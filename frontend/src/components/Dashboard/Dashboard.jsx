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

  // Breadcrumb / title mapping
  const titles = {
    summary: 'System Summary & Operations',
    pump: 'Edge-AI Pump Predictive Maintenance',
    leak: 'AI Water Loss & Structural Leak Tracker',
    energy: 'Algorithmic Energy Optimization System',
    resource: 'Predictive Resource Orchestrator',
  };

  // Render the unique component for each team member
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
      default:
        return <SummaryView onSelectModule={(tabId) => setActiveTab(tabId)} />;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* -------------------------------------------------------------------
          Common Dashboard Sidebar
      ------------------------------------------------------------------- */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId)}
        onNavigateHome={onNavigateHome}
      />

      {/* -------------------------------------------------------------------
          Main View Area
      ------------------------------------------------------------------- */}
      <div className="dashboard-main">
        {/* Top Header Bar */}
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <div className="dashboard-breadcrumbs">
              <span>Dashboard</span>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
              <span className="active">{titles[activeTab] || 'Overview'}</span>
            </div>
          </div>

          <div className="dashboard-topbar-right">
            <div className="db-status-chip">
              <i className="fa-solid fa-circle" style={{ fontSize: '0.55rem' }}></i>
              <span>ESP32 Telemetry Live</span>
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
