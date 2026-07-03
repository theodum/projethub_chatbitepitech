# Documents à ingérer dans le RAG

Dépose ici les fichiers que le chatbot doit connaître : **PDF** (texte, pas scanné), `.txt` ou `.md`.

Puis, depuis `backend/` :

```bash
python ingest.py
```

Chaque fichier devient un *document* découpé en *chunks* encodés (embeddings) et
stocké dans Supabase. Le script est idempotent : relancer remplace proprement
la version précédente d'un fichier.

> ⚠️ Les PDF **scannés / images** ne contiennent pas de texte extractible.
> Il faudrait de l'OCR (hors périmètre actuel) — préfère des PDF texte.
