"""
Service pour interagir avec l'API Google AI Studio (Gemini)
"""
import asyncio
from google import genai
from typing import List, Dict, Optional

from config import GOOGLE_API_KEY


class GoogleAIService:
    """Service pour communiquer avec l'API Google AI Studio"""
    
    def __init__(self):
        self.api_key = GOOGLE_API_KEY
        self.model_name = "gemini-2.5-flash"
        self.client = None
        
        if self.api_key:
            # Initialiser le client avec la clé API
            self.client = genai.Client(api_key=self.api_key)
    
    def _generate_response_sync(
        self, 
        message: str, 
        conversation_history: Optional[List[Dict[str, str]]] = None,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Génère une réponse de manière synchrone (pour être exécutée dans un thread)
        """
        if not self.api_key:
            raise ValueError(
                "Cle API Google non configuree. "
                "Ajoutez GEMINI_API_KEY ou GOOGLE_API_KEY dans backend/.env"
            )
        
        if not self.client:
            raise ValueError("Client Google AI non initialise")
        
        if not message or not message.strip():
            raise ValueError("Le message ne peut pas etre vide")
        
        # Générer la réponse
        config = None
        if system_prompt:
            config = genai.types.GenerateContentConfig(
                system_instruction=system_prompt
            )
        
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=self._build_contents(message, conversation_history),
            config=config
        )
        
        if response and response.text:
            return response.text.strip()
        
        raise ValueError("Reponse invalide de l'API Google")
    
    def _build_contents(
        self, 
        message: str, 
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> List[Dict]:
        """Construit le contenu avec l'historique de conversation"""
        contents = []
        
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg.get("role") == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg.get("content", "")}]
                })
        
        # Ajouter le message actuel
        contents.append({
            "role": "user",
            "parts": [{"text": message}]
        })
        
        return contents
    
    async def generate_response(
        self, 
        message: str, 
        conversation_history: Optional[List[Dict[str, str]]] = None,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Génère une réponse à partir d'un message et d'un historique de conversation
        """
        try:
            # Exécuter la méthode synchrone dans un thread pour ne pas bloquer
            response = await asyncio.to_thread(
                self._generate_response_sync,
                message,
                conversation_history,
                system_prompt
            )
            return response
            
        except Exception as e:
            error_msg = str(e)
            if "API_KEY" in error_msg or "authentication" in error_msg.lower():
                raise ValueError("Cle API Google invalide")
            elif "quota" in error_msg.lower() or "rate limit" in error_msg.lower():
                raise ValueError("Trop de requetes. Veuillez patienter avant de reessayer")
            elif "not found" in error_msg.lower():
                raise ValueError(f"Modele {self.model_name} non trouve")
            else:
                raise ValueError(f"Erreur API Google: {error_msg}")
