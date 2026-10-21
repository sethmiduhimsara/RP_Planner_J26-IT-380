import React, { useEffect, useMemo, useState } from 'react';
import './WaterLossAnalysis.css';

const API_BASE = (import.meta?.env?.VITE_WATER_LOSS_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const previewPoints = [
  { t: '00:00', level: 10.00 }, { t: '00:30', level: 10.00 },
  { t: '01:00', level: 9.99 }, { t: '01:30', level: 9.99 },
  { t: '02:00', level: 9.98 }, { t: '02:30', level: 9.98 },
  { t: '03:00', level: 9.97 }, { t: '03:30', level: 9.97 },
  { t: '04:00', level: 9.96 }, { t: '04:30', level: 9.95 },
  { t: '05:00', level: 9.94 }, { t: '05:30', level: 9.93 },
];

function MiniChart({ points }) {
  const width = 660;
  const height = 190;
  const pad = { top: 14, right: 16, bottom: 24, left: 34 };
  const values = points.map((p) => Number(p.level)).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) - 0.03 : 0;
  const max = values.length ? Math.max(...values) + 0.03 : 1;
  const coords = points.map((p, i) => {
    const x = pad.left + (i / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
    const v = Number(p.level);
    const y = height - pad.bottom - ((v - min) / Math.max(max - min, 0.001)) * (height - pad.top - pad.bottom);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="wla-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Water-level history chart">
      {[0, 1, 2, 3].map((n) => {
        const y = pad.top + n * ((height - pad.top - pad.bottom) / 3);
        return <line key={n} x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="wla-gridline" />;
      })}
      <polyline points={coords} className="wla-chart-line" />
      {points.map((p, i) => {
        const vals = points.map((item) => Number(item.level)).filter(Number.isFinite);
        const lo = Math.min(...vals) - 0.03;
        const hi = Math.max(...vals) + 0.03;
        const x = pad.left + (i / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
        const y = height - pad.bottom - ((Number(p.level) - lo) / Math.max(hi - lo, 0.001)) * (height - pad.top - pad.bottom);
        return <circle key={`${p.t}-${i}`} cx={x} cy={y} r="3.5" className="wla-chart-dot" />;
      })}
      <text x={pad.left} y={height - 5} className="wla-axis-label">Earlier</text>
      <text x={width - pad.right} y={height - 5} textAnchor="end" className="wla-axis-label">Latest</text>
    </svg>
  );
}

function MetricCard({ label, value, unit, note, icon, tone = '' }) {
  return (
    <article className={`wla-metric ${tone}`}>
      <div className="wla-metric-top"><span>{label}</span><span className="wla-metric-icon">{icon}</span></div>
      <div className="wla-metric-value">{value}<small>{unit}</small></div>
      <div className="wla-metric-note">{note}</div>
    </article>
  );
}

export default function WaterLossAnalysis() {
  const [live, setLive] = useState(null);
  const [apiState, setApiState] = useState('checking');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timer;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/water-loss/status`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        if (!mounted) return;
        setLive(data);
        setApiState('connected');
        setLastUpdated(new Date());
      } catch {
        if (mounted) setApiState('disconnected');
      }
    };
    load();
    timer = window.setInterval(load, 2500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const usingPreview = !live && showPreview;
  const level = live?.water_level_cm ?? (usingPreview ? 9.94 : null);
  const distance = live?.distance_cm ?? (usingPreview ? 23.74 : null);
  const predicted = live?.predicted_evaporation_cm_per_hour ?? (usingPreview ? 0.010469 : null);
  const observedDrop = live?.observed_drop_cm ?? (usingPreview ? 0.06 : null);
  const status = live?.status ?? (usingPreview ? 'PREVIEW_ONLY' : 'WAITING');
  const points = useMemo(() => live?.history?.length ? live.history.map((p, i) => ({ t: p.timestamp || `${i}`, level: Number(p.water_level_cm) })) : previewPoints, [live]);

  const display = (v, decimals = 2) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(decimals);
  const leakFlag = String(status).toUpperCase().includes('LEAK') || String(status).toUpperCase().includes('ABNORMAL');

  return (
    <main className="wla-page">
      <header className="wla-header">
        <div>
          <div className="wla-eyebrow">AQUAEDGE AI · MONITORING</div>
          <h1>Water Loss Analysis</h1>
          <p>Sensor observations and LSTM-based evaporation estimate in one view.</p>
        </div>
        <div className={`wla-connection ${apiState === 'connected' ? 'is-live' : 'is-offline'}`}>
          <span className="wla-connection-dot" />
          {apiState === 'connected' ? 'Python API connected' : apiState === 'checking' ? 'Checking connection…' : 'Live API not connected'}
        </div>
      </header>

      {usingPreview && (
        <div className="wla-preview-banner">
          <span className="wla-preview-badge">PREVIEW DATA</span>
          <span>Values below are illustrative UI preview values, not live sensor readings. The Python API is not connected yet.</span>
          <button type="button" onClick={() => setShowPreview(false)}>Hide preview</button>
        </div>
      )}
      {!live && !showPreview && (
        <div className="wla-preview-banner muted">Waiting for API data. Start the Python service to display readings.</div>
      )}

      <section className="wla-status-row">
        <div className="wla-status-copy">
          <span className="wla-status-label">CURRENT SYSTEM STATUS</span>
          <h2>{live ? (leakFlag ? 'Abnormal water drop detected' : 'Monitoring active') : (showPreview ? 'Preview mode' : 'Waiting for sensor data')}</h2>
          <p>{live ? 'Status is based on the connected Python service response.' : 'Live data will appear after the API endpoint is running and connected to ESP32.'}</p>
        </div>
        <div className={`wla-alert-pill ${live && leakFlag ? 'alert' : 'normal'}`}>
          <span>{live && leakFlag ? '!' : '●'}</span>
          {live ? (leakFlag ? 'POSSIBLE LEAK / ABNORMAL DROP' : 'NO ABNORMAL DROP REPORTED') : 'NO LIVE ALERT'}
        </div>
      </section>

      <section className="wla-metrics-grid">
        <MetricCard label="Estimated water level" value={display(level)} unit="cm" note={live ? 'From connected API' : 'Illustrative preview'} icon="◉" />
        <MetricCard label="Sensor distance" value={display(distance)} unit="cm" note="Sensor to water surface" icon="↕" />
        <MetricCard label="LSTM evaporation estimate" value={display(predicted, 6)} unit="cm/hr" note="Model prediction; synthetic training" icon="⌁" tone="accent" />
        <MetricCard label="Observed drop" value={display(observedDrop)} unit="cm" note="Compared with baseline" icon="↓" tone={live && leakFlag ? 'warning' : ''} />
      </section>

      <section className="wla-content-grid">
        <article className="wla-panel wla-history-panel">
          <div className="wla-panel-heading">
            <div><h3>Water-level trend</h3><p>Recent observations over time</p></div>
            <span className="wla-mini-tag">{live?.history?.length ? 'LIVE HISTORY' : 'PREVIEW TREND'}</span>
          </div>
          <MiniChart points={points} />
          <div className="wla-chart-legend"><span className="wla-legend-line" /> Water level (cm)</div>
        </article>
        <article className="wla-panel">
          <div className="wla-panel-heading"><div><h3>Model & data status</h3><p>Prototype transparency</p></div><span className="wla-chip">LSTM</span></div>
          <div className="wla-detail-row"><span>Model file</span><strong>{live?.model_loaded === true ? 'Loaded' : 'Check Python service'}</strong></div>
          <div className="wla-detail-row"><span>Sensor source</span><strong>{live?.sensor_connected === true ? 'ESP32 connected' : 'Not confirmed'}</strong></div>
          <div className="wla-detail-row"><span>Training data</span><strong>Synthetic</strong></div>
          <div className="wla-detail-row"><span>Last update</span><strong>{lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</strong></div>
          <p className="wla-note">A possible-leak status is an anomaly warning, not confirmation of a physical leak. Model predictions require validation with longer real observations.</p>
        </article>
      </section>
      <footer className="wla-footer">AquaEdge AI · AI Leak & Evaporation Tracker <span>PP1 prototype</span></footer>
    </main>
  );
}
