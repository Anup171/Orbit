"""
OSMnx Road Routing Module
--------------------------
Loads a road network graph from OpenStreetMap via OSMnx and computes
shortest-path routes from a staging point (e.g. fire station, field
hospital) to each damaged building.

Capabilities:
  1. Download or load a cached road network graph for a disaster region.
  2. Snap building centroids to the nearest network node.
  3. Compute shortest-path travel times (using edge lengths and
     assumed travel speeds for each road type).
  4. Return ordered route geometries for the frontend RoutePanel.

This module is designed to work offline with cached graphs when
internet access is unavailable in disaster zones.
"""

from __future__ import annotations

import os
import json
import pickle
import logging
from typing import List, Dict, Optional, Tuple

import numpy as np
import networkx as nx

try:
    import osmnx as ox
    HAS_OSMNX = True
except ImportError:
    HAS_OSMNX = False

try:
    from shapely.geometry import Point, LineString, mapping
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Default travel speeds (km/h) per road type — conservative
# disaster-zone estimates (debris, damage, emergency vehicles).
# ──────────────────────────────────────────────────────────────

DEFAULT_SPEEDS: Dict[str, float] = {
    "motorway":      50.0,
    "trunk":         40.0,
    "primary":       35.0,
    "secondary":     30.0,
    "tertiary":      25.0,
    "residential":   20.0,
    "unclassified":  15.0,
    "service":       10.0,
    "living_street": 10.0,
    "default":       15.0,
}


# ──────────────────────────────────────────────────────────────
# Graph loading and caching
# ──────────────────────────────────────────────────────────────

