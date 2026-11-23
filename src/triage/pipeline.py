"""
Triage Pipeline Orchestrator
-----------------------------
End-to-end pipeline that takes model predictions (damage polygons)
and produces a prioritised, routed triage plan:

  1. Convert model outputs → BuildingAssessment objects.
  2. Load road network graph (OSMnx).
  3. Compute travel times from staging point to each building.
  4. Score and rank buildings by composite priority.
  5. Generate route geometries for the top-priority targets.
  6. Export everything as a GeoJSON FeatureCollection for the frontend.

This module bridges Stage 3 (Eval & Calibration) with Stage 5
(Serving & App UI).
"""

from __future__ import annotations

import json
import logging
from typing import List, Dict, Optional, Tuple

import numpy as np

try:
    import geopandas as gpd
    from shapely.geometry import shape, mapping, Polygon, Point
    HAS_GEO = True
except ImportError:
    HAS_GEO = False

from src.triage.priority import (
    BuildingAssessment,
    compute_priority_scores,
    building_to_geojson_properties,
    buildings_to_summary,
    DAMAGE_CLASSES,
)
from src.triage.routing import RoadNetwork

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Conversion helpers: model output → BuildingAssessment
# ──────────────────────────────────────────────────────────────

def predictions_to_buildings(
    damage_polygons: List[dict],
    confidence_threshold: float = 0.6,
) -> List[BuildingAssessment]:
    """
    Convert a list of prediction dicts (from the model / API) into
    BuildingAssessment objects.

    Each dict is expected to have at minimum:
        {
            "building_id": str,
            "damage_class": str,          # one of DAMAGE_CLASSES
            "damage_score": float,        # softmax confidence
            "area_sq_m": float,
            "centroid_lat": float,
            "centroid_lon": float,
            "confidence": float,          # max softmax prob
        }
    """
    buildings = []
    for pred in damage_polygons:
        b = BuildingAssessment(
            building_id=pred["building_id"],
            damage_class=pred.get("damage_class", "no-damage"),
            damage_score=pred.get("damage_score", 0.0),
            area_sq_m=pred.get("area_sq_m", 0.0),
            centroid_lat=pred.get("centroid_lat", 0.0),
            centroid_lon=pred.get("centroid_lon", 0.0),
            confidence=pred.get("confidence", 1.0),
        )
        b.needs_manual_review = b.confidence < confidence_threshold
        buildings.append(b)
    return buildings


def geojson_to_buildings(
    geojson_path: str,
    confidence_threshold: float = 0.6,
) -> List[BuildingAssessment]:
    """
    Load building assessments from a GeoJSON file (e.g. sample_triage.geojson
    or the output of the prediction API).
    """
    with open(geojson_path, "r") as f:
        fc = json.load(f)

    buildings = []
    for feature in fc.get("features", []):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})

        # Compute centroid from geometry
        centroid_lat, centroid_lon = 0.0, 0.0
        if HAS_GEO and geom:
            poly = shape(geom)
            centroid = poly.centroid
            centroid_lon = centroid.x
            centroid_lat = centroid.y
        elif geom.get("type") == "Polygon" and geom.get("coordinates"):
            coords = geom["coordinates"][0]
            centroid_lon = sum(c[0] for c in coords) / len(coords)
            centroid_lat = sum(c[1] for c in coords) / len(coords)

        b = BuildingAssessment(
            building_id=props.get("building_id", "unknown"),
            damage_class=props.get("damage_class", "no-damage"),
            damage_score=props.get("damage_score", 0.0),
            area_sq_m=props.get("area_sq_m", 0.0),
            centroid_lat=centroid_lat,
            centroid_lon=centroid_lon,
            confidence=props.get("confidence", 1.0),
            needs_manual_review=props.get("needs_manual_review", False),
        )
        buildings.append(b)

    return buildings


# ──────────────────────────────────────────────────────────────
# Full triage pipeline
# ──────────────────────────────────────────────────────────────

