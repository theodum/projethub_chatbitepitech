"""
Script d'ingestion en lot des documents dans le RAG.

Usage :
    cd backend
    python ingest.py

Dépose tes fichiers PDF (ou .txt / .md) dans backend/documents/, puis lance
ce script. La logique d'ingestion est partagée avec l'endpoint admin d'upload
(voir services/ingestion_service.py).
"""
import sys
from pathlib import Path

from supabase import create_client, Client

sys.path.insert(0, str(Path(__file__).parent))
from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from services.ingestion_service import ingest_bytes

DOCUMENTS_DIR = Path(__file__).parent / "documents"


def get_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SystemExit(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans backend/.env"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def main():
    DOCUMENTS_DIR.mkdir(exist_ok=True)
    files = sorted(
        p for p in DOCUMENTS_DIR.iterdir()
        if p.suffix.lower() in {".pdf", ".txt", ".md"}
    )
    if not files:
        print(f"Aucun fichier dans {DOCUMENTS_DIR}. Dépose tes PDF là puis relance.")
        return

    client = get_client()
    for path in files:
        print(f"\n[DOC] {path.name}")
        try:
            result = ingest_bytes(client, path.name, path.read_bytes())
            print(f"   OK {result['chunks']} chunks ingérés")
        except Exception as e:
            print(f"   ERREUR sur {path.name}: {e}")

    print("\nIngestion terminée.")


if __name__ == "__main__":
    main()
