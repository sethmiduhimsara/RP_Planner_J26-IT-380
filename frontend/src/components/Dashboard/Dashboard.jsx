import React, { useState } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import MotorVibration from '../motor-vibration/MotorVibration';
import WaterLoss from '../water-loss/WaterLoss';
import EnergyOptimizer from '../energy-optimizer/EnergyOptimizer';
import ResourceOrchestrator from '../resource-orchestrator/ResourceOrchestrator';
import SummaryView from '../summary-view/SummaryView';
import './Dashboard.css';

export default function Dashboard({ onNavigateHome }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Breadcrumb / title mapping for all menu items
  const titles = {
    summary: 'Dashboard Overview',
    'pool-overview': 'Pool Overview & Telemetry',
    pump: 'Pump Health & Vibration Diagnostics',
    leak: 'Water Loss & Structural Leak Tracker',
    energy: 'Heating Optimization System',
    resource: 'Environmental Data & Planning',
    sensors: 'Sensor Devices & Hardware Telemetry',
    alerts: 'Alerts & Operational Events',
    research: 'Research Insights & Analysis',
    settings: 'System & Parameter Settings',
  };

  // Render the unique component for each tab
  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'pump':
        return <MotorVibration />;
      case 'leak':
        return <WaterLoss />;
      case 'energy':
        return <EnergyOptimizer />;
      case 'resource':
        return <ResourceOrchestrator />;
      case 'summary':
      case 'pool-overview':
      default:
        return <SummaryView onSelectModule={(tabId) => setActiveTab(tabId)} />;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* -------------------------------------------------------------------
          Common Dashboard Sidebar (Fully Responsive with Mobile Drawer)
      ------------------------------------------------------------------- */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId)}
        onNavigateHome={onNavigateHome}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* -------------------------------------------------------------------
          Main View Area
      ------------------------------------------------------------------- */}
      <div className="dashboard-main">
        {/* Top Header Bar */}
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            {/* Hamburger Button for Mobile (<900px) */}
            <button
              type="button"
              className="db-mobile-menu-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open Sidebar Menu"
              title="Open Menu"
            >
              <i className="fa-solid fa-bars"></i>
            </button>

            <div className="dashboard-breadcrumbs">
              <span className="db-bc-root">AquaEdge AI</span>
              <i className="fa-solid fa-chevron-right db-bc-arrow"></i>
              <span className="active">{titles[activeTab] || 'Overview'}</span>
            </div>
          </div>

          <div className="dashboard-topbar-right">
            <div className="db-status-chip">
              <i className="fa-solid fa-circle" style={{ fontSize: '0.55rem' }}></i>
              <span>ESP32 Live</span>
            </div>

            <div className="db-user-avatar" title="Facility Engineer">
              FE
            </div>
          </div>
        </header>

        {/* Content Body: Dynamically renders the selected module component */}
        <main className="dashboard-content">
          {renderActiveComponent()}
        </main>
      </div>
    </div>
  );
}
