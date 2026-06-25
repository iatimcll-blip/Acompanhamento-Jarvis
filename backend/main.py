"""
Jarvis MCLL - Backend API
Dashboard de Acompanhamento de Operações
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Jarvis MCLL API",
    description="API para análise de operações, redes, B2B e frota",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "Jarvis MCLL API is running",
        "version": "1.0.0"
    }

# Root
@app.get("/")
async def root():
    return {
        "message": "Bem-vindo ao Jarvis MCLL",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "redes": "/api/redes",
            "b2b": "/api/b2b",
            "frota": "/api/frota",
            "upload": "/api/upload"
        }
    }

# Import routes (will be added)
# from app.routes import redes, b2b, frota, upload

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
