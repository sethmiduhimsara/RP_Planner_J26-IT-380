import React from 'react';
import './Sidebar.css';

export default function Sidebar({
  activeTab = 'summary',
  onTabChange,
  onNavigateHome,
  isOpen = false,
  onClose,
}) {
  // Navigation structure exactly matching the screenshot UI
  const menuSections = [
    {
      title: 'OVERVIEW',
      items: [
        {
          id: 'summary',
          title: 'Dashboard',
          icon: 'fa-solid fa-chart-line',
        },
      ],
    },
    {
      title: 'MONITORING',
      items: [
        {
          id: 'pool-overview',
          title: 'Pool Overview',
          icon: 'fa-solid fa-water',
        },
        {
          id: 'leak',
          title: 'Water Loss Analysis',
          icon: 'fa-solid fa-droplet',
        },
        {
          id: 'pump',
          title: 'Pump Health',
          icon: 'fa-solid fa-gears',
        },
        {
          id: 'energy',
          title: 'Heating Optimization',
          icon: 'fa-solid fa-temperature-arrow-up',
        },
        {
          id: 'resource',
          title: 'Resource Orchestrator',
          icon: 'fa-solid fa-chart-line',
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        {
          id: 'sensors',
          title: 'Sensor Devices',
          icon: 'fa-solid fa-microchip',
        },
        {
          id: 'alerts',
          title: 'Alerts & Events',
          icon: 'fa-solid fa-bell',
        },
        {
          id: 'research',
          title: 'Research Insights',
          icon: 'fa-solid fa-flask',
        },
        {
          id: 'settings',
          title: 'Settings',
          icon: 'fa-solid fa-sliders',
        },
      ],
    },
  ];

  const handleItemClick = (itemId) => {
    if (onTabChange) {
      onTabChange(itemId);
    }
    // Auto-close drawer on mobile when an item is selected
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="sb-mobile-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Component */}
      <aside
        className={`aquaedge-sidebar ${isOpen ? 'is-open' : ''}`}
        aria-label="Application Navigation"
      >
        <div className="sb-inner-scroll">
          {/* -----------------------------------------------------------------
              Header: Brand Logo & Pink Bar from Screenshot
          ----------------------------------------------------------------- */}
          <div className="sb-header-block">
            <div className="sb-brand-row">
              <div className="sb-brand-logo">
                <div className="sb-logo-badge">
                  <i className="fa-solid fa-droplet"></i>
                </div>
                <span className="sb-brand-title">AquaEdge AI</span>
              </div>

              {/* Close Button on Mobile View */}
              <button
                type="button"
                className="sb-mobile-close-btn"
                onClick={onClose}
                aria-label="Close Sidebar"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Pink Accent Line from Screenshot */}
            <div className="sb-pink-bar" aria-hidden="true"></div>
          </div>

          {/* -----------------------------------------------------------------
              Navigation Sections (OVERVIEW, MONITORING, SYSTEM)
          ----------------------------------------------------------------- */}
          <nav className="sb-nav-container">
            {menuSections.map((section, sIdx) => (
              <div key={sIdx} className="sb-nav-section">
                <span className="sb-section-title">{section.title}</span>
                <ul className="sb-menu-list">
                  {section.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`sb-menu-btn ${isActive ? 'is-active' : ''}`}
                          onClick={() => handleItemClick(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {/* Active left indicator strip */}
                          {isActive && <span className="sb-active-strip"></span>}

                          <i className={`sb-menu-icon ${item.icon}`}></i>
                          <span className="sb-menu-label">{item.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* -----------------------------------------------------------------
              Quick Return to Landing Page Action at Bottom
          ----------------------------------------------------------------- */}
          {onNavigateHome && (
            <div className="sb-footer-block">
              <button
                type="button"
                className="sb-return-btn"
                onClick={onNavigateHome}
                title="Return to Landing Page"
              >
                <i className="fa-solid fa-arrow-left"></i>
                <span>Back to Home</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
