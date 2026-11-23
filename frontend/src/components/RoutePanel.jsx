/**
 * RoutePanel.jsx
 * ---------------
 * Interactive side panel displaying the prioritised disaster triage queue,
 * statistical metrics, filter/search controls, and emergency rescue routing dispatch.
 */

import React, { useState, useMemo } from 'react';

const DAMAGE_COLORS = {
  'no-damage': '#2ecc71',
  'minor-damage': '#f1c40f',
  'major-damage': '#e67e22',
  'destroyed': '#e74c3c',
};

const DAMAGE_ICONS = {
  'no-damage': '✓',
  'minor-damage': '⚡',
  'major-damage': '⚠',
  'destroyed': '🔥',
};

export default function RoutePanel({
  buildings = [],
  selectedBuilding,
  onSelectBuilding,
  onRequestRoute,
  activeRouteInfo,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('ALL'); // 'ALL', 'destroyed', 'major-damage', 'minor-damage', 'no-damage', 'REVIEW'
  const [sortBy, setSortBy] = useState('rank'); // 'rank', 'damage', 'area'

  // Extract clean properties list from GeoJSON features
  const allProperties = useMemo(() => {
    return (buildings || [])
      .filter((f) => f && f.properties)
      .map((f) => ({
        ...f.properties,
        _geometry: f.geometry,
      }));
  }, [buildings]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const counts = { 'destroyed': 0, 'major-damage': 0, 'minor-damage': 0, 'no-damage': 0 };
    let reviewCount = 0;

    allProperties.forEach((p) => {
      if (counts[p.damage_class] !== undefined) {
        counts[p.damage_class]++;
      }
      if (p.needs_manual_review === true || p.needs_manual_review === 'true') {
        reviewCount++;
      }
    });

    return {
      counts,
      reviewCount,
      total: allProperties.length,
    };
  }, [allProperties]);

  // Filtered & sorted buildings
  const displayedBuildings = useMemo(() => {
    let result = [...allProperties];

    // Filter by class or review flag
    if (filterClass === 'REVIEW') {
      result = result.filter((p) => p.needs_manual_review === true || p.needs_manual_review === 'true');
    } else if (filterClass !== 'ALL') {
      result = result.filter((p) => p.damage_class === filterClass);
    }

    // Filter by search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((p) =>
        (p.building_id || '').toLowerCase().includes(q) ||
        (p.damage_class || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'damage') {
        return (b.damage_score || 0) - (a.damage_score || 0);
      }
      if (sortBy === 'area') {
        return (b.area_sq_m || 0) - (a.area_sq_m || 0);
      }
      // default: rank
      return (a.priority_rank || 999) - (b.priority_rank || 999);
    });

    return result;
  }, [allProperties, filterClass, searchTerm, sortBy]);

  return (
    <div style={panelContainerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: '700', color: '#fff' }}>
              Triage & Routing Queue
            </h3>
            <span style={{ fontSize: 11, color: '#888' }}>
              {stats.total} total structures assessed
            </span>
          </div>
        </div>
      </div>

      {/* Aggregate Overview Card */}
      {stats.total > 0 && (
        <div style={statsContainerStyle}>
          <div style={statRowStyle}>
            <StatChip label="Destroyed" count={stats.counts['destroyed']} color={DAMAGE_COLORS['destroyed']} />
            <StatChip label="Major" count={stats.counts['major-damage']} color={DAMAGE_COLORS['major-damage']} />
            <StatChip label="Minor" count={stats.counts['minor-damage']} color={DAMAGE_COLORS['minor-damage']} />
            <StatChip label="Intact" count={stats.counts['no-damage']} color={DAMAGE_COLORS['no-damage']} />
          </div>
          {stats.reviewCount > 0 && (
            <div style={reviewAlertStyle}>
              <span>⚠</span>
              <span><strong>{stats.reviewCount}</strong> buildings require calibration review</span>
            </div>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div style={filterToolbarStyle}>
        <input
          type="text"
          placeholder="🔍 Search building ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={searchInputStyle}
        />

        {/* Filter Pills */}
        <div style={chipsContainerStyle}>
          <button
            onClick={() => setFilterClass('ALL')}
            style={getChipStyle(filterClass === 'ALL', '#555')}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilterClass('destroyed')}
            style={getChipStyle(filterClass === 'destroyed', DAMAGE_COLORS['destroyed'])}
          >
            Destroyed ({stats.counts['destroyed']})
          </button>
          <button
            onClick={() => setFilterClass('major-damage')}
            style={getChipStyle(filterClass === 'major-damage', DAMAGE_COLORS['major-damage'])}
          >
            Major ({stats.counts['major-damage']})
          </button>
          <button
            onClick={() => setFilterClass('REVIEW')}
            style={getChipStyle(filterClass === 'REVIEW', '#9b59b6')}
          >
            Review ({stats.reviewCount})
          </button>
        </div>

        {/* Sort Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#888' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={selectStyle}
          >
            <option value="rank">Priority Rank</option>
            <option value="damage">Damage Severity</option>
            <option value="area">Footprint Area</option>
          </select>
        </div>
      </div>

      {/* Active Route Info Card (if computed) */}
      {activeRouteInfo && (
        <div style={activeRouteCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#00d2ff', fontSize: 12 }}>⚡ Active Rescue Route</strong>
            <span style={{ fontSize: 11, color: '#aaa' }}>ETA: {activeRouteInfo.travel_time_minutes} min</span>
          </div>
          <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>
            Distance: <strong>{activeRouteInfo.distance_km} km</strong> · Staging $\rightarrow$ {activeRouteInfo.targetId}
          </div>
        </div>
      )}

      {/* Buildings List */}
      <div style={listContainerStyle}>
        {displayedBuildings.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: 13 }}>
            No structures match current filter.
          </div>
        ) : (
          displayedBuildings.map((p) => {
            const isSelected = selectedBuilding && selectedBuilding.building_id === p.building_id;
            const needsReview = p.needs_manual_review === true || p.needs_manual_review === 'true';
            const color = DAMAGE_COLORS[p.damage_class] || '#888';

            return (
              <div
                key={p.building_id}
                onClick={() => onSelectBuilding && onSelectBuilding(p)}
                style={{
                  ...cardStyle,
                  borderLeft: `4px solid ${color}`,
                  background: isSelected ? '#1b2a38' : '#1c1c1c',
                  boxShadow: isSelected ? '0 0 12px rgba(0, 210, 255, 0.4)' : 'none',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{DAMAGE_ICONS[p.damage_class] || '●'}</span>
                    <strong style={{ fontSize: 13, color: '#fff' }}>{p.building_id}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {needsReview && (
                      <span style={reviewBadgeStyle}>REVIEW</span>
                    )}
                    <span style={rankBadgeStyle}>#{p.priority_rank}</span>
                  </div>
                </div>

                {/* Metrics Row */}
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: color, fontWeight: 'bold' }}>
                    {p.damage_class?.replace('-', ' ')}
                  </span>
                  <span>Confidence: <strong style={{ color: '#fff' }}>{(p.damage_score * 100).toFixed(0)}%</strong></span>
                  <span>Area: <strong style={{ color: '#fff' }}>{p.area_sq_m} m²</strong></span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 6, borderTop: '1px solid #282828' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBuilding && onSelectBuilding(p);
                    }}
                    style={actionBtnStyle}
                  >
                    📍 Focus Map
                  </button>
                  {onRequestRoute && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestRoute(p);
                      }}
                      style={{ ...actionBtnStyle, background: '#005b8e', borderColor: '#0088cc', color: '#fff' }}
                    >
                      🚒 Dispatch Route
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────

function StatChip({ label, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ color: '#aaa' }}>{label}:</span>
      <strong style={{ color: '#fff' }}>{count}</strong>
    </div>
  );
}

// ── Style Definitions ───────────────────────────────────────

const panelContainerStyle = {
  width: 360,
  minWidth: 320,
  maxWidth: 420,
  background: '#141414',
  color: '#e0e0e0',
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid #2a2a2a',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle = {
  padding: '14px 16px',
  background: '#1a1a1a',
  borderBottom: '1px solid #282828',
};

const statsContainerStyle = {
  padding: '10px 16px',
  background: '#171717',
  borderBottom: '1px solid #282828',
};

const statRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
};

