import { useEffect, useMemo, useState } from 'react';
import './WaterLossAnalysis.css';

const API_BASE = (import.meta?.env?.VITE_WATER_LOSS_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast?latitude=6.9271&longitude=79.8612&current=temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation&wind_speed_unit=ms';

/* ─── Preview data shown when the API is not reachable ─── */
const previewPoints = [
  { t: '00:00', level: 10.00 }, { t: '00:30', level: 10.00 },
  { t: '01:00', level: 9.99  }, { t: '01:30', level: 9.99  },
  { t: '02:00', level: 9.98  }, { t: '02:30', level: 9.98  },
  { t: '03:00', level: 9.97  }, { t: '03:30', level: 9.97  },
  { t: '04:00', level: 9.96  }, { t: '04:30', level: 9.95  },
  { t: '05:00', level: 9.94  }, { t: '05:30', level: 9.93  },
];

/* ─── Simulated telemetry shown when API is absent ─── */
const PREVIEW_TELEMETRY = {
  temperature_c:  28.4,
  humidity_pct:   62,
  wind_speed_mps: 1.8,
  solar_rad:      420,
};

/* ─────────────────────────────────────────────────────────
   TrendChart
   Dual-layer SVG: actual water-level line + predicted
   evaporation ceiling as a dashed reference band.
───────────────────────────────────────────────────────── */
function TrendChart({ points, predicted }) {
  const W = 700, H = 220;
  const pad = { top: 18, right: 20, bottom: 36, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top  - pad.bottom;
  const n     = points.length;

  const values = points.map(p => Number(p.level)).filter(Number.isFinite);
  if (!values.length) return null;

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const spread  = Math.max(dataMax - dataMin, 0.05);
  const yMin    = dataMin - spread * 0.25;
  const yMax    = dataMax + spread * 0.25;
  const yRange  = yMax - yMin;

  const toX = i  => pad.left + (i / Math.max(n - 1, 1)) * plotW;
  const toY = v  => pad.top  + (1 - (v - yMin) / yRange) * plotH;

  /* Y-axis tick values */
  const yTicks = [0, 1, 2, 3, 4].map(i => yMin + (i / 4) * yRange);

  /* Actual level polyline */
  const levelPts = points.map((p, i) => `${toX(i).toFixed(1)},${toY(Number(p.level)).toFixed(1)}`).join(' ');

  /* Predicted evaporation ceiling: a horizontal reference drawn at max-level minus predicted */
  const predCeiling = predicted != null && Number.isFinite(Number(predicted))
    ? dataMax - Number(predicted)
    : null;

  /* Area fill path */
  const firstX = toX(0);
  const lastX  = toX(n - 1);
  const bottomY = pad.top + plotH;
  const areaPath = `M ${firstX} ${bottomY} ` +
    points.map((p, i) => `L ${toX(i).toFixed(1)} ${toY(Number(p.level)).toFixed(1)}`).join(' ') +
    ` L ${lastX} ${bottomY} Z`;

  /* X-axis: show up to 6 evenly-spaced labels */
  const labelIndices = n <= 6
    ? points.map((_, i) => i)
    : [0, 1, 2, 3, 4, 5].map(i => Math.round((i / 5) * (n - 1)));

  return (
    <svg
      className="wla-trend-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Water-level trend chart"
    >
      <defs>
        <linearGradient id="wla-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0284c7" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="wla-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <filter id="wla-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid lines */}
      {yTicks.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} className="wla-gridline" />
            <text x={pad.left - 6} y={y + 4} textAnchor="end" className="wla-axis-tick">
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Y-axis label */}
      <text
        x={11}
        y={pad.top + plotH / 2}
        textAnchor="middle"
        className="wla-axis-unit"
        transform={`rotate(-90, 11, ${pad.top + plotH / 2})`}
      >cm</text>

      {/* Predicted evaporation reference band */}
      {predCeiling != null && (
        <>
          <line
            x1={pad.left} y1={toY(predCeiling).toFixed(1)}
            x2={W - pad.right} y2={toY(predCeiling).toFixed(1)}
            className="wla-pred-line"
          />
          <text
            x={W - pad.right - 4}
            y={toY(predCeiling) - 5}
            textAnchor="end"
            className="wla-pred-label"
          >Predicted evap. ceiling</text>
        </>
      )}

      {/* Area fill */}
      <path d={areaPath} fill="url(#wla-area-grad)" />

      {/* Actual level line (glow pass) */}
      <polyline points={levelPts} className="wla-chart-line-glow" filter="url(#wla-glow)" />
      {/* Actual level line */}
      <polyline points={levelPts} stroke="url(#wla-line-grad)" className="wla-chart-line" />

      {/* Data dots */}
      {points.map((p, i) => (
        <circle
          key={`${p.t}-${i}`}
          cx={toX(i).toFixed(1)}
          cy={toY(Number(p.level)).toFixed(1)}
          r="3.5"
          className="wla-chart-dot"
        />
      ))}

      {/* X-axis time labels */}
      {labelIndices.map(i => (
        <text
          key={i}
          x={toX(i).toFixed(1)}
          y={H - 8}
          textAnchor="middle"
          className="wla-axis-tick"
        >{points[i]?.t ?? ''}</text>
      ))}

      {/* X-axis bottom border */}
      <line
        x1={pad.left} y1={pad.top + plotH}
        x2={W - pad.right} y2={pad.top + plotH}
        className="wla-axis-border"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────
   DropGauge
   A horizontal bar comparing observedDrop vs predicted
   evaporation per polling interval.
───────────────────────────────────────────────────────── */
function DropGauge({ observed, predicted }) {
  const obs  = Number.isFinite(Number(observed))  ? Number(observed)  : null;
  const pred = Number.isFinite(Number(predicted)) ? Number(predicted) : null;

  if (obs == null || pred == null) {
    return (
      <div className="wla-gauge-unavail">
        Observed vs predicted comparison unavailable — connect the API to display this gauge.
      </div>
    );
  }

  /* Scale: max of the two = 100% of bar width */
  const maxVal    = Math.max(obs, pred, 0.0001);
  const obsPct    = Math.min((obs  / maxVal) * 100, 100).toFixed(1);
  const predPct   = Math.min((pred / maxVal) * 100, 100).toFixed(1);
  /* Flag when observed is significantly above prediction */
  const THRESHOLD = 2.0;
  const flagged   = obs > pred * THRESHOLD;

  return (
    <div className="wla-gauge-wrap">
      <div className="wla-gauge-row">
        <span className="wla-gauge-label">Observed drop</span>
        <div className="wla-gauge-track">
          <div
            className={`wla-gauge-bar obs${flagged ? ' flagged' : ''}`}
            style={{ width: `${obsPct}%` }}
          />
        </div>
        <span className="wla-gauge-val">{obs.toFixed(4)} cm</span>
      </div>
      <div className="wla-gauge-row">
        <span className="wla-gauge-label">Predicted evap.</span>
        <div className="wla-gauge-track">
          <div className="wla-gauge-bar pred" style={{ width: `${predPct}%` }} />
        </div>
        <span className="wla-gauge-val">{pred.toFixed(6)} cm/hr</span>
      </div>
      {flagged && (
        <div className="wla-gauge-flag">
          ⚠ Observed drop exceeds predicted evaporation × {THRESHOLD} — anomaly flag active
          <em> (demo threshold; not confirmation of a physical leak)</em>
        </div>
      )}
      {!flagged && (
        <div className="wla-gauge-ok">
          ✓ Drop is within expected evaporation range
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   TelemetryBadges
   Environmental input factor cards used by the LSTM model.
   Shows Open-Meteo live observation when available,
   otherwise preview values.
───────────────────────────────────────────────────────── */
function TelemetryBadges({ data, isLive }) {
  const t = data ?? PREVIEW_TELEMETRY;
  const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d);

  const items = [
    { icon: '🌡', label: 'Temperature',  value: `${fmt(t.temperature_c, 1)}°C`,  sub: 'Ambient air' },
    { icon: '💧', label: 'Humidity',     value: `${fmt(t.humidity_pct, 0)} %`,   sub: 'Relative' },
    { icon: '🌬', label: 'Wind speed',   value: `${fmt(t.wind_speed_mps, 1)} m/s`, sub: 'Surface wind' },
    { icon: '☀',  label: 'Solar rad.',   value: `${fmt(t.solar_rad, 0)} W/m²`,   sub: 'Global irradiance' },
  ];

  return (
    <div className="wla-telem-grid">
      {items.map(item => (
        <div key={item.label} className="wla-telem-card">
          <div className="wla-telem-icon">{item.icon}</div>
          <div className="wla-telem-body">
            <div className="wla-telem-val">{item.value}</div>
            <div className="wla-telem-label">{item.label}</div>
            <div className="wla-telem-sub">{item.sub}</div>
          </div>
          <span className={`wla-telem-badge ${isLive ? 'is-live' : 'is-sim'}`}>
            {isLive ? '● LIVE' : 'SIMULATED'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   MetricCard — refined version
───────────────────────────────────────────────────────── */
function MetricCard({ label, value, unit, note, icon, tone = '' }) {
  return (
    <article className={`wla-metric ${tone}`}>
      <div className="wla-metric-top">
        <span className="wla-metric-icon">{icon}</span>
        <span className="wla-metric-label">{label}</span>
      </div>
      <div className="wla-metric-value">
        {value}<small>{unit}</small>
      </div>
      <div className="wla-metric-note">{note}</div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────── */
export default function WaterLossAnalysis() {
  const [live, setLive]             = useState(null);
  const [apiState, setApiState]     = useState('checking');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showPreview, setShowPreview] = useState(true);
  const [weather, setWeather]       = useState(null);
  const [weatherState, setWeatherState] = useState('checking'); // 'checking' | 'live' | 'fallback'

  /* ── 1. Poll the Python Water Loss API ── */
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

  /* ── 2. Fetch live environmental data from Open-Meteo ── */
  useEffect(() => {
    let mounted = true;
    let timer;
    const fetchWeather = async () => {
      try {
        const res = await fetch(OPEN_METEO_URL);
        if (!res.ok) throw new Error(`Weather error: ${res.status}`);
        const data = await res.json();
        if (!mounted || !data?.current) return;
        setWeather({
          temperature_c:  data.current.temperature_2m,
          humidity_pct:   data.current.relative_humidity_2m,
          wind_speed_mps: data.current.wind_speed_10m,
          solar_rad:      data.current.shortwave_radiation,
        });
        setWeatherState('live');
      } catch {
        if (mounted) setWeatherState('fallback');
      }
    };
    fetchWeather();
    timer = window.setInterval(fetchWeather, 60000); // 1-minute interval
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const usingPreview = !live && showPreview;

  const level       = live?.water_level_cm                    ?? (usingPreview ? 9.94     : null);
  const distance    = live?.distance_cm                       ?? (usingPreview ? 23.74    : null);
  const predicted   = live?.predicted_evaporation_cm_per_hour ?? (usingPreview ? 0.010469 : null);
  const observedDrop = live?.observed_drop_cm                 ?? (usingPreview ? 0.06     : null);
  const status      = live?.status                            ?? (usingPreview ? 'PREVIEW_ONLY' : 'WAITING');

  const points = useMemo(
    () =>
      live?.history?.length
        ? live.history.map((p, i) => ({ t: p.timestamp || `${i}`, level: Number(p.water_level_cm) }))
        : previewPoints,
    [live],
  );

  const display = (v, decimals = 2) =>
    v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(decimals);

  const normalizedStatus = String(status ?? '').trim().toUpperCase();
  const leakFlag = [
    'POSSIBLE_LEAK',
    'POSSIBLE_LEAK_OR_ABNORMAL_DROP',
    'ABNORMAL_DROP_DETECTED',
  ].includes(normalizedStatus);

  /* Pulse animation on alert pill */
  const alertClass = live && leakFlag ? 'alert' : 'normal';

  return (
    <main className="wla-page">

      {/* ── Header ── */}
      <header className="wla-header">
        <div className="wla-header-left">
          <div className="wla-eyebrow">
            <span className="wla-eyebrow-dot" />
            AQUAEDGE AI · MONITORING
          </div>
          <h1>Water Loss Analysis</h1>
          <p>Real-time sensor observations paired with LSTM-based evaporation modelling.</p>
        </div>
        <div className="wla-header-right">
          <div className={`wla-connection ${apiState === 'connected' ? 'is-live' : 'is-offline'}`}>
            <span className="wla-connection-dot" />
            {apiState === 'connected'
              ? 'Python API connected'
              : apiState === 'checking'
              ? 'Checking…'
              : 'Live API not connected'}
          </div>
          {lastUpdated && (
            <div className="wla-last-update">
              Last update: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </header>

      {/* ── Preview / waiting banner ── */}
      {usingPreview && (
        <div className="wla-preview-banner">
          <span className="wla-preview-badge">PREVIEW DATA</span>
          <span>
            Values shown are illustrative UI preview values — not live sensor readings.
            The Python FastAPI service, ESP32 sensor, and trained LSTM model are not connected.
          </span>
          <button type="button" onClick={() => setShowPreview(false)}>Dismiss</button>
        </div>
      )}
      {!live && !showPreview && (
        <div className="wla-preview-banner muted">
          Waiting for API data. Start the Python service to display live readings.
        </div>
      )}

      {/* ── Status hero ── */}
      <section className="wla-status-row">
        <div className="wla-status-copy">
          <span className="wla-status-label">CURRENT SYSTEM STATUS</span>
          <h2>
            {live
              ? (leakFlag ? 'Abnormal water drop detected' : 'Monitoring active — normal')
              : (showPreview ? 'Preview mode' : 'Waiting for sensor data')}
          </h2>
          <p>
            {live
              ? 'Status reflects the connected Python service response. Anomaly warnings are not confirmation of a physical leak.'
              : 'Live data will appear once the FastAPI endpoint is running and the ESP32 sensor is connected.'}
          </p>
        </div>
        <div className={`wla-alert-pill ${alertClass}`}>
          <span className="wla-alert-dot" />
          {live
            ? (leakFlag
                ? 'POSSIBLE LEAK / ABNORMAL DROP (DEMO THRESHOLD)'
                : 'NO ABNORMAL DROP REPORTED')
            : 'NO LIVE ALERT'}
        </div>
      </section>

      {/* ── Metric cards ── */}
      <section className="wla-metrics-grid">
        <MetricCard
          label="Water level"
          value={display(level)}
          unit=" cm"
          note={live ? 'From connected API' : 'Illustrative preview'}
          icon="◉"
        />
        <MetricCard
          label="Sensor distance"
          value={display(distance)}
          unit=" cm"
          note="Sensor to water surface"
          icon="↕"
        />
        <MetricCard
          label="LSTM evap. estimate"
          value={display(predicted, 6)}
          unit=" cm/hr"
          note="Model prediction · synthetic training"
          icon="⌁"
          tone="accent"
        />
        <MetricCard
          label="Observed drop"
          value={display(observedDrop)}
          unit=" cm"
          note="Compared with baseline"
          icon="↓"
          tone={live && leakFlag ? 'warning' : ''}
        />
      </section>

      {/* ── Chart + Gauge row ── */}
      <section className="wla-content-grid">

        {/* Left: Trend chart */}
        <article className="wla-panel wla-history-panel">
          <div className="wla-panel-heading">
            <div>
              <h3>Water-level trend</h3>
              <p>Recent observations over time · Y-axis in cm</p>
            </div>
            <span className="wla-mini-tag">
              {live?.history?.length ? 'LIVE HISTORY' : 'PREVIEW TREND'}
            </span>
          </div>
          <TrendChart points={points} predicted={predicted} />
          <div className="wla-chart-legend">
            <span className="wla-legend-line solid" />
            <span>Water level (cm)</span>
            <span className="wla-legend-line dashed" style={{ marginLeft: 14 }} />
            <span>Predicted evap. ceiling</span>
          </div>
        </article>

        {/* Right: panels stacked */}
        <div className="wla-right-stack">

          {/* Observed vs Predicted gauge */}
          <article className="wla-panel">
            <div className="wla-panel-heading">
              <div>
                <h3>Observed vs Predicted drop</h3>
                <p>Anomaly detection comparison</p>
              </div>
              <span className="wla-chip">LSTM</span>
            </div>
            <DropGauge observed={observedDrop} predicted={predicted} />
          </article>

          {/* Model & data status */}
          <article className="wla-panel">
            <div className="wla-panel-heading">
              <div>
                <h3>Model &amp; data status</h3>
                <p>Prototype transparency</p>
              </div>
              <span className="wla-chip">INFO</span>
            </div>
            <div className="wla-detail-row"><span>Model file</span><strong>{live?.model_loaded === true ? '✓ Loaded' : 'Check Python service'}</strong></div>
            <div className="wla-detail-row"><span>Sensor source</span><strong>{live?.sensor_connected === true ? '✓ ESP32 connected' : 'Not confirmed'}</strong></div>
            <div className="wla-detail-row"><span>Training data</span><strong>Synthetic (demo)</strong></div>
            <div className="wla-detail-row"><span>Poll interval</span><strong>2.5 s</strong></div>
            <p className="wla-note">
              A possible-leak flag is an anomaly warning only — it does not confirm a physical leak.
              Model predictions require validation against longer real-world observations.
            </p>
          </article>
        </div>
      </section>

      {/* ── Environmental telemetry ── */}
      <section className="wla-telem-section">
        <div className="wla-section-heading">
          <div>
            <h3>LSTM Model Input Factors</h3>
            <p>
              {weatherState === 'live'
                ? 'Real-time observation via Open-Meteo Weather API (Colombo, LK)'
                : 'Environmental parameters used by the evaporation model'}
            </p>
          </div>
          <span className={`wla-weather-pill ${weatherState === 'live' ? 'live' : 'sim'}`}>
            {weatherState === 'live' ? '● OPEN-METEO LIVE' : weatherState === 'checking' ? 'FETCHING WEATHER…' : 'SIMULATED VALUES'}
          </span>
        </div>
        <TelemetryBadges
          data={weather || live?.telemetry || null}
          isLive={weatherState === 'live'}
        />
      </section>

      {/* ── Footer ── */}
      <footer className="wla-footer">
        <span>AquaEdge AI · AI Leak &amp; Evaporation Tracker</span>
        <span className="wla-footer-tag">PP1 PROTOTYPE</span>
      </footer>
    </main>
  );
}
