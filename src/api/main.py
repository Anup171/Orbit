"""
FastAPI Application Entry Point
--------------------------------
Creates and configures the FastAPI app with CORS, database init,
and route registration.

Run with:
    uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.database.connection import init_db

app = FastAPI(
    title="Disaster Damage Assessment API",
    description="Satellite imagery damage assessment, triage, and routing API",
    version="1.0.0",
)

# CORS — allow the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(router, prefix="/api/v1")


@app.on_event("startup")
def on_startup():
    """Initialize the database tables on startup."""
    init_db()
