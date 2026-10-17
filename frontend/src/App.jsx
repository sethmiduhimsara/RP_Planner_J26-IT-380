import React, { useState } from 'react';
import LandingPage from './components/Landing-page/LandingPage';
import Dashboard from './components/Dashboard/Dashboard';
import './App.css';

function App() {
  // Navigation state: 'landing' or 'dashboard'
  const [currentView, setCurrentView] = useState('landing');

  return (
    <div className="app-container">
      {currentView === 'landing' ? (
        <LandingPage onNavigateToDashboard={() => setCurrentView('dashboard')} />
      ) : (
        <Dashboard onNavigateHome={() => setCurrentView('landing')} />
      )}
    </div>
  );
}

export default App;
