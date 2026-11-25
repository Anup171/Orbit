/**
 * RoutePanel.jsx
 * ---------------
 * Clean, flat Rescue Priority & Triage + Rescue Planning panel matching the
 * restrained Light (#FFFFFF / #EFF2F4) & Dark (#0D2238 / #031C30) theme.
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
  minPriority,
  onChangeMinPriority,
  onlyManualReview,
  onToggleManualReview,
  numTeams,
  onChangeNumTeams,
  maxStops,
  onChangeMaxStops,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState('priority_score');
  const [sortAsc, setSortAsc] = useState(false);

  const surface = darkMode ? '#0D2238' : '#FFFFFF';
  const subtle = darkMode ? '#112A45' : '#F7F9FA';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const textPrimary = darkMode ? '#EFF2F4' : '#1E252B';
  const textMuted = darkMode ? '#9CB2C5' : '#5D7285';
  const selectedRowBg = darkMode ? '#163754' : '#E8F3FC';

  const allProperties = useMemo(() => {
    return (buildings || [])
      .filter((f) => f && f.properties)
      .map((f) => ({ ...f.properties }));
  }, [buildings]);

  const stats = useMemo(() => {
    const counts = { destroyed: 0, 'major-damage': 0, 'minor-damage': 0, 'no-damage': 0 };
    let reviewCount = 0;
    allProperties.forEach((p) => {
      if (counts[p.damage_class] !== undefined) counts[p.damage_class]++;
      if (p.needs_manual_review === true || p.needs_manual_review === 'true') reviewCount++;
    });
    const affected = counts.destroyed + counts['major-damage'] + counts['minor-damage'];
    return {
      total: allProperties.length,
      affected,
      destroyed: counts.destroyed,
      major: counts['major-damage'],
      minor: counts['minor-damage'],
      reviewCount,
    };
  }, [allProperties]);

  const displayedRows = useMemo(() => {
    let rows = [...allProperties];
    if (damageFilter !== 'ALL') rows = rows.filter((p) => p.damage_class === damageFilter);
    if (minPriority > 0) rows = rows.filter((p) => (p.priority_score || 0) >= minPriority);
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
  }, [allProperties, damageFilter, minPriority, onlyManualReview, searchTerm, sortCol, sortAsc]);

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
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 11.5,
    fontFamily: 'Poppins, sans-serif',
  };

  return (
    <div
      style={{
        width: 390,
        minWidth: 340,
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
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: textPrimary }}>
              Rescue Priority & Triage
            </h3>
            <span style={{ fontSize: 11, color: textMuted }}>
              Expected Severity · OSMnx Road Routing
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
            <LegendDot color={DAMAGE_COLORS.destroyed} label="Dest" muted={textMuted} />
            <LegendDot color={DAMAGE_COLORS['major-damage']} label="Maj" muted={textMuted} />
            <LegendDot color={DAMAGE_COLORS['minor-damage']} label="Min" muted={textMuted} />
            <LegendDot color={DAMAGE_COLORS['no-damage']} label="OK" muted={textMuted} />
          </div>
        </div>
      </div>

      {/* 1. Disaster Overview */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: textMuted, marginBottom: 6 }}>
          DISASTER OVERVIEW
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          <MetricBox label="Total" value={stats.total} color={textPrimary} bg={subtle} border={borderCol} muted={textMuted} />
          <MetricBox label="Affected" value={stats.affected} color="#d35400" bg={subtle} border={borderCol} muted={textMuted} />
          <MetricBox label="Dest" value={stats.destroyed} color={DAMAGE_COLORS.destroyed} bg={subtle} border={borderCol} muted={textMuted} />
          <MetricBox label="Major" value={stats.major} color={DAMAGE_COLORS['major-damage']} bg={subtle} border={borderCol} muted={textMuted} />
          <MetricBox label="Minor" value={stats.minor} color={DAMAGE_COLORS['minor-damage']} bg={subtle} border={borderCol} muted={textMuted} />
          <MetricBox label="Review" value={stats.reviewCount} color="#0C7FDA" bg={subtle} border={borderCol} muted={textMuted} />
        </div>
      </div>

      {/* 2. Rescue Planning */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: textMuted }}>RESCUE PLANNING</span>
          <button
            type="button"
            onClick={onToggleSelectBase}
            style={{
              padding: '4px 9px',
              borderRadius: 4,
              border: '1px solid #0C7FDA',
              backgroundColor: isSelectingBase ? '#0C7FDA' : 'transparent',
              color: isSelectingBase ? '#FFFFFF' : '#0C7FDA',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isSelectingBase ? 'Click Map for Base...' : 'Select Base on Map'}
          </button>
        </div>

        <div style={{ fontSize: 11.5, color: textMuted, marginBottom: 8 }}>
          Base:{' '}
          <strong style={{ color: textPrimary }}>
            {rescueBase ? `${rescueBase.lat.toFixed(4)}, ${rescueBase.lon.toFixed(4)}` : 'Not set'}
          </strong>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: textMuted, flex: 1 }}>
            Teams:{' '}
            <select
              value={numTeams}
              onChange={(e) => onChangeNumTeams(Number(e.target.value))}
              style={{ ...inputStyle, padding: '3px 6px' }}
            >
              <option value={1}>1 Team</option>
              <option value={2}>2 Teams</option>
              <option value={3}>3 Teams</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: textMuted, flex: 1 }}>
            Stops:{' '}
            <select
              value={maxStops}
              onChange={(e) => onChangeMaxStops(Number(e.target.value))}
              style={{ ...inputStyle, padding: '3px 6px' }}
            >
              <option value={6}>6</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label
            title="Force fresh Overpass download instead of cached GraphML"
            style={{ fontSize: 10.5, color: textMuted, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          >
            <input type="checkbox" checked={refreshCache} onChange={onToggleRefreshCache} />
            Refresh OSM
          </label>
        </div>

        <button
          type="button"
          onClick={onGenerateRoute}
          disabled={isRouting}
          style={{
            width: '100%',
            padding: '8px 12px',
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
            ? routingMessage || 'Downloading road network...'
            : routePlan
              ? 'Recalculate Rescue Route'
              : 'Generate Rescue Route'}
        </button>

        {!isRouting && routingMessage && routePlan?.status === 'ok' && (
          <div style={{ fontSize: 11, color: '#27ae60', marginTop: 6 }}>
            {routingMessage}
          </div>
        )}

        {routePlan && routePlan.status === 'road_network_unavailable' && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              backgroundColor: darkMode ? '#2b1619' : '#FDEDEC',
              border: '1px solid #c0392b',
              borderRadius: 4,
              color: darkMode ? '#f5b7b1' : '#922b21',
              fontSize: 11,
            }}
          >
            <strong>OSM Road Network Unavailable:</strong>{' '}
            {routePlan.error || 'Unable to retrieve road network. Please retry later.'}
          </div>
        )}

        {routePlan && routePlan.status === 'ok' && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              backgroundColor: subtle,
              border: `1px solid ${borderCol}`,
              borderRadius: 4,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11.5 }}>
              <div>Stops: <strong style={{ color: '#0C7FDA' }}>{routePlan.summary?.rescue_stops_count ?? 0}</strong></div>
              <div>Road Dist: <strong>{routePlan.summary?.total_route_distance_km ?? 0} km</strong></div>
              <div>Est. Time: <strong>{routePlan.summary?.total_route_travel_time_minutes ?? 0} min</strong></div>
              <div>Unroutable: <strong>{routePlan.summary?.unroutable_buildings ?? 0}</strong></div>
            </div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4, lineHeight: 1.35 }}>
              Heuristic route (greedy priority-per-travel-time; not globally optimal).
            </div>
          </div>
        )}
      </div>

      {/* 3. Map Controls & Filters */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11.5, color: textMuted }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={showDamageLayers} onChange={onToggleDamageLayers} />
            Damage
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={showRescueRoutes} onChange={onToggleRescueRoutes} />
            Routes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyManualReview} onChange={onToggleManualReview} />
            Review Only
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 80 }}
          />
          <select
            value={damageFilter}
            onChange={(e) => onChangeDamageFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="ALL">All Classes</option>
            <option value="destroyed">Destroyed</option>
            <option value="major-damage">Major</option>
            <option value="minor-damage">Minor</option>
            <option value="no-damage">Intact</option>
          </select>
          <select
            value={minPriority}
            onChange={(e) => onChangeMinPriority(Number(e.target.value))}
            style={inputStyle}
          >
            <option value={0}>Any Prio</option>
            <option value={0.4}>≥ 0.4</option>
            <option value={0.6}>≥ 0.6</option>
            <option value={0.75}>≥ 0.75</option>
          </select>
        </div>
      </div>

      {/* 4. Sortable Priority Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, backgroundColor: subtle, borderBottom: `1px solid ${borderCol}`, zIndex: 2 }}>
              <th style={thStyle(textMuted)} onClick={() => handleSort('building_id')}>ID{sortArrow('building_id')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('damage_class')}>Class{sortArrow('damage_class')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('area_sq_m')}>Area{sortArrow('area_sq_m')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('priority_score')}>Prio{sortArrow('priority_score')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('travel_time_minutes')}>Time{sortArrow('travel_time_minutes')}</th>
              <th style={thStyle(textMuted)} onClick={() => handleSort('visit_order')}>Stop{sortArrow('visit_order')}</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 20, color: textMuted }}>
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
                    <td style={{ padding: '7px 8px', fontWeight: 600, color: textPrimary }}>
                      {p.building_id.replace('bldg_', '#')}
                      {review && <span title="Needs Manual Review" style={{ color: '#0C7FDA', marginLeft: 3 }}>•</span>}
                    </td>
                    <td style={{ padding: '7px 6px', color, fontWeight: 600 }}>
                      {(p.damage_class || '').replace('-damage', '').replace('no-damage', 'intact')}
                    </td>
                    <td style={{ padding: '7px 6px', color: textMuted }}>
                      {p.area_sq_m ? `${Math.round(p.area_sq_m)}` : '—'}
                    </td>
                    <td style={{ padding: '7px 6px', color: '#0C7FDA', fontWeight: 600 }}>
                      {p.priority_score != null ? Number(p.priority_score).toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '7px 6px', color: textMuted }}>
                      {p.travel_time_minutes != null
                        ? `${Number(p.travel_time_minutes).toFixed(1)}m`
                        : p.reachable === false
                          ? 'N/A'
                          : '—'}
                    </td>
                    <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                      {p.visit_order != null ? (
                        <span
                          style={{
                            display: 'inline-block',
                            backgroundColor: '#0C7FDA',
                            color: '#FFFFFF',
                            borderRadius: 4,
                            padding: '1px 6px',
                            fontSize: 10.5,
                            fontWeight: 600,
                          }}
                        >
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

function LegendDot({ color, label, muted }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: muted }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function MetricBox({ label, value, color, bg, border, muted }) {
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '5px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 9.5, color: muted }}>{label}</div>
    </div>
  );
}

function thStyle(color) {
  return {
    padding: '7px 6px',
    textAlign: 'left',
    fontSize: 10.5,
    color,
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };
}