class RoadNetwork:
    """
    Wraps an OSMnx / NetworkX road graph with routing utilities.
    """

    def __init__(
        self,
        graph: Optional[nx.MultiDiGraph] = None,
        speeds: Optional[Dict[str, float]] = None,
    ):
        self.graph = graph
        self.speeds = speeds or DEFAULT_SPEEDS
        self._travel_time_added = False

    # ── Loading methods ──────────────────────────────────────

    @classmethod
    def from_point(
        cls,
        center_lat: float,
        center_lon: float,
        dist_m: int = 5000,
        network_type: str = "drive",
        cache_dir: Optional[str] = None,
        **kwargs,
    ) -> "RoadNetwork":
        """
        Download a road network centred on (lat, lon) with the given
        radius in metres. Optionally caches to disk.
        """
        if not HAS_OSMNX:
            raise ImportError("osmnx is required — pip install osmnx")

        cache_path = None
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            cache_path = os.path.join(
                cache_dir,
                f"graph_{center_lat:.4f}_{center_lon:.4f}_{dist_m}m.graphml",
            )
            if os.path.exists(cache_path):
                logger.info("Loading cached graph from %s", cache_path)
                G = ox.load_graphml(cache_path)
                return cls(graph=G, **kwargs)

        logger.info(
            "Downloading road network: (%.4f, %.4f), %d m radius",
            center_lat, center_lon, dist_m,
        )
        G = ox.graph_from_point(
            (center_lat, center_lon),
            dist=dist_m,
            network_type=network_type,
        )

        if cache_path:
            ox.save_graphml(G, cache_path)
            logger.info("Graph cached to %s", cache_path)

        return cls(graph=G, **kwargs)

    @classmethod
    def from_bbox(
        cls,
        north: float,
        south: float,
        east: float,
        west: float,
        network_type: str = "drive",
        cache_dir: Optional[str] = None,
        **kwargs,
    ) -> "RoadNetwork":
        """
        Download a road network within the given bounding box.
        """
        if not HAS_OSMNX:
            raise ImportError("osmnx is required — pip install osmnx")

        cache_path = None
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            cache_path = os.path.join(
                cache_dir,
                f"graph_bbox_{north:.4f}_{south:.4f}_{east:.4f}_{west:.4f}.graphml",
            )
            if os.path.exists(cache_path):
                logger.info("Loading cached graph from %s", cache_path)
                G = ox.load_graphml(cache_path)
                return cls(graph=G, **kwargs)

        G = ox.graph_from_bbox(
            bbox=(north, south, east, west),
            network_type=network_type,
        )

        if cache_path:
            ox.save_graphml(G, cache_path)

        return cls(graph=G, **kwargs)

    @classmethod
    def from_graphml(cls, path: str, **kwargs) -> "RoadNetwork":
        """Load a pre-cached GraphML file."""
        if not HAS_OSMNX:
            raise ImportError("osmnx is required — pip install osmnx")
        G = ox.load_graphml(path)
        return cls(graph=G, **kwargs)

    # ── Travel time computation ──────────────────────────────

    def _add_travel_times(self):
        """
        Add a 'travel_time' edge attribute (minutes) based on edge
        length and the highway type's assumed speed.
        """
        if self._travel_time_added or self.graph is None:
            return

        for u, v, data in self.graph.edges(data=True):
            highway = data.get("highway", "default")
            # highway can be a list in OSMnx
            if isinstance(highway, list):
                highway = highway[0]

            speed_kmh = self.speeds.get(highway, self.speeds["default"])
            length_m = data.get("length", 0.0)
            # time = distance / speed  →  minutes
            data["travel_time"] = (length_m / 1000.0) / speed_kmh * 60.0

        self._travel_time_added = True

    # ── Node snapping ────────────────────────────────────────

    def nearest_node(self, lat: float, lon: float) -> int:
        """
        Find the graph node closest to the given (lat, lon) coordinate.
        """
        if not HAS_OSMNX:
            raise ImportError("osmnx is required")
        return ox.nearest_nodes(self.graph, lon, lat)

    def nearest_nodes_batch(
        self,
        lats: List[float],
        lons: List[float],
    ) -> List[int]:
        """
        Snap multiple coordinates to their nearest graph nodes.
        """
        if not HAS_OSMNX:
            raise ImportError("osmnx is required")
        return list(ox.nearest_nodes(self.graph, lons, lats))

    # ── Shortest path routing ────────────────────────────────

    def compute_travel_time(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
    ) -> Optional[float]:
        """
        Compute the shortest-path travel time (minutes) between two
        coordinates on the road network.

        Returns None if no path exists.
        """
        self._add_travel_times()
        orig_node = self.nearest_node(origin_lat, origin_lon)
        dest_node = self.nearest_node(dest_lat, dest_lon)

        try:
            time_min = nx.shortest_path_length(
                self.graph, orig_node, dest_node, weight="travel_time"
            )
            return float(time_min)
        except nx.NetworkXNoPath:
            logger.warning(
                "No path from (%.4f, %.4f) to (%.4f, %.4f)",
                origin_lat, origin_lon, dest_lat, dest_lon,
            )
            return None

    def compute_travel_times_batch(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_coords: List[Tuple[float, float]],
    ) -> List[Optional[float]]:
        """
        Compute travel times from a single origin to many destinations.
        Much more efficient than calling compute_travel_time in a loop
        because we reuse the Dijkstra tree from the origin node.
        """
        self._add_travel_times()
        orig_node = self.nearest_node(origin_lat, origin_lon)

        dest_lats = [c[0] for c in dest_coords]
        dest_lons = [c[1] for c in dest_coords]
        dest_nodes = self.nearest_nodes_batch(dest_lats, dest_lons)

        # Compute shortest-path lengths from origin to all reachable nodes
        try:
            lengths = nx.single_source_dijkstra_path_length(
                self.graph, orig_node, weight="travel_time"
            )
        except Exception:
            lengths = {}

        results = []
        for node in dest_nodes:
            if node in lengths:
                results.append(float(lengths[node]))
            else:
                results.append(None)

        return results

    def compute_route_geometry(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
    ) -> Optional[dict]:
        """
        Compute the shortest-path route and return its geometry as
        a GeoJSON LineString (for the frontend RoutePanel).

        Returns None if no path exists.
        """
        self._add_travel_times()
        orig_node = self.nearest_node(origin_lat, origin_lon)
        dest_node = self.nearest_node(dest_lat, dest_lon)

        try:
            path_nodes = nx.shortest_path(
                self.graph, orig_node, dest_node, weight="travel_time"
            )
        except nx.NetworkXNoPath:
            return None

        # Build coordinate list from node positions
        coords = []
        for node in path_nodes:
            node_data = self.graph.nodes[node]
            coords.append((node_data["x"], node_data["y"]))  # (lon, lat)

        travel_time = self.compute_travel_time(
            origin_lat, origin_lon, dest_lat, dest_lon
        )

        if not HAS_SHAPELY:
            # Fallback: return raw GeoJSON without shapely
            return {
                "type": "Feature",
                "properties": {
                    "travel_time_minutes": travel_time,
                    "num_road_segments": len(path_nodes) - 1,
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
            }

        line = LineString(coords)
        return {
            "type": "Feature",
            "properties": {
                "travel_time_minutes": travel_time,
                "distance_m": round(line.length * 111_320, 1),  # rough deg→m
                "num_road_segments": len(path_nodes) - 1,
            },
            "geometry": mapping(line),
        }

    def compute_routes_to_buildings(
        self,
        origin_lat: float,
        origin_lon: float,
        building_coords: List[Tuple[float, float]],
        top_k: Optional[int] = None,
    ) -> List[Optional[dict]]:
        """
        Compute route geometries from the staging point to each building.

        Args:
            origin_lat, origin_lon: Staging point / field hospital.
            building_coords: List of (lat, lon) for each building centroid.
            top_k: If set, only compute routes for the top-k buildings.

        Returns:
            List of GeoJSON Feature dicts (or None if unreachable).
        """
        targets = building_coords[:top_k] if top_k else building_coords
        routes = []
        for lat, lon in targets:
            route = self.compute_route_geometry(origin_lat, origin_lon, lat, lon)
            routes.append(route)
        return routes

    # ── Graph metadata ───────────────────────────────────────

    def summary(self) -> dict:
        """Return basic graph statistics."""
        if self.graph is None:
            return {"status": "no graph loaded"}
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "strongly_connected": nx.is_strongly_connected(self.graph),
        }
