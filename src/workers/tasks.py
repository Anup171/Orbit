"""
Celery Tasks for Background ONNX Inference
-------------------------------------------
Defines the asynchronous prediction task that:
  1. Loads pre/post satellite image pair.
  2. Runs ONNX inference for localization + damage assessment.
  3. Runs the triage pipeline (priority scoring + optional routing).
  4. Stores results in the database.

The worker is designed to run on a GPU node with onnxruntime-gpu.
Falls back to the MockDamageModel stub when ONNX model is not available.
"""

import os
import sys
import json
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import cv2

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.workers.celery_app import celery_app
from src.database.connection import SessionLocal
from src.database.models import AssessmentJob, BuildingRecord

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# ONNX model loader (lazy singleton)
# ──────────────────────────────────────────────────────────────

_onnx_session = None

def _get_onnx_session():
    """Load the ONNX model once and cache it."""
    global _onnx_session
    if _onnx_session is not None:
        return _onnx_session

    model_path = os.getenv("ONNX_MODEL_PATH", "checkpoints/siamese_resnet34.onnx")

    if os.path.exists(model_path):
        try:
            import onnxruntime as ort
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            _onnx_session = ort.InferenceSession(model_path, providers=providers)
            logger.info("ONNX model loaded from %s", model_path)
            return _onnx_session
        except Exception as e:
            logger.warning("Failed to load ONNX model: %s. Using mock.", e)

    logger.info("Using MockDamageModel (ONNX model not found at %s)", model_path)
    return None


def _run_inference(pre_img: np.ndarray, post_img: np.ndarray):
    """
    Run inference using ONNX Runtime or fall back to mock.
    Returns (loc_mask, dmg_probs): both numpy arrays.
    """
    session = _get_onnx_session()

    if session is not None:
        # Normalise and prepare tensors: (1, 3, H, W) float32
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)

        def prepare(img):
            t = img.astype(np.float32) / 255.0
            t = np.transpose(t, (2, 0, 1))[np.newaxis]  # (1, 3, H, W)
            return (t - mean) / std

        pre_t = prepare(pre_img)
        post_t = prepare(post_img)

        loc_prob, dmg_prob = session.run(
            None,
            {"pre_img": pre_t, "post_img": post_t},
        )
        # loc_prob: (1, 1, H, W), dmg_prob: (1, 4, H, W)
        loc_mask = (loc_prob[0, 0] > 0.5).astype(np.uint8)
        dmg_probs = np.transpose(dmg_prob[0], (1, 2, 0))  # (H, W, 4)
        return loc_mask, dmg_probs
    else:
        # Fallback to mock
        from stubs.mock_onnx_runner import MockDamageModel
        mock = MockDamageModel()
        return mock.predict(pre_img, post_img)


# ──────────────────────────────────────────────────────────────
# Building extraction from pixel-level predictions
# ──────────────────────────────────────────────────────────────

DAMAGE_CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"]

def _extract_buildings(loc_mask: np.ndarray, dmg_probs: np.ndarray):
    """
    Extract individual buildings from the localization mask using
    connected components, and assign each a damage class based on
    the dominant damage probability within its footprint.
    """
    num_labels, labels = cv2.connectedComponents(loc_mask)
    buildings = []

    for label_id in range(1, num_labels):
        mask = (labels == label_id)
        pixel_count = int(mask.sum())
        if pixel_count < 10:  # filter noise
            continue

        # Approximate area (pixels → sq metres, assuming ~0.3m/px)
        area_sq_m = pixel_count * 0.3 * 0.3

        # Damage: average probabilities within this building footprint
        building_probs = dmg_probs[mask]  # (N, 4)
        avg_probs = building_probs.mean(axis=0)
        pred_class = int(np.argmax(avg_probs))
        confidence = float(avg_probs[pred_class])

        # Centroid
        ys, xs = np.where(mask)
        cy, cx = float(ys.mean()), float(xs.mean())

        buildings.append({
            "building_id": f"bldg_{label_id:04d}",
            "damage_class": DAMAGE_CLASSES[pred_class],
            "damage_score": float(avg_probs[pred_class]),
            "area_sq_m": round(area_sq_m, 1),
            "centroid_lat": cy,     # pixel coords; georeferencing is done later
            "centroid_lon": cx,
            "confidence": confidence,
        })

    return buildings


# ──────────────────────────────────────────────────────────────
# Main Celery task
# ──────────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="predict_damage")
def predict_damage(
    self,
    job_id: str,
    pre_image_path: str,
    post_image_path: str,
    staging_lat: Optional[float] = None,
    staging_lon: Optional[float] = None,
):
    """
    Background task: run damage assessment on a satellite image pair.
    """
    db = SessionLocal()
    try:
        # Update job status
        job = db.query(AssessmentJob).filter(AssessmentJob.id == job_id).first()
        if job:
            job.status = "processing"
            db.commit()

        # 1. Load images
        pre_img = cv2.imread(pre_image_path)
        post_img = cv2.imread(post_image_path)

        if pre_img is None or post_img is None:
            raise FileNotFoundError(
                f"Could not load images: pre={pre_image_path}, post={post_image_path}"
            )

        pre_rgb = cv2.cvtColor(pre_img, cv2.COLOR_BGR2RGB)
        post_rgb = cv2.cvtColor(post_img, cv2.COLOR_BGR2RGB)

        # 2. Run inference
        loc_mask, dmg_probs = _run_inference(pre_rgb, post_rgb)

        # 3. Extract buildings
        buildings = _extract_buildings(loc_mask, dmg_probs)

        # 4. Priority scoring (without routing for now — routing needs geo coords)
        from src.triage.priority import (
            BuildingAssessment,
            compute_priority_scores,
            buildings_to_summary,
        )

        assessments = []
        for b in buildings:
            assessments.append(BuildingAssessment(
                building_id=b["building_id"],
                damage_class=b["damage_class"],
                damage_score=b["damage_score"],
                area_sq_m=b["area_sq_m"],
                centroid_lat=b["centroid_lat"],
                centroid_lon=b["centroid_lon"],
                confidence=b["confidence"],
            ))

        ranked = compute_priority_scores(assessments, confidence_threshold=0.6)
        summary = buildings_to_summary(ranked)

        # 5. Store results in DB
        for b in ranked:
            record = BuildingRecord(
                job_id=job_id,
                building_id=b.building_id,
                damage_class=b.damage_class,
                damage_score=b.damage_score,
                area_sq_m=b.area_sq_m,
                priority_rank=b.priority_rank,
                priority_score=b.priority_score,
                confidence=b.confidence,
                needs_manual_review=b.needs_manual_review,
                centroid_lat=b.centroid_lat,
                centroid_lon=b.centroid_lon,
                travel_time_minutes=b.travel_time_minutes,
            )
            db.add(record)

        if job:
            job.status = "completed"
            job.total_buildings = summary.get("total_buildings", 0)
            job.flagged_for_review = summary.get("flagged_for_review", 0)
            job.summary_json = json.dumps(summary)
            job.completed_at = datetime.utcnow()

        db.commit()
        logger.info("Job %s completed: %d buildings assessed", job_id, len(ranked))

        return {
            "job_id": job_id,
            "status": "completed",
            "total_buildings": len(ranked),
            "summary": summary,
        }

    except Exception as e:
        logger.exception("Job %s failed: %s", job_id, e)
        if job:
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
        raise

    finally:
        db.close()
