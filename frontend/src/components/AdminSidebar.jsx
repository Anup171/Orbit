/**
 * AdminSidebar.jsx
 * ----------------
 * Clean, flat vertical navigation sidebar containing ONLY project-relevant
 * items for the Disaster Damage Assessment & Rescue Triage platform:
 *   - Dashboard (Global Disaster Intelligence)
 *   - Assessment Map (Pre/Post Satellite & Routing)
 *   - Global Zones (2,283 Worldwide Scenes)
 *   - Manual Review (Low-Confidence Queue with count badge)
 *   - Upload Imagery (Custom Pre/Post Inference)
 *   - OSM Cache & Tools
 */

import React from 'react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'assessment', label: 'Assessment Map', icon: 'map' },
];

function NavIcon({ name, color }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: color, 'aria-hidden': true };
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M12 3L3 10.5V21a1 1 0 001 1h5.5v-6.5h5V22H20a1 1 0 001-1V10.5L12 3z" />
        </svg>
      );
    case 'map':
      return (
        <svg {...props}>
          <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...props}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      );
    case 'review':
      return (
        <svg {...props}>
          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...props}>
          <path d="M21 5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" />
        </svg>
      );
    case 'sliders':
    default:
      return (
        <svg {...props}>
          <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
        </svg>
      );
  }
}

export default function AdminSidebar({
  activeNav = 'assessment',
  onSelectNav,
  collapsed = false,
  onToggleCollapse,
  darkMode = false,
  onToggleDarkMode,
  reviewBadgeCount = 0,
  mobileOpen = false,
  onCloseMobile,
  onResetWorkspace,
}) {
  const sidebarWidth = collapsed ? 100 : 280;
  const bg = darkMode ? '#031C30' : '#FFFFFF';
  const borderCol = darkMode ? '#143049' : '#E1E7EC';
  const defaultColor = darkMode ? '#EFF2F4' : '#5D7285';
  const selectedBg = darkMode ? '#163754' : '#E8F3FC';
  const selectedColor = darkMode ? '#FFFFFF' : '#0C7FDA';

  const sidebarContent = (
    <aside
      aria-label="Primary Navigation"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100%',
        backgroundColor: bg,
        borderRight: `1px solid ${borderCol}`,
        padding: collapsed ? '30px 20px' : '30px 24px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, background-color 0.2s ease',
        overflowY: 'auto',
        overflowX: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Brand Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          marginBottom: 30,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="#0C7FDA" />
            <path d="M8 14L14 8L20 14L14 20L8 14Z" fill="#FFFFFF" />
          </svg>
          {!collapsed && (
            <span
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: darkMode ? '#EFF2F4' : '#1E252B',
                whiteSpace: 'nowrap',
              }}
            >
              DisasterOps
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent',
            border: `1px solid ${borderCol}`,
            borderRadius: 4,
            color: defaultColor,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 13,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Navigation List */}
      <nav aria-label="Main Menu" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {NAV_ITEMS.map((item) => {
          const isSelected = activeNav === item.id;
          const itemColor = isSelected ? selectedColor : defaultColor;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectNav && onSelectNav(item.id);
                onCloseMobile && onCloseMobile();
              }}
              aria-current={isSelected ? 'page' : undefined}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 14,
                width: '100%',
                padding: collapsed ? '11px 0' : '10px 14px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: isSelected ? selectedBg : 'transparent',
                color: itemColor,
                fontFamily: 'Poppins, sans-serif',
                fontSize: 15,
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              <NavIcon name={item.icon} color={itemColor} />

              {!collapsed && (
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
              )}

              {item.hasBadge && reviewBadgeCount > 0 && (
                collapsed ? (
                  <span
                    aria-label={`${reviewBadgeCount} items`}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 12,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: '#0C7FDA',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      backgroundColor: '#0C7FDA',
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: 10,
                      lineHeight: '16px',
                    }}
                  >
                    {reviewBadgeCount}
                  </span>
                )
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Anchored Controls */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '4px 0' : '4px 6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={defaultColor} aria-hidden="true">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
            {!collapsed && (
              <span style={{ fontSize: 15, color: defaultColor, fontWeight: 400 }}>
                Dark Mode
              </span>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              role="switch"
              aria-checked={darkMode}
              aria-label="Toggle dark mode"
              onClick={onToggleDarkMode}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                border: 'none',
                backgroundColor: darkMode ? '#0C7FDA' : '#CBD5E1',
                position: 'relative',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: darkMode ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  transition: 'left 0.15s ease',
                }}
              />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onResetWorkspace}
          aria-label="Reset View"
          title={collapsed ? 'Reset View' : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '11px 14px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: darkMode ? '#4B6275' : '#5D7285',
            color: '#FFFFFF',
            fontFamily: 'Poppins, sans-serif',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4a2 2 0 00-2 2v14a2 2 0 002 2h8v-2H4V5z" />
          </svg>
          {!collapsed && <span>Reset View</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="desktop-sidebar" style={{ height: '100%', display: mobileOpen ? 'none' : 'block' }}>
        {sidebarContent}
      </div>

      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div
            onClick={onCloseMobile}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(3, 28, 48, 0.45)' }}
          />
          <div style={{ position: 'relative', zIndex: 201, height: '100%' }}>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
