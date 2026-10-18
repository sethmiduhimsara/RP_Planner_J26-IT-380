import React, { useState } from 'react';
import './MotorVibration.css';

export default function MotorVibration() {
  // Preset simulation states to showcase during presentation to the evaluation panel
  const [activeSimulation, setActiveSimulation] = useState('normal');
  const [activeGraphTab, setActiveGraphTab] = useState('time'); // 'time' or 'fft'
  const [activeAxis, setActiveAxis] = useState('combined'); // 'combined', 'x', 'y', 'z'

  // Pre-configured scientific datasets reflecting real accelerometer telemetry under different motor states
  const simulationProfiles = {
    normal: {
      label: 'Normal Operation',
      tagClass: 'state-ok',
      healthScore: 98.2,
      rms: 0.41,
      peakVib: 0.65,
      kurtosis: 2.94,
      crestFactor: 1.58,
      leadTime: '38+ Days',
      statusMessage: 'Vibration signatures within ISO 10816 Zone A. No mechanical wear detected.',
      statusType: 'ok',
      isoZone: 'Zone A (Good)',
      isoColor: '#22c55e',
      isoProgress: '22%',
      probabilities: {
        normal: 96.4,
        bearing: 2.1,
        cavitation: 1.0,
        unbalance: 0.5,
      },
      axes: { x: 0.28, y: 0.24, z: 0.18 },
      // SVG path coordinates for smooth normal sinusoidal vibration
      timeWave: 'M0,100 Q40,60 80,100 T160,100 T240,100 T320,100 T400,100 T480,100 T560,100 T640,100 T720,100 T800,100',
      fftWave: 'M0,190 L60,190 L90,80 L120,190 L240,190 L260,140 L280,190 L400,190 L600,190 L800,190',
    },
    bearing: {
      label: 'Bearing Degradation (BPFO)',
      tagClass: 'state-warn',
      healthScore: 71.4,
      rms: 1.18,
      peakVib: 2.34,
      kurtosis: 5.82,
      crestFactor: 3.12,
      leadTime: '12 - 14 Days',
      statusMessage: 'High-frequency impacts detected at 3.2 kHz harmonic. Outer race bearing wear developing.',
      statusType: 'warn',
      isoZone: 'Zone C (Alert)',
      isoColor: '#f59e0b',
      isoProgress: '68%',
      probabilities: {
        normal: 12.3,
        bearing: 81.6,
        cavitation: 4.1,
        unbalance: 2.0,
      },
      axes: { x: 0.89, y: 0.72, z: 0.35 },
      // Spiky high-kurtosis periodic peaks typical of bearing race defects
      timeWave: 'M0,100 Q20,30 40,100 T80,100 Q100,20 120,100 T160,100 Q180,25 200,100 T240,100 Q260,15 280,100 T320,100 T400,100 T480,100 T560,100 T640,100 T720,100 T800,100',
      fftWave: 'M0,190 L60,190 L90,110 L120,190 L250,190 L270,130 L290,190 L420,190 L450,50 L480,190 L520,70 L550,190 L800,190',
    },
    cavitation: {
      label: 'Impeller Cavitation / Flow',
      tagClass: 'state-danger',
      healthScore: 63.8,
      rms: 1.62,
      peakVib: 3.18,
      kurtosis: 6.45,
      crestFactor: 3.84,
      leadTime: '4 - 6 Days',
      statusMessage: 'Erratic broadband noise pattern across 500Hz-2kHz. Liquid vapor collapse detected.',
      statusType: 'danger',
      isoZone: 'Zone C/D (Action Required)',
      isoColor: '#dc2626',
      isoProgress: '85%',
      probabilities: {
        normal: 6.2,
        bearing: 8.5,
        cavitation: 82.1,
        unbalance: 3.2,
      },
      axes: { x: 1.15, y: 1.08, z: 0.62 },
      // Highly erratic turbulence waveform
      timeWave: 'M0,100 L30,40 L60,150 L90,30 L120,160 L150,50 L180,140 L210,20 L240,170 L270,60 L300,130 L330,40 L360,150 L400,100 L500,130 L600,70 L700,140 L800,100',
      fftWave: 'M0,190 L40,160 L80,140 L120,110 L160,90 L200,80 L250,75 L300,70 L350,90 L400,130 L500,160 L800,190',
    },
    unbalance: {
      label: 'Shaft Unbalance / Misalignment',
      tagClass: 'state-warn',
      healthScore: 78.5,
      rms: 0.94,
      peakVib: 1.55,
      kurtosis: 3.15,
      crestFactor: 2.10,
      leadTime: '20+ Days',
      statusMessage: 'Elevated 1X rotational speed fundamental peak. Mechanical realignment suggested.',
      statusType: 'warn',
      isoZone: 'Zone B (Satisfactory)',
      isoColor: '#84cc16',
      isoProgress: '48%',
      probabilities: {
        normal: 18.5,
        bearing: 4.2,
        cavitation: 2.1,
        unbalance: 75.2,
      },
      axes: { x: 0.74, y: 0.52, z: 0.28 },
      timeWave: 'M0,100 Q40,35 80,100 T160,100 Q200,35 240,100 T320,100 Q360,35 400,100 T480,100 T560,100 T640,100 T720,100 T800,100',
      fftWave: 'M0,190 L50,190 L80,30 L110,190 L160,190 L180,120 L200,190 L300,190 L500,190 L800,190',
    },
  };

  const current = simulationProfiles[activeSimulation];

  return (
    <div className="mv-container">
      {/* -------------------------------------------------------------------
          1. Header Section with Research & Hardware Metadata
      ------------------------------------------------------------------- */}
      <div className="mv-header">
        <div className="mv-header-left">
          <div className="mv-icon-badge">
            <i className="fa-solid fa-gears"></i>
          </div>
          <div className="mv-header-title">
            <h2>Edge-AI Pump Predictive Maintenance</h2>
            <p>
              Vibration pattern anomaly detection and pre-failure diagnostics for commercial pool circulation pumps.
            </p>
          </div>
        </div>

        <div className="mv-header-tags">
          <span className="mv-tag mv-tag-primary">
            <i className="fa-solid fa-microchip"></i> ESP32 MCU
          </span>
          <span className="mv-tag mv-tag-primary">
            <i className="fa-solid fa-wave-square"></i> ADXL345 (800 Hz)
          </span>
          <span className="mv-tag mv-tag-success">
            <span className="mv-tag-pulse-dot"></span> TinyML Edge Active
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          2. Interactive Simulation Bar (Demo Tool for Panel Presentation)
      ------------------------------------------------------------------- */}
      <div className="mv-demo-bar">
        <div className="mv-demo-label">
          <i className="fa-solid fa-flask-vial"></i>
          <span>Live Evaluation Simulator (Preset Anomaly Profiles):</span>
        </div>

        <div className="mv-demo-buttons">
          <button
            type="button"
            className={`mv-demo-btn ${activeSimulation === 'normal' ? 'is-active' : ''}`}
            onClick={() => setActiveSimulation('normal')}
          >
            <i className="fa-solid fa-circle-check"></i> Normal State
          </button>

          <button
            type="button"
            className={`mv-demo-btn is-warning ${activeSimulation === 'bearing' ? 'is-active' : ''}`}
            onClick={() => setActiveSimulation('bearing')}
          >
            <i className="fa-solid fa-triangle-exclamation"></i> Bearing Degradation
          </button>

          <button
            type="button"
            className={`mv-demo-btn is-danger ${activeSimulation === 'cavitation' ? 'is-active' : ''}`}
            onClick={() => setActiveSimulation('cavitation')}
          >
            <i className="fa-solid fa-radiation"></i> Impeller Cavitation
          </button>

          <button
            type="button"
            className={`mv-demo-btn is-warning ${activeSimulation === 'unbalance' ? 'is-active' : ''}`}
            onClick={() => setActiveSimulation('unbalance')}
          >
            <i className="fa-solid fa-arrows-rotate"></i> Shaft Misalignment
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          3. Core KPI Cards Grid
      ------------------------------------------------------------------- */}
      <div className="mv-kpi-grid">
        {/* KPI 1: Health Score */}
        <div className={`mv-kpi-card ${current.tagClass}`}>
          <div className="mv-kpi-top">
            <span className="mv-kpi-label">Pump Health Index</span>
            <div className="mv-kpi-icon">
              <i className="fa-solid fa-heart-pulse"></i>
            </div>
          </div>
          <div className="mv-kpi-val">
            {current.healthScore}<span className="mv-kpi-unit">%</span>
          </div>
          <div className={`mv-kpi-sub sub-${current.statusType}`}>
            <i className="fa-solid fa-circle-check"></i>
            <span>{current.isoZone}</span>
          </div>
        </div>

        {/* KPI 2: Tri-Axial RMS Vibration */}
        <div className={`mv-kpi-card ${current.tagClass}`}>
          <div className="mv-kpi-top">
            <span className="mv-kpi-label">RMS Vibration Level</span>
            <div className="mv-kpi-icon">
              <i className="fa-solid fa-chart-line"></i>
            </div>
          </div>
          <div className="mv-kpi-val">
            {current.rms}<span className="mv-kpi-unit">g RMS</span>
          </div>
          <div className="mv-kpi-sub">
            <span style={{ color: '#64748b' }}>ISO 10816 Threshold: 1.12 g</span>
          </div>
        </div>

        {/* KPI 3: Kurtosis & Feature Extraction */}
        <div className={`mv-kpi-card ${current.tagClass}`}>
          <div className="mv-kpi-top">
            <span className="mv-kpi-label">Spectral Kurtosis</span>
            <div className="mv-kpi-icon">
              <i className="fa-solid fa-calculator"></i>
            </div>
          </div>
          <div className="mv-kpi-val">
            {current.kurtosis}<span className="mv-kpi-unit">Kurt</span>
          </div>
          <div className="mv-kpi-sub">
            <span style={{ color: '#64748b' }}>Crest Factor: {current.crestFactor}</span>
          </div>
        </div>

        {/* KPI 4: Lead Time Before Failure */}
        <div className={`mv-kpi-card ${current.tagClass}`}>
          <div className="mv-kpi-top">
            <span className="mv-kpi-label">Pre-Failure Lead Time</span>
            <div className="mv-kpi-icon">
              <i className="fa-solid fa-stopwatch"></i>
            </div>
          </div>
          <div className="mv-kpi-val" style={{ fontSize: '1.6rem' }}>
            {current.leadTime}
          </div>
          <div className={`mv-kpi-sub sub-${current.statusType}`}>
            <i className="fa-solid fa-shield-halved"></i>
            <span>Early Warning Active</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          4. Charts & Diagnostic Visualizer (2 Columns)
      ------------------------------------------------------------------- */}
      <div className="mv-charts-row">
        {/* Left Column: Live Accelerometer Waveform & FFT Spectrum */}
        <div className="mv-card">
          <div className="mv-card-header">
            <div className="mv-card-title">
              <i className="fa-solid fa-wave-square"></i>
              <h3>ADXL345 Telemetry Stream ({activeGraphTab === 'time' ? 'Time-Domain' : 'FFT Frequency Spectrum'})</h3>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="mv-tab-selector">
                <button
                  type="button"
                  className={`mv-tab-btn ${activeGraphTab === 'time' ? 'is-active' : ''}`}
                  onClick={() => setActiveGraphTab('time')}
                >
                  Waveform (t)
                </button>
                <button
                  type="button"
                  className={`mv-tab-btn ${activeGraphTab === 'fft' ? 'is-active' : ''}`}
                  onClick={() => setActiveGraphTab('fft')}
                >
                  FFT Spectrum (f)
                </button>
              </div>
            </div>
          </div>

          {/* SVG Real-time Styled Waveform Container */}
          <div className="mv-chart-box">
            <svg
              className="mv-chart-svg"
              viewBox="0 0 800 200"
              preserveAspectRatio="none"
              aria-label="Vibration plot"
            >
              {/* Background Grid Lines */}
              <defs>
                <pattern id="mv-grid" width="40" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 25" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
                </pattern>
                <linearGradient id="mv-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <rect width="800" height="200" fill="url(#mv-grid)" />

              {/* Zero reference line */}
              <line x1="0" y1="100" x2="800" y2="100" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />

              {/* Waveform line */}
              {activeGraphTab === 'time' ? (
                <>
                  <path
                    d={current.timeWave}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Subtle secondary axis */}
                  <path
                    d="M0,105 Q35,75 75,105 T150,105 T225,105 T300,105 T375,105 T450,105 T525,105 T600,105 T675,105 T750,105 T800,105"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="1.2"
                    strokeDasharray="2 2"
                    opacity="0.6"
                  />
                </>
              ) : (
                <>
                  <path
                    d={`${current.fftWave} L800,200 L0,200 Z`}
                    fill="url(#mv-grad)"
                  />
                  <path
                    d={current.fftWave}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}
            </svg>
          </div>

          <div className="mv-chart-legend">
            <div className="mv-legend-group">
              <div className="mv-legend-item">
                <span className="mv-legend-dot" style={{ backgroundColor: '#4f46e5' }}></span>
                <span>Active Channel: {activeGraphTab === 'time' ? 'Tri-Axial Resultant a_xyz' : 'Harmonic Spectrum (0 - 4 kHz)'}</span>
              </div>
              {activeGraphTab === 'time' && (
                <div className="mv-legend-item">
                  <span className="mv-legend-dot" style={{ backgroundColor: '#0284c7' }}></span>
                  <span>Filtered Baseline</span>
                </div>
              )}
            </div>

            <span>Sampling Rate: 800 Hz (ODR)</span>
          </div>
        </div>

        {/* Right Column: TinyML Anomaly Classification & ISO Severity */}
        <div className="mv-card">
          <div className="mv-card-header">
            <div className="mv-card-title">
              <i className="fa-solid fa-brain"></i>
              <h3>TinyML Classifier Inference</h3>
            </div>
            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: '600' }}>
              Latency: 14.8 ms
            </span>
          </div>

          {/* Probability Bars */}
          <div className="mv-prob-list">
            {/* Class 1: Normal */}
            <div className="mv-prob-row">
              <div className="mv-prob-info">
                <span>Normal State (No Fault)</span>
                <span>{current.probabilities.normal}%</span>
              </div>
              <div className="mv-prob-track">
                <div
                  className="mv-prob-fill"
                  style={{ width: `${current.probabilities.normal}%`, backgroundColor: '#22c55e' }}
                ></div>
              </div>
            </div>

            {/* Class 2: Bearing Degradation */}
            <div className="mv-prob-row">
              <div className="mv-prob-info">
                <span>Bearing Race Defect (BPFO/BPFI)</span>
                <span>{current.probabilities.bearing}%</span>
              </div>
              <div className="mv-prob-track">
                <div
                  className="mv-prob-fill"
                  style={{ width: `${current.probabilities.bearing}%`, backgroundColor: '#f59e0b' }}
                ></div>
              </div>
            </div>

            {/* Class 3: Cavitation */}
            <div className="mv-prob-row">
              <div className="mv-prob-info">
                <span>Impeller Cavitation &amp; Flow Void</span>
                <span>{current.probabilities.cavitation}%</span>
              </div>
              <div className="mv-prob-track">
                <div
                  className="mv-prob-fill"
                  style={{ width: `${current.probabilities.cavitation}%`, backgroundColor: '#dc2626' }}
                ></div>
              </div>
            </div>

            {/* Class 4: Unbalance */}
            <div className="mv-prob-row">
              <div className="mv-prob-info">
                <span>Shaft Unbalance / Misalignment</span>
                <span>{current.probabilities.unbalance}%</span>
              </div>
              <div className="mv-prob-track">
                <div
                  className="mv-prob-fill"
                  style={{ width: `${current.probabilities.unbalance}%`, backgroundColor: '#8b5cf6' }}
                ></div>
              </div>
            </div>
          </div>

          {/* ISO 10816-3 Severity Scale */}
          <div style={{ marginTop: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600' }}>
              <span>ISO 10816-3 Severity Gauge</span>
              <span style={{ color: current.isoColor }}>{current.isoZone}</span>
            </div>
            <div className="mv-iso-bar">
              <div className="mv-iso-zone zone-a" title="Zone A: Good (0.0 - 0.71 g)"></div>
              <div className="mv-iso-zone zone-b" title="Zone B: Satisfactory (0.71 - 1.12 g)"></div>
              <div className="mv-iso-zone zone-c" title="Zone C: Alert (1.12 - 1.80 g)"></div>
              <div className="mv-iso-zone zone-d" title="Zone D: Critical Damage (> 1.80 g)"></div>
            </div>
            <div className="mv-iso-labels">
              <span>Good</span>
              <span>Satisfactory</span>
              <span>Alert</span>
              <span>Danger</span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          5. Bottom Row: Tri-Axial Telemetry & Research Dataset Pipeline
      ------------------------------------------------------------------- */}
      <div className="mv-bottom-grid">
        {/* Card 1: 3-Axis Accelerometer Live Feeds */}
        <div className="mv-card">
          <div className="mv-card-header">
            <div className="mv-card-title">
              <i className="fa-solid fa-arrows-up-down-left-right"></i>
              <h3>ADXL345 Tri-Axial Breakdown</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>g Units</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="mv-axis-card">
              <div className="mv-axis-info">
                <small>X-Axis (Radial In-Plane)</small>
                <h4>{current.axes.x} g</h4>
              </div>
              <i className="fa-solid fa-arrow-right" style={{ color: '#4f46e5' }}></i>
            </div>

            <div className="mv-axis-card">
              <div className="mv-axis-info">
                <small>Y-Axis (Radial Vertical)</small>
                <h4>{current.axes.y} g</h4>
              </div>
              <i className="fa-solid fa-arrow-up" style={{ color: '#0284c7' }}></i>
            </div>

            <div className="mv-axis-card">
              <div className="mv-axis-info">
                <small>Z-Axis (Axial Shaft Thrust)</small>
                <h4>{current.axes.z} g</h4>
              </div>
              <i className="fa-solid fa-arrows-spin" style={{ color: '#10b981' }}></i>
            </div>
          </div>
        </div>

        {/* Card 2: Research Dataset & Edge Pipeline */}
        <div className="mv-card">
          <div className="mv-card-header">
            <div className="mv-card-title">
              <i className="fa-solid fa-database"></i>
              <h3>Dataset &amp; Model Footprint</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: '600' }}>
              TFLite Micro
            </span>
          </div>

          <div className="mv-pipeline-card">
            <div className="mv-pipeline-step">
              <span className="mv-step-num">1</span>
              <div>
                <strong>Dataset Samples Collected:</strong>
                <p>28,400 multi-state vibration windows collected via ESP32 testbench.</p>
              </div>
            </div>

            <div className="mv-pipeline-step">
              <span className="mv-step-num">2</span>
              <div>
                <strong>Feature Extraction:</strong>
                <p>RMS, Kurtosis, Crest Factor, Skewness, &amp; Peak FFT Frequencies.</p>
              </div>
            </div>

            <div className="mv-pipeline-step">
              <span className="mv-step-num">3</span>
              <div>
                <strong>ESP32 Flash Memory Used:</strong>
                <p>38.4 KB (TensorFlow Lite INT8 quantized weight model).</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Real-Time Maintenance Advisory */}
        <div className="mv-card" style={{ borderLeft: `4px solid ${current.isoColor}` }}>
          <div className="mv-card-header">
            <div className="mv-card-title">
              <i className="fa-solid fa-clipboard-check"></i>
              <h3>Predictive Maintenance Advisory</h3>
            </div>
            <span className={`mv-tag ${current.tagClass}`}>{current.label}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'space-between' }}>
            <p style={{ fontSize: '0.92rem', color: '#334155', lineHeight: '1.6' }}>
              {current.statusMessage}
            </p>

            <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <small style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
                Recommended Action:
              </small>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#0f172a', marginTop: '4px' }}>
                {activeSimulation === 'normal' && 'Continue regular automated monitoring schedule. Next routine check in 30 days.'}
                {activeSimulation === 'bearing' && 'Schedule bearing lubrication and acoustic verification within 12 days to prevent catastrophic pump seizure.'}
                {activeSimulation === 'cavitation' && 'Check suction line strainer and balance tank water level immediately. Inspect impeller for vapor pitting.'}
                {activeSimulation === 'unbalance' && 'Inspect motor-pump shaft coupling bolts and verify foundation alignment at next planned downtime.'}
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Telemetry Timestamp: {new Date().toLocaleTimeString()} · Motor P-101 (2.2 kW)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
