/**
 * App.jsx
 * -------
 * Clean, flat, restrained Light/Dark Admin Workspace integrating:
 *   - AdminSidebar (300px expanded / 100px collapsed / mobile drawer, Posts selected initially)
 *   - TopHeader (white header bar with message notification icon & circular avatar)
 *   - DashboardView (29px Epilogue heading, #0C7FDA bar chart, list cards with circular avatars)
 *   - Live Satellite Assessment Workspace (SwipeMap + DamageLayer + RoutePanel)
 */

import React, { useState, useCallback, useEffect } from 'react';
import AdminSidebar from './components/AdminSidebar.jsx';
import TopHeader from './components/TopHeader.jsx';
import DashboardView from './components/DashboardView.jsx';
import SwipeMap from './components/SwipeMap.jsx';
import DamageLayer from './components/DamageLayer.jsx';
import RoutePanel from './components/RoutePanel.jsx';

const API_BASE = '/api/v1';
const RESCUE_API = '/api/rescue';

export default function App() {
  // Navigation & Theme Shell State (Posts selected in initial reference state)
  const [activeNav, setActiveNav] = useState('posts');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Disaster Assessment & Routing State
  const [disasters, setDisasters] = useState([]);
  const [globalZones, setGlobalZones] = useState(null);
  const [selectedDisasterId, setSelectedDisasterId] = useState('');
  const [activeDisasterInfo, setActiveDisasterInfo] = useState(null);

  const [geojsonData, setGeojsonData] = useState({ type: 'FeatureCollection', features: [] });
  const [routeData, setRouteData] = useState({ type: 'FeatureCollection', features: [] });
  const [routePlan, setRoutePlan] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);

  const [mapView, setMapView] = useState({ center: [-122.716, 38.473], zoom: 16.5 });
  const [rescueBase, setRescueBase] = useState({
    lat: 38.475,
    lon: -122.720,
    label: 'Rescue Command Base',
  });
  const [isSelectingBase, setIsSelectingBase] = useState(false);

  const [showDamageLayers, setShowDamageLayers] = useState(true);
  const [showRescueRoutes, setShowRescueRoutes] = useState(true);
  const [damageFilter, setDamageFilter] = useState('ALL');
  const [minPriority, setMinPriority] = useState(0);
  const [onlyManualReview, setOnlyManualReview] = useState(false);
  const [numTeams, setNumTeams] = useState(1);
  const [maxStops, setMaxStops] = useState(10);

  const [imageOverlay, setImageOverlay] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [routingMessage, setRoutingMessage] = useState('');
  const [refreshCache, setRefreshCache] = useState(false);

  // Sync data-theme attribute for CSS variables & MapLibre popups
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    fetchDisasters();
    fetchGlobalZones();
  }, []);

  const fetchGlobalZones = async () => {
    try {
      const res = await fetch(`${API_BASE}/disasters/zones`);
      if (res.ok) setGlobalZones(await res.json());
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
          const defaultScene =
            catalog.find((d) => d.id.startsWith('santa-rosa-wildfire')) || catalog[0];
          selectDisaster(defaultScene);
        }
      }
    } catch (err) {
      console.warn('Error fetching disasters catalog:', err);
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

    const defaultBase = {
      lat: disaster.center[1] + 0.002,
      lon: disaster.center[0] - 0.002,
      label: `${disaster.location} Command Base`,
    };
    setRescueBase(defaultBase);
    setIsSelectingBase(false);

    setImageOverlay({
      pre_image_url: disaster.pre_image_url,
      post_image_url: disaster.post_image_url,
      image_coords: disaster.image_coords,
    });

    setRouteData({ type: 'FeatureCollection', features: [] });
    setRoutePlan(null);
    setRoutingMessage('');

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

  // Non-blocking OSMnx Road-Network Rescue Routing
  const runRescueRouting = useCallback(
    async (baseCoords, teamsCount, stopsCount) => {
      if (!selectedDisasterId) return;
      setIsRouting(true);
      setRoutingMessage('Downloading road network...');
      try {
        const res = await fetch(`${RESCUE_API}/generate-route-async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: selectedDisasterId,
            base_lat: baseCoords.lat,
            base_lon: baseCoords.lon,
            max_stops: stopsCount,
            num_teams: teamsCount,
            damage_filter:
              damageFilter !== 'ALL'
                ? [damageFilter]
                : ['destroyed', 'major-damage', 'minor-damage'],
            confidence_threshold: 0.65,
            refresh_cache: refreshCache,
          }),
        });
        if (!res.ok) throw new Error('Failed to start routing job');
        const job = await res.json();
        setRoutingMessage(job.progress_message || 'Downloading road network...');

        const pollJob = async () => {
          try {
            const jr = await fetch(`${RESCUE_API}/job/${job.job_id}`);
            if (!jr.ok) throw new Error('Polling failed');
            const jdata = await jr.json();
            if (jdata.progress_message) setRoutingMessage(jdata.progress_message);

            if (jdata.status === 'completed' && jdata.result) {
              const data = jdata.result;
              setRoutePlan(data);
              if (data.buildings_geojson) setGeojsonData(data.buildings_geojson);
              if (data.route_geojson) setRouteData(data.route_geojson);
              setShowRescueRoutes(true);
              setRefreshCache(false);
              setIsRouting(false);
            } else if (jdata.status === 'failed') {
              setRoutePlan({
                status: 'road_network_unavailable',
                error: jdata.progress_message || 'Unable to retrieve road network. Please retry later.',
              });
              setIsRouting(false);
            } else {
              setTimeout(pollJob, 800);
            }
          } catch {
            setRoutePlan({
              status: 'road_network_unavailable',
              error: 'Unable to retrieve road network. Please retry later.',
            });
            setRoutingMessage('Unable to retrieve road network. Please retry later.');
            setIsRouting(false);
          }
        };
        setTimeout(pollJob, 400);
      } catch {
        setRoutePlan({
          status: 'road_network_unavailable',
          error: 'Unable to retrieve road network. Please retry later.',
        });
        setRoutingMessage('Unable to retrieve road network. Please retry later.');
        setIsRouting(false);
      }
    },
    [selectedDisasterId, damageFilter, refreshCache]
  );

  const handleSelectBaseOnMap = useCallback(
    async (coords) => {
      const updated = { ...coords, label: 'User Selected Rescue Base' };
      setRescueBase(updated);
      setIsSelectingBase(false);

      try {
        await fetch(`${RESCUE_API}/base-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: selectedDisasterId,
            lat: updated.lat,
            lon: updated.lon,
            label: updated.label,
          }),
        });
      } catch (err) {
        console.warn('Could not persist base location:', err);
      }

      if (routePlan) {
        runRescueRouting(updated, numTeams, maxStops);
      }
    },
    [selectedDisasterId, routePlan, numTeams, maxStops, runRescueRouting]
  );

  const handleNavChange = (navId) => {
    setActiveNav(navId);
    if (navId === 'comments') {
      setOnlyManualReview(true);
    } else if (navId === 'posts') {
      setOnlyManualReview(false);
    } else if (navId === 'pages') {
      setMapView({ center: [-40, 22], zoom: 2.3 });
    }
  };

  const handleFileUpload = useCallback(
    async (e) => {
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
        const res = await fetch(
          `${API_BASE}/predict?staging_lat=${rescueBase.lat}&staging_lon=${rescueBase.lon}`,
          { method: 'POST', body: formData }
        );
        const data = await res.json();
        setJobStatus('queued');
        const pollInterval = setInterval(async () => {
          try {
            const st = await (await fetch(`${API_BASE}/jobs/${data.job_id}`)).json();
            setJobStatus(st.status);
            if (st.status === 'completed') {
              clearInterval(pollInterval);
              setIsLoading(false);
              const geo = await (await fetch(`${API_BASE}/jobs/${data.job_id}/geojson`)).json();
              setGeojsonData(geo);
              setActiveNav('posts');
            } else if (st.status === 'failed') {
              clearInterval(pollInterval);
              setIsLoading(false);
            }
          } catch {
            clearInterval(pollInterval);
            setIsLoading(false);
          }
        }, 2500);
      } catch (err) {
        console.error('Upload failed:', err);
        setJobStatus('error');
        setIsLoading(false);
      }
    },
    [rescueBase]
  );

  const manualReviewCount = (geojsonData.features || []).filter(
    (f) => f?.properties?.needs_manual_review === true || f?.properties?.needs_manual_review === 'true'
  ).length;

  const workspaceBg = darkMode ? '#071626' : '#EFF2F4';
  const surfaceBg = darkMode ? '#0D2238' : '#FFFFFF';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const headingCol = darkMode ? '#EFF2F4' : '#1E252B';
  const mutedCol = darkMode ? '#9CB2C5' : '#5D7285';

  const navTitleMap = {
    dashboard: 'Dashboard',
    posts: 'Disaster Scenes & Assessment',
    media: 'Satellite Imagery & Upload',
    pages: 'Global Disaster Zones',
    comments: 'Manual Review Queue',
    appearance: 'Appearance',
    plugins: 'Plugins',
    users: 'Response Teams',
    settings: 'Settings',
    tools: 'OSMnx & Cache Tools',
  };

  const showMapWorkspace = ['posts', 'media', 'pages', 'comments'].includes(activeNav);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: workspaceBg }}>
      {/* Left Vertical Admin Sidebar */}
      <AdminSidebar
        activeNav={activeNav}
        onSelectNav={handleNavChange}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        commentBadgeCount={manualReviewCount}
        mobileOpen={mobileDrawerOpen}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        onLogout={() => selectDisaster(disasters[0])}
      />

      {/* Right Main Column: Top Header + Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        <TopHeader
          darkMode={darkMode}
          onOpenMobileMenu={() => setMobileDrawerOpen(true)}
          onSelectMessages={() => handleNavChange('comments')}
          unreadCount={manualReviewCount}
        />

        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: workspaceBg }}>
          {activeNav === 'dashboard' ? (
            <DashboardView
              darkMode={darkMode}
              buildings={geojsonData.features}
              disasters={disasters}
              activeDisasterInfo={activeDisasterInfo}
              onSelectDisaster={selectDisaster}
              onGoToMap={() => setActiveNav('posts')}
            />
          ) : showMapWorkspace ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '18px 22px', gap: 14 }}>
              {/* Clean Section Header + Scene Selector Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <h1
                  className="font-heading"
                  style={{ margin: 0, fontSize: 29, fontWeight: 600, color: headingCol }}
                >
                  {navTitleMap[activeNav] || 'Posts'}
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    aria-label="Select disaster scene"
                    value={selectedDisasterId}
                    onChange={(e) => {
                      const d = disasters.find((x) => x.id === e.target.value);
                      if (d) selectDisaster(d);
                    }}
                    style={{
                      backgroundColor: surfaceBg,
                      color: headingCol,
                      border: `1px solid ${borderCol}`,
                      borderRadius: 6,
                      padding: '7px 12px',
                      fontSize: 13,
                      fontFamily: 'Poppins, sans-serif',
                      maxWidth: 340,
                    }}
                  >
                    {!disasters.some((d) => d.id === selectedDisasterId) && activeDisasterInfo && (
                      <option value={activeDisasterInfo.id}>{activeDisasterInfo.name}</option>
                    )}
                    {disasters.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.total_buildings} bldgs)
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setMapView({ center: [-40, 22], zoom: 2.3 })}
                    style={{
                      backgroundColor: surfaceBg,
                      color: '#0C7FDA',
                      border: `1px solid ${borderCol}`,
                      borderRadius: 6,
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Global Zones ({globalZones?.features?.length || disasters.length})
                  </button>

                  <label
                    style={{
                      backgroundColor: '#0C7FDA',
                      color: '#FFFFFF',
                      borderRadius: 6,
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Upload Pair
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {(isLoading || jobStatus) && (
                    <span style={{ fontSize: 12, color: mutedCol }}>
                      {isLoading ? 'Loading...' : `Job: ${jobStatus}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Map Card + Rescue Triage Panel */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    backgroundColor: surfaceBg,
                    border: `1px solid ${borderCol}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
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
                      rescueBase={rescueBase}
                      isSelectingBase={isSelectingBase}
                      onSelectBase={handleSelectBaseOnMap}
                      showDamageLayers={showDamageLayers}
                      showRescueRoutes={showRescueRoutes}
                      damageFilter={damageFilter}
                      minPriority={minPriority}
                      onlyManualReview={onlyManualReview}
                      selectedBuilding={selectedBuilding}
                      onSelectBuilding={setSelectedBuilding}
                      onSelectZone={handleSelectZone}
                    />
                  </SwipeMap>
                </div>

                <RoutePanel
                  darkMode={darkMode}
                  buildings={geojsonData.features}
                  selectedBuilding={selectedBuilding}
                  onSelectBuilding={setSelectedBuilding}
                  rescueBase={rescueBase}
                  isSelectingBase={isSelectingBase}
                  onToggleSelectBase={() => setIsSelectingBase(!isSelectingBase)}
                  onGenerateRoute={() => runRescueRouting(rescueBase, numTeams, maxStops)}
                  isRouting={isRouting}
                  routingMessage={routingMessage}
                  refreshCache={refreshCache}
                  onToggleRefreshCache={() => setRefreshCache(!refreshCache)}
                  routePlan={routePlan}
                  showDamageLayers={showDamageLayers}
                  onToggleDamageLayers={() => setShowDamageLayers(!showDamageLayers)}
                  showRescueRoutes={showRescueRoutes}
                  onToggleRescueRoutes={() => setShowRescueRoutes(!showRescueRoutes)}
                  damageFilter={damageFilter}
                  onChangeDamageFilter={setDamageFilter}
                  minPriority={minPriority}
                  onChangeMinPriority={setMinPriority}
                  onlyManualReview={onlyManualReview}
                  onToggleManualReview={() => setOnlyManualReview(!onlyManualReview)}
                  numTeams={numTeams}
                  onChangeNumTeams={setNumTeams}
                  maxStops={maxStops}
                  onChangeMaxStops={setMaxStops}
                />
              </div>
            </div>
          ) : (
            /* Restrained Flat Cards for Tools / Settings / Appearance / Plugins / Users */
            <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
              <h1
                className="font-heading"
                style={{ margin: '0 0 20px 0', fontSize: 29, fontWeight: 600, color: headingCol }}
              >
                {navTitleMap[activeNav]}
              </h1>
              <div
                style={{
                  backgroundColor: surfaceBg,
                  border: `1px solid ${borderCol}`,
                  borderRadius: 6,
                  padding: 20,
                  maxWidth: 640,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 600, color: headingCol, marginBottom: 8 }}>
                  {activeNav === 'tools' ? 'OSMnx Road Network Cache' : `${navTitleMap[activeNav]} Configuration`}
                </div>
                <p style={{ fontSize: 13, color: mutedCol, margin: '0 0 16px 0', lineHeight: 1.6 }}>
                  {activeNav === 'tools'
                    ? 'Road networks are cached as GraphML files in data/osm_cache/ with 180s configurable Overpass timeouts and multi-endpoint fallback.'
                    : `Clean administrative view for ${navTitleMap[activeNav]}. Return to Posts or Dashboard to inspect live satellite damage assessments and rescue routes.`}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {activeNav === 'tools' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await fetch(`${RESCUE_API}/cache/clear`, { method: 'POST' });
                        const d = await r.json();
                        alert(`Cleared ${d.files_removed} cached OSM files.`);
                      }}
                      style={{
                        backgroundColor: '#5D7285',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Clear OSM Cache
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveNav('posts')}
                    style={{
                      backgroundColor: '#0C7FDA',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Return to Satellite Map
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
