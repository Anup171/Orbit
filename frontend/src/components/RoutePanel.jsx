/**
 * RoutePanel.jsx
 * ---------------
 * Streamlined, uncluttered Rescue Triage & Routing right sidebar.
 * Features:
 *   - Compact 4-metric overview strip
 *   - Clean Rescue Dispatch card (Base picker + Generate Route + optional settings)
 *   - Simple search + class filter + layer toggles
 *   - Spacious 5-column sortable Priority Table (ID | Class | Prio | Time | Stop)
 */

import React, { useState, useMemo } from 'react';

const DAMAGE_COLORS = {
  'no-damage': '#27ae60',
  'minor-damage': '#d4ac0d',
  'major-damage': '#d35400',
  'destroyed': '#c0392b',
};

export default function RoutePanel({
  darkMode = false,
  buildings = [],
  selectedBuilding,
  onSelectBuilding,
  rescueBase,
  isSelectingBase,
  onToggleSelectBase,
  onGenerateRoute,
  isRouting = false,
  routingMessage = '',
  refreshCache = false,
  onToggleRefreshCache,
  routePlan = null,
  showDamageLayers,
  onToggleDamageLayers,
  showRescueRoutes,
  onToggleRescueRoutes,
  damageFilter,
  onChangeDamageFilter,
  onlyManualReview,
  onToggleManualReview,
  numTeams,
  onChangeNumTeams,
  maxStops,
  onChangeMaxStops,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [sortCol, setSortCol] = useState('priority_score');
  const [sortAsc, setSortAsc] = useState(false);

  const surface = darkMode ? '#0D2238' : '#FFFFFF';
  const subtle = darkMode ? '#112A45' : '#F7F9FA';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const textPrimary = darkMode ? '#EFF2F4' : '#1E252B';
  const textMuted = darkMode ? '#9CB2C5' : '#5D7285';
  const selectedRowBg = darkMode ? '#163754' : '#E8F3FC';

  const allProperties = useMemo(() => {
    return (buildings || []).filter((f) => f && f.properties).map((f) => ({ ...f.properties }));
  }, [buildings]);

  const stats = useMemo(() => {
    let destroyed = 0;
    let major = 0;
    let reviewCount = 0;
    allProperties.forEach((p) => {
      if (p.damage_class === 'destroyed') destroyed++;
      if (p.damage_class === 'major-damage') major++;
      if (p.needs_manual_review === true || p.needs_manual_review === 'true') reviewCount++;
    });
    return { total: allProperties.length, destroyed, major, reviewCount };
  }, [allProperties]);

  const displayedRows = useMemo(() => {
    let rows = [...allProperties];
    if (damageFilter !== 'ALL') rows = rows.filter((p) => p.damage_class === damageFilter);
    if (onlyManualReview) {
      rows = rows.filter((p) => p.needs_manual_review === true || p.needs_manual_review === 'true');
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(
        (p) =>
          (p.building_id || '').toLowerCase().includes(q) ||
          (p.damage_class || '').toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      let va = a[sortCol];
      let vb = b[sortCol];
      if (sortCol === 'visit_order' || sortCol === 'travel_time_minutes') {
        va = va != null ? Number(va) : 999999;
        vb = vb != null ? Number(vb) : 999999;
      } else if (typeof va === 'string' || typeof vb === 'string') {
        return sortAsc
          ? String(va || '').localeCompare(String(vb || ''))
          : String(vb || '').localeCompare(String(va || ''));
      } else {
        va = Number(va ?? -1);
        vb = Number(vb ?? -1);
      }
      return sortAsc ? va - vb : vb - va;
    });
    return rows;
  }, [allProperties, damageFilter, onlyManualReview, searchTerm, sortCol, sortAsc]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === 'visit_order' || col === 'travel_time_minutes' || col === 'building_id');
    }
  };
  const sortArrow = (col) => (sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : '');

  const inputStyle = {
    backgroundColor: subtle,
    color: textPrimary,
    border: `1px solid ${borderCol}`,
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: 'Poppins, sans-serif',
  };

  return (
    <div
      style={{
        width: 360,
        minWidth: 320,
        backgroundColor: surface,
        color: textPrimary,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${borderCol}`,
        borderRadius: 6,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header + 4 Clean Metrics */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: textPrimary }}>
            Rescue Triage
          </h3>
          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: textMuted }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showDamageLayers} onChange={onToggleDamageLayers} />
              Polygons
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showRescueRoutes} onChange={onToggleRescueRoutes} />
              Routes
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatPill label="Total" value={stats.total} color={textPrimary} bg={subtle} muted={textMuted} />
          <StatPill label="Destroyed" value={stats.destroyed} color={DAMAGE_COLORS.destroyed} bg={subtle} muted={textMuted} />
          <StatPill label="Major" value={stats.major} color={DAMAGE_COLORS['major-damage']} bg={subtle} muted={textMuted} />
          <StatPill label="Review" value={stats.reviewCount} color="#0C7FDA" bg={subtle} muted={textMuted} />
        </div>
      </div>

      {/* Rescue Dispatch Controls */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={onGenerateRoute}
            disabled={isRouting}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: isRouting ? '#5D7285' : '#0C7FDA',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: isRouting ? 'wait' : 'pointer',
            }}
          >
            {isRouting
              ? routingMessage || 'Loading roads...'
              : routePlan
                ? 'Recalculate Route'
                : 'Generate Rescue Route'}
          </button>

          <button
            type="button"
            onClick={onToggleSelectBase}
            title="Click on map to place rescue base"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #0C7FDA',
              backgroundColor: isSelectingBase ? '#0C7FDA' : 'transparent',
              color: isSelectingBase ? '#FFFFFF' : '#0C7FDA',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isSelectingBase ? 'Click Map...' : 'Set Base'}
          </button>

          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            title="Routing options"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${borderCol}`,
              backgroundColor: subtle,
              color: textMuted,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ⚙
          </button>
        </div>

        {/* Collapsible Routing Options */}
        {showOptions && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', backgroundColor: subtle, borderRadius: 6, marginBottom: 8, fontSize: 11, color: textMuted }}>
            <label>
              Teams:{' '}
              <select value={numTeams} onChange={(e) => onChangeNumTeams(Number(e.target.value))} style={{ ...inputStyle, padding: '2px 6px' }}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <label>
              Stops:{' '}
              <select value={maxStops} onChange={(e) => onChangeMaxStops(Number(e.target.value))} style={{ ...inputStyle, padding: '2px 6px' }}>
                <option value={6}>6</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={refreshCache} onChange={onToggleRefreshCache} />
              Refresh OSM
            </label>
          </div>
        )}

        <div style={{ fontSize: 11, color: textMuted }}>
          Base: <strong style={{ color: textPrimary }}>{rescueBase ? `${rescueBase.lat.toFixed(4)}, ${rescueBase.lon.toFixed(4)}` : '—'}</strong>
        </div>

        {routePlan && routePlan.status === 'road_network_unavailable' && (
          <div style={{ marginTop: 8, padding: '7px 10px', backgroundColor: darkMode ? '#2b1619' : '#FDEDEC', border: '1px solid #c0392b', borderRadius: 4, color: darkMode ? '#f5b7b1' : '#922b21', fontSize: 11 }}>
            <strong>Road Network Unavailable:</strong> {routePlan.error || 'Please retry later.'}
          </div>
        )}

        {routePlan && routePlan.status === 'ok' && (
          <div style={{ marginTop: 8, padding: '7px 10px', backgroundColor: subtle, borderRadius: 4, fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Stops: <strong style={{ color: '#0C7FDA' }}>{routePlan.summary?.rescue_stops_count ?? 0}</strong></span>
            <span>Dist: <strong>{routePlan.summary?.total_route_distance_km ?? 0} km</strong></span>
            <span>Time: <strong>{routePlan.summary?.total_route_travel_time_minutes ?? 0} min</strong></span>
          </div>
        )}
      </div>

      {/* Simple Search & Filter */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${borderCol}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search building..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 80 }}
        />
        <select value={damageFilter} onChange={(e) => onChangeDamageFilter(e.target.value)} style={inputStyle}>
          <option value="ALL">All</option>
          <option value="destroyed">Destroyed</option>
          <option value="major-damage">Major</option>
          <option value="minor-damage">Minor</option>
          <option value="no-damage">Intact</option>
        </select>
        <button
          type="button"
          onClick={onToggleManualReview}
          title="Filter to buildings needing manual review"
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            border: `1px solid ${onlyManualReview ? '#0C7FDA' : borderCol}`,
            backgroundColor: onlyManualReview ? '#E8F3FC' : subtle,
            color: onlyManualReview ? '#0C7FDA' : textMuted,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Review
        </button>
      </div>

      {/* Spacious 5-Column Priority Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, backgroundColor: subtle, borderBottom: `1px solid ${borderCol}`, zIndex: 2 }}>
              <th style={thStyle(textMuted)} onClick={() => handleSort('building_id')}>ID{sortArrow('building_id')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('damage_class')}>Class{sortArrow('damage_class')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('priority_score')}>Priority{sortArrow('priority_score')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('travel_time_minutes')}>Time{sortArrow('travel_time_minutes')}</th>
              <th style={{ ...thStyle(textMuted), textAlign: 'center' }} onClick={() => handleSort('visit_order')}>Stop{sortArrow('visit_order')}</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: textMuted }}>
                  No buildings match filters.
                </td>
              </tr>
            ) : (
              displayedRows.map((p) => {
                const isSelected = selectedBuilding && selectedBuilding.building_id === p.building_id;
                const color = DAMAGE_COLORS[p.damage_class] || textMuted;
                const review = p.needs_manual_review === true || p.needs_manual_review === 'true';

                return (
                  <tr
                    key={p.building_id}
                    onClick={() => onSelectBuilding && onSelectBuilding(p)}
                    style={{
                      backgroundColor: isSelected ? selectedRowBg : 'transparent',
                      borderBottom: `1px solid ${borderCol}`,
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '9px 8px 9px 14px', fontWeight: 600, color: textPrimary }}>
                      {p.building_id.replace('bldg_', '#')}
                      {review && <span title="Needs Manual Review" style={{ color: '#0C7FDA', marginLeft: 4 }}>•</span>}
                    </td>
                    <td style={{ padding: '9px 6px', color, fontWeight: 600, textTransform: 'capitalize' }}>
                      {(p.damage_class || '').replace('-damage', '').replace('no-damage', 'intact')}
                    </td>
                    <td style={{ padding: '9px 6px', color: '#0C7FDA', fontWeight: 600 }}>
                      {p.priority_score != null ? Number(p.priority_score).toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '9px 6px', color: textMuted }}>
                      {p.travel_time_minutes != null
                        ? `${Number(p.travel_time_minutes).toFixed(1)}m`
                        : p.reachable === false
                          ? 'N/A'
                          : '—'}
                    </td>
                    <td style={{ padding: '9px 10px 9px 6px', textAlign: 'center' }}>
                      {p.visit_order != null ? (
                        <span style={{ display: 'inline-block', backgroundColor: '#0C7FDA', color: '#FFFFFF', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>
                          {p.visit_order}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatPill({ label, value, color, bg, muted }) {
  return (
    <div style={{ backgroundColor: bg, borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 10, color: muted }}>{label}</div>
    </div>
  );
}

function thStyle(color) {
  return {
    padding: '8px 8px',
    textAlign: 'left',
    fontSize: 11,
    color,
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };
}
