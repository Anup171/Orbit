/**
 * DashboardView.jsx
 * -----------------
 * Understated, flat dashboard shell with 29px Epilogue Semibold heading,
 * white cards (#FFFFFF) with subtle 1px borders and small corner radii,
 * a simple #0C7FDA blue bar chart, and list cards with circular avatars
 * and muted gray text.
 */

import React from 'react';

export default function DashboardView({
  darkMode = false,
  buildings = [],
  disasters = [],
  activeDisasterInfo = null,
  onSelectDisaster,
  onGoToMap,
}) {
  const cardBg = darkMode ? '#0D2238' : '#FFFFFF';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const titleColor = darkMode ? '#EFF2F4' : '#1E252B';
  const mutedColor = darkMode ? '#8FA5B8' : '#5D7285';
  const subtleBg = darkMode ? '#112A45' : '#EFF2F4';

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

  const topBuildings = buildings.slice(0, 5);

  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1
          className="font-heading"
          style={{
            margin: 0,
            fontSize: 29,
            fontWeight: 600,
            color: titleColor,
          }}
        >
          Dashboard
        </h1>
        <button
          type="button"
          onClick={onGoToMap}
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
          Open Satellite Map
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}
      >
        {/* Simple Blue Bar Chart Card */}
        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderCol}`,
            borderRadius: 6,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: titleColor, marginBottom: 4 }}>
            Damage Distribution
          </div>
          <div style={{ fontSize: 12, color: mutedColor, marginBottom: 20 }}>
            {activeDisasterInfo?.name || 'Active Disaster Scene'} ({buildings.length} structures)
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-around',
              height: 180,
              paddingTop: 16,
              borderBottom: `1px solid ${borderCol}`,
            }}
          >
            {barData.map((d) => {
              const pct = Math.max(6, Math.round((d.value / maxVal) * 140));
              return (
                <div
                  key={d.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    width: 56,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: titleColor }}>
                    {d.value}
                  </span>
                  <div
                    style={{
                      width: 34,
                      height: pct,
                      backgroundColor: '#0C7FDA',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              paddingTop: 10,
              fontSize: 12,
              color: mutedColor,
            }}
          >
            {barData.map((d) => (
              <span key={d.label} style={{ width: 56, textAlign: 'center' }}>
                {d.label}
              </span>
            ))}
          </div>
        </div>

        {/* List Card with Circular Avatars & Muted Gray Placeholders */}
        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderCol}`,
            borderRadius: 6,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: titleColor, marginBottom: 4 }}>
            Priority Structures Queue
          </div>
          <div style={{ fontSize: 12, color: mutedColor, marginBottom: 14 }}>
            Highest expected severity & triage rank
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topBuildings.map((f, idx) => {
              const p = f.properties || {};
              return (
                <div
                  key={p.building_id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 6,
                    backgroundColor: subtleBg,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      backgroundColor: '#0C7FDA',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    #{p.priority_rank || idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: titleColor }}>
                      {p.building_id}
                    </div>
                    <div style={{ fontSize: 12, color: mutedColor }}>
                      {(p.damage_class || '').replace('-', ' ')} · {p.area_sq_m} m²
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0C7FDA' }}>
                    {p.priority_score != null ? Number(p.priority_score).toFixed(2) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disaster Events List Card */}
        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderCol}`,
            borderRadius: 6,
            padding: 20,
            gridColumn: '1 / -1',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: titleColor, marginBottom: 12 }}>
            Cataloged Disaster Scenes ({disasters.length})
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {disasters.slice(0, 6).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onSelectDisaster && onSelectDisaster(d);
                  onGoToMap && onGoToMap();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  backgroundColor: subtleBg,
                  border: `1px solid ${borderCol}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    backgroundColor: '#5D7285',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {d.icon || '🛰'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: titleColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {d.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: mutedColor }}>
                    {d.total_buildings} buildings · {d.damage_breakdown?.destroyed || 0} destroyed
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
