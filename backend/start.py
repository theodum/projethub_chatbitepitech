#!/usr/bin/env python3
"""
Script de démarrage du serveur FastAPI
Compatible macOS et Ubuntu/Linux
"""
import sys
import os
from pathlib import Path

# Ajouter le répertoire backend au PYTHONPATH
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Importer et lancer uvicorn via main.py
if __name__ == "__main__":
    # Utiliser main.py qui gère déjà uvicorn
    # Note: uvicorn est installé dans venv, donc ce script doit être exécuté
    # avec le Python du venv activé ou via le chemin du venv
    try:
        import uvicorn
        from config import PORT, HOST
        
        uvicorn.run(
            "main:app",
            host=HOST,
            port=PORT,
            reload=True
        )
    except ImportError as e:
        print("Erreur: uvicorn n'est pas installé ou le venv n'est pas activé.")
        print("Solution:")
        print("  1. Activez le venv: source venv/bin/activate")
        print("  2. Ou utilisez: npm run dev:api:mac (macOS) ou npm run dev:api:linux (Ubuntu)")
        sys.exit(1)
