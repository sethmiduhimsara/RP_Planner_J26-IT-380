import React from 'react';
import './Sidebar.css';

export default function Sidebar({ activeTab = 'summary', onTabChange, onNavigateHome }) {
  // Navigation tabs configuration
  const tabs = [
    {
      category: 'General',
      items: [
        {
          id: 'summary',
          title: 'System Summary',
          subtitle: 'Unified Pool Telemetry',
          icon: 'fa-solid fa-gauge-high',
          badge: 'Live',
          badgeClass: 'sb-badge-green',
        },
      ],
    },
    {
      category: 'Research Components',
      items: [
        {
          id: 'pump',
          title: 'Pump Predictive Maintenance',
          subtitle: 'ESP32 · ADXL345 · TinyML',
          icon: 'fa-solid fa-gears',
          member: 'Component 01',
        },
        {
          id: 'leak',
          title: 'Water Loss & Leak Tracker',
          subtitle: 'LSTM · Ultrasonic Sensors',
          icon: 'fa-solid fa-droplet',
          member: 'Component 02',
        },
        {
          id: 'energy',
          title: 'Energy Optimization System',
          subtitle: 'Smart Heating Algorithm',
          icon: 'fa-solid fa-temperature-arrow-up',
          member: 'Component 03',
        },
        {
          id: 'resource',
          title: 'Resource Orchestrator',
          subtitle: 'XGBoost AI Planning',
          icon: 'fa-solid fa-chart-line',
          member: 'Component 04',
        },
      ],
    },
  ];

  const handleTabClick = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  return (
    <aside className="dashboard-sidebar" aria-label="Dashboard Sidebar">
      {/* -------------------------------------------------------------------
          Sidebar Header / Branding
      ------------------------------------------------------------------- */}
      <div>
        <div className="sb-header">
          <div className="sb-brand">
            <div className="sb-brand-icon">
              <i className="fa-solid fa-water"></i>
            </div>
            <div className="sb-brand-info">
              <span className="sb-brand-title">AquaEdge AI</span>
              <span className="sb-brand-subtitle">Control Dashboard</span>
            </div>
          </div>

          <div className="sb-project-pill">
            <i className="fa-solid fa-microchip"></i>
            <span>SLIIT Research · J26-IT-380</span>
          </div>
        </div>

        {/* -------------------------------------------------------------------
            Navigation Tab List
        ------------------------------------------------------------------- */}
        <nav className="sb-nav-section">
          {tabs.map((section, sIdx) => (
            <div key={sIdx} className="sb-nav-group">
              <div className="sb-section-label">{section.category}</div>
              <ul className="sb-nav-list">
                {section.items.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <li key={tab.id}>
                      <button
                        type="button"
                        className={`sb-nav-item ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleTabClick(tab.id)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <div className="sb-item-icon-wrapper">
                          <i className={tab.icon}></i>
                        </div>
                        <div className="sb-item-content">
                          <span className="sb-item-title">{tab.title}</span>
                          <span className="sb-item-sub">{tab.subtitle}</span>
                        </div>
                        {tab.badge && (
                          <span className={`sb-item-badge ${tab.badgeClass}`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* -------------------------------------------------------------------
          Sidebar Footer / System Status & Quick Actions
      ------------------------------------------------------------------- */}
      <div className="sb-footer">
        <div className="sb-status-card">
          <div className="sb-status-left">
            <span className="sb-live-pulse"></span>
            <span>Edge Telemetry</span>
          </div>
          <span className="sb-status-tag">Connected</span>
        </div>

        <div className="sb-footer-actions">
          {onNavigateHome && (
            <button
              type="button"
              className="sb-action-btn"
              onClick={onNavigateHome}
              title="Return to Landing Page"
            >
              <i className="fa-solid fa-arrow-left"></i>
              <span>Back to Landing Page</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