class TriagePipeline:
    """
    End-to-end pipeline: predictions → prioritised, routed triage plan.
    """

    def __init__(
        self,
        staging_lat: float,
        staging_lon: float,
        road_network: Optional[RoadNetwork] = None,
        priority_weights: Optional[Dict[str, float]] = None,
        confidence_threshold: float = 0.6,
        network_radius_m: int = 5000,
        cache_dir: Optional[str] = None,
    ):
        """
        Args:
            staging_lat, staging_lon: Coordinates of the rescue staging point.
            road_network: Pre-loaded RoadNetwork (if None, will be fetched).
            priority_weights: Override default priority weights.
            confidence_threshold: Flag buildings below this for manual review.
            network_radius_m: Radius for OSMnx graph download.
            cache_dir: Directory for caching the road graph.
        """
        self.staging_lat = staging_lat
        self.staging_lon = staging_lon
        self.priority_weights = priority_weights
        self.confidence_threshold = confidence_threshold
        self.network_radius_m = network_radius_m
        self.cache_dir = cache_dir

        self._road_network = road_network

    @property
    def road_network(self) -> RoadNetwork:
        """Lazy-load the road network on first access."""
        if self._road_network is None:
            logger.info("Loading road network around staging point...")
            self._road_network = RoadNetwork.from_point(
                center_lat=self.staging_lat,
                center_lon=self.staging_lon,
                dist_m=self.network_radius_m,
                cache_dir=self.cache_dir,
            )
            logger.info("Road network: %s", self._road_network.summary())
        return self._road_network

    def run(
        self,
        buildings: List[BuildingAssessment],
        compute_routes: bool = True,
        top_k_routes: Optional[int] = 10,
    ) -> dict:
        """
        Execute the full triage pipeline.

        Args:
            buildings: List of BuildingAssessment objects (from model output).
            compute_routes: Whether to compute road routing.
            top_k_routes: Only compute route geometries for the top-k priority
                          buildings (None = all).

        Returns:
            {
                "buildings": [...],          # prioritised BuildingAssessment list
                "routes": [...],             # GeoJSON route Features
                "summary": {...},            # aggregate statistics
                "geojson": {...},            # full FeatureCollection for frontend
            }
        """
        # 1. Compute travel times (batch for efficiency)
        if compute_routes and buildings:
            self._fill_travel_times(buildings)

        # 2. Score and rank
        ranked = compute_priority_scores(
            buildings,
            weights=self.priority_weights,
            confidence_threshold=self.confidence_threshold,
        )

        # 3. Generate route geometries for top-priority buildings
        routes = []
        if compute_routes and buildings:
            route_targets = ranked[:top_k_routes] if top_k_routes else ranked
            coords = [(b.centroid_lat, b.centroid_lon) for b in route_targets]
            routes = self.road_network.compute_routes_to_buildings(
                self.staging_lat,
                self.staging_lon,
                coords,
            )

        # 4. Build output GeoJSON
        geojson = self._build_geojson(ranked, routes)
        summary = buildings_to_summary(ranked)

        return {
            "buildings": ranked,
            "routes": routes,
            "summary": summary,
            "geojson": geojson,
        }

    def _fill_travel_times(self, buildings: List[BuildingAssessment]):
        """Batch-compute travel times from staging point to each building."""
        coords = [(b.centroid_lat, b.centroid_lon) for b in buildings]
        times = self.road_network.compute_travel_times_batch(
            self.staging_lat,
            self.staging_lon,
            coords,
        )
        for b, t in zip(buildings, times):
            b.travel_time_minutes = t

    def _build_geojson(
        self,
        buildings: List[BuildingAssessment],
        routes: List[Optional[dict]],
    ) -> dict:
        """
        Build a complete GeoJSON FeatureCollection containing both
        building damage polygons and route LineStrings.
        """
        features = []

        # Building features (as point geometry — centroid)
        for b in buildings:
            feature = {
                "type": "Feature",
                "properties": building_to_geojson_properties(b),
                "geometry": {
                    "type": "Point",
                    "coordinates": [b.centroid_lon, b.centroid_lat],
                },
            }
            features.append(feature)

        # Route features
        for route in routes:
            if route is not None:
                features.append(route)

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    def run_from_geojson(
        self,
        geojson_path: str,
        compute_routes: bool = True,
        top_k_routes: Optional[int] = 10,
    ) -> dict:
        """
        Convenience method: load predictions from GeoJSON → run pipeline.
        """
        buildings = geojson_to_buildings(
            geojson_path,
            confidence_threshold=self.confidence_threshold,
        )
        return self.run(
            buildings,
            compute_routes=compute_routes,
            top_k_routes=top_k_routes,
        )


# ──────────────────────────────────────────────────────────────
# Standalone convenience function
# ──────────────────────────────────────────────────────────────

def run_triage(
    damage_predictions: List[dict],
    staging_lat: float,
    staging_lon: float,
    priority_weights: Optional[Dict[str, float]] = None,
    confidence_threshold: float = 0.6,
    compute_routes: bool = True,
    top_k_routes: int = 10,
    network_radius_m: int = 5000,
    cache_dir: Optional[str] = None,
) -> dict:
    """
    One-shot convenience function for the full triage pipeline.
    """
    buildings = predictions_to_buildings(
        damage_predictions,
        confidence_threshold=confidence_threshold,
    )

    pipeline = TriagePipeline(
        staging_lat=staging_lat,
        staging_lon=staging_lon,
        priority_weights=priority_weights,
        confidence_threshold=confidence_threshold,
        network_radius_m=network_radius_m,
        cache_dir=cache_dir,
    )

    return pipeline.run(
        buildings,
        compute_routes=compute_routes,
        top_k_routes=top_k_routes,
    )
