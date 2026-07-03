"""
Routes API pour le chatbot
"""
from fastapi import APIRouter, HTTPException, File, UploadFile
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from models.chat_models import ChatRequest, ChatResponse
from services.googleai_service import GoogleAIService
from services.embeddings_service import EmbeddingService
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


def retrieve_context(
    question: str,
    match_count: int = 5,
    match_threshold: float = 0.5,
) -> tuple:
    """
    Recherche sémantique (RAG) :
    1. Encode la question en vecteur (Gemini text-embedding-004)
    2. Interroge la fonction Postgres match_document_chunks (pgvector)
    3. Renvoie le contenu à injecter + les titres sources
    """
    try:
        query_embedding = embedding_service.embed_query(question)
    except Exception as e:
        print(f"Erreur lors de l'embedding de la question: {str(e)}")
        return "", [], 0.0

    try:
        response = get_supabase_client().rpc(
            "match_document_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": match_count,
            },
        ).execute()
    except Exception as e:
        print(f"Erreur lors de la recherche vectorielle: {str(e)}")
        return "", [], 0.0

    rows = response.data or []
    if not rows:
        return "", [], 0.0

    injected_content = ""
    sources = []
    max_similarity = 0.0
    for row in rows:
        titre = row.get("titre", "")
        contenu = row.get("contenu", "")
        injected_content += f"## {titre}\n{contenu}\n\n"
        if titre and titre not in sources:
            sources.append(titre)
        similarity = row.get("similarity") or 0.0
        max_similarity = max(max_similarity, similarity)

    return injected_content, sources, max_similarity


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Endpoint pour générer une réponse à partir d'un message.
    Enrichit le prompt avec les passages pertinents (RAG sémantique).
    """
    try:
        # Récupérer le contexte pertinent par recherche sémantique
        injected_content, sources, max_similarity = retrieve_context(request.message)

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


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Endpoint pour uploader un fichier texte
    """
    try:
        # Vérifier le type de fichier
        if not file.content_type or 'text' not in file.content_type:
            raise HTTPException(status_code=400, detail="Seuls les fichiers texte sont acceptés")

        # Lire le contenu du fichier
        content = await file.read()
        text_content = content.decode('utf-8')

        return {
            "filename": file.filename,
            "content": text_content,
            "size": len(text_content)
        }
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Le fichier doit être encodé en UTF-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    """Endpoint de santé pour vérifier que l'API fonctionne"""
    return {"status": "OK", "service": "Google AI Studio"}
