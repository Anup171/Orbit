/**
 * RoutePanel.jsx
 * ---------------
 * Side panel displaying the prioritised triage list and rescue team route details.
 * Shows each building's damage class, priority rank, confidence, and
 * flags buildings that need manual review.
 */

import React, { useMemo } from 'react';

const DAMAGE_COLORS = {
  'no-damage':    '#2ecc71',
  'minor-damage': '#f1c40f',
  'major-damage': '#e67e22',
  'destroyed':    '#e74c3c',
};

const DAMAGE_ICONS = {
  'no-damage':    '✓',
  'minor-damage': '⚡',
  'major-damage': '⚠',
  'destroyed':    '🔥',
};

export default function RoutePanel({ buildings = [], selectedBuilding, onSelectBuilding }) {
  // Sort by priority_rank
  const sorted = useMemo(() => {
    return [...buildings]
      .filter((f) => f.properties)
      .sort((a, b) => (a.properties.priority_rank || 99) - (b.properties.priority_rank || 99));
  }, [buildings]);

  // Summary stats
  const stats = useMemo(() => {
    const counts = { 'no-damage': 0, 'minor-damage': 0, 'major-damage': 0, destroyed: 0 };
    let reviewCount = 0;
    sorted.forEach((f) => {
      const cls = f.properties.damage_class;
      if (counts[cls] !== undefined) counts[cls]++;
      if (f.properties.needs_manual_review === true || f.properties.needs_manual_review === 'true') {
        reviewCount++;
      }
    });
    return { counts, reviewCount, total: sorted.length };
  }, [sorted]);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>🚨 Triage Panel</h3>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          {stats.total} building{stats.total !== 1 ? 's' : ''} assessed
        </span>
      </div>

      {/* Summary bar */}
      {stats.total > 0 && (
        <div style={summaryStyle}>
          {Object.entries(stats.counts).map(([cls, count]) => (
            <div key={cls} style={summaryItemStyle}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: DAMAGE_COLORS[cls], display: 'inline-block',
                marginRight: 4,
              }} />
              <span style={{ fontSize: 11 }}>
                {cls.replace('-', ' ')}: <strong>{count}</strong>
              </span>
            </div>
          ))}
          {stats.reviewCount > 0 && (
            <div style={{ ...summaryItemStyle, color: '#9b59b6' }}>
              ⚠ <strong>{stats.reviewCount}</strong> need review
            </div>
          )}
        </div>
      )}

      {/* Building list */}
      <div style={listStyle}>
        {sorted.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
            No buildings to display.<br />
            Load sample data or submit an assessment.
          </div>
        ) : (
          sorted.map((feature) => {
            const p = feature.properties;
            const isSelected =
              selectedBuilding && selectedBuilding.building_id === p.building_id;
            const needsReview = p.needs_manual_review === true || p.needs_manual_review === 'true';

            return (
              <div
                key={p.building_id}
                onClick={() => onSelectBuilding && onSelectBuilding(p)}
                style={{
                  ...cardStyle,
                  borderLeft: `4px solid ${DAMAGE_COLORS[p.damage_class] || '#888'}`,
                  background: isSelected ? 'rgba(52,152,219,0.15)' : '#1e1e1e',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 13 }}>
                    #{p.priority_rank} {DAMAGE_ICONS[p.damage_class] || ''} {p.building_id}
                  </span>
                  {needsReview && (
                    <span style={{
                      background: '#9b59b6', color: '#fff', fontSize: 9,
                      padding: '2px 6px', borderRadius: 3, fontWeight: 'bold',
                    }}>
                      REVIEW
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#ccc', marginTop: 4 }}>
                  <span style={{ color: DAMAGE_COLORS[p.damage_class], fontWeight: 'bold' }}>
                    {p.damage_class}
                  </span>
                  {' · '}
                  Conf: {(p.damage_score * 100).toFixed(0)}%
                  {' · '}
                  Area: {p.area_sq_m} m²
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const panelStyle = {
  width: 320,
  background: '#121212',
  color: '#eee',
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid #333',
  overflow: 'hidden',
};

const headerStyle = {
  padding: '12px 14px',
  borderBottom: '1px solid #333',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const summaryStyle = {
  padding: '8px 14px',
  borderBottom: '1px solid #333',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const summaryItemStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 11,
};

const listStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '6px 0',
};

const cardStyle = {
  margin: '4px 8px',
  padding: '8px 10px',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'background 0.15s',
};
