/**
 * SwipeMap.jsx
 * ------------
 * True side-by-side split comparison between Pre-Disaster and Post-Disaster
 * satellite imagery using synchronized dual MapLibre viewports.
 *
 * Architecture:
 *   - Post-Disaster Map (Bottom layer): High-resolution post-disaster satellite imagery
 *     overlaid with the real Maxar post-disaster destruction photo, building damage assessments,
 *     global disaster zone markers, and rescue routes.
 *   - Pre-Disaster Map (Top layer): High-resolution pre-disaster satellite imagery
 *     overlaid with the real Maxar pre-disaster baseline photo, highlighted scene perimeter,
 *     and intact building outlines, physically clipped to the LEFT side using CSS clipPath.
 *   - Draggable Slider Bar: Divides pre-disaster on the left from post-disaster on the right.
 *   - Camera Synchronizer: Real-time 60fps mirror of center, zoom, bearing, and pitch.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';

const DEFAULT_CENTER = [-122.716, 38.473];
const DEFAULT_ZOOM = 16.5;

const SATELLITE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];

export default function SwipeMap({
  children,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  imageOverlay = null,
  geojsonData = null,
}) {
  const containerRef = useRef(null);
  const postContainerRef = useRef(null);
  const preContainerRef = useRef(null);

  const postMapRef = useRef(null);
  const preMapRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [swipePosition, setSwipePosition] = useState(50);
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
            tiles: SATELLITE_TILES,
            tileSize: 256,
            attribution: 'Post-Disaster Satellite Imagery (ESRI / Maxar)',
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
            tiles: SATELLITE_TILES,
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
      attributionControl: false,
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

    let postReady = false;
    let preReady = false;

    const checkBothReady = () => {
      if (postReady && preReady) {
        postMapRef.current = postMap;
        preMapRef.current = preMap;
        setMapLoaded(true);
      }
    };

    postMap.on('load', () => {
      postReady = true;
      checkBothReady();
    });

    preMap.on('load', () => {
      preReady = true;
      checkBothReady();
    });

    return () => {
      postMap.remove();
      preMap.remove();
      postMapRef.current = null;
      preMapRef.current = null;
    };
  }, []);

  // Update camera view when center or zoom changes
  useEffect(() => {
    if (!mapLoaded || !center) return;
    if (postMapRef.current) {
      postMapRef.current.flyTo({
        center,
        zoom: zoom || 16.5,
        essential: true,
        duration: 1200,
      });
    }
  }, [mapLoaded, center, zoom]);

  // Update raster Maxar image overlays & Pre-Disaster area highlight whenever imageOverlay changes
  useEffect(() => {
    if (!mapLoaded || !imageOverlay) return;

    const { pre_image_url, post_image_url, image_coords } = imageOverlay;
    if (!image_coords || image_coords.length < 4) return;

    const upsertImageOverlay = (map, srcId, layerId, url, coords, beforeLayerId) => {
      if (!map || !url) return;
      try {
        const existingSrc = map.getSource(srcId);
        if (existingSrc && typeof existingSrc.updateImage === 'function') {
          existingSrc.updateImage({ url, coordinates: coords });
        } else {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getSource(srcId)) map.removeSource(srcId);

          map.addSource(srcId, {
            type: 'image',
            url,
            coordinates: coords,
          });

          const before = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined;
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: srcId,
              paint: {
                'raster-opacity': 1.0,
                'raster-fade-duration': 0,
              },
            },
            before
          );
        }
      } catch (err) {
        console.warn(`Overlay error for ${layerId}:`, err);
      }
    };

    // 1. Pre-Disaster Image Overlay (Left Map)
    upsertImageOverlay(
      preMapRef.current,
      'pre-disaster-image-src',
      'pre-disaster-image-layer',
      pre_image_url,
      image_coords,
      'pre-area-highlight-fill'
    );

    // 2. Highlight Pre-Disaster Scene Area Perimeter on Left Map
    if (preMapRef.current) {
      const preMap = preMapRef.current;
      const ring = [...image_coords, image_coords[0]];
      const areaGeojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          },
        ],
      };

      if (preMap.getSource('pre-area-highlight-src')) {
        preMap.getSource('pre-area-highlight-src').setData(areaGeojson);
      } else {
        preMap.addSource('pre-area-highlight-src', {
          type: 'geojson',
          data: areaGeojson,
        });
        preMap.addLayer({
          id: 'pre-area-highlight-fill',
          type: 'fill',
          source: 'pre-area-highlight-src',
          paint: {
            'fill-color': '#2ecc71',
            'fill-opacity': 0.06,
          },
        });
        preMap.addLayer({
          id: 'pre-area-highlight-line',
          type: 'line',
          source: 'pre-area-highlight-src',
          paint: {
            'line-color': '#2ecc71',
            'line-width': 3,
            'line-dasharray': [3, 2],
            'line-opacity': 0.95,
          },
        });
      }
    }

    // 3. Post-Disaster Image Overlay (Right Map — always underneath damage polygons)
    upsertImageOverlay(
      postMapRef.current,
      'post-disaster-image-src',
      'post-disaster-image-layer',
      post_image_url,
      image_coords,
      'damage-polygons-fill'
    );
  }, [mapLoaded, imageOverlay]);

  // Render subtle intact green building outlines on the Pre-Disaster map for direct comparison
  useEffect(() => {
    if (!mapLoaded || !preMapRef.current || !geojsonData) return;
    const preMap = preMapRef.current;
    const buildingFeatures = (geojsonData.features || []).filter(
      (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );
    const safeGeojson = { type: 'FeatureCollection', features: buildingFeatures };

    if (preMap.getSource('pre-buildings-src')) {
      preMap.getSource('pre-buildings-src').setData(safeGeojson);
    } else {
      preMap.addSource('pre-buildings-src', {
        type: 'geojson',
        data: safeGeojson,
      });
      preMap.addLayer({
        id: 'pre-buildings-fill',
        type: 'fill',
        source: 'pre-buildings-src',
        paint: {
          'fill-color': '#2ecc71',
          'fill-opacity': 0.1,
        },
      });
      preMap.addLayer({
        id: 'pre-buildings-line',
        type: 'line',
        source: 'pre-buildings-src',
        paint: {
          'line-color': '#58d68d',
          'line-width': 1.5,
          'line-opacity': 0.85,
        },
      });
    }
  }, [mapLoaded, geojsonData]);

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
          pointerEvents: 'none',
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
          width: 3,
          height: '100%',
          backgroundColor: '#0C7FDA',
          cursor: 'col-resize',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 34,
            height: 34,
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            border: '2px solid #0C7FDA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: '#0C7FDA',
            fontWeight: 600,
            boxShadow: '0 1px 4px rgba(30, 37, 43, 0.2)',
            cursor: 'col-resize',
            userSelect: 'none',
          }}
        >
          ⇔
        </div>
      </div>

      {/* ── 4. Split Side Indicator Badges ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: Math.max(16, (swipePosition * 0.5)) + '%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E1E7EC',
          borderRadius: 4,
          padding: '4px 10px',
          color: '#1E252B',
          fontSize: 11,
          fontWeight: 600,
          pointerEvents: 'none',
          opacity: swipePosition > 18 ? 1 : 0,
          transition: 'opacity 0.2s',
          whiteSpace: 'nowrap',
        }}
      >
        Pre-Disaster
      </div>

      <div
        style={{
          position: 'absolute',
          top: 14,
          left: Math.min(84, swipePosition + ((100 - swipePosition) * 0.5)) + '%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E1E7EC',
          borderRadius: 4,
          padding: '4px 10px',
          color: '#1E252B',
          fontSize: 11,
          fontWeight: 600,
          pointerEvents: 'none',
          opacity: (100 - swipePosition) > 18 ? 1 : 0,
          transition: 'opacity 0.2s',
          whiteSpace: 'nowrap',
        }}
      >
        Post-Disaster
      </div>

      {/* ── 5. Quick Percentage Jump Controls (Bottom Center) ────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E1E7EC',
          borderRadius: 6,
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 1px 4px rgba(30, 37, 43, 0.1)',
          fontSize: 11,
        }}
      >
        <span style={{ color: '#5D7285', fontWeight: 600, padding: '0 4px' }}>Split:</span>
        <button
          type="button"
          onClick={() => setSwipePosition(100)}
          style={getQuickBtnStyle(swipePosition === 100)}
        >
          100% Pre
        </button>
        <button
          type="button"
          onClick={() => setSwipePosition(50)}
          style={getQuickBtnStyle(swipePosition === 50)}
        >
          50 / 50
        </button>
        <button
          type="button"
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
    borderRadius: 4,
    border: 'none',
    background: active ? '#0C7FDA' : 'transparent',
    color: active ? '#FFFFFF' : '#5D7285',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontFamily: 'Poppins, sans-serif',
  };
}
