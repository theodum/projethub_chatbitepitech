"""
Tests unitaires de la logique d'ingestion (fonctions pures, sans réseau ni DB).

Lancer depuis backend/ :
    pytest
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from services.ingestion_service import chunk_text, extract_text


def test_chunk_text_decoupe_avec_recouvrement():
    text = "a" * 3000
    chunks = chunk_text(text, size=1000, overlap=200)
    # On avance de (size - overlap) = 800 : positions 0, 800, 1600, 2400 -> 4 chunks
    assert len(chunks) == 4
    assert all(len(c) <= 1000 for c in chunks)


def test_chunk_text_normalise_les_espaces():
    assert chunk_text("  bonjour   le    monde  ", size=1000, overlap=0) == ["bonjour le monde"]


def test_chunk_text_vide():
    assert chunk_text("   ") == []


def test_extract_text_fichier_texte():
    assert extract_text("notes.txt", "hello world".encode("utf-8")) == "hello world"


def test_extract_text_markdown():
    assert "Titre" in extract_text("readme.md", "# Titre\ncontenu".encode("utf-8"))
