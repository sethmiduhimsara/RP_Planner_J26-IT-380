import React from 'react';
import heroImg from '../../assets/resort_pool_hero.jpg';
import './LandingPage.css';

export default function LandingPage({ onNavigateToDashboard }) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="ae-landing-wrapper">
      {/* ---------------------------------------------------------------------
          1. Navbar
      --------------------------------------------------------------------- */}
      <header className="ae-navbar">
        <div className="ae-container ae-navbar-inner">
          <a href="#top" className="ae-brand">
            <div className="ae-brand-icon">
              <i className="fa-solid fa-water"></i>
            </div>
            <span className="ae-brand-name">AquaEdge-AI</span>
          </a>

          <nav>
            <ul className="ae-nav-menu">
              <li><a href="#overview">Home</a></li>
              <li><a href="#technology">Technology</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#workflow">Workflow</a></li>
              <li><a href="#research">Research</a></li>
            </ul>
          </nav>

          <div className="ae-nav-actions">
            <button
              type="button"
              onClick={onNavigateToDashboard}
              className="ae-btn-dashboard"
              title="Launch Control Dashboard"
            >
              <i className="fa-solid fa-gauge-high"></i>
              <span>Explore Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------------
          2. Hero Section
      --------------------------------------------------------------------- */}
      <section className="ae-hero" id="overview">
        <div className="ae-container ae-hero-grid">
          <div className="ae-hero-left">
            <div className="ae-pill-badge">
              <i className="fa-solid fa-microchip"></i>
              <span>YEAR 2026 / RESEARCH PROJECT J26-IT-380</span>
            </div>

            <h1 className="ae-hero-title">
              Smarter Pool <br />
              Management. <br />
              More Efficient <br />
              Resources.
            </h1>

            <p className="ae-hero-desc">
              Advanced research into edge-based computation, predictive pump monitoring,
              and intelligent resource allocation. Harnessing the power of Edge computing
              to create sustainable aquatic environments.
            </p>

            <div className="ae-hero-actions">
              <button
                type="button"
                onClick={onNavigateToDashboard}
                className="ae-btn-teal"
              >
                <span>Explore Technology</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>

              <a href="#workflow" className="ae-btn-outline">
                Our Research Approach
              </a>
            </div>
          </div>

          <div className="ae-hero-right">
            <div className="ae-hero-image-wrapper">
              <img
                src={heroImg}
                alt="Luxury resort pool at twilight with intelligent monitoring"
                className="ae-hero-image"
              />

              {/* Floating UI Dashboard Telemetry Card */}
              <div className="ae-floating-card">
                <div className="ae-fc-head">
                  <span>Pool Telemetry</span>
                  <span className="ae-fc-badge">Live · Optimal</span>
                </div>
                <div className="ae-fc-body">
                  <div className="ae-fc-metric">
                    <h4>98.2%</h4>
                    <small>System Health</small>
                  </div>
                  <div className="ae-mini-bars">
                    <span className="ae-bar" style={{ height: '14px' }}></span>
                    <span className="ae-bar" style={{ height: '22px' }}></span>
                    <span className="ae-bar" style={{ height: '18px' }}></span>
                    <span className="ae-bar" style={{ height: '28px' }}></span>
                    <span className="ae-bar" style={{ height: '20px' }}></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          3. Section: "A More Intelligent Approach" (3 Pillars)
      --------------------------------------------------------------------- */}
      <section className="ae-section" id="features">
        <div className="ae-container">
          <div className="ae-section-center">
            <h2 className="ae-section-title">A More Intelligent Approach</h2>
            <p className="ae-section-sub">
              Our research focuses on the core pillars of modern pool infrastructure management,
              utilizing multidimensional sensory data for real-world efficiency.
            </p>
          </div>

          <div className="ae-pillars-grid">
            {/* Pillar 1: Water Loss Analysis */}
            <div className="ae-pillar-card">
              <div className="ae-pillar-icon-box">
                <i className="fa-solid fa-chart-line"></i>
              </div>
              <h3>Water Loss Analysis</h3>
              <p>
                Accurately analyzing water levels and ambient conditions to differentiate
                between natural evaporation and structural leaks in real-time.
              </p>
            </div>

            {/* Pillar 2: Pump Condition Monitoring */}
            <div className="ae-pillar-card">
              <div className="ae-pillar-icon-box">
                <i className="fa-solid fa-gears"></i>
              </div>
              <h3>Pump Condition Monitoring</h3>
              <p>
                Discrete continuous assessment of mechanical stress and motor health to
                evaluate wear and predict potential failures in advance.
              </p>
            </div>

            {/* Pillar 3: Heating Optimization */}
            <div className="ae-pillar-card">
              <div className="ae-pillar-icon-box">
                <i className="fa-solid fa-temperature-arrow-up"></i>
              </div>
              <h3>Heating Optimization</h3>
              <p>
                Intelligent thermal scheduling algorithms designed to minimize energy
                expenditure while maintaining optimal thermal comfort.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          4. Section: "The Research Workflow" (01 -> 02 -> 03 -> 04)
      --------------------------------------------------------------------- */}
      <section className="ae-section" id="workflow" style={{ paddingTop: 0 }}>
        <div className="ae-container">
          <div className="ae-section-center">
            <h2 className="ae-section-title">The Research Workflow</h2>
          </div>

          <div className="ae-workflow-container">
            <div className="ae-wf-line" aria-hidden="true"></div>

            {/* Step 01 */}
            <div className="ae-workflow-step">
              <div className="ae-wf-circle">01</div>
              <h3 className="ae-wf-title">Sense</h3>
              <p className="ae-wf-desc">
                Continuous real-time sensory data capture across pool IoT sensors.
              </p>
            </div>

            {/* Step 02 */}
            <div className="ae-workflow-step">
              <div className="ae-wf-circle">02</div>
              <h3 className="ae-wf-title">Analyze</h3>
              <p className="ae-wf-desc">
                Translating continuous sensory data to extract relevant structural and anomaly patterns.
              </p>
            </div>

            {/* Step 03 */}
            <div className="ae-workflow-step">
              <div className="ae-wf-circle">03</div>
              <h3 className="ae-wf-title">Understand</h3>
              <p className="ae-wf-desc">
                Edge computing embedded machine learning inference on-device for prompt understanding.
              </p>
            </div>

            {/* Step 04 */}
            <div className="ae-workflow-step">
              <div className="ae-wf-circle">04</div>
              <h3 className="ae-wf-title">Improve</h3>
              <p className="ae-wf-desc">
                Determining actionable steps toward maintenance and resource conservation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          5. Section: "Next-Generation Infrastructure" (List + 2x2 Bento Tiles)
      --------------------------------------------------------------------- */}
      <section className="ae-section" id="technology">
        <div className="ae-container ae-infra-grid">
          <div className="ae-infra-left">
            <h2>Next-Generation Infrastructure</h2>
            <div className="ae-infra-list">
              <div className="ae-infra-item">
                <span className="ae-infra-dot"></span>
                <div className="ae-infra-item-text">
                  <strong>Edge Computing</strong>
                  <p>Processing data locally on-site for immediate analysis, bypassing external cloud latency.</p>
                </div>
              </div>

              <div className="ae-infra-item">
                <span className="ae-infra-dot"></span>
                <div className="ae-infra-item-text">
                  <strong>Acoustic &amp; Vibration Monitoring</strong>
                  <p>Sub-surface sensor streams for pump acoustics, vibration metrics, and physical state indicators.</p>
                </div>
              </div>

              <div className="ae-infra-item">
                <span className="ae-infra-dot"></span>
                <div className="ae-infra-item-text">
                  <strong>Machine Learning</strong>
                  <p>Predictive algorithms trained on diverse real-world datasets for high-accuracy diagnostics.</p>
                </div>
              </div>

              <div className="ae-infra-item">
                <span className="ae-infra-dot"></span>
                <div className="ae-infra-item-text">
                  <strong>IoT Connectivity</strong>
                  <p>Lightweight, low-power telemetry transmission across robust cloud infrastructure.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="ae-infra-right">
            <div className="ae-bento-grid">
              {/* Tile 1: Mint */}
              <div className="ae-bento-tile ae-bento-light">
                <i className="fa-solid fa-microchip ae-bento-icon"></i>
                <h4>Edge Processing</h4>
              </div>

              {/* Tile 2: Dark Navy */}
              <div className="ae-bento-tile ae-bento-dark">
                <i className="fa-solid fa-wave-square ae-bento-icon"></i>
                <h4>Acoustic AI</h4>
              </div>

              {/* Tile 3: Dark Navy */}
              <div className="ae-bento-tile ae-bento-dark">
                <i className="fa-solid fa-shield-halved ae-bento-icon"></i>
                <h4>Efficiency First</h4>
              </div>

              {/* Tile 4: Mint */}
              <div className="ae-bento-tile ae-bento-light">
                <i className="fa-solid fa-calendar-check ae-bento-icon"></i>
                <h4>Smart Scheduling</h4>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          6. Section: "Moving Beyond Reactive Monitoring" (Full Dark Navy Section)
      --------------------------------------------------------------------- */}
      <section className="ae-dark-section">
        <div className="ae-container ae-dark-grid">
          <div className="ae-dark-left">
            <span className="ae-dark-tag">Innovation &amp; Methodology</span>
            <h2 className="ae-dark-title">Moving Beyond Reactive Monitoring</h2>

            <p className="ae-dark-desc">
              Traditional pool management relies on monthly testing and reactive repairs when failures
              occur. The AquaEdge-AI architecture bridges this paradigm by enabling truly intelligent, proactive
              operations.
            </p>

            <p className="ae-dark-desc">
              By integrating Edge-AI directly into the hydraulic loop, we allow the infrastructure to "listen"
              to the pool's equipment in real time. We are understanding the physics of the entire system—from
              micro-cavitations in a pump to the thermodynamic signatures of thermocline loss.
            </p>

            <div className="ae-case-study-card">
              <div className="ae-cs-thumb">
                <i className="fa-solid fa-droplet"></i>
              </div>
              <div className="ae-cs-info">
                <small>Case Study</small>
                <h5>Edge AI Applications in Oceanic Hydraulics &rarr;</h5>
              </div>
            </div>
          </div>

          <div className="ae-dark-visual">
            <div className="ae-vial-graphic">
              <div className="ae-vial-glass">
                <div className="ae-vial-liquid"></div>
              </div>
              <div className="ae-vial-badge">
                <i className="fa-solid fa-check"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          7. Section: "Strategic Objectives" (4 Cards)
      --------------------------------------------------------------------- */}
      <section className="ae-section">
        <div className="ae-container">
          <div className="ae-section-center">
            <h2 className="ae-section-title">Strategic Objectives</h2>
          </div>

          <div className="ae-objectives-grid">
            {/* Obj 1 */}
            <div className="ae-obj-card">
              <div className="ae-obj-icon-box">
                <i className="fa-solid fa-leaf"></i>
              </div>
              <h4>Sustainability</h4>
              <p>Substantially reducing overall water consumption and heating electrical overheads.</p>
            </div>

            {/* Obj 2 */}
            <div className="ae-obj-card">
              <div className="ae-obj-icon-box">
                <i className="fa-solid fa-screwdriver-wrench"></i>
              </div>
              <h4>Pump Longevity</h4>
              <p>Detecting premature mechanical wear before catastrophic pump failure occurs.</p>
            </div>

            {/* Obj 3 */}
            <div className="ae-obj-card">
              <div className="ae-obj-icon-box">
                <i className="fa-solid fa-temperature-arrow-up"></i>
              </div>
              <h4>Efficient Heating</h4>
              <p>Smart scheduling to drastically minimize unnecessary electrical demand.</p>
            </div>

            {/* Obj 4 */}
            <div className="ae-obj-card">
              <div className="ae-obj-icon-box">
                <i className="fa-solid fa-chart-pie"></i>
              </div>
              <h4>Data-Informed</h4>
              <p>Empowering hotel and aquatic operators with deep predictive insights.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          8. Section: "Our Research Team" (Left Info + Right 2x2 Grid)
      --------------------------------------------------------------------- */}
      <section className="ae-section" id="research" style={{ paddingTop: 0 }}>
        <div className="ae-container ae-team-grid">
          <div className="ae-team-left">
            <h2>Our Research Team</h2>
            <p>
              Supervised and built by our team of final-year engineering students from the
              Sri Lanka Institute of Information Technology (SLIIT).
            </p>

            <div className="ae-team-bullets">
              <div className="ae-team-bullet-item">
                <i className="fa-solid fa-circle-check"></i>
                <span>Research-backed reliability</span>
              </div>
              <div className="ae-team-bullet-item">
                <i className="fa-solid fa-circle-check"></i>
                <span>Scalable real-world deployment</span>
              </div>
            </div>
          </div>

          <div className="ae-team-right">
            <div className="ae-team-cards-grid">
              {/* Member 1 */}
              <div className="ae-member-card">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                  alt="Ms. Maya Silva"
                  className="ae-member-avatar"
                />
                <div className="ae-member-info">
                  <h4>Ms. Maya Silva</h4>
                  <p>Lead Researcher</p>
                </div>
              </div>

              {/* Member 2 */}
              <div className="ae-member-card">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
                  alt="Sarah Jenkins"
                  className="ae-member-avatar"
                />
                <div className="ae-member-info">
                  <h4>Sarah Jenkins</h4>
                  <p>ML &amp; IoT Architect</p>
                </div>
              </div>

              {/* Member 3 */}
              <div className="ae-member-card">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                  alt="Manuel Torres"
                  className="ae-member-avatar"
                />
                <div className="ae-member-info">
                  <h4>Manuel Torres</h4>
                  <p>IoT Sensor Engineer</p>
                </div>
              </div>

              {/* Member 4 */}
              <div className="ae-member-card">
                <img
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80"
                  alt="David Kim"
                  className="ae-member-avatar"
                />
                <div className="ae-member-info">
                  <h4>David Kim</h4>
                  <p>Full Stack Lead</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          9. CTA Banner (Curved Green/Teal Container)
      --------------------------------------------------------------------- */}
      <section className="ae-cta-section">
        <div className="ae-container">
          <div className="ae-cta-box">
            <h2>Explore the Future of Intelligent Pool Management</h2>
            <p>
              Join us in redefining the standard for aquatic infrastructure through
              research-driven edge computing.
            </p>
            <button
              type="button"
              onClick={onNavigateToDashboard}
              className="ae-btn-white-doc"
            >
              <span>View Project Documentation</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------
          10. Footer
      --------------------------------------------------------------------- */}
      <footer className="ae-footer">
        <div className="ae-container">
          <div className="ae-footer-grid">
            <div className="ae-footer-brand-col">
              <a href="#top" className="ae-brand">
                <div className="ae-brand-icon">
                  <i className="fa-solid fa-water"></i>
                </div>
                <span className="ae-brand-name">AquaEdge-AI</span>
              </a>
              <p>
                Leading research on edge-AI powered IoT systems for optimizing commercial
                and residential pool infrastructure.
              </p>
            </div>

            <div className="ae-footer-col">
              <h4>Research Focus</h4>
              <ul>
                <li><a href="#technology">Edge Computing</a></li>
                <li><a href="#technology">Acoustic Sensing</a></li>
                <li><a href="#technology">Predictive Algorithms</a></li>
                <li><a href="#technology">Thermal Models</a></li>
              </ul>
            </div>

            <div className="ae-footer-col">
              <h4>Platform</h4>
              <ul>
                <li><a href="#overview">System Overview</a></li>
                <li><a href="#technology">Architecture</a></li>
                <li><a href="#features">Tech Stack</a></li>
                <li><a href="#workflow">Documentation</a></li>
              </ul>
            </div>

            <div className="ae-footer-col ae-footer-contact">
              <h4>Contact</h4>
              <p>Sri Lanka Institute of Information Technology (SLIIT), Faculty of Computing</p>
              <a href="mailto:research@aquasense.ai" className="ae-footer-email">
                research@aquasense.ai
              </a>
            </div>
          </div>

          <div className="ae-footer-bottom">
            <div>
              &copy; {currentYear} AquaEdge-AI · SLIIT Research Project J26-IT-380.
            </div>
            <div>
              All rights reserved · Department of Information Technology
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
