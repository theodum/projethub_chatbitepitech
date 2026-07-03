"""
Configuration de l'application
Gère le chargement des variables d'environnement
"""
import os
from dotenv import load_dotenv
from pathlib import Path

# Charger les variables d'environnement depuis .env
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# Configuration Google AI Studio
# Le SDK Google GenAI utilise GEMINI_API_KEY par défaut
GOOGLE_API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')

# Configuration Supabase
# Le backend est un serveur de confiance : il utilise la clé service_role
# (bypasse le RLS) pour la recherche sémantique et l'ingestion des embeddings.
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Configuration serveur
PORT = int(os.getenv('PORT', '3001'))
HOST = os.getenv('HOST', '0.0.0.0')
