import React from 'react';
import './LandingPage.css';

export default function LandingPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="landing-wrapper">
      {/* ---------------------------------------------------------------------
          Navigation Bar
      --------------------------------------------------------------------- */}
      <header className="lp-navbar">
        <div className="lp-container lp-navbar-inner">
          <a href="#top" className="lp-brand">
            <div className="lp-brand-icon">
              <i className="fa-solid fa-water"></i>
            </div>
            <div className="lp-brand-text">
              <span className="lp-brand-title">AquaEdge AI</span>
              <span className="lp-brand-tag">Pool Intelligence</span>
            </div>
          </a>

          <nav>
            <ul className="lp-nav-links">
              <li><a href="#overview">Overview</a></li>
              <li><a href="#modules">Key Features</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#impact">Enterprise Impact</a></li>
            </ul>
          </nav>

          <div className="lp-nav-actions">
            <a href="#signin" className="lp-btn lp-btn-secondary">
              <i className="fa-solid fa-arrow-right-to-bracket"></i> Sign In
            </a>
            <a href="#modules" className="lp-btn lp-btn-primary">
              <i className="fa-solid fa-arrow-right"></i> Explore System
            </a>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------------
          Hero Section
      --------------------------------------------------------------------- */}
      <section className="lp-hero" id="overview">
        <div className="lp-container lp-hero-grid">
          <div className="lp-hero-content">
            <div className="lp-hero-pill">
              <i className="fa-solid fa-microchip"></i>
              <span>Edge-AI &amp; IoT Research Project · ID: J26-IT-380</span>
            </div>

            <h1 className="lp-hero-title">
              Intelligent Swimming <br />
              <span className="highlight-blue">Pool Management</span> System
            </h1>

            <p className="lp-hero-description">
              Autonomous Edge-AI and IoT operations designed for commercial pools, hotels, and resorts.
              Eliminate unexpected pump breakdowns, detect structural leaks early, optimize heating energy,
              and forecast pool resources with on-device TinyML intelligence.
            </p>

            <div className="lp-hero-actions">
              <a href="#modules" className="lp-btn lp-btn-primary lp-btn-lg">
                <i className="fa-solid fa-cubes-stacked"></i> Explore 4 AI Modules
              </a>
              <a href="#how-it-works" className="lp-btn lp-btn-secondary lp-btn-lg">
                <i className="fa-solid fa-diagram-project"></i> How It Works
              </a>
            </div>

            <div className="lp-hero-badges">
              <div className="lp-hero-badge-item">
                <i className="fa-solid fa-circle-check"></i>
                <span>Offline Edge Processing</span>
              </div>
              <div className="lp-hero-badge-item">
                <i className="fa-solid fa-circle-check"></i>
                <span>Zero Cloud Dependency for Alerts</span>
              </div>
              <div className="lp-hero-badge-item">
                <i className="fa-solid fa-circle-check"></i>
                <span>Retrofit-Ready IoT</span>
              </div>
            </div>
          </div>

          {/* Telemetry Card Mockup */}
          <div className="lp-hero-visual">
            <div className="lp-preview-card">
              <div className="lp-preview-card-header">
                <div className="lp-browser-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className="lp-card-status">
                  <span className="lp-status-dot"></span>
                  <span>Live Telemetry · ESP32 Edge Active</span>
                </div>
              </div>

              <div className="lp-preview-card-body">
                <div className="lp-preview-top-metric">
                  <div className="lp-metric-meta">
                    <small>System Health Overview</small>
                    <h4>Resort Main Pool Hub</h4>
                  </div>
                  <span className="lp-metric-badge">
                    <i className="fa-solid fa-shield-halved"></i> 100% Protected
                  </span>
                </div>

                <div className="lp-preview-tiles">
                  {/* Module 1 Tile */}
                  <div className="lp-tile">
                    <div className="lp-tile-header">
                      <span className="lp-tile-label">Pump Vibration</span>
                      <div className="lp-tile-icon" style={{ backgroundColor: '#eef2ff', color: '#4f46e5' }}>
                        <i className="fa-solid fa-gears"></i>
                      </div>
                    </div>
                    <div className="lp-tile-value">0.42 g RMS</div>
                    <div className="lp-tile-desc">Normal · TinyML Active</div>
                  </div>

                  {/* Module 2 Tile */}
                  <div className="lp-tile">
                    <div className="lp-tile-header">
                      <span className="lp-tile-label">Water Loss Status</span>
                      <div className="lp-tile-icon" style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>
                        <i className="fa-solid fa-droplet"></i>
                      </div>
                    </div>
                    <div className="lp-tile-value">0.0 mm/hr</div>
                    <div className="lp-tile-desc">Evaporation Only · No Leak</div>
                  </div>

                  {/* Module 3 Tile */}
                  <div className="lp-tile">
                    <div className="lp-tile-header">
                      <span className="lp-tile-label">Pool Water Temp</span>
                      <div className="lp-tile-icon" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                        <i className="fa-solid fa-temperature-arrow-up"></i>
                      </div>
                    </div>
                    <div className="lp-tile-value">28.5 °C</div>
                    <div className="lp-tile-desc">Eco-Optimized Window</div>
                  </div>

                  {/* Module 4 Tile */}
                  <div className="lp-tile">
                    <div className="lp-tile-header">
                      <span className="lp-tile-label">Resource Demand</span>
                      <div className="lp-tile-icon" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>
                        <i className="fa-solid fa-chart-line"></i>
                      </div>
                    </div>
                    <div className="lp-tile-value">Optimal</div>
                    <div className="lp-tile-desc">XGBoost Forecast Steady</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          Enterprise Impact / Stats Strip
      --------------------------------------------------------------------- */}
      <section className="lp-stats-strip" id="impact">
        <div className="lp-container">
          <div className="lp-stats-grid">
            <div className="lp-stat-box">
              <div className="lp-stat-val">24<span>/</span>7</div>
              <div className="lp-stat-label">Autonomous Edge Monitoring</div>
            </div>
            <div className="lp-stat-box">
              <div className="lp-stat-val">100<span>%</span></div>
              <div className="lp-stat-label">Offline TinyML Anomaly Detection</div>
            </div>
            <div className="lp-stat-box">
              <div className="lp-stat-val">Up to 30<span>%</span></div>
              <div className="lp-stat-label">Heating Energy Cost Reduction</div>
            </div>
            <div className="lp-stat-box">
              <div className="lp-stat-val">0<span>mm</span></div>
              <div className="lp-stat-label">Undetected Structural Leak Allowance</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          Key Features Section (4 Cards)
      --------------------------------------------------------------------- */}
      <section className="lp-section lp-section-subtle" id="modules">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">System Modules</span>
            <h2 className="lp-section-title">Four Core Intelligence Pillars</h2>
            <p className="lp-section-subtitle">
              Each specialized module targets a critical operational vulnerability in commercial pool
              management, delivering real-time actionable intelligence without human intervention.
            </p>
          </div>

          <div className="lp-features-grid">
            {/* Card 1: Edge-AI Pump Predictive Maintenance */}
            <div className="lp-feature-card lp-card-pump">
              <div className="lp-card-header">
                <div className="lp-card-icon-wrapper">
                  <i className="fa-solid fa-gears"></i>
                </div>
                <span className="lp-card-badge">Module 01</span>
              </div>
              <h3 className="lp-card-title">Edge-AI Pump Predictive Maintenance</h3>
              <p className="lp-card-desc">
                Continuous vibration and motor anomaly tracking using ESP32 and on-device TinyML.
                Detects bearing degradation, imbalance, and cavitation weeks before hardware breakdown.
              </p>
              <div className="lp-card-meta">
                <span className="lp-card-tech">
                  <i className="fa-solid fa-microchip"></i> ESP32 · ADXL345 · TinyML
                </span>
                <span>Proactive Uptime</span>
              </div>
            </div>

            {/* Card 2: AI Leak & Evaporation Tracker */}
            <div className="lp-feature-card lp-card-leak">
              <div className="lp-card-header">
                <div className="lp-card-icon-wrapper">
                  <i className="fa-solid fa-droplet"></i>
                </div>
                <span className="lp-card-badge">Module 02</span>
              </div>
              <h3 className="lp-card-title">AI Leak &amp; Evaporation Tracker</h3>
              <p className="lp-card-desc">
                Combines high-precision ultrasonic telemetry with LSTM neural networks to accurately discern
                natural environmental evaporation from structural water loss in real-time.
              </p>
              <div className="lp-card-meta">
                <span className="lp-card-tech">
                  <i className="fa-solid fa-water"></i> Ultrasonic · LSTM Forecasting
                </span>
                <span>Water Conservation</span>
              </div>
            </div>

            {/* Card 3: Smart Heating Optimization */}
            <div className="lp-feature-card lp-card-heat">
              <div className="lp-card-header">
                <div className="lp-card-icon-wrapper">
                  <i className="fa-solid fa-temperature-arrow-up"></i>
                </div>
                <span className="lp-card-badge">Module 03</span>
              </div>
              <h3 className="lp-card-title">Smart Heating Optimization</h3>
              <p className="lp-card-desc">
                Algorithmic thermal scheduling synchronizing ambient weather, guest occupancy, and tariff windows
                to maintain ideal swimming comfort while drastically cutting commercial heating energy bills.
              </p>
              <div className="lp-card-meta">
                <span className="lp-card-tech">
                  <i className="fa-solid fa-bolt"></i> Algorithmic Thermal Scheduling
                </span>
                <span>Energy Efficiency</span>
              </div>
            </div>

            {/* Card 4: Predictive Resource Orchestration */}
            <div className="lp-feature-card lp-card-resource">
              <div className="lp-card-header">
                <div className="lp-card-icon-wrapper">
                  <i className="fa-solid fa-chart-line"></i>
                </div>
                <span className="lp-card-badge">Module 04</span>
              </div>
              <h3 className="lp-card-title">Predictive Resource Orchestration</h3>
              <p className="lp-card-desc">
                XGBoost machine learning models forecasting daily bather loads, sanitization chemical dosing
                requirements, and optimal staff allocation schedules in advance.
              </p>
              <div className="lp-card-meta">
                <span className="lp-card-tech">
                  <i className="fa-solid fa-network-wired"></i> XGBoost ML Models
                </span>
                <span>Resource Optimization</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          How It Works (Hardware-to-Cloud)
      --------------------------------------------------------------------- */}
      <section className="lp-section" id="how-it-works">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">System Architecture</span>
            <h2 className="lp-section-title">How It Works: Hardware-to-Cloud</h2>
            <p className="lp-section-subtitle">
              A reliable three-stage pipeline bridging rugged on-site IoT sensors with edge inference
              and centralized cloud analytics.
            </p>
          </div>

          <div className="lp-flow-container">
            {/* Step 1 */}
            <div className="lp-flow-step">
              <div className="lp-step-num-badge">1</div>
              <div className="lp-step-icon">
                <i className="fa-solid fa-satellite-dish"></i>
              </div>
              <h3 className="lp-step-title">1. IoT Sensors Collect Data</h3>
              <p className="lp-step-desc">
                Non-invasive ADXL345 vibration sensors, ultrasonic level gauges, and thermal probes gather
                high-frequency telemetry directly at the pool edge 24/7.
              </p>
              <div className="lp-step-connector">
                <i className="fa-solid fa-arrow-right"></i>
              </div>
            </div>

            {/* Step 2 */}
            <div className="lp-flow-step">
              <div className="lp-step-num-badge">2</div>
              <div className="lp-step-icon">
                <i className="fa-solid fa-brain"></i>
              </div>
              <h3 className="lp-step-title">2. Edge-AI &amp; Cloud ML Process Data</h3>
              <p className="lp-step-desc">
                ESP32 microcontrollers run TinyML models locally for instant offline fault detection, while
                cloud LSTM and XGBoost algorithms execute predictive deep learning models.
              </p>
              <div className="lp-step-connector">
                <i className="fa-solid fa-arrow-right"></i>
              </div>
            </div>

            {/* Step 3 */}
            <div className="lp-flow-step">
              <div className="lp-step-num-badge">3</div>
              <div className="lp-step-icon">
                <i className="fa-solid fa-chart-pie"></i>
              </div>
              <h3 className="lp-step-title">3. Real-Time Dashboard Alerts</h3>
              <p className="lp-step-desc">
                Hotel facility managers receive immediate anomaly warnings, automated heating triggers, and
                maintenance timelines via a centralized, user-friendly dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          B2B Call to Action Strip
      --------------------------------------------------------------------- */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-container">
          <div className="lp-cta-card">
            <div className="lp-cta-text">
              <h3>Ready to Modernize Your Pool Operations?</h3>
              <p>
                Engineered for enterprise hospitality. Discover how Edge-AI and IoT turn reactive pool maintenance
                into predictable, cost-saving operational excellence.
              </p>
            </div>
            <div className="lp-cta-actions">
              <a href="#overview" className="lp-btn-cta">
                <i className="fa-solid fa-play"></i> View Live Demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          Footer
      --------------------------------------------------------------------- */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand-info">
              <div className="lp-footer-project">
                SLIIT Research Project J26-IT-380
              </div>
              <div className="lp-footer-subtitle">
                Edge-AI &amp; IoT System for Intelligent Swimming Pool Management
              </div>
            </div>

            <ul className="lp-footer-links">
              <li><a href="#overview"><i className="fa-solid fa-angle-right"></i> Overview</a></li>
              <li><a href="#modules"><i className="fa-solid fa-angle-right"></i> 4 Modules</a></li>
              <li><a href="#how-it-works"><i className="fa-solid fa-angle-right"></i> Architecture</a></li>
              <li><a href="mailto:project.j26it380@sliit.lk"><i className="fa-solid fa-envelope"></i> Contact Team</a></li>
            </ul>
          </div>

          <div className="lp-footer-bottom">
            <div>
              &copy; {currentYear} Intelligent Swimming Pool Management System. All rights reserved.
            </div>
            <div>
              Developed for SLIIT Undergraduate Research · Project ID: <a href="#overview">J26-IT-380</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
