/**
 * App.jsx
 * -------
 * Main Disaster Damage Assessment Platform application.
 * Integrates:
 *   - Global Disaster Event Selector: All 10 xBD disaster events + 2,700+ clickable global zones
 *   - SwipeMap: Pre/post satellite comparison slider with real Maxar satellite imagery & highlighted pre-disaster area
 *   - DamageLayer: Color-coded building footprints, global zone markers, and emergency rescue routes
 *   - RoutePanel: Prioritised triage queue, filters, search, and emergency route dispatch
 */

import React, { useState, useCallback, useEffect } from 'react';
import SwipeMap from './components/SwipeMap.jsx';
import DamageLayer from './components/DamageLayer.jsx';
import { getFeatureCentroid } from './utils/geo.js';
import RoutePanel from './components/RoutePanel.jsx';

const API_BASE = '/api/v1';

export default function App() {
  const [disasters, setDisasters] = useState([]);
  const [globalZones, setGlobalZones] = useState(null);
  const [selectedDisasterId, setSelectedDisasterId] = useState('');
  const [activeDisasterInfo, setActiveDisasterInfo] = useState(null);
  const [geojsonData, setGeojsonData] = useState({ type: 'FeatureCollection', features: [] });
  const [routeData, setRouteData] = useState({ type: 'FeatureCollection', features: [] });
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [mapView, setMapView] = useState({ center: [-122.716, 38.473], zoom: 16.5 });
  const [stagingCoords, setStagingCoords] = useState({
    lat: 38.475,
    lon: -122.720,
    name: 'Incident Command Post',
  });
  const [imageOverlay, setImageOverlay] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch curated catalog (all 10 events) and global zones GeoJSON on mount
  useEffect(() => {
    fetchDisasters();
    fetchGlobalZones();
  }, []);

  const fetchGlobalZones = async () => {
    try {
      const res = await fetch(`${API_BASE}/disasters/zones`);
      if (res.ok) {
        const zones = await res.json();
        setGlobalZones(zones);
      }
    } catch (err) {
      console.warn('Could not load global zones:', err);
    }
  };

  const fetchDisasters = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/disasters`);
      if (res.ok) {
        const catalog = await res.json();
        setDisasters(catalog);
        if (catalog.length > 0) {
          // Prefer a high-destruction scene on initial load
          const defaultScene =
            catalog.find((d) => d.id.startsWith('santa-rosa-wildfire')) || catalog[0];
          selectDisaster(defaultScene);
        }
      } else {
        loadFallbackData();
      }
    } catch (err) {
      console.warn('Error fetching disasters catalog:', err);
      loadFallbackData();
    } finally {
      setIsLoading(false);
    }
  };

  const selectDisaster = useCallback(async (disaster) => {
    if (!disaster) return;
    setIsLoading(true);
    setSelectedDisasterId(disaster.id);
    setActiveDisasterInfo(disaster);
    setMapView({ center: disaster.center, zoom: 16.5 });

    setStagingCoords({
      lat: disaster.center[1] + 0.002,
      lon: disaster.center[0] - 0.002,
      name: `${disaster.location} Command Base`,
    });

    setImageOverlay({
      pre_image_url: disaster.pre_image_url,
      post_image_url: disaster.post_image_url,
      image_coords: disaster.image_coords,
    });

    setRouteData({ type: 'FeatureCollection', features: [] });
    setActiveRouteInfo(null);

    try {
      const res = await fetch(disaster.geojson_url);
      if (res.ok) {
        const geoData = await res.json();
        setGeojsonData(geoData);
        if (geoData.features && geoData.features.length > 0) {
          setSelectedBuilding(geoData.features[0].properties);
        } else {
          setSelectedBuilding(null);
        }
      }
    } catch (err) {
      console.error('Error loading disaster GeoJSON:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load any of the 2,700+ global zones when clicked on the world map
  const handleSelectZone = useCallback(
    async (sceneId) => {
      const existing = disasters.find((d) => d.id === sceneId);
      if (existing) {
        selectDisaster(existing);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/disasters/${sceneId}/info`);
        if (res.ok) {
          const info = await res.json();
          selectDisaster(info);
        }
      } catch (err) {
        console.error('Error loading scene info:', err);
        setIsLoading(false);
      }
    },
    [disasters, selectDisaster]
  );

  const handleGlobalOverview = () => {
    setMapView({ center: [-40, 22], zoom: 2.3 });
    setSelectedBuilding(null);
  };

  const handleDisasterChange = (e) => {
    const targetId = e.target.value;
    const targetDisaster = disasters.find((d) => d.id === targetId);
    if (targetDisaster) {
      selectDisaster(targetDisaster);
    }
  };

  const loadFallbackData = () => {
    const fallback = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            building_id: 'bldg_0001',
            damage_class: 'destroyed',
            damage_score: 0.98,
            priority_rank: 1,
            priority_score: 0.95,
            confidence: 0.95,
            needs_manual_review: false,
            area_sq_m: 420.5,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-122.7165, 38.4735],
              [-122.7155, 38.4735],
              [-122.7155, 38.4725],
              [-122.7165, 38.4725],
              [-122.7165, 38.4735],
            ]],
          },
        },
      ],
    };
    setGeojsonData(fallback);
    setSelectedBuilding(fallback.features[0].properties);
  };

  // Dispatch rescue route from staging point to a target building
  const handleRequestRoute = useCallback(async (building) => {
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

  const totalZonesCount = globalZones?.features?.length || disasters.length;
  // Deduplicate one representative per event for quick-jump pills
  const uniqueEvents = [];
  const seenEvents = new Set();
  for (const d of disasters) {
    if (!seenEvents.has(d.event)) {
      seenEvents.add(d.event);
      uniqueEvents.push(d);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Interactive Map Area */}
      <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
        <SwipeMap
          center={mapView.center}
          zoom={mapView.zoom}
          imageOverlay={imageOverlay}
          geojsonData={geojsonData}
        >
          <DamageLayer
            geojsonData={geojsonData}
            routeData={routeData}
            globalZones={globalZones}
            selectedBuilding={selectedBuilding}
            onSelectBuilding={setSelectedBuilding}
            onSelectZone={handleSelectZone}
          />
        </SwipeMap>

        {/* Top Floating Control Bar */}
        <div style={floatingControlBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🛰️</span>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 13, color: '#fff' }}>
                  xView2 Satellite Disaster Assessment
                </div>
                <div style={{ fontSize: 11, color: '#00d2ff' }}>
                  Siamese ResNet-34 · True Maxar Pre/Post Overlay
                </div>
              </div>
            </div>
            {isLoading && (
              <span style={{ fontSize: 11, color: '#f1c40f', background: 'rgba(241,196,15,0.15)', padding: '2px 8px', borderRadius: 10 }}>
                Loading...
              </span>
            )}
          </div>

          {/* Global Disaster Selector */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 11, color: '#aaa', fontWeight: 'bold' }}>
                🌍 ALL DISASTERS ({uniqueEvents.length} EVENTS · {totalZonesCount.toLocaleString()} ZONES):
              </label>
              <button
                onClick={handleGlobalOverview}
                style={{
                  background: '#1b3a4b',
                  border: '1px solid #00d2ff',
                  color: '#00d2ff',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 'bold',
                  padding: '2px 7px',
                  cursor: 'pointer',
                }}
              >
                🌐 Global Map
              </button>
            </div>
            <select
              value={selectedDisasterId}
              onChange={handleDisasterChange}
              style={disasterSelectStyle}
            >
              {!disasters.some((d) => d.id === selectedDisasterId) && activeDisasterInfo && (
                <option value={activeDisasterInfo.id}>
                  {activeDisasterInfo.name} ({activeDisasterInfo.total_buildings} bldgs — {activeDisasterInfo.damage_breakdown?.destroyed || 0} destroyed)
                </option>
              )}
              {disasters.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.total_buildings} bldgs — {d.damage_breakdown?.destroyed || 0} destroyed)
                </option>
              ))}
            </select>
          </div>

          {/* Current Event Summary Pill */}
          {activeDisasterInfo && (
            <div style={disasterDetailsPillStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#bbb' }}>📍 {activeDisasterInfo.location}</span>
                <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                  🔥 {activeDisasterInfo.damage_breakdown?.destroyed || 0} Destroyed
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                {activeDisasterInfo.description}
              </div>
            </div>
          )}

          {/* Quick Jump Pills for ALL 10 Disaster Events */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {uniqueEvents.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDisaster(d)}
                style={getQuickDisasterBtnStyle(activeDisasterInfo?.event === d.event)}
              >
                {d.icon} {d.event.replace('-', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          {/* Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: '1px solid #2a2a2a' }}>
            <label style={{ ...actionBtnStyle, cursor: 'pointer', background: '#005b8e', borderColor: '#0088cc' }}>
              📁 Upload Custom Pair
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
  background: 'rgba(18, 18, 18, 0.94)',
  backdropFilter: 'blur(10px)',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '12px 16px',
  boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
  maxWidth: 440,
  width: 'calc(100% - 28px)',
};

const disasterSelectStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#222',
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
  outline: 'none',
  cursor: 'pointer',
};

const disasterDetailsPillStyle = {
  marginTop: 8,
  padding: '8px 10px',
  background: 'rgba(25, 25, 25, 0.8)',
  borderRadius: 6,
  border: '1px solid #333',
};

function getQuickDisasterBtnStyle(active) {
  return {
    padding: '3px 7px',
    borderRadius: 12,
    border: `1px solid ${active ? '#00d2ff' : '#333'}`,
    background: active ? '#005b8e' : '#222',
    color: active ? '#fff' : '#aaa',
    fontSize: 9.5,
    fontWeight: 'bold',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  };
}

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
