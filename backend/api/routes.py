"""
Routes API pour le chatbot
"""
from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
import sys
import json
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from models.chat_models import ChatRequest, ChatResponse
from services.googleai_service import GoogleAIService
from services.embeddings_service import EmbeddingService
from services.moderation_service import is_bypass_attempt
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Instances des services
ai_service = GoogleAIService()
embedding_service = EmbeddingService()

# Client Supabase (initialisé à la demande, clé service_role)
supabase: Client | None = None


def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Configuration Supabase non configurée")
    global supabase
    if supabase is None:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return supabase


CURSUS_YEARS = 5  # durée du cursus Epitech (tek1..tek5)


def study_year_of(promo: int | None) -> int | None:
    """
    Le champ `promo` stocke directement l'année d'étude (1..5, tek1..tek5).
    Renvoie l'année si valide, sinon None (l'utilisateur ne voit alors que les
    documents SANS restriction de promo).
    """
    if not promo or promo < 1 or promo > CURSUS_YEARS:
        return None
    return promo


def retrieve_context(
    question: str,
    match_count: int = 5,
    match_threshold: float = 0.65,
    user_promo: int | None = None,
) -> tuple:
    """
    Recherche sémantique (RAG) :
    1. Encode la question en vecteur (Gemini text-embedding-004)
    2. Interroge match_document_chunks (pgvector) en filtrant les documents
       selon l'année d'étude de l'utilisateur et la date de démarrage du sujet
    3. Renvoie le contenu à injecter + les titres sources
    """
    try:
        query_embedding = embedding_service.embed_query(question)
    except Exception as e:
        print(f"Erreur lors de l'embedding de la question: {str(e)}")
        return "", [], 0.0

    from datetime import date
    user_year = study_year_of(user_promo)

    try:
        response = get_supabase_client().rpc(
            "match_document_chunks",
            {
                "query_embedding": query_embedding,
                # On récupère le top-k sans filtrer (seuil 0) pour connaître la vraie
                # similarité max ; le filtrage au seuil réel se fait ensuite en Python.
                "match_threshold": 0.0,
                "match_count": match_count,
                # Contrôle d'accès : année d'étude + date courante.
                "user_year": user_year,
                "today": date.today().isoformat(),
            },
        ).execute()
    except Exception as e:
        print(f"Erreur lors de la recherche vectorielle: {str(e)}")
        return "", [], 0.0

    rows = response.data or []
    if not rows:
        return "", [], 0.0

    # Vraie meilleure similarité (même sous le seuil) — utile pour prioriser les trous
    max_similarity = max((row.get("similarity") or 0.0) for row in rows)

    # On n'injecte que les passages réellement pertinents (au-dessus du seuil)
    injected_content = ""
    sources = []
    for row in rows:
        if (row.get("similarity") or 0.0) < match_threshold:
            continue
        titre = row.get("titre", "")
        contenu = row.get("contenu", "")
        injected_content += f"## {titre}\n{contenu}\n\n"
        if titre and titre not in sources:
            sources.append(titre)

    return injected_content, sources, max_similarity


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Endpoint pour générer une réponse à partir d'un message.
    Enrichit le prompt avec les passages pertinents (RAG sémantique).
    """
    try:
        # Récupérer le contexte pertinent par recherche sémantique
        injected_content, sources, max_similarity = retrieve_context(request.message, user_promo=request.user_promo)

        # Injecter dans le system prompt
        system_prompt = request.system_prompt or ""
        if injected_content.strip():
            system_prompt += (
                "\n\n### Contexte pertinent (base de connaissances) :\n"
                f"{injected_content}"
            )

        conversation_history = None
        if request.conversation_history:
            conversation_history = [
                {"role": msg.role, "content": msg.content}
                for msg in request.conversation_history
            ]

        response_text = await ai_service.generate_response(
            message=request.message,
            conversation_history=conversation_history,
            system_prompt=system_prompt
        )

        return ChatResponse(
            response=response_text,
            sources=sources,
            max_similarity=max_similarity,
            context_found=bool(injected_content.strip()),
            flagged=is_bypass_attempt(request.message),
        )

    except ValueError as e:
        error_message = str(e)
        if "non configurée" in error_message or "non configuree" in error_message:
            status_code = 500
        elif "invalide" in error_message or "refusé" in error_message:
            status_code = 401
        elif "Trop de requêtes" in error_message:
            status_code = 429
        else:
            status_code = 400
        raise HTTPException(status_code=status_code, detail=error_message)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération de la réponse: {str(e)}"
        )


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Version streaming de /chat : renvoie la réponse en flux (ndjson).
    Ligne 1 = métadonnées (sources, similarité, contexte, flag modération),
    puis des lignes 'delta' avec le texte au fur et à mesure, puis 'done'.
    """
    injected_content, sources, max_similarity = retrieve_context(request.message)

    system_prompt = request.system_prompt or ""
    if injected_content.strip():
        system_prompt += (
            "\n\n### Contexte pertinent (base de connaissances) :\n"
            f"{injected_content}"
        )

    conversation_history = None
    if request.conversation_history:
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

    meta = {
        "type": "meta",
        "sources": sources,
        "max_similarity": max_similarity,
        "context_found": bool(injected_content.strip()),
        "flagged": is_bypass_attempt(request.message),
    }

    async def event_stream():
        yield json.dumps(meta) + "\n"
        try:
            async for delta in ai_service.generate_response_stream(
                request.message, conversation_history, system_prompt
            ):
                yield json.dumps({"type": "delta", "text": delta}) + "\n"
            yield json.dumps({"type": "done"}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "detail": str(e)}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


