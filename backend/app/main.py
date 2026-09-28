from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth, calculator, preferences, profile, questionnaire, recommendations, saved, schemes, understanding, applications, partner_portal

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="Government Scheme Analyzer for Marginalized Entrepreneurs",
    version=settings.VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(profile.router, prefix="/api", tags=["profile"])
app.include_router(questionnaire.router, prefix="/api", tags=["questionnaire"])
app.include_router(schemes.router, prefix="/api", tags=["schemes"])
app.include_router(recommendations.router, prefix="/api", tags=["recommendations"])
app.include_router(saved.router, prefix="/api", tags=["saved"])
app.include_router(preferences.router, prefix="/api", tags=["preferences"])
app.include_router(understanding.router, prefix="/api", tags=["ai-understanding"])
app.include_router(calculator.router, prefix="/api", tags=["calculator"])
app.include_router(applications.router, prefix="/api", tags=["applications"])
app.include_router(partner_portal.router, prefix="/api", tags=["partner"])


@app.get("/health")
def health_check():
    return {"status": "ok", "version": settings.VERSION, "service": settings.APP_NAME}


@app.get("/")
def root():
    return {"message": "VittVanni Backend API", "version": settings.VERSION, "docs": "/docs", "health": "/health"}