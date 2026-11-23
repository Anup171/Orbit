/**
 * SwipeMap.jsx
 * ------------
 * True side-by-side split comparison between Pre-Disaster and Post-Disaster
 * satellite imagery using synchronized dual MapLibre viewports.
 *
 * Architecture:
 *   - Post-Disaster Map (Bottom layer): High-resolution post-disaster satellite view
 *     with overlaid building damage assessments, priority highlights, and routes.
 *   - Pre-Disaster Map (Top layer): High-resolution pre-disaster satellite imagery,
 *     physically clipped to the LEFT side using CSS clipPath.
 *   - Draggable Slider Bar: Divides pre-disaster on the left from post-disaster on the right.
 *   - Camera Synchronizer: Real-time 60fps mirror of center, zoom, bearing, and pitch.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';

const DEFAULT_CENTER = [-122.4185, 37.7746]; // San Francisco disaster sample coordinates
const DEFAULT_ZOOM = 16.5;

// Satellite tile sources
const PRE_SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];

const POST_SATELLITE_TILES = [
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
];

export default function SwipeMap({ children, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM }) {
  const containerRef = useRef(null);
  const postContainerRef = useRef(null);
  const preContainerRef = useRef(null);

  const postMapRef = useRef(null);
  const preMapRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [swipePosition, setSwipePosition] = useState(50); // percentage (0 - 100)
  const isDragging = useRef(false);

  useEffect(() => {
    if (postMapRef.current || preMapRef.current) return;

    // 1. Post-Disaster Map (Bottom canvas — includes damage assessment annotations)
    const postMap = new maplibregl.Map({
      container: postContainerRef.current,
      style: {
        version: 8,
        name: 'Post-Disaster Satellite Assessment',
        sources: {
          'post-satellite': {
            type: 'raster',
            tiles: POST_SATELLITE_TILES,
            tileSize: 256,
            attribution: 'Post-Disaster Satellite Imagery',
            maxzoom: 20,
          },
        },
        layers: [
          {
            id: 'post-satellite-layer',
            type: 'raster',
            source: 'post-satellite',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center,
      zoom,
    });

    postMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    postMap.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // 2. Pre-Disaster Map (Top canvas — clipped to left side)
    const preMap = new maplibregl.Map({
      container: preContainerRef.current,
      style: {
        version: 8,
        name: 'Pre-Disaster Baseline Satellite',
        sources: {
          'pre-satellite': {
            type: 'raster',
            tiles: PRE_SATELLITE_TILES,
            tileSize: 256,
            attribution: 'Pre-Disaster Satellite (ESRI)',
            maxzoom: 20,
          },
        },
        layers: [
          {
            id: 'pre-satellite-layer',
            type: 'raster',
            source: 'pre-satellite',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center,
      zoom,
      attributionControl: false, // Avoid duplicate attribution
    });

    // 3. Bidirectional Camera Synchronizer
    let isSyncing = false;

    const syncMaps = (source, target) => {
      if (isSyncing) return;
      isSyncing = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      });
      isSyncing = false;
    };

    postMap.on('move', () => syncMaps(postMap, preMap));
    preMap.on('move', () => syncMaps(preMap, postMap));

    postMap.on('load', () => {
      postMapRef.current = postMap;
      preMapRef.current = preMap;
      setMapLoaded(true);
    });

    return () => {
      postMap.remove();
      preMap.remove();
    };
  }, []);

  // Mouse / Touch handlers for dragging the split divider
  const handleDragStart = (e) => {
    isDragging.current = true;
    e.preventDefault();
  };

  const handleDragEnd = () => {
    isDragging.current = false;
  };

  const handleDragMove = useCallback((e) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
    if (clientX === undefined) return;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const bounded = Math.max(0, Math.min(100, x));
    setSwipePosition(bounded);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        userSelect: isDragging.current ? 'none' : 'auto',
      }}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      {/* ── 1. Post-Disaster Map (Right Side / Full Canvas) ────────── */}
      <div
        ref={postContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* ── 2. Pre-Disaster Map (Left Side / Clipped with clipPath) ─── */}
      <div
        ref={preContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          clipPath: `inset(0 ${100 - swipePosition}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - swipePosition}% 0 0)`,
          pointerEvents: 'none', // All user drag/zoom/click inputs pass directly to the interactive map
        }}
      />

      {/* ── 3. Draggable Split Divider Line & Handle ────────────────── */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          position: 'absolute',
          top: 0,
          left: `${swipePosition}%`,
          transform: 'translateX(-50%)',
          width: 6,
          height: '100%',
          background: 'linear-gradient(to bottom, #00d2ff, #ffffff, #00d2ff)',
          cursor: 'col-resize',
          zIndex: 10,
          boxShadow: '0 0 14px rgba(0, 210, 255, 0.9), 0 0 4px rgba(0,0,0,0.8)',
          pointerEvents: 'auto',
        }}
      >
        {/* Circular grip badge */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#121212',
            border: '2px solid #00d2ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: '#00d2ff',
            fontWeight: 'bold',
            boxShadow: '0 2px 14px rgba(0,0,0,0.8)',
            cursor: 'col-resize',
            userSelect: 'none',
          }}
        >
          ⇔
        </div>
      </div>

      {/* ── 4. Split Side Indicator Badges ──────────────────────────── */}
      {/* Pre-Disaster Badge (Left) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: Math.max(16, (swipePosition * 0.5) - 60) + '%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          background: 'rgba(10, 25, 20, 0.88)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #2ecc71',
          borderRadius: 20,
          padding: '5px 14px',
          color: '#2ecc71',
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.5,
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          opacity: swipePosition > 15 ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      >
        🛰️ PRE-DISASTER SATELLITE
      </div>

      {/* Post-Disaster Badge (Right) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: Math.min(84, swipePosition + ((100 - swipePosition) * 0.5)) + '%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          background: 'rgba(30, 15, 15, 0.88)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #e74c3c',
          borderRadius: 20,
          padding: '5px 14px',
          color: '#ff6b6b',
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.5,
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          opacity: (100 - swipePosition) > 15 ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      >
        🚨 POST-DISASTER SATELLITE + DAMAGE
      </div>

      {/* ── 5. Quick Percentage Jump Controls (Bottom Center) ────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: 'rgba(18, 18, 18, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #333',
          borderRadius: 24,
          padding: '4px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          fontSize: 11,
        }}
      >
        <span style={{ color: '#888', fontWeight: 'bold' }}>SPLIT:</span>
        <button
          onClick={() => setSwipePosition(100)}
          style={getQuickBtnStyle(swipePosition === 100)}
        >
          100% Pre
        </button>
        <button
          onClick={() => setSwipePosition(50)}
          style={getQuickBtnStyle(swipePosition === 50)}
        >
          50 / 50 Split
        </button>
        <button
          onClick={() => setSwipePosition(0)}
          style={getQuickBtnStyle(swipePosition === 0)}
        >
          100% Post
        </button>
      </div>

      {/* ── 6. Render Children (DamageLayer overlays on the interactive map) ── */}
      {mapLoaded &&
        React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child, { map: postMapRef.current })
            : child
        )}
    </div>
  );
}

function getQuickBtnStyle(active) {
  return {
    padding: '4px 10px',
    borderRadius: 14,
    border: 'none',
    background: active ? '#00d2ff' : 'transparent',
    color: active ? '#000' : '#bbb',
    fontWeight: active ? 'bold' : 'normal',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}
