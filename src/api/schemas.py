"""
Pydantic Request / Response Schemas
------------------------------------
Defines the data contracts for the FastAPI endpoints.
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """Body for POST /predict — submit a new assessment job."""
    staging_lat: Optional[float] = Field(None, description="Latitude of the staging/rescue point")
    staging_lon: Optional[float] = Field(None, description="Longitude of the staging/rescue point")


class TriageRequest(BaseModel):
    """Body for POST /triage — run triage on existing predictions."""
    job_id: str
    staging_lat: float
    staging_lon: float
    top_k_routes: int = Field(10, ge=1, le=100)


# ──────────────────────────────────────────────────────────────
# Response schemas
# ──────────────────────────────────────────────────────────────

class JobCreatedResponse(BaseModel):
    job_id: str
    status: str = "pending"
    message: str = "Assessment job created"


class BuildingResponse(BaseModel):
    building_id: str
    damage_class: str
    damage_score: float
    area_sq_m: float
    priority_rank: int
    priority_score: float
    confidence: float
    needs_manual_review: bool
    centroid_lat: float
    centroid_lon: float
    travel_time_minutes: Optional[float] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    total_buildings: int = 0
    flagged_for_review: int = 0
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class JobResultsResponse(BaseModel):
    job_id: str
    status: str
    summary: Optional[Dict[str, Any]] = None
    buildings: List[BuildingResponse] = []


class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    model_loaded: bool = False
