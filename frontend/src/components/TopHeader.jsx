/**
 * TopHeader.jsx
 * -------------
 * Clean flat white (or navy in dark theme) top header bar with mobile drawer
 * trigger on the left and message icon + circular user avatar on the right.
 */

import React from 'react';

export default function TopHeader({
  darkMode = false,
  onOpenMobileMenu,
  onSelectMessages,
  unreadCount = 0,
}) {
  const bg = darkMode ? '#0D2238' : '#FFFFFF';
  const borderCol = darkMode ? '#19354F' : '#E1E7EC';
  const iconColor = darkMode ? '#EFF2F4' : '#5D7285';

  return (
    <header
      style={{
        height: 60,
        minHeight: 60,
        backgroundColor: bg,
        borderBottom: `1px solid ${borderCol}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          style={{
            display: 'none',
            background: 'transparent',
            border: `1px solid ${borderCol}`,
            borderRadius: 6,
            padding: '6px 10px',
            color: iconColor,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ☰
        </button>
      </div>

      {/* Right side: Message icon + circular user avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button
          type="button"
          onClick={onSelectMessages}
          aria-label="Review notifications"
          title="Manual Review Queue"
          style={{
            position: 'relative',
            background: 'transparent',
            border: 'none',
            padding: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={iconColor} aria-hidden="true">
            <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#0C7FDA',
              }}
            />
          )}
        </button>

        <div
          aria-label="User profile"
          title="Disaster Response Lead"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            backgroundColor: '#0C7FDA',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          DR
        </div>
      </div>
    </header>
  );
}
