"""
Triage & Routing Package
------------------------
Smart triage and road routing for disaster-damaged buildings.

Submodules:
  - priority:  Composite priority scoring (severity × size × travel time).
  - routing:   OSMnx road graph loading and shortest-path computation.
  - pipeline:  End-to-end orchestrator bridging model output → frontend.
"""

from src.triage.priority import (
    BuildingAssessment,
    compute_priority_scores,
    buildings_to_summary,
    DAMAGE_CLASSES,
    SEVERITY_MAP,
    DEFAULT_WEIGHTS,
)
from src.triage.routing import RoadNetwork
from src.triage.pipeline import (
    TriagePipeline,
    run_triage,
    predictions_to_buildings,
    geojson_to_buildings,
)

__all__ = [
    "BuildingAssessment",
    "compute_priority_scores",
    "buildings_to_summary",
    "DAMAGE_CLASSES",
    "SEVERITY_MAP",
    "DEFAULT_WEIGHTS",
    "RoadNetwork",
    "TriagePipeline",
    "run_triage",
    "predictions_to_buildings",
    "geojson_to_buildings",
]
