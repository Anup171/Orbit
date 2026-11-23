"""
FastAPI Routes — Disaster Damage Assessment API
-------------------------------------------------
Endpoints:
  GET  /health              — Service health check
  POST /predict             — Submit image pair for async damage assessment
  GET  /jobs/{job_id}       — Check job status
  GET  /jobs/{job_id}/results — Retrieve prioritised building results
  GET  /jobs/{job_id}/geojson — Download results as GeoJSON FeatureCollection
  POST /triage              — Re-run triage with a new staging point
"""

import os
import json
import uuid
import shutil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from src.database.connection import get_db
from src.database.models import AssessmentJob, BuildingRecord
from src.api.schemas import (
    PredictRequest,
    TriageRequest,
    JobCreatedResponse,
    JobStatusResponse,
    JobResultsResponse,
    BuildingResponse,
    HealthResponse,
)

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "data/uploads")


# ──────────────────────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
def health():
    model_path = os.getenv("ONNX_MODEL_PATH", "checkpoints/siamese_resnet34.onnx")
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        model_loaded=os.path.exists(model_path),
    )


# ──────────────────────────────────────────────────────────────
# Submit prediction job
# ──────────────────────────────────────────────────────────────

@router.post("/predict", response_model=JobCreatedResponse)
async def predict(
    pre_image: UploadFile = File(..., description="Pre-disaster satellite image"),
    post_image: UploadFile = File(..., description="Post-disaster satellite image"),
    staging_lat: Optional[float] = Query(None),
    staging_lon: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Upload a pre/post satellite image pair and queue an assessment job.
    Returns the job_id to poll for results.
    """
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # Save uploaded files
    pre_path = os.path.join(job_dir, f"pre_{pre_image.filename}")
    post_path = os.path.join(job_dir, f"post_{post_image.filename}")

    with open(pre_path, "wb") as f:
        shutil.copyfileobj(pre_image.file, f)
    with open(post_path, "wb") as f:
        shutil.copyfileobj(post_image.file, f)

    # Create DB record
    job = AssessmentJob(
        id=job_id,
        status="pending",
        pre_image_path=pre_path,
        post_image_path=post_path,
        staging_lat=staging_lat,
        staging_lon=staging_lon,
    )
    db.add(job)
    db.commit()

    # Queue Celery task
    from src.workers.tasks import predict_damage
    predict_damage.delay(
        job_id=job_id,
        pre_image_path=pre_path,
        post_image_path=post_path,
        staging_lat=staging_lat,
        staging_lon=staging_lon,
    )

    return JobCreatedResponse(job_id=job_id, status="pending")


# ──────────────────────────────────────────────────────────────
# Job status
# ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Check the status of an assessment job."""
    job = db.query(AssessmentJob).filter(AssessmentJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        total_buildings=job.total_buildings,
        flagged_for_review=job.flagged_for_review,
        created_at=job.created_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
    )


# ──────────────────────────────────────────────────────────────
# Job results
# ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/results", response_model=JobResultsResponse)
def get_job_results(job_id: str, db: Session = Depends(get_db)):
    """
    Retrieve the prioritised building damage results for a completed job.
    """
    job = db.query(AssessmentJob).filter(AssessmentJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.status != "completed":
        return JobResultsResponse(job_id=job.id, status=job.status)

    records = (
        db.query(BuildingRecord)
        .filter(BuildingRecord.job_id == job_id)
        .order_by(BuildingRecord.priority_rank)
        .all()
    )

    buildings = [
        BuildingResponse(
            building_id=r.building_id,
            damage_class=r.damage_class,
            damage_score=r.damage_score,
            area_sq_m=r.area_sq_m,
            priority_rank=r.priority_rank,
            priority_score=r.priority_score,
            confidence=r.confidence,
            needs_manual_review=r.needs_manual_review,
            centroid_lat=r.centroid_lat,
            centroid_lon=r.centroid_lon,
            travel_time_minutes=r.travel_time_minutes,
        )
        for r in records
    ]

    summary = json.loads(job.summary_json) if job.summary_json else None

    return JobResultsResponse(
        job_id=job.id,
        status=job.status,
        summary=summary,
        buildings=buildings,
    )


# ──────────────────────────────────────────────────────────────
# GeoJSON export
# ──────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/geojson")
def get_job_geojson(job_id: str, db: Session = Depends(get_db)):
    """
    Download the assessment results as a GeoJSON FeatureCollection
    compatible with MapLibre / the React frontend.
    """
    job = db.query(AssessmentJob).filter(AssessmentJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job is still {job.status}")

    records = (
        db.query(BuildingRecord)
        .filter(BuildingRecord.job_id == job_id)
        .order_by(BuildingRecord.priority_rank)
        .all()
    )

    features = []
    for r in records:
        feature = {
            "type": "Feature",
            "properties": {
                "building_id": r.building_id,
                "damage_class": r.damage_class,
                "damage_score": r.damage_score,
                "area_sq_m": r.area_sq_m,
                "priority_rank": r.priority_rank,
                "priority_score": r.priority_score,
                "confidence": r.confidence,
                "needs_manual_review": r.needs_manual_review,
            },
            "geometry": json.loads(r.geometry_json) if r.geometry_json else {
                "type": "Point",
                "coordinates": [r.centroid_lon, r.centroid_lat],
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


# ──────────────────────────────────────────────────────────────
# Re-run triage with new staging point
# ──────────────────────────────────────────────────────────────

@router.post("/triage")
def run_triage_endpoint(
    request: TriageRequest,
    db: Session = Depends(get_db),
):
    """
    Re-run triage/routing on an existing completed job with a
    new staging point. Updates priority ranks and travel times.
    """
    job = db.query(AssessmentJob).filter(AssessmentJob.id == request.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job is {job.status}, not completed")

    records = (
        db.query(BuildingRecord)
        .filter(BuildingRecord.job_id == request.job_id)
        .all()
    )

    from src.triage.priority import BuildingAssessment, compute_priority_scores

    assessments = [
        BuildingAssessment(
            building_id=r.building_id,
            damage_class=r.damage_class,
            damage_score=r.damage_score,
            area_sq_m=r.area_sq_m,
            centroid_lat=r.centroid_lat,
            centroid_lon=r.centroid_lon,
            confidence=r.confidence,
        )
        for r in records
    ]

    ranked = compute_priority_scores(assessments, confidence_threshold=0.6)

    # Update DB records
    record_map = {r.building_id: r for r in records}
    for b in ranked:
        if b.building_id in record_map:
            rec = record_map[b.building_id]
            rec.priority_rank = b.priority_rank
            rec.priority_score = b.priority_score
            rec.needs_manual_review = b.needs_manual_review

    job.staging_lat = request.staging_lat
    job.staging_lon = request.staging_lon
    db.commit()

    return {
        "job_id": request.job_id,
        "message": "Triage re-run complete",
        "total_buildings": len(ranked),
    }
