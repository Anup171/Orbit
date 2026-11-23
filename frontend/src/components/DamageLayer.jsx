/**
 * DamageLayer.jsx
 * ----------------
 * Renders color-coded damage building footprints (Polygons), centroid pins (Points),
 * and emergency rescue routes (LineStrings) on the MapLibre map.
 * 
 * Color scheme:
 *   - no-damage:     #2ecc71 (green)
 *   - minor-damage:  #f1c40f (yellow)
 *   - major-damage:  #e67e22 (orange)
 *   - destroyed:     #e74c3c (red)
 *   - manual review: #9b59b6 (purple outline)
 *   - selected:      #00d2ff (cyan highlight)
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { getFeatureCentroid } from '../utils/geo.js';

const DAMAGE_COLORS = {
  'no-damage': '#2ecc71',
  'minor-damage': '#f1c40f',
  'major-damage': '#e67e22',
  'destroyed': '#e74c3c',
};

const SOURCE_BUILDINGS = 'damage-buildings-src';
const LAYER_POLYGON_FILL = 'damage-polygons-fill';
const LAYER_POLYGON_LINE = 'damage-polygons-line';
const LAYER_POLYGON_HIGHLIGHT = 'damage-polygons-highlight';
const LAYER_POINTS = 'damage-points';

const SOURCE_ROUTES = 'emergency-routes-src';
const LAYER_ROUTE_CASING = 'emergency-routes-casing';
const LAYER_ROUTE_LINE = 'emergency-routes-line';

export default function DamageLayer({
  map,
  geojsonData,
  routeData,
  selectedBuilding,
  onSelectBuilding,
}) {
  const popupRef = useRef(null);

  // Setup layers and update building data
  useEffect(() => {
    if (!map) return;

    // Separate buildings from routes if mixed
    const buildingFeatures = (geojsonData?.features || []).filter(
      (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon' || f.geometry.type === 'Point')
    );

    const safeGeojson = {
      type: 'FeatureCollection',
      features: buildingFeatures,
    };

    if (map.getSource(SOURCE_BUILDINGS)) {
      map.getSource(SOURCE_BUILDINGS).setData(safeGeojson);
    } else {
      map.addSource(SOURCE_BUILDINGS, {
        type: 'geojson',
        data: safeGeojson,
      });

      // 1. Polygon Footprint Fill Layer
      map.addLayer({
        id: LAYER_POLYGON_FILL,
        type: 'fill',
        source: SOURCE_BUILDINGS,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': [
            'match',
            ['get', 'damage_class'],
            'no-damage', DAMAGE_COLORS['no-damage'],
            'minor-damage', DAMAGE_COLORS['minor-damage'],
            'major-damage', DAMAGE_COLORS['major-damage'],
            'destroyed', DAMAGE_COLORS['destroyed'],
            '#888888',
          ],
          'fill-opacity': 0.65,
        },
      });

      // 2. Polygon Outline Layer (with purple indicator for manual review)
      map.addLayer({
        id: LAYER_POLYGON_LINE,
        type: 'line',
        source: SOURCE_BUILDINGS,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', 'needs_manual_review'], false], '#9b59b6',
            ['match',
              ['get', 'damage_class'],
              'no-damage', DAMAGE_COLORS['no-damage'],
              'minor-damage', DAMAGE_COLORS['minor-damage'],
              'major-damage', DAMAGE_COLORS['major-damage'],
              'destroyed', DAMAGE_COLORS['destroyed'],
              '#ffffff',
            ],
          ],
          'line-width': [
            'case',
            ['boolean', ['get', 'needs_manual_review'], false], 3.5,
            1.5,
          ],
          'line-opacity': 0.95,
        },
      });

      // 3. Polygon Selection Highlight Layer
      map.addLayer({
        id: LAYER_POLYGON_HIGHLIGHT,
        type: 'line',
        source: SOURCE_BUILDINGS,
        filter: ['==', ['get', 'building_id'], ''],
        paint: {
          'line-color': '#00e5ff',
          'line-width': 4,
          'line-opacity': 1,
        },
      });

      // 4. Point / Centroid Circles (for point-based data)
      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SOURCE_BUILDINGS,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 11, 20, 20],
          'circle-color': [
            'match',
            ['get', 'damage_class'],
            'no-damage', DAMAGE_COLORS['no-damage'],
            'minor-damage', DAMAGE_COLORS['minor-damage'],
            'major-damage', DAMAGE_COLORS['major-damage'],
            'destroyed', DAMAGE_COLORS['destroyed'],
            '#888888',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': [
            'case',
            ['boolean', ['get', 'needs_manual_review'], false], 3,
            1.5,
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', 'needs_manual_review'], false], '#9b59b6',
            '#ffffff',
          ],
        },
      });

      // Unified Click Handler for Polygons & Points
      const handleClick = (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        const centroid = getFeatureCentroid(feature);

        if (onSelectBuilding) {
          onSelectBuilding(props);
        }

        if (centroid) {
          showPopup(props, centroid);
        }
      };

      map.on('click', LAYER_POLYGON_FILL, handleClick);
      map.on('click', LAYER_POINTS, handleClick);

      // Cursor hover feedback
      const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
      const unsetPointer = () => { map.getCanvas().style.cursor = ''; };

      map.on('mouseenter', LAYER_POLYGON_FILL, setPointer);
      map.on('mouseleave', LAYER_POLYGON_FILL, unsetPointer);
      map.on('mouseenter', LAYER_POINTS, setPointer);
      map.on('mouseleave', LAYER_POINTS, unsetPointer);
    }

    // Auto-fit bounds on initial load
    if (buildingFeatures.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      buildingFeatures.forEach((f) => {
        const centroid = getFeatureCentroid(f);
        if (centroid) bounds.extend(centroid);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 1000 });
      }
    }
  }, [map, geojsonData]);

  // Handle Rescue Routes display
  useEffect(() => {
    if (!map) return;

    const routeFeatures = (routeData?.features || []).filter(
      (f) => f.geometry && f.geometry.type === 'LineString'
    );

    const safeRoutes = {
      type: 'FeatureCollection',
      features: routeFeatures,
    };

    if (map.getSource(SOURCE_ROUTES)) {
      map.getSource(SOURCE_ROUTES).setData(safeRoutes);
    } else {
      map.addSource(SOURCE_ROUTES, {
        type: 'geojson',
        data: safeRoutes,
      });

      // Outer glow / casing
      map.addLayer({
        id: LAYER_ROUTE_CASING,
        type: 'line',
        source: SOURCE_ROUTES,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#0044ff',
          'line-width': 8,
          'line-opacity': 0.5,
        },
      });

      // Core route line
      map.addLayer({
        id: LAYER_ROUTE_LINE,
        type: 'line',
        source: SOURCE_ROUTES,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#00d2ff',
          'line-width': 4,
          'line-opacity': 0.95,
        },
      });
    }

    if (routeFeatures.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      routeFeatures.forEach((rf) => {
        rf.geometry.coordinates.forEach((pt) => bounds.extend(pt));
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 1000 });
      }
    }
  }, [map, routeData]);

  // Synchronize map selection when selectedBuilding changes from RoutePanel
  useEffect(() => {
    if (!map) return;

    if (!selectedBuilding) {
      if (map.getLayer(LAYER_POLYGON_HIGHLIGHT)) {
        map.setFilter(LAYER_POLYGON_HIGHLIGHT, ['==', ['get', 'building_id'], '']);
      }
      if (popupRef.current) {
        popupRef.current.remove();
      }
      return;
    }

    const bId = selectedBuilding.building_id;

    // Update highlight filter
    if (map.getLayer(LAYER_POLYGON_HIGHLIGHT)) {
      map.setFilter(LAYER_POLYGON_HIGHLIGHT, ['==', ['get', 'building_id'], bId]);
    }

    // Locate building feature in geojsonData to center and show popup
    const targetFeature = (geojsonData?.features || []).find(
      (f) => f.properties?.building_id === bId
    );

    if (targetFeature) {
      const centroid = getFeatureCentroid(targetFeature);
      if (centroid) {
        map.flyTo({
          center: centroid,
          zoom: Math.max(map.getZoom(), 17),
          speed: 1.4,
          essential: true,
        });
        showPopup(targetFeature.properties, centroid);
      }
    }
  }, [map, selectedBuilding, geojsonData]);

  const showPopup = (props, coordinates) => {
    if (!map || !coordinates) return;

    const damageColor = DAMAGE_COLORS[props.damage_class] || '#888';
    const conf = props.damage_score ? (props.damage_score * 100).toFixed(0) : 'N/A';
    const area = props.area_sq_m || 'N/A';
    const priority = props.priority_rank || 'N/A';
    const reviewFlag = props.needs_manual_review === true || props.needs_manual_review === 'true';

    const html = `
      <div style="font-family: system-ui, sans-serif; font-size: 13px; min-width: 190px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 14px; color: #fff;">${props.building_id}</strong>
          <span style="background: #252525; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid #444;">
            Rank #${priority}
          </span>
        </div>
        <div style="margin-bottom: 6px;">
          <span style="color: ${damageColor}; font-weight: bold; text-transform: uppercase; font-size: 12px;">
            ● ${props.damage_class?.replace('-', ' ')}
          </span>
        </div>
        <div style="color: #bbb; font-size: 12px; line-height: 1.5;">
          <div>Confidence: <strong style="color: #fff;">${conf}%</strong></div>
          <div>Footprint Area: <strong style="color: #fff;">${area} m²</strong></div>
          ${props.travel_time_minutes ? `<div>Travel Time: <strong style="color: #00e5ff;">${props.travel_time_minutes.toFixed(1)} min</strong></div>` : ''}
        </div>
        ${reviewFlag ? `
          <div style="margin-top: 8px; background: rgba(155, 89, 182, 0.25); border: 1px solid #9b59b6; border-radius: 4px; padding: 4px 6px; color: #d7bde2; font-size: 11px; font-weight: bold;">
            ⚠ Flagged for Manual Review
          </div>
        ` : ''}
      </div>
    `;

    if (popupRef.current) {
      popupRef.current.remove();
    }

    popupRef.current = new maplibregl.Popup({ closeOnClick: true, offset: 12 })
      .setLngLat(coordinates)
      .setHTML(html)
      .addTo(map);
  };

  return null;
}