MAX_ATTACH_BYTES = 2 * 1024 * 1024   # 2 Mo : garde-fou taille
MAX_EXTRACT_CHARS = 20000            # texte injecté à l'IA (évite d'exploser les tokens)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Extrait le texte d'un fichier joint au chat (code, .txt, .md, PDF…).
    Réutilise l'extraction d'ingestion (pypdf pour les PDF, décodage tolérant sinon).
    Le contenu extrait est renvoyé au frontend, qui l'attache à la question.
    """
    from services.ingestion_service import extract_text

    filename = file.filename or "fichier"
    content = await file.read()
    if len(content) > MAX_ATTACH_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 2 Mo).")

    # Détection binaire : un octet nul ou trop de caractères de contrôle => pas du texte.
    def looks_binary(raw: bytes) -> bool:
        if b"\x00" in raw[:4096]:
            return True
        sample = raw[:4096]
        if not sample:
            return False
        # Octets considérés "texte" : tab, LF, CR, FF, ESC + imprimables >= 0x20.
        text_chars = {7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100))
        nontext = sum(1 for b in sample if b not in text_chars)
        return nontext / len(sample) > 0.30

    is_pdf = filename.lower().endswith(".pdf")
    if not is_pdf and looks_binary(content):
        # Image / binaire / format non supporté : partagé dans le fil mais illisible par l'IA.
        return {"filename": filename, "content": "", "size": len(content), "readable": False, "truncated": False}

    try:
        text_content = extract_text(filename, content)
    except Exception:
        text_content = ""

    text_content = (text_content or "").strip()
    truncated = len(text_content) > MAX_EXTRACT_CHARS
    if truncated:
        text_content = text_content[:MAX_EXTRACT_CHARS]

    readable = bool(text_content)

    return {
        "filename": filename,
        "content": text_content,
        "size": len(content),
        "readable": readable,     # False = fichier non exploitable par l'IA (image, binaire…)
        "truncated": truncated,
    }


@router.get("/health")
async def health():
    """Endpoint de santé pour vérifier que l'API fonctionne"""
    return {"status": "OK", "service": "Google AI Studio"}
