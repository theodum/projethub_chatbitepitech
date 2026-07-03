"""
Routes d'administration : gestion de la base de connaissances RAG.

Toutes les routes sont protégées : elles exigent un utilisateur authentifié
avec le rôle 'admin' (vérification du JWT Supabase + du rôle en base).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Header
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from services.ingestion_service import ingest_bytes

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_EXTENSIONS = (".pdf", ".txt", ".md")

# Client Supabase service_role (initialisé à la demande)
supabase: Client | None = None


def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Configuration Supabase non configurée")
    global supabase
    if supabase is None:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return supabase


def require_admin(authorization: str = Header(None)) -> str:
    """
    Vérifie le JWT (header Authorization: Bearer ...) et le rôle 'admin'.
    Retourne l'id de l'utilisateur. Lève 401/403 sinon.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")
    token = authorization.split(" ", 1)[1]

    client = get_supabase_client()
    try:
        user_response = client.auth.get_user(token)
        user = user_response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide")
    if not user:
        raise HTTPException(status_code=401, detail="Token invalide")

    result = client.table("users").select("role").eq("id", user.id).limit(1).execute()
    role = result.data[0]["role"] if result.data else None
    if role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")

    return user.id


@router.get("/documents")
async def list_documents(admin_id: str = Depends(require_admin)):
    """Liste les documents ingérés avec leur nombre de chunks."""
    client = get_supabase_client()
    docs = client.table("documents").select("id, titre, source, created_at").order("titre").execute()

    result = []
    for doc in docs.data or []:
        count_resp = (
            client.table("document_chunks")
            .select("id", count="exact")
            .eq("document_id", doc["id"])
            .limit(1)
            .execute()
        )
        result.append({**doc, "chunks": count_resp.count or 0})
    return result


@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    admin_id: str = Depends(require_admin),
):
    """Uploade et ingère un document (PDF / txt / md)."""
    filename = file.filename or "document"
    if not filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Types acceptés : PDF, .txt, .md")

    data = await file.read()
    client = get_supabase_client()
    try:
        return ingest_bytes(client, filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'ingestion : {str(e)}")


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    admin_id: str = Depends(require_admin),
):
    """Supprime un document et tous ses chunks (cascade)."""
    client = get_supabase_client()
    client.table("documents").delete().eq("id", document_id).execute()
    return {"status": "deleted", "id": document_id}
