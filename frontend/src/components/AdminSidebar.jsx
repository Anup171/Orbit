/**
 * AdminSidebar.jsx
 * ----------------
 * Clean, flat, restrained vertical navigation sidebar with Light (#FFFFFF)
 * and Dark (#031C30) themes, expanded (300px) / collapsed (100px) states,
 * filled SVG icons, Comments count badge, bottom theme switch & Logout button,
 * and responsive mobile drawer support.
 */

import React from 'react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'posts', label: 'Posts', icon: 'post' },
  { id: 'media', label: 'Media', icon: 'image' },
  { id: 'pages', label: 'Pages', icon: 'document' },
  { id: 'comments', label: 'Comments', icon: 'comment', hasBadge: true },
  { id: 'appearance', label: 'Appearance', icon: 'grid' },
  { id: 'plugins', label: 'Plugins', icon: 'plugin' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
  { id: 'tools', label: 'Tools', icon: 'sliders' },
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
    case 'post':
      return (
        <svg {...props}>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...props}>
          <path d="M21 5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" />
        </svg>
      );
    case 'document':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm1 7V3.5L19.5 9H15zM8 13h8v1.8H8V13zm0 3.5h8v1.8H8v-1.8z" />
        </svg>
      );
    case 'comment':
      return (
        <svg {...props}>
          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...props}>
          <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
        </svg>
      );
    case 'plugin':
      return (
        <svg {...props}>
          <path d="M20.5 11H19V7a2 2 0 00-2-2h-4V3.5a2.5 2.5 0 00-5 0V5H4a2 2 0 00-2 2v3.8h1.5a2.7 2.7 0 010 5.4H2V20a2 2 0 002 2h3.8v-1.5a2.7 2.7 0 015.4 0V22H17a2 2 0 002-2v-4h1.5a2.5 2.5 0 000-5z" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...props}>
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.3.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
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
  activeNav = 'posts',
  onSelectNav,
  collapsed = false,
  onToggleCollapse,
  darkMode = false,
  onToggleDarkMode,
  commentBadgeCount = 0,
  mobileOpen = false,
  onCloseMobile,
  onLogout,
}) {
  const sidebarWidth = collapsed ? 100 : 300;
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
          {/* Small blue geometric logo */}
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
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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

              {/* Comments / Manual Review Count Badge */}
              {item.hasBadge && commentBadgeCount > 0 && (
                collapsed ? (
                  <span
                    aria-label={`${commentBadgeCount} items`}
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
                    {commentBadgeCount}
                  </span>
                )
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Anchored Controls: Theme Switch + Logout */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Moon Icon + Theme Label + Compact Switch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '4px 0' : '4px 6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={defaultColor}
              aria-hidden="true"
            >
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
                transition: 'background-color 0.15s ease',
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

        {collapsed && (
          <button
            type="button"
            role="switch"
            aria-checked={darkMode}
            aria-label="Toggle dark mode"
            title="Toggle Dark Mode"
            onClick={onToggleDarkMode}
            style={{
              width: 40,
              height: 22,
              margin: '0 auto',
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
              }}
            />
          </button>
        )}

        {/* Full-width Slate Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Logout"
          title={collapsed ? 'Logout' : undefined}
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
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="desktop-sidebar" style={{ height: '100%', display: mobileOpen ? 'none' : 'block' }}>
        {sidebarContent}
      </div>

      {/* Mobile Dismissible Drawer */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
          }}
        >
          <div
            onClick={onCloseMobile}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(3, 28, 48, 0.45)',
            }}
          />
          <div style={{ position: 'relative', zIndex: 201, height: '100%' }}>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
