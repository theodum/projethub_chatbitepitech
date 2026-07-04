"""
Détection heuristique des tentatives de contournement du garde-fou pédagogique
(l'étudiant demande directement le code / la solution / que le bot fasse le travail
à sa place, au lieu de chercher à comprendre).

Heuristique volontairement large : c'est un signal d'alerte à confirmer à l'œil,
pas un verdict. Les questions « comment faire… » restent, elles, non signalées.
"""
import re

BYPASS_PATTERNS = [
    # donne / file / envoie / montre (moi) ... le code / la solution / la réponse
    re.compile(r"\b(donne|file|passe|envoie|montre|balance)\b[\s-]*(moi)?\s+.{0,25}?(code|solution|correction|corrig|répons|repons)", re.IGNORECASE),
    # écris / rédige / génère / implémente / code (moi) ... code / fonction / lib ...
    re.compile(r"\b(écris|ecris|rédige|redige|génère|genere|implémente|implemente|code)\b[\s-]*(moi)?\s+.{0,25}?(code|fonction|programme|classe|méthode|methode|solution|librairie|biblioth|\blib\b)", re.IGNORECASE),
    # demande d'un artefact de conception prêt à l'emploi : interface / header / squelette / template / prototypes...
    re.compile(r"\b(donne|file|passe|envoie|montre|balance|écris|ecris|rédige|redige|génère|genere|fais|crée|cree|code)\b[\s-]*(moi)?\s+.{0,30}?(interface|prototype|header|squelette|template|boilerplate|signatures?|classe\s+abstraite)", re.IGNORECASE),
    # corrige / répare / debug / résous (moi) ... mon code / projet / erreur ...
    re.compile(r"\b(corrige|corriger|répare|repare|debug|débug|résous|resous|résoudre|resoudre)\b[\s-]*(moi)?\s+.{0,25}?(code|programme|projet|exercice|fonction|bug|erreur|\blib\b|librairie|biblioth)", re.IGNORECASE),
    # fais (moi) mon / ma / le ... projet / exercice / lib / fonction ...  (« fais moi ma lib »)
    re.compile(r"\bfais\b[\s-]*(moi|le|la)?\s+(mon|ma|le|la|l['’ ]|ce|cette)?\s*(projet|exercice|devoir|travail|\btp\b|\blib\b|librairie|biblioth|fonction|programme|code)", re.IGNORECASE),
    # « ... à ma place »
    re.compile(r"\b(fais|faire|code|écris|ecris|rédige|redige)\b.{0,30}?\b(à|a)\s+ma\s+place", re.IGNORECASE),
    # solution / code complet, tout le code
    re.compile(r"\b(solution|correction|corrigé|code)\s+(complet|complète|complete|entier|entière)\b", re.IGNORECASE),
    re.compile(r"\btout\s+le\s+code\b", re.IGNORECASE),
]


def is_bypass_attempt(text: str) -> bool:
    """Renvoie True si la question ressemble à une demande de code/solution direct."""
    if not text:
        return False
    return any(pattern.search(text) for pattern in BYPASS_PATTERNS)
