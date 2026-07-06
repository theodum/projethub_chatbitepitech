"""
Routes de modération pour l'extension VS Code.

L'extension détecte les gros collages dans l'éditeur et les envoie ici.
Le backend :
  1. résout le token d'extension -> user_id (table extension_tokens) ;
  2. demande à l'IA si le texte collé est réellement du code (et son langage) ;
  3. si oui, trace l'événement dans code_paste_events (visible dans l'admin).

Authentification : header `Authorization: Bearer epibot_xxxxx`
(token dédié à l'extension, généré depuis le compte de l'étudiant).
"""
import json
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent.parent))
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from services.googleai_service import GoogleAIService

router = APIRouter(prefix="/api/moderation", tags=["moderation"])

ai_service = GoogleAIService()

# Seuil : en-dessous, on ne sollicite même pas l'IA (frappe normale, petit collage).
MIN_LINES_TO_CHECK = 10
EXCERPT_MAX = 4000  # on n'envoie pas des fichiers entiers à l'IA

supabase: Client | None = None


def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Configuration Supabase manquante")
    global supabase
    if supabase is None:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return supabase


def resolve_token(authorization: str | None) -> str:
    """Valide le token d'extension et renvoie le user_id associé."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")
    token = authorization.split(" ", 1)[1].strip()

    client = get_supabase_client()
    result = (
        client.table("extension_tokens")
        .select("user_id, revoked")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    row = result.data[0] if result.data else None
    if not row or row.get("revoked"):
        raise HTTPException(status_code=401, detail="Token invalide ou révoqué")

    # Trace la dernière utilisation (best-effort, non bloquant)
    try:
        client.table("extension_tokens").update(
            {"last_used_at": "now()"}
        ).eq("token", token).execute()
    except Exception:
        pass

    return row["user_id"]


class PasteEvent(BaseModel):
    file_name: str | None = Field(default=None, description="Nom du fichier collé")
    line_count: int = Field(..., description="Nombre de lignes ajoutées d'un coup")
    content: str = Field(..., description="Le texte collé")


async def is_code_snippet(text: str) -> tuple[bool, str]:
    """
    Demande à l'IA si le texte est du code, et son langage.
    Retourne (is_code, language). Best-effort : en cas d'échec, on suppose que
    oui (on préfère un faux positif tracé qu'un vrai collage manqué).
    """
    prompt = (
        "Tu es un classificateur. On te donne un extrait collé dans un éditeur. "
        "Réponds STRICTEMENT en JSON compact, sans texte autour, au format "
        '{\"is_code\": true|false, \"language\": \"<langage ou \'\'>\"}. '
        "is_code=true seulement s'il s'agit de code source de programmation "
        "(pas de la prose, du markdown, un log ou des données)."
    )
    try:
        raw = await ai_service.generate_response(
            message=text[:EXCERPT_MAX],
            conversation_history=None,
            system_prompt=prompt,
        )
        # L'IA peut entourer de ```json ... ``` : on isole l'objet.
        start, end = raw.find("{"), raw.rfind("}")
        data = json.loads(raw[start : end + 1]) if start != -1 else {}
        return bool(data.get("is_code", True)), str(data.get("language", "") or "")
    except Exception:
        return True, ""


@router.post("/paste")
async def report_paste(event: PasteEvent, authorization: str = Header(None)):
    """
    Signale un collage massif détecté par l'extension VS Code.
    Ne trace que si l'IA confirme qu'il s'agit de code.
    """
    user_id = resolve_token(authorization)

    if event.line_count < MIN_LINES_TO_CHECK:
        return {"tracked": False, "reason": "sous le seuil"}

    is_code, language = await is_code_snippet(event.content)
    if not is_code:
        return {"tracked": False, "reason": "pas du code"}

    client = get_supabase_client()
    client.table("code_paste_events").insert(
        {
            "user_id": user_id,
            "file_name": event.file_name,
            "line_count": event.line_count,
            "language": language or None,
            "is_code": True,
            "excerpt": event.content[:500],
        }
    ).execute()

    return {"tracked": True, "language": language, "lines": event.line_count}


@router.get("/health")
async def health():
    return {"status": "OK", "service": "moderation"}
