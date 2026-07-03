"""
Service d'embeddings via Google AI (text-embedding-004, 768 dimensions).
Utilisé pour la recherche sémantique (RAG).
"""
from typing import List

from google import genai

from config import GOOGLE_API_KEY

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768


class EmbeddingService:
    """Encode du texte en vecteurs pour la recherche sémantique."""

    def __init__(self):
        self.client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY else None

    def _embed(self, texts: List[str], task_type: str) -> List[List[float]]:
        if not self.client:
            raise ValueError(
                "Cle API Google non configuree pour les embeddings. "
                "Ajoutez GEMINI_API_KEY ou GOOGLE_API_KEY dans backend/.env"
            )
        response = self.client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=texts,
            config=genai.types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=EMBEDDING_DIM,
            ),
        )
        return [embedding.values for embedding in response.embeddings]

    def embed_query(self, text: str) -> List[float]:
        """Embedding d'une question utilisateur (optimisé pour la recherche)."""
        return self._embed([text], task_type="RETRIEVAL_QUERY")[0]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embedding de passages de documents (optimisé pour l'ingestion)."""
        return self._embed(texts, task_type="RETRIEVAL_DOCUMENT")
