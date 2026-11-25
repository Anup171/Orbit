/**
 * DashboardView.jsx
 * -----------------
 * Informative Global Disaster Intelligence Dashboard enabling users to search,
 * filter, and inspect data for EVERY disaster event and zone visible on the map
 * (all 10 xBD disaster events / 2,283 global zones + active scene breakdown).
 */

import React, { useState, useMemo } from 'react';

export default function DashboardView({
  darkMode = false,
  buildings = [],
  disasters = [],
  globalZones = null,
  activeDisasterInfo = null,
  onSelectDisaster,
  onSelectZone,
  onGoToMap,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const cardBg = darkMode ? '#0D2238' : '#FFFFFF';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const titleColor = darkMode ? '#EFF2F4' : '#1E252B';
  const mutedColor = darkMode ? '#8FA5B8' : '#5D7285';
  const subtleBg = darkMode ? '#112A45' : '#EFF2F4';

  // Aggregate statistics across ALL 2,283 global zones by disaster event
  const eventAggregates = useMemo(() => {
    const zoneFeats = globalZones?.features || [];
    const byEvent = {};

    zoneFeats.forEach((f) => {
      const p = f.properties || {};
      const ev = p.event || 'unknown';
      if (!byEvent[ev]) {
        byEvent[ev] = {
          event: ev,
          title: p.title || ev,
          location: p.location || '',
          disaster_type: p.disaster_type || 'disaster',
          zonesCount: 0,
          totalBuildings: 0,
          destroyed: 0,
          major: 0,
          minor: 0,
          topSceneId: p.scene_id,
          maxSeverity: -1,
        };
      }
      const agg = byEvent[ev];
      agg.zonesCount += 1;
      agg.totalBuildings += Number(p.total_buildings || 0);
      agg.destroyed += Number(p.destroyed || 0);
      agg.major += Number(p.major_damage || 0);
      agg.minor += Number(p.minor_damage || 0);
      const sev = Number(p.severity_score || 0);
      if (sev > agg.maxSeverity) {
        agg.maxSeverity = sev;
        agg.topSceneId = p.scene_id;
      }
    });

    return Object.values(byEvent).sort((a, b) => b.destroyed - a.destroyed);
  }, [globalZones]);

  const disasterTypes = useMemo(() => {
    const types = new Set(eventAggregates.map((e) => e.disaster_type));
    return ['ALL', ...Array.from(types).sort()];
  }, [eventAggregates]);

  // Filter individual zones or events by search + type
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return eventAggregates.filter((ev) => {
      if (typeFilter !== 'ALL' && ev.disaster_type !== typeFilter) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.event.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        ev.disaster_type.toLowerCase().includes(q)
      );
    });
  }, [eventAggregates, searchQuery, typeFilter]);

  const matchingZones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const feats = globalZones?.features || [];
    if (!q && typeFilter === 'ALL') return [];
    return feats
      .filter((f) => {
        const p = f.properties || {};
        if (typeFilter !== 'ALL' && p.disaster_type !== typeFilter) return false;
        if (!q) return true;
        return (
          (p.scene_id || '').toLowerCase().includes(q) ||
          (p.title || '').toLowerCase().includes(q) ||
          (p.location || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.properties?.severity_score || 0) - (a.properties?.severity_score || 0))
      .slice(0, 12);
  }, [globalZones, searchQuery, typeFilter]);

  // Global Totals
  const totalGlobalZones = globalZones?.features?.length || 0;
  const totalGlobalBuildings = eventAggregates.reduce((s, e) => s + e.totalBuildings, 0);
  const totalGlobalDestroyed = eventAggregates.reduce((s, e) => s + e.destroyed, 0);

  // Active scene bar chart
  const counts = { destroyed: 0, 'major-damage': 0, 'minor-damage': 0, 'no-damage': 0 };
  buildings.forEach((f) => {
    const cls = f?.properties?.damage_class;
    if (counts[cls] !== undefined) counts[cls]++;
  });
  const barData = [
    { label: 'Destroyed', value: counts.destroyed },
    { label: 'Major', value: counts['major-damage'] },
    { label: 'Minor', value: counts['minor-damage'] },
    { label: 'Intact', value: counts['no-damage'] },
  ];
  const maxVal = Math.max(1, ...barData.map((d) => d.value));

  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
      {/* Heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="font-heading" style={{ margin: 0, fontSize: 29, fontWeight: 600, color: titleColor }}>
            Dashboard
          </h1>
          <div style={{ fontSize: 13, color: mutedColor }}>
            Global disaster intelligence across {eventAggregates.length} events and {totalGlobalZones.toLocaleString()} mapped zones
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToMap}
          style={{
            backgroundColor: '#0C7FDA',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            padding: '9px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open Assessment Map
        </button>
      </div>

      {/* Global KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KpiCard label="Disaster Events" value={eventAggregates.length} sub="xBD Global Coverage" cardBg={cardBg} borderCol={borderCol} titleColor={titleColor} mutedColor={mutedColor} />
        <KpiCard label="Mapped Zones" value={totalGlobalZones.toLocaleString()} sub="Clickable on Global Map" cardBg={cardBg} borderCol={borderCol} titleColor="#0C7FDA" mutedColor={mutedColor} />
        <KpiCard label="Total Structures" value={totalGlobalBuildings.toLocaleString()} sub="Across all zones" cardBg={cardBg} borderCol={borderCol} titleColor={titleColor} mutedColor={mutedColor} />
        <KpiCard label="Destroyed Structures" value={totalGlobalDestroyed.toLocaleString()} sub="Confirmed collapsed/burnt" cardBg={cardBg} borderCol={borderCol} titleColor="#c0392b" mutedColor={mutedColor} />
      </div>

      {/* Search & Filter All Disasters */}
      <div
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${borderCol}`,
          borderRadius: 6,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: titleColor }}>
              Explore All Disasters on Map
            </div>
            <div style={{ fontSize: 12, color: mutedColor }}>
              Search by event, city/country, or scene ID to inspect any zone
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search disaster, location, or scene ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: subtleBg,
                color: titleColor,
                border: `1px solid ${borderCol}`,
                borderRadius: 6,
                padding: '7px 12px',
                fontSize: 12.5,
                width: 260,
                fontFamily: 'Poppins, sans-serif',
              }}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                backgroundColor: subtleBg,
                color: titleColor,
                border: `1px solid ${borderCol}`,
                borderRadius: 6,
                padding: '7px 12px',
                fontSize: 12.5,
                fontFamily: 'Poppins, sans-serif',
              }}
            >
              {disasterTypes.map((t) => (
                <option key={t} value={t}>
                  {t === 'ALL' ? 'All Disaster Types' : t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* All Events Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${borderCol}`, color: mutedColor, textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Disaster Event</th>
                <th style={{ padding: '8px 10px' }}>Location</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Zones</th>
                <th style={{ padding: '8px 10px' }}>Buildings</th>
                <th style={{ padding: '8px 10px' }}>Destroyed</th>
                <th style={{ padding: '8px 10px' }}>Major</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => (
                <tr key={ev.event} style={{ borderBottom: `1px solid ${borderCol}` }}>
                  <td style={{ padding: '10px', fontWeight: 600, color: titleColor }}>{ev.title}</td>
                  <td style={{ padding: '10px', color: mutedColor }}>{ev.location}</td>
                  <td style={{ padding: '10px', color: mutedColor, textTransform: 'capitalize' }}>{ev.disaster_type}</td>
                  <td style={{ padding: '10px', color: titleColor }}>{ev.zonesCount}</td>
                  <td style={{ padding: '10px', color: titleColor }}>{ev.totalBuildings.toLocaleString()}</td>
                  <td style={{ padding: '10px', color: '#c0392b', fontWeight: 600 }}>{ev.destroyed.toLocaleString()}</td>
                  <td style={{ padding: '10px', color: '#d35400', fontWeight: 600 }}>{ev.major.toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectZone && onSelectZone(ev.topSceneId);
                        onGoToMap && onGoToMap();
                      }}
                      style={{
                        backgroundColor: '#E8F3FC',
                        color: '#0C7FDA',
                        border: 'none',
                        borderRadius: 4,
                        padding: '5px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Inspect on Map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Matching Individual Zones when searching */}
        {matchingZones.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${borderCol}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: titleColor, marginBottom: 8 }}>
              Matching Map Zones (Top {matchingZones.length} by Severity)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {matchingZones.map((f) => {
                const p = f.properties || {};
                return (
                  <button
                    key={p.scene_id}
                    type="button"
                    onClick={() => {
                      onSelectZone && onSelectZone(p.scene_id);
                      onGoToMap && onGoToMap();
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: subtleBg,
                      border: `1px solid ${borderCol}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: titleColor }}>{p.scene_id}</div>
                      <div style={{ fontSize: 11, color: mutedColor }}>
                        {p.total_buildings} bldgs · {p.destroyed} destroyed
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#0C7FDA' }}>Open</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row: Active Scene Bar Chart & Top Priority Structures */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div style={{ backgroundColor: cardBg, border: `1px solid ${borderCol}`, borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: titleColor, marginBottom: 4 }}>
            Active Scene Damage Distribution
          </div>
          <div style={{ fontSize: 12, color: mutedColor, marginBottom: 16 }}>
            {activeDisasterInfo?.name || 'Active Scene'} ({buildings.length} structures)
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 150, borderBottom: `1px solid ${borderCol}` }}>
            {barData.map((d) => {
              const h = Math.max(6, Math.round((d.value / maxVal) * 120));
              return (
                <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 56 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: titleColor }}>{d.value}</span>
                  <div style={{ width: 32, height: h, backgroundColor: '#0C7FDA', borderRadius: '4px 4px 0 0' }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: 8, fontSize: 12, color: mutedColor }}>
            {barData.map((d) => (
              <span key={d.label} style={{ width: 56, textAlign: 'center' }}>{d.label}</span>
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: cardBg, border: `1px solid ${borderCol}`, borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: titleColor, marginBottom: 4 }}>
            Top Priority Buildings (Active Scene)
          </div>
          <div style={{ fontSize: 12, color: mutedColor, marginBottom: 12 }}>
            Ranked by Expected Severity, Area & Confidence
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {buildings.slice(0, 5).map((f, idx) => {
              const p = f.properties || {};
              return (
                <div key={p.building_id || idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 6, backgroundColor: subtleBg }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#0C7FDA', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
                    #{p.priority_rank || idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: titleColor }}>{p.building_id}</div>
                    <div style={{ fontSize: 11.5, color: mutedColor }}>
                      {(p.damage_class || '').replace('-', ' ')} · {p.area_sq_m} m²
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0C7FDA' }}>
                    {p.priority_score != null ? Number(p.priority_score).toFixed(2) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, cardBg, borderCol, titleColor, mutedColor }) {
  return (
    <div style={{ backgroundColor: cardBg, border: `1px solid ${borderCol}`, borderRadius: 6, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: titleColor }}>{value}</div>
      <div style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
