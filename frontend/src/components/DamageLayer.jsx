/**
 * DamageLayer.jsx
 * ----------------
 * Renders building-level damage polygons, rescue base marker, road-based
 * rescue routes (multi-team color-coded), numbered rescue stop markers,
 * global disaster zone markers, and interactive building inspection popups.
 *
 * Prevents duplicate building layers by reusing MapLibre sources/layers.
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

const TEAM_COLORS = ['#00d2ff', '#ff00ff', '#00ff99', '#ffaa00', '#a29bfe'];

const SOURCE_BUILDINGS = 'damage-buildings-src';
const LAYER_POLYGON_FILL = 'damage-polygons-fill';
const LAYER_POLYGON_LINE = 'damage-polygons-line';
const LAYER_POLYGON_HIGHLIGHT = 'damage-polygons-highlight';
const LAYER_POINTS = 'damage-points';

const SOURCE_ROUTES = 'emergency-routes-src';
const LAYER_ROUTE_CASING = 'emergency-routes-casing';
const LAYER_ROUTE_LINE = 'emergency-routes-line';
const LAYER_STOP_CIRCLES = 'rescue-stop-circles';
const LAYER_STOP_LABELS = 'rescue-stop-labels';

const SOURCE_BASE = 'rescue-base-src';
const LAYER_BASE_HALO = 'rescue-base-halo';
const LAYER_BASE_PIN = 'rescue-base-pin';
const LAYER_BASE_LABEL = 'rescue-base-label';

const SOURCE_GLOBAL_ZONES = 'global-disaster-zones-src';
const LAYER_GLOBAL_ZONES = 'global-disaster-zones-circles';

export default function DamageLayer({
  map,
  geojsonData,
  routeData,
  globalZones,
  rescueBase,
  isSelectingBase = false,
  onSelectBase,
  showDamageLayers = true,
  showRescueRoutes = true,
  damageFilter = 'ALL',
  minPriority = 0,
  onlyManualReview = false,
  selectedBuilding,
  onSelectBuilding,
  onSelectZone,
}) {
  const popupRef = useRef(null);
  const isSelectingBaseRef = useRef(isSelectingBase);
  const onSelectBaseRef = useRef(onSelectBase);

  useEffect(() => {
    isSelectingBaseRef.current = isSelectingBase;
    onSelectBaseRef.current = onSelectBase;
    if (map) {
      map.getCanvas().style.cursor = isSelectingBase ? 'crosshair' : '';
    }
  }, [map, isSelectingBase, onSelectBase]);

  // 1. Setup Building Damage Layers (no duplicate layers) & update data
  useEffect(() => {
    if (!map) return;

    const rawFeatures = (geojsonData?.features || []).filter(
      (f) =>
        f.geometry &&
        (f.geometry.type === 'Polygon' ||
          f.geometry.type === 'MultiPolygon' ||
          f.geometry.type === 'Point')
    );

    // Apply map-level filters (category, priority threshold, manual review)
    const filteredFeatures = rawFeatures.filter((f) => {
      const p = f.properties || {};
      if (damageFilter !== 'ALL' && p.damage_class !== damageFilter) return false;
      if (minPriority > 0 && (p.priority_score || 0) < minPriority) return false;
      if (onlyManualReview && !(p.needs_manual_review === true || p.needs_manual_review === 'true')) {
        return false;
      }
      return true;
    });

    const safeGeojson = {
      type: 'FeatureCollection',
      features: filteredFeatures,
    };

    if (map.getSource(SOURCE_BUILDINGS)) {
      map.getSource(SOURCE_BUILDINGS).setData(safeGeojson);
    } else {
      map.addSource(SOURCE_BUILDINGS, {
        type: 'geojson',
        data: safeGeojson,
      });

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
          'fill-opacity': 0.24,
        },
      });

      map.addLayer({
        id: LAYER_POLYGON_LINE,
        type: 'line',
        source: SOURCE_BUILDINGS,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', 'needs_manual_review'], false], '#9b59b6',
            [
              'match',
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
            ['boolean', ['get', 'needs_manual_review'], false], 3.2,
            1.6,
          ],
          'line-opacity': 0.95,
        },
      });

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

      map.addLayer({
        id: LAYER_POINTS,
        type: 'circle',
        source: SOURCE_BUILDINGS,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 11, 20, 18],
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
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      const handleClick = (e) => {
        if (isSelectingBaseRef.current) return;
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        const centroid = getFeatureCentroid(feature);

        if (onSelectBuilding) onSelectBuilding(props);
        if (centroid) showPopup(props, centroid);
      };

      map.on('click', LAYER_POLYGON_FILL, handleClick);
      map.on('click', LAYER_POINTS, handleClick);

      const setPointer = () => {
        if (!isSelectingBaseRef.current) map.getCanvas().style.cursor = 'pointer';
      };
      const unsetPointer = () => {
        map.getCanvas().style.cursor = isSelectingBaseRef.current ? 'crosshair' : '';
      };

      map.on('mouseenter', LAYER_POLYGON_FILL, setPointer);
      map.on('mouseleave', LAYER_POLYGON_FILL, unsetPointer);
      map.on('mouseenter', LAYER_POINTS, setPointer);
      map.on('mouseleave', LAYER_POINTS, unsetPointer);

      // Map click handler for "Select Rescue Base" mode
      map.on('click', (e) => {
        if (isSelectingBaseRef.current && onSelectBaseRef.current) {
          onSelectBaseRef.current({
            lat: Number(e.lngLat.lat.toFixed(6)),
            lon: Number(e.lngLat.lng.toFixed(6)),
          });
        }
      });
    }
  }, [map, geojsonData, damageFilter, minPriority, onlyManualReview]);

  // Toggle visibility of damage layers
  useEffect(() => {
    if (!map) return;
    const vis = showDamageLayers ? 'visible' : 'none';
    [LAYER_POLYGON_FILL, LAYER_POLYGON_LINE, LAYER_POLYGON_HIGHLIGHT, LAYER_POINTS].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', vis);
      }
    });
  }, [map, showDamageLayers]);

  // 2. Render Rescue Base Marker
  useEffect(() => {
    if (!map || !rescueBase) return;
    const baseGeojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { label: rescueBase.label || 'RESCUE BASE' },
          geometry: {
            type: 'Point',
            coordinates: [rescueBase.lon, rescueBase.lat],
          },
        },
      ],
    };

    if (map.getSource(SOURCE_BASE)) {
      map.getSource(SOURCE_BASE).setData(baseGeojson);
    } else {
      map.addSource(SOURCE_BASE, { type: 'geojson', data: baseGeojson });
      map.addLayer({
        id: LAYER_BASE_HALO,
        type: 'circle',
        source: SOURCE_BASE,
        paint: {
          'circle-radius': 18,
          'circle-color': '#00d2ff',
          'circle-opacity': 0.25,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#00d2ff',
        },
      });
      map.addLayer({
        id: LAYER_BASE_PIN,
        type: 'circle',
        source: SOURCE_BASE,
        paint: {
          'circle-radius': 9,
          'circle-color': '#0984e3',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: LAYER_BASE_LABEL,
        type: 'symbol',
        source: SOURCE_BASE,
        layout: {
          'text-field': '🏥 BASE',
          'text-size': 11,
          'text-offset': [0, -1.8],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2,
        },
      });
    }
  }, [map, rescueBase]);

  // 3. Render Road-Based Rescue Routes & Numbered Stops
  useEffect(() => {
    if (!map) return;

    const allFeatures = routeData?.features || [];
    const safeRoutes = {
      type: 'FeatureCollection',
      features: allFeatures,
    };

    if (map.getSource(SOURCE_ROUTES)) {
      map.getSource(SOURCE_ROUTES).setData(safeRoutes);
    } else {
      map.addSource(SOURCE_ROUTES, {
        type: 'geojson',
        data: safeRoutes,
      });

      map.addLayer({
        id: LAYER_ROUTE_CASING,
        type: 'line',
        source: SOURCE_ROUTES,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0a192f',
          'line-width': 8,
          'line-opacity': 0.75,
        },
      });

      map.addLayer({
        id: LAYER_ROUTE_LINE,
        type: 'line',
        source: SOURCE_ROUTES,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'team_id'],
            1, TEAM_COLORS[0],
            2, TEAM_COLORS[1],
            3, TEAM_COLORS[2],
            4, TEAM_COLORS[3],
            5, TEAM_COLORS[4],
            '#00d2ff',
          ],
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
      });

      map.addLayer({
        id: LAYER_STOP_CIRCLES,
        type: 'circle',
        source: SOURCE_ROUTES,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 12,
          'circle-color': [
            'match',
            ['get', 'team_id'],
            1, '#0088cc',
            2, '#b300b3',
            3, '#00995c',
            4, '#cc7700',
            '#0088cc',
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: LAYER_STOP_LABELS,
        type: 'symbol',
        source: SOURCE_ROUTES,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['to-string', ['get', 'visit_order']],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });
    }

    const vis = showRescueRoutes ? 'visible' : 'none';
    [LAYER_ROUTE_CASING, LAYER_ROUTE_LINE, LAYER_STOP_CIRCLES, LAYER_STOP_LABELS].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', vis);
      }
    });
  }, [map, routeData, showRescueRoutes]);

  // 4. Render Global Disaster Zones (2,283 scenes worldwide)
  useEffect(() => {
    if (!map || !globalZones) return;

    if (map.getSource(SOURCE_GLOBAL_ZONES)) {
      map.getSource(SOURCE_GLOBAL_ZONES).setData(globalZones);
    } else {
      map.addSource(SOURCE_GLOBAL_ZONES, {
        type: 'geojson',
        data: globalZones,
      });

      map.addLayer({
        id: LAYER_GLOBAL_ZONES,
        type: 'circle',
        source: SOURCE_GLOBAL_ZONES,
        maxzoom: 15,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 8, 13, 12],
          'circle-color': [
            'case',
            ['>', ['get', 'destroyed'], 10], '#e74c3c',
            ['>', ['get', 'major_damage'], 5], '#e67e22',
            '#f1c40f',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', LAYER_GLOBAL_ZONES, (e) => {
        if (isSelectingBaseRef.current) return;
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;
        if (props?.scene_id && onSelectZone) {
          onSelectZone(props.scene_id);
        }
      });

      map.on('mouseenter', LAYER_GLOBAL_ZONES, () => {
        if (!isSelectingBaseRef.current) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_GLOBAL_ZONES, () => {
        map.getCanvas().style.cursor = isSelectingBaseRef.current ? 'crosshair' : '';
      });
    }
  }, [map, globalZones, onSelectZone]);

  // 5. Synchronize map selection & popup when selectedBuilding changes
  useEffect(() => {
    if (!map) return;

    if (!selectedBuilding) {
      if (map.getLayer(LAYER_POLYGON_HIGHLIGHT)) {
        map.setFilter(LAYER_POLYGON_HIGHLIGHT, ['==', ['get', 'building_id'], '']);
      }
      if (popupRef.current) popupRef.current.remove();
      return;
    }

    const bId = selectedBuilding.building_id;
    if (map.getLayer(LAYER_POLYGON_HIGHLIGHT)) {
      map.setFilter(LAYER_POLYGON_HIGHLIGHT, ['==', ['get', 'building_id'], bId]);
    }

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
    const conf = props.confidence != null ? (Number(props.confidence) * 100).toFixed(0) : 'N/A';
    const area = props.area_sq_m != null ? `${Number(props.area_sq_m).toFixed(1)} m²` : 'N/A';
    const expSev = props.expected_severity != null ? Number(props.expected_severity).toFixed(2) : 'N/A';
    const prioScore = props.priority_score != null ? Number(props.priority_score).toFixed(3) : 'N/A';
    const travelTime =
      props.travel_time_minutes != null && props.travel_time_minutes !== 'null'
        ? `${Number(props.travel_time_minutes).toFixed(1)} min`
        : props.reachable === false
          ? 'Unreachable'
          : 'Not routed yet';
    const visitOrder =
      props.visit_order != null && props.visit_order !== 'null'
        ? `#${props.visit_order}${props.team_id ? ` (Team ${props.team_id})` : ''}`
        : '—';
    const reviewFlag = props.needs_manual_review === true || props.needs_manual_review === 'true';

    const html = `
      <div style="font-family: Poppins, sans-serif; font-size: 12px; min-width: 225px; color: var(--text-primary);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px;">
          <strong style="font-size: 13px; color: var(--text-primary);">${props.building_id}</strong>
          <span style="background: var(--bg-selected); color: #0C7FDA; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600;">
            Rank #${props.priority_rank || '—'}
          </span>
        </div>
        <div style="margin-bottom: 6px;">
          <span style="color: ${damageColor}; font-weight: 600; text-transform: uppercase; font-size: 11.5px;">
            ● ${(props.damage_class || 'unknown').replace('-', ' ')}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; color: var(--text-default); font-size: 11.5px;">
          <div>Confidence:</div><div><strong style="color: var(--text-primary);">${conf}%</strong></div>
          <div>Building Area:</div><div><strong style="color: var(--text-primary);">${area}</strong></div>
          <div>Expected Severity:</div><div><strong style="color: #d35400;">${expSev} / 3.0</strong></div>
          <div>Priority Score:</div><div><strong style="color: #0C7FDA;">${prioScore}</strong></div>
          <div>Est. Travel Time:</div><div><strong style="color: #27ae60;">${travelTime}</strong></div>
          <div>Rescue Visit Order:</div><div><strong style="color: var(--text-primary);">${visitOrder}</strong></div>
        </div>
        ${reviewFlag
        ? `<div style="margin-top: 8px; background: var(--bg-selected); border: 1px solid #0C7FDA; border-radius: 4px; padding: 4px 6px; color: #0C7FDA; font-size: 11px; font-weight: 600;">
                 Needs Manual Review (Low Confidence)
               </div>`
        : ''
      }
      </div>
    `;

    if (popupRef.current) popupRef.current.remove();

    popupRef.current = new maplibregl.Popup({ closeOnClick: true, offset: 12 })
      .setLngLat(coordinates)
      .setHTML(html)
      .addTo(map);
  };

  return null;
}