const reviewAlertStyle = {
  marginTop: 8,
  background: 'rgba(155, 89, 182, 0.15)',
  border: '1px solid #9b59b6',
  borderRadius: 4,
  padding: '4px 8px',
  color: '#d7bde2',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const filterToolbarStyle = {
  padding: '10px 16px',
  borderBottom: '1px solid #282828',
  background: '#161616',
};

const searchInputStyle = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #333',
  background: '#222',
  color: '#fff',
  fontSize: 12,
  outline: 'none',
};

const chipsContainerStyle = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
  overflowX: 'auto',
  paddingBottom: 2,
};

function getChipStyle(active, color) {
  return {
    padding: '3px 8px',
    borderRadius: 12,
    border: `1px solid ${active ? color : '#333'}`,
    background: active ? color : 'transparent',
    color: active ? '#fff' : '#aaa',
    fontSize: 10,
    fontWeight: 'bold',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  };
}

const selectStyle = {
  background: '#222',
  color: '#ddd',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 11,
  outline: 'none',
};

const activeRouteCardStyle = {
  margin: '8px 14px 0 14px',
  padding: '8px 12px',
  background: '#0d2233',
  border: '1px solid #0088cc',
  borderRadius: 6,
};

const listContainerStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const cardStyle = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #282828',
  cursor: 'pointer',
  transition: 'transform 0.1s, background 0.15s, box-shadow 0.15s',
};

const rankBadgeStyle = {
  background: '#2a2a2a',
  color: '#00d2ff',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 'bold',
  border: '1px solid #333',
};

const reviewBadgeStyle = {
  background: '#9b59b6',
  color: '#fff',
  padding: '2px 5px',
  borderRadius: 3,
  fontSize: 9,
  fontWeight: 'bold',
  letterSpacing: 0.5,
};

const actionBtnStyle = {
  flex: 1,
  padding: '4px 8px',
  fontSize: 11,
  background: '#252525',
  color: '#ccc',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  cursor: 'pointer',
};
