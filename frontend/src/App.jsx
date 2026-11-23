import React, { useState, useCallback } from 'react';
import SwipeMap from './components/SwipeMap.jsx';
import DamageLayer from './components/DamageLayer.jsx';
import RoutePanel from './components/RoutePanel.jsx';

const API_BASE = '/api/v1';

const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  features: [],
};

export default function App() {
  const [geojsonData, setGeojsonData] = useState(SAMPLE_GEOJSON);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  const handleUpload = useCallback(async (preFile, postFile, stagingLat, stagingLon) => {
    const formData = new FormData();
    formData.append('pre_image', preFile);
    formData.append('post_image', postFile);

    let url = `${API_BASE}/predict`;
    const params = new URLSearchParams();
    if (stagingLat) params.set('staging_lat', stagingLat);
    if (stagingLon) params.set('staging_lon', stagingLon);
    if (params.toString()) url += `?${params}`;

    try {
      const res = await fetch(url, { method: 'POST', body: formData });
      const data = await res.json();
      setJobId(data.job_id);
      setJobStatus('pending');
      pollJob(data.job_id);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  }, []);

  const pollJob = useCallback(async (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${id}`);
        const data = await res.json();
        setJobStatus(data.status);
        if (data.status === 'completed') {
          clearInterval(interval);
          loadResults(id);
        } else if (data.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  const loadResults = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}/geojson`);
      const data = await res.json();
      setGeojsonData(data);
    } catch (err) {
      console.error('Failed to load results:', err);
    }
  }, []);

  const loadSampleData = useCallback(async () => {
    try {
      const res = await fetch('/stubs/sample_triage.geojson');
      const data = await res.json();
      setGeojsonData(data);
    } catch {
      // Fallback: use inline sample
      setGeojsonData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_001', damage_class: 'destroyed',
              damage_score: 0.94, priority_rank: 1, confidence: 0.88,
              needs_manual_review: false, area_sq_m: 420.5,
            },
            geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          },
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_002', damage_class: 'major-damage',
              damage_score: 0.72, priority_rank: 2, confidence: 0.61,
              needs_manual_review: true, area_sq_m: 850.0,
            },
            geometry: { type: 'Point', coordinates: [-122.4185, 37.7748] },
          },
          {
            type: 'Feature',
            properties: {
              building_id: 'bldg_003', damage_class: 'no-damage',
              damage_score: 0.05, priority_rank: 3, confidence: 0.96,
              needs_manual_review: false, area_sq_m: 120.0,
            },
            geometry: { type: 'Point', coordinates: [-122.4175, 37.7745] },
          },
        ],
      });
    }
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Map area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <SwipeMap>
          <DamageLayer
            geojsonData={geojsonData}
            onSelectBuilding={setSelectedBuilding}
          />
        </SwipeMap>

        {/* Upload toolbar */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 8,
          padding: '10px 14px', fontSize: 13,
        }}>
          <strong>Disaster Damage Assessment</strong>
          <div style={{ marginTop: 8 }}>
            <button onClick={loadSampleData} style={btnStyle}>
              Load Sample Data
            </button>
            {jobStatus && (
              <span style={{ marginLeft: 10 }}>
                Job: <code>{jobStatus}</code>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side panel */}
      <RoutePanel
        buildings={geojsonData.features}
        selectedBuilding={selectedBuilding}
        onSelectBuilding={setSelectedBuilding}
      />
    </div>
  );
}

const btnStyle = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#333',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
};
