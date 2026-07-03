"""
Service d'ingestion : extrait le texte d'un fichier, le découpe en chunks,
les encode (embeddings) et les stocke dans Supabase.

Utilisé par le script CLI (ingest.py) ET par l'endpoint admin d'upload,
pour ne pas dupliquer la logique.
"""
import io
from typing import List, Optional

from pypdf import PdfReader
from supabase import Client

from services.embeddings_service import EmbeddingService

CHUNK_SIZE = 1500        # caractères par chunk (~400 tokens)
CHUNK_OVERLAP = 200      # recouvrement entre chunks
EMBED_BATCH = 50         # chunks encodés par appel API

embedding_service = EmbeddingService()


def extract_text(filename: str, data: bytes) -> str:
    """Extrait le texte d'un fichier (PDF via pypdf, sinon décodage UTF-8)."""
    if filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    return data.decode("utf-8", errors="ignore")


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Découpe le texte en morceaux qui se recouvrent."""
    text = " ".join(text.split())  # normalise espaces / sauts de ligne
    chunks: List[str] = []
    start = 0
    while start < len(text):
        chunk = text[start:start + size].strip()
        if chunk:
            chunks.append(chunk)
        start += size - overlap
    return chunks


def ingest_document(client: Client, source: str, text: str, titre: Optional[str] = None) -> dict:
    """
    Ingestion idempotente d'un document déjà extrait en texte :
    remplace l'ancienne version (par `source`), insère document + chunks encodés.
    Retourne {titre, source, chunks}.
    """
    titre = titre or (source.rsplit(".", 1)[0] if "." in source else source)
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("Aucun texte exploitable (PDF scanné/image ?)")

    # Idempotent : supprime l'ancienne version (cascade sur les chunks)
    client.table("documents").delete().eq("source", source).execute()

    doc = client.table("documents").insert({"titre": titre, "source": source}).execute()
    document_id = doc.data[0]["id"]

    inserted = 0
    for i in range(0, len(chunks), EMBED_BATCH):
        batch = chunks[i:i + EMBED_BATCH]
        embeddings = embedding_service.embed_documents(batch)
        rows = [
            {"document_id": document_id, "contenu": c, "embedding": e}
            for c, e in zip(batch, embeddings)
        ]
        client.table("document_chunks").insert(rows).execute()
        inserted += len(rows)

    return {"titre": titre, "source": source, "chunks": inserted}


def ingest_bytes(client: Client, filename: str, data: bytes) -> dict:
    """Ingestion depuis un fichier uploadé (octets bruts)."""
    text = extract_text(filename, data)
    return ingest_document(client, source=filename, text=text)
