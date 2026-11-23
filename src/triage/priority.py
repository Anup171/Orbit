"""
Priority Scoring Module
-----------------------
Computes a composite priority score for each damaged building to decide
the order in which rescue teams should respond.

The score combines three weighted factors (from config.yaml → triage.weights):
  1. Severity  (0.5) — higher damage class → higher priority.
  2. Size      (0.3) — larger building footprint → more likely occupants.
  3. Travel    (0.2) — shorter travel time from staging point → faster response.

Buildings are ranked by descending composite score. Those below a
confidence threshold are additionally flagged for manual review.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

import numpy as np


# ──────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────

DAMAGE_CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"]

#: Base severity value per damage class (0–1 scale, higher = worse).
SEVERITY_MAP: Dict[str, float] = {
    "no-damage":    0.00,
    "minor-damage": 0.30,
    "major-damage": 0.65,
    "destroyed":    1.00,
}

#: Default weights from config.yaml → triage.weights.
DEFAULT_WEIGHTS = {
    "severity": 0.5,
    "size": 0.3,
    "travel_time": 0.2,
}


# ──────────────────────────────────────────────────────────────
# Data class for a single assessed building
# ──────────────────────────────────────────────────────────────

@dataclass
class BuildingAssessment:
    """
    Container for one building's damage assessment output.
    """
    building_id: str
    damage_class: str                     # one of DAMAGE_CLASSES
    damage_score: float                   # model softmax confidence for predicted class
    area_sq_m: float                      # footprint area in square metres
    centroid_lat: float = 0.0
    centroid_lon: float = 0.0
    confidence: float = 1.0              # max softmax probability
    needs_manual_review: bool = False
    travel_time_minutes: Optional[float] = None   # filled in by routing module

    # Computed fields
    priority_score: float = 0.0
    priority_rank: int = 0


# ──────────────────────────────────────────────────────────────
# Normalisation helpers
# ──────────────────────────────────────────────────────────────

def _min_max_normalize(values: np.ndarray) -> np.ndarray:
    """Min-max normalise an array to [0, 1]. Returns zeros if constant."""
    vmin, vmax = values.min(), values.max()
    if vmax - vmin < 1e-9:
        return np.zeros_like(values)
    return (values - vmin) / (vmax - vmin)


# ──────────────────────────────────────────────────────────────
# Core scoring logic
# ──────────────────────────────────────────────────────────────

def compute_severity_scores(buildings: List[BuildingAssessment]) -> np.ndarray:
    """
    Map each building's damage class to a 0–1 severity value,
    weighted by model confidence.
    """
    scores = np.array([
        SEVERITY_MAP.get(b.damage_class, 0.0) * b.damage_score
        for b in buildings
    ])
    return scores


def compute_size_scores(buildings: List[BuildingAssessment]) -> np.ndarray:
    """
    Normalise building areas to [0, 1] — larger buildings get higher scores
    (more likely to have trapped occupants).
    """
    areas = np.array([b.area_sq_m for b in buildings])
    return _min_max_normalize(areas)


def compute_travel_scores(buildings: List[BuildingAssessment]) -> np.ndarray:
    """
    Invert normalised travel times so that *closer* buildings get higher
    scores (faster to reach → higher priority).

    Buildings without a travel time (None) are assigned a neutral score of 0.5.
    """
    times = np.array([
        b.travel_time_minutes if b.travel_time_minutes is not None else np.nan
        for b in buildings
    ])

    # Handle all-NaN case
    if np.all(np.isnan(times)):
        return np.full(len(buildings), 0.5)

    # Replace NaN with the median of known values
    median_time = float(np.nanmedian(times))
    times = np.where(np.isnan(times), median_time, times)

    normalised = _min_max_normalize(times)
    # Invert: short travel → high score
    return 1.0 - normalised


def compute_priority_scores(
    buildings: List[BuildingAssessment],
    weights: Optional[Dict[str, float]] = None,
    confidence_threshold: float = 0.6,
) -> List[BuildingAssessment]:
    """
    Compute composite priority scores and rank all buildings.

    Args:
        buildings:  List of BuildingAssessment objects with damage_class,
                    area_sq_m, and optionally travel_time_minutes filled in.
        weights:    Dict with keys 'severity', 'size', 'travel_time'
                    summing to ~1.0. Defaults to config.yaml values.
        confidence_threshold: Buildings below this confidence are flagged
                    for manual review.

    Returns:
        The same list sorted by descending priority_score, with
        priority_score, priority_rank, and needs_manual_review populated.
    """
    if not buildings:
        return buildings

    w = weights or DEFAULT_WEIGHTS
    w_sev = w.get("severity", 0.5)
    w_size = w.get("size", 0.3)
    w_travel = w.get("travel_time", 0.2)

    sev = compute_severity_scores(buildings)
    size = compute_size_scores(buildings)
    travel = compute_travel_scores(buildings)

    composite = w_sev * sev + w_size * size + w_travel * travel

    for i, b in enumerate(buildings):
        b.priority_score = float(composite[i])
        b.needs_manual_review = b.confidence < confidence_threshold

    # Sort descending by composite score
    buildings.sort(key=lambda b: b.priority_score, reverse=True)

    for rank, b in enumerate(buildings, start=1):
        b.priority_rank = rank

    return buildings


# ──────────────────────────────────────────────────────────────
# GeoJSON conversion helpers
# ──────────────────────────────────────────────────────────────

def building_to_geojson_properties(b: BuildingAssessment) -> dict:
    """
    Convert a BuildingAssessment to the properties dict matching the
    sample_triage.geojson schema.
    """
    return {
        "building_id": b.building_id,
        "damage_class": b.damage_class,
        "damage_score": round(b.damage_score, 4),
        "area_sq_m": round(b.area_sq_m, 1),
        "priority_rank": b.priority_rank,
        "priority_score": round(b.priority_score, 4),
        "confidence": round(b.confidence, 4),
        "needs_manual_review": b.needs_manual_review,
    }


def buildings_to_summary(buildings: List[BuildingAssessment]) -> dict:
    """
    Generate aggregate triage statistics.
    """
    total = len(buildings)
    if total == 0:
        return {"total": 0}

    class_counts = {}
    for b in buildings:
        class_counts[b.damage_class] = class_counts.get(b.damage_class, 0) + 1

    flagged = sum(1 for b in buildings if b.needs_manual_review)

    return {
        "total_buildings": total,
        "damage_distribution": class_counts,
        "flagged_for_review": flagged,
        "flagged_percent": round(100.0 * flagged / total, 1),
        "top_priority_id": buildings[0].building_id if buildings else None,
        "avg_priority_score": round(
            float(np.mean([b.priority_score for b in buildings])), 4
        ),
    }
