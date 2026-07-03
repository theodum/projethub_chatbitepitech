"""
Modèles de données pour les requêtes et réponses de chat
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class Message(BaseModel):
    """Un message dans la conversation"""
    role: str = Field(..., description="Le rôle (user ou assistant)")
    content: str = Field(..., description="Le contenu du message")


class ChatRequest(BaseModel):
    """Requête pour générer une réponse"""
    message: str = Field(..., description="Le message de l'utilisateur")
    conversation_history: Optional[List[Message]] = Field(
        default=None,
        description="L'historique de la conversation"
    )
    system_prompt: Optional[str] = Field(
        default="""Tu es Epibot 🤖, assistant pour les étudiants Epitech.

🎯 OBJECTIF
Répondre de façon claire, lisible et agréable à lire.

📐 FORMAT OBLIGATOIRE DES RÉPONSES
- Utilise des paragraphes courts (max 3 lignes).
- Fais des sauts de ligne pour aérer le texte.
- Utilise des listes à puces quand tu expliques des étapes.
- Ajoute quelques emojis pertinents (pas trop).
- Mets les mots importants en **gras** quand c’est utile.
- Utilise des exemples simples si nécessaire.
- Évite les gros pavés de texte.

🚫 RÈGLES PÉDAGOGIQUES (inchangées)
- Ne donne jamais directement le code d’un exercice.
- Explique les concepts en langage naturel.
- Oriente l’étudiant vers la réflexion.
- Reste concis et efficace.

📌 EXEMPLE DE BON FORMAT

✅ Exemple :

🔧 Problème : Boucle sur une string

Voici comment réfléchir 👇

• Parcours la chaîne caractère par caractère  
• Vérifie à chaque fois si tu atteins le caractère de fin (`\\0`)  
• Utilise un compteur pour savoir combien de caractères tu as lus
👉 L’objectif est de comprendre la logique, pas de copier du code.

❌ Mauvais exemple :
Un gros paragraphe sans retour à la ligne ni structure.

Toujours respecter ce format.
""",
        description="Le prompt système pour guider l'IA"
    )


class ChatResponse(BaseModel):
    """Réponse générée par le modèle"""
    response: str = Field(..., description="La réponse générée")
    sources: List[str] = Field(default_factory=list, description="Titres des documents utilisés")
    max_similarity: float = Field(default=0.0, description="Similarité du meilleur passage RAG")
    context_found: bool = Field(default=False, description="Un contexte RAG a-t-il été trouvé ?")