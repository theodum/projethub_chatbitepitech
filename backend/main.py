"""
Point d'entrée de l'application FastAPI
"""
import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from api.admin import router as admin_router
from config import PORT, HOST, GOOGLE_API_KEY

# Créer l'application FastAPI
app = FastAPI(
    title="Epibot API",
    description="API backend pour le chatbot Epibot",
    version="1.0.0"
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Gestionnaire d'erreurs de validation Pydantic"""
    errors = exc.errors()
    error_details = []
    for error in errors:
        error_details.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    return JSONResponse(
        status_code=422,
        content={
            "error": "Erreur de validation",
            "details": error_details
        }
    )

# Configuration CORS pour permettre les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclure les routes
app.include_router(router)
app.include_router(admin_router)


@app.on_event("startup")
async def startup_event():
    """Evenement au demarrage du serveur"""
    print("Serveur Epibot API demarre")
    
    if not GOOGLE_API_KEY:
        print("ATTENTION: Cle API Google non trouvee")
        print("Ajoutez GEMINI_API_KEY ou GOOGLE_API_KEY dans backend/.env")
    else:
        print("Cle API Google detectee")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=True  # Rechargement automatique en développement
    )
