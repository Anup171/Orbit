/**
 * DamageLayer.jsx
 * ----------------
 * Renders color-coded damage polygons/points on the MapLibre map.
 * Color scheme:
 *   - no-damage:     #2ecc71 (green)
 *   - minor-damage:  #f1c40f (yellow)
 *   - major-damage:  #e67e22 (orange)
 *   - destroyed:     #e74c3c (red)
 *   - manual review: #9b59b6 (purple outline)
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

const DAMAGE_COLORS = {
  'no-damage':    '#2ecc71',
  'minor-damage': '#f1c40f',
  'major-damage': '#e67e22',
  'destroyed':    '#e74c3c',
};

const SOURCE_ID = 'damage-buildings';
const LAYER_ID = 'damage-circles';
const REVIEW_LAYER_ID = 'review-outline';

export default function DamageLayer({ map, geojsonData, onSelectBuilding }) {
  const popupRef = useRef(null);

  useEffect(() => {
    if (!map || !geojsonData) return;

    // Add or update source
    if (map.getSource(SOURCE_ID)) {
      map.getSource(SOURCE_ID).setData(geojsonData);
    } else {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojsonData,
      });

      // Main damage circles layer
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            12, 4,
            16, 10,
            20, 18,
          ],
          'circle-color': [
            'match',
            ['get', 'damage_class'],
            'no-damage',    DAMAGE_COLORS['no-damage'],
            'minor-damage', DAMAGE_COLORS['minor-damage'],
            'major-damage', DAMAGE_COLORS['major-damage'],
            'destroyed',    DAMAGE_COLORS['destroyed'],
            '#888',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': [
            'case',
            ['get', 'needs_manual_review'], 3,
            1,
          ],
          'circle-stroke-color': [
            'case',
            ['get', 'needs_manual_review'], '#9b59b6',
            '#333',
          ],
        },
      });

      // Click handler for building selection
      map.on('click', LAYER_ID, (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          const props = feature.properties;

          if (onSelectBuilding) {
            onSelectBuilding(props);
          }

          // Show popup
          const coordinates = feature.geometry.coordinates.slice();
          const html = `
            <div style="font-family: system-ui; font-size: 12px; max-width: 200px;">
              <strong>${props.building_id}</strong><br/>
              <span style="color: ${DAMAGE_COLORS[props.damage_class] || '#888'}; font-weight: bold;">
                ${props.damage_class}
              </span>
              <br/>
              Confidence: ${(props.damage_score * 100).toFixed(0)}%<br/>
              Area: ${props.area_sq_m} m²<br/>
              Priority: #${props.priority_rank}
              ${props.needs_manual_review === true || props.needs_manual_review === 'true'
                ? '<br/><span style="color: #9b59b6; font-weight: bold;">⚠ Needs Review</span>'
                : ''}
            </div>
          `;

          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new maplibregl.Popup({ closeOnClick: true })
            .setLngLat(coordinates)
            .setHTML(html)
            .addTo(map);
        }
      });

      // Cursor change on hover
      map.on('mouseenter', LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Fit map to data bounds if features exist
    if (geojsonData.features && geojsonData.features.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      geojsonData.features.forEach((f) => {
        if (f.geometry && f.geometry.coordinates) {
          const coords = f.geometry.coordinates;
          if (f.geometry.type === 'Point') {
            bounds.extend(coords);
          } else if (f.geometry.type === 'Polygon') {
            coords[0].forEach((c) => bounds.extend(c));
          }
        }
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 18 });
      }
    }
  }, [map, geojsonData]);

  return null; // This component only manipulates the map imperatively
}
