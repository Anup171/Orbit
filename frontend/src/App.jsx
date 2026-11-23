/**
 * App.jsx
 * -------
 * Main Disaster Damage Assessment Platform application.
 * Integrates:
 *   - SwipeMap: Pre/post satellite comparison slider
 *   - DamageLayer: Color-coded building footprints, centroid pins, and route overlays
 *   - RoutePanel: Prioritised triage queue, filters, search, and emergency route dispatch
 */

import React, { useState, useCallback, useEffect } from 'react';
import SwipeMap from './components/SwipeMap.jsx';
import DamageLayer from './components/DamageLayer.jsx';
import { getFeatureCentroid } from './utils/geo.js';
import RoutePanel from './components/RoutePanel.jsx';

const API_BASE = '/api/v1';

// Default disaster staging command post (San Francisco Bay area)
const DEFAULT_STAGING = {
  lat: 37.7760,
  lon: -122.4210,
  name: 'Field Command Staging Point',
};

export default function App() {
  const [geojsonData, setGeojsonData] = useState({ type: 'FeatureCollection', features: [] });
  const [routeData, setRouteData] = useState({ type: 'FeatureCollection', features: [] });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [stagingCoords, setStagingCoords] = useState(DEFAULT_STAGING);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load sample dataset on mount so the user immediately sees a live working map
  useEffect(() => {
    loadSampleData();
  }, []);

  const loadSampleData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sample-triage`);
      if (res.ok) {
        const data = await res.json();
        setGeojsonData(data);
        if (data.features && data.features.length > 0) {
          setSelectedBuilding(data.features[0].properties);
        }
      } else {
        throw new Error('API sample not found');
      }
    } catch {
      // Fallback sample with real polygon boundaries
      const fallback = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_001',
              damage_class: 'destroyed',
              damage_score: 0.94,
              priority_rank: 1,
              priority_score: 0.88,
              confidence: 0.88,
              needs_manual_review: false,
              area_sq_m: 420.5,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-122.4194, 37.7749],
                [-122.4190, 37.7749],
                [-122.4190, 37.7745],
                [-122.4194, 37.7745],
                [-122.4194, 37.7749],
              ]],
            },
          },
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_002',
              damage_class: 'major-damage',
              damage_score: 0.72,
              priority_rank: 2,
              priority_score: 0.65,
              confidence: 0.61,
              needs_manual_review: true,
              area_sq_m: 850.0,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-122.4185, 37.7748],
                [-122.4179, 37.7748],
                [-122.4179, 37.7743],
                [-122.4185, 37.7743],
                [-122.4185, 37.7748],
              ]],
            },
          },
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_003',
              damage_class: 'no-damage',
              damage_score: 0.05,
              priority_rank: 3,
              priority_score: 0.12,
              confidence: 0.96,
              needs_manual_review: false,
              area_sq_m: 120.0,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-122.4175, 37.7745],
                [-122.4170, 37.7745],
                [-122.4170, 37.7740],
                [-122.4175, 37.7740],
                [-122.4175, 37.7745],
              ]],
            },
          },
        ],
      };
      setGeojsonData(fallback);
      setSelectedBuilding(fallback.features[0].properties);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Dispatch rescue route from staging point to a target building
  const handleRequestRoute = useCallback(async (building) => {
    // Locate the feature
    const feature = (geojsonData.features || []).find(
      (f) => f.properties?.building_id === building.building_id
    );
    if (!feature) return;

    const targetCoords = getFeatureCentroid(feature);
    if (!targetCoords) return;

    try {
      const res = await fetch(`${API_BASE}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_lat: stagingCoords.lat,
          origin_lon: stagingCoords.lon,
          destinations: [
            {
              lat: targetCoords[1],
              lon: targetCoords[0],
              id: building.building_id,
            },
          ],
          top_k: 1,
          use_osm: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const firstRoute = data.routes[0];
          setRouteData({
            type: 'FeatureCollection',
            features: [firstRoute],
          });
          setActiveRouteInfo({
            targetId: building.building_id,
            distance_km: firstRoute.properties?.distance_km || 0.8,
            travel_time_minutes: firstRoute.properties?.travel_time_minutes || 2.4,
          });
        }
      }
    } catch (err) {
      console.error('Route calculation error:', err);
    }
  }, [geojsonData, stagingCoords]);

  // Handle uploading custom pre/post satellite image pair
  const handleFileUpload = useCallback(async (e) => {
    const files = e.target.files;
    if (!files || files.length < 2) {
      alert('Please select both a pre-disaster and post-disaster satellite image.');
      return;
    }

    const formData = new FormData();
    formData.append('pre_image', files[0]);
    formData.append('post_image', files[1]);

    setIsLoading(true);
    setJobStatus('uploading');

    try {
      const res = await fetch(`${API_BASE}/predict?staging_lat=${stagingCoords.lat}&staging_lon=${stagingCoords.lon}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setJobId(data.job_id);
      setJobStatus('queued');
      pollAssessmentJob(data.job_id);
    } catch (err) {
      console.error('Upload failed:', err);
      setJobStatus('error');
      setIsLoading(false);
    }
  }, [stagingCoords]);

  const pollAssessmentJob = useCallback((id) => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${id}`);
        const data = await res.json();
        setJobStatus(data.status);

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          setIsLoading(false);
          // Fetch final GeoJSON
          const geoRes = await fetch(`${API_BASE}/jobs/${id}/geojson`);
          const geoData = await geoRes.json();
          setGeojsonData(geoData);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setIsLoading(false);
          alert(`Assessment failed: ${data.error_message || 'Unknown error'}`);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setIsLoading(false);
      }
    }, 2500);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Interactive Map Area */}
      <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
        <SwipeMap>
          <DamageLayer
            geojsonData={geojsonData}
            routeData={routeData}
            selectedBuilding={selectedBuilding}
            onSelectBuilding={setSelectedBuilding}
          />
        </SwipeMap>

        {/* Top Floating Control Bar */}
        <div style={floatingControlBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🛰️</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 13, color: '#fff' }}>
                Satellite Disaster Assessment
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                Siamese ResNet-34 · xView2 Benchmark · OSMnx Routing
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button
              onClick={loadSampleData}
              disabled={isLoading}
              style={actionBtnStyle}
            >
              🔄 Reload Sample
            </button>

            <label style={{ ...actionBtnStyle, cursor: 'pointer', background: '#005b8e' }}>
              📁 Upload Pair
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>

            {jobStatus && (
              <span style={{ fontSize: 11, background: '#252525', padding: '4px 8px', borderRadius: 4, color: '#00d2ff' }}>
                Job: {jobStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side Triage & Routing Panel */}
      <RoutePanel
        buildings={geojsonData.features}
        selectedBuilding={selectedBuilding}
        onSelectBuilding={setSelectedBuilding}
        onRequestRoute={handleRequestRoute}
        activeRouteInfo={activeRouteInfo}
      />
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const floatingControlBarStyle = {
  position: 'absolute',
  top: 14,
  left: 14,
  zIndex: 30,
  background: 'rgba(18, 18, 18, 0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '12px 16px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  maxWidth: 340,
};

const actionBtnStyle = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#eee',
  fontSize: 11,
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.15s',
};
