"""
API de chat pour l'extension VS Code (Epibot dans l'éditeur).

Authentification par le token d'extension (epibot_xxx) — le même que
l'anti-collage. Le backend, serveur de confiance (service_role), gère
la persistance des conversations/messages : l'historique de l'extension
apparaît donc aussi dans l'app web et l'admin (même base).

Endpoints :
  GET  /api/ext/conversations               -> liste des conversations du user
  POST /api/ext/conversations               -> créer une conversation
  GET  /api/ext/conversations/{id}/messages -> historique d'une conversation
  POST /api/ext/chat/stream                 -> chat streamé (RAG filtré par promo)
  POST /api/ext/messages/{id}/feedback      -> feedback 👍/👎
"""
import json
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List

sys.path.insert(0, str(Path(__file__).parent.parent))
from api.moderation import resolve_token, get_supabase_client
from api.routes import retrieve_context, promo_to_study_year
from services.googleai_service import GoogleAIService
from services.moderation_service import is_bypass_attempt
from models.chat_models import ChatRequest  # pour le system_prompt par défaut

router = APIRouter(prefix="/api/ext", tags=["extension-chat"])

ai_service = GoogleAIService()

# Le system prompt pédagogique par défaut (identique à l'app web).
DEFAULT_SYSTEM_PROMPT = ChatRequest.model_fields["system_prompt"].default


def _get_user(user_id: str) -> dict:
    """Charge le profil (promo, name) de l'utilisateur."""
    client = get_supabase_client()
    res = client.table("users").select("id, name, promo").eq("id", user_id).limit(1).execute()
    return res.data[0] if res.data else {"id": user_id, "name": None, "promo": None}


# ---------------------------------------------------------------- Conversations

@router.get("/conversations")
async def list_conversations(authorization: str = Header(None)):
    user_id = resolve_token(authorization)
    client = get_supabase_client()
    # Conversations dont l'utilisateur est membre (modèle partagé).
    rows = (
        client.table("conversation_members")
        .select("role, conversation:conversations(id, title, created_at)")
        .eq("user_id", user_id)
        .execute()
    )
    convs = []
    for r in rows.data or []:
        c = r.get("conversation")
        if c:
            convs.append({**c, "is_owner": r.get("role") == "owner"})
    convs.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return convs


class NewConversation(BaseModel):
    title: Optional[str] = Field(default="Nouvelle conversation")


@router.post("/conversations")
async def create_conversation(payload: NewConversation, authorization: str = Header(None)):
    user_id = resolve_token(authorization)
    client = get_supabase_client()
    # Le trigger DB inscrit automatiquement le créateur comme membre 'owner'.
    res = (
        client.table("conversations")
        .insert({"user_id": user_id, "title": payload.title or "Nouvelle conversation"})
        .execute()
    )
    return res.data[0]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, authorization: str = Header(None)):
    user_id = resolve_token(authorization)
    client = get_supabase_client()
    # Vérifie l'appartenance à la conversation (sécurité, on est en service_role).
    member = (
        client.table("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not member.data:
        raise HTTPException(status_code=403, detail="Accès refusé à cette conversation")

    msgs = (
        client.table("messages")
        .select("id, content, user_id, created_at, feedback, rag_sources")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return msgs.data or []


# ---------------------------------------------------------------- Chat streamé

class ExtChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    conversation_history: Optional[List[dict]] = None


@router.post("/chat/stream")
async def ext_chat_stream(payload: ExtChatRequest, authorization: str = Header(None)):
    user_id = resolve_token(authorization)
    user = _get_user(user_id)
    client = get_supabase_client()

    # Conversation : créée si absente (comme l'app web).
    conversation_id = payload.conversation_id
    if not conversation_id:
        created = (
            client.table("conversations")
            .insert({"user_id": user_id, "title": payload.message[:48] or "Conversation"})
            .execute()
        )
        conversation_id = created.data[0]["id"]

    # Sauvegarde la question de l'étudiant.
    flagged = is_bypass_attempt(payload.message)
    try:
        client.table("messages").insert({
            "content": payload.message,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "flagged": flagged or None,
        }).execute()
    except Exception as e:
        print(f"ext: échec sauvegarde question: {e}")

    # RAG filtré par l'année d'étude de l'utilisateur (promo -> tek).
    injected, sources, max_sim = retrieve_context(payload.message, user_promo=user.get("promo"))
    context_found = bool(injected.strip())

    system_prompt = DEFAULT_SYSTEM_PROMPT
    if context_found:
        system_prompt += "\n\n### Contexte pertinent (base de connaissances) :\n" + injected

    history = None
    if payload.conversation_history:
        history = [{"role": m.get("role"), "content": m.get("content", "")}
                   for m in payload.conversation_history]

    meta = {
        "type": "meta",
        "conversation_id": conversation_id,
        "sources": sources,
        "max_similarity": max_sim,
        "context_found": context_found,
        "flagged": flagged,
    }

    async def event_stream():
        yield json.dumps(meta) + "\n"
        full = ""
        try:
            async for delta in ai_service.generate_response_stream(
                payload.message, history, system_prompt
            ):
                full += delta
                yield json.dumps({"type": "delta", "text": delta}) + "\n"
            # Sauvegarde la réponse du bot + métadonnées RAG.
            try:
                saved = client.table("messages").insert({
                    "content": full,
                    "user_id": None,
                    "conversation_id": conversation_id,
                    "rag_similarity": max_sim,
                    "rag_sources": sources,
                    "rag_context_found": context_found,
                }).execute()
                bot_id = saved.data[0]["id"] if saved.data else None
                yield json.dumps({"type": "done", "message_id": bot_id}) + "\n"
            except Exception as e:
                print(f"ext: échec sauvegarde réponse: {e}")
                yield json.dumps({"type": "done"}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "detail": str(e)}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


# ---------------------------------------------------------------- Feedback

class FeedbackBody(BaseModel):
    feedback: str  # 'up' | 'down'


@router.post("/messages/{message_id}/feedback")
async def set_feedback(message_id: int, body: FeedbackBody, authorization: str = Header(None)):
    resolve_token(authorization)  # valide le token
    if body.feedback not in ("up", "down"):
        raise HTTPException(status_code=400, detail="feedback doit être 'up' ou 'down'")
    client = get_supabase_client()
    client.table("messages").update({"feedback": body.feedback}).eq("id", message_id).execute()
    return {"status": "ok"}


@router.get("/health")
async def health():
    return {"status": "OK", "service": "ext-chat"}
