/**
 * SwipeMap.jsx
 * ------------
 * Pre/post disaster satellite imagery comparison using MapLibre GL.
 * Provides a draggable swipe divider to compare before/after imagery.
 * Children (like DamageLayer) are rendered as overlays on the map.
 */

import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';

const DEFAULT_CENTER = [-122.4185, 37.7746]; // San Francisco (matches sample data)
const DEFAULT_ZOOM = 16;

export default function SwipeMap({ children, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [swipePosition, setSwipePosition] = useState(50); // percentage
  const isDragging = useRef(false);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        name: 'Disaster Assessment',
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center,
      zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      mapRef.current = map;
      setMapLoaded(true);
    });

    return () => map.remove();
  }, []);

  // Swipe drag handlers
  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleMouseMove = (e) => {
    if (!isDragging.current || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSwipePosition(Math.max(5, Math.min(95, x)));
  };

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Swipe divider */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          left: `${swipePosition}%`,
          transform: 'translateX(-50%)',
          width: 4,
          height: '100%',
          background: '#fff',
          cursor: 'col-resize',
          zIndex: 5,
          boxShadow: '0 0 8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drag handle */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#fff',
          border: '2px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 'bold',
          color: '#333',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}>
          ⇔
        </div>
      </div>

      {/* Labels */}
      <div style={{
        position: 'absolute', top: 8, left: 12, zIndex: 6,
        background: 'rgba(0,0,0,0.6)', color: '#fff',
        padding: '3px 8px', borderRadius: 4, fontSize: 11,
      }}>
        PRE-DISASTER
      </div>
      <div style={{
        position: 'absolute', top: 8, right: 12, zIndex: 6,
        background: 'rgba(0,0,0,0.6)', color: '#fff',
        padding: '3px 8px', borderRadius: 4, fontSize: 11,
      }}>
        POST-DISASTER
      </div>

      {/* Pass map instance to children */}
      {mapLoaded &&
        React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { map: mapRef.current })
            : child
        )}
    </div>
  );
}
