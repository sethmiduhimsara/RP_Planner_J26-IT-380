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
   Time formatter for chart X-axis, tables & tooltips
   Converts long ISO timestamps into clean HH:MM:SS or HH:MM
───────────────────────────────────────────────────────── */
function formatChartTime(t) {
  if (!t) return '';
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  try {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
  } catch {
    // fallback
  }
  if (typeof t === 'string' && t.includes('T')) {
    const timePart = t.split('T')[1];
    return timePart.split('+')[0].split('.')[0].slice(0, 8);
  }
  return String(t);
}

/* ─────────────────────────────────────────────────────────
   Helper: Moving Average to smooth raw ultrasonic jitter
───────────────────────────────────────────────────────── */
function computeMovingAvg(data, windowSize = 3) {
  if (!data || !data.length) return [];
  return data.map((item, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const subset = data.slice(start, i + 1);
    const sum = subset.reduce((acc, curr) => acc + Number(curr.level), 0);
    return { ...item, level: sum / subset.length };
  });
}

/* ─────────────────────────────────────────────────────────
   Helper: Compute clean, rounded Y-axis bounds
───────────────────────────────────────────────────────── */
function computeNiceDomain(minVal, maxVal) {
  const diff = Math.max(maxVal - minVal, 0.08);
  const pad = diff * 0.18;
  const rawMin = minVal - pad;
  const rawMax = maxVal + pad;
  
  const range = rawMax - rawMin;
  const targetStep = range / 4;
  let step;
  if (targetStep <= 0.05) step = 0.05;
  else if (targetStep <= 0.1) step = 0.1;
  else if (targetStep <= 0.2) step = 0.2;
  else if (targetStep <= 0.5) step = 0.5;
  else step = 1.0;

  const niceMin = Math.floor(rawMin / step) * step;
  const niceMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
    ticks.push(Number(v.toFixed(3)));
  }
  return {
    yMin: niceMin,
    yMax: niceMax,
    yRange: Math.max(niceMax - niceMin, 0.01),
    yTicks: ticks,
  };
}

/* ─────────────────────────────────────────────────────────
   TrendChart (Upgraded: Clean X/Y scale, Moving Avg & Tooltip)
───────────────────────────────────────────────────────── */
function TrendChart({ points, leakThreshold }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const W = 720, H = 220;
  const pad = { top: 20, right: 32, bottom: 36, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top  - pad.bottom;
  const n     = points.length;

  const values = points.map(p => Number(p.level)).filter(Number.isFinite);
  if (!values.length) return null;

  const thresholdVal = leakThreshold != null && Number.isFinite(Number(leakThreshold)) ? Number(leakThreshold) : null;
  const dataMin = Math.min(...values, ...(thresholdVal != null ? [thresholdVal] : []));
  const dataMax = Math.max(...values);
  const { yMin, yMax, yRange, yTicks } = computeNiceDomain(dataMin, dataMax);

  const toX = i => pad.left + (i / Math.max(n - 1, 1)) * plotW;
  const toY = v => pad.top  + (1 - (v - yMin) / yRange) * plotH;

  /* Smoothed trend points */
  const smoothed = computeMovingAvg(points, Math.min(4, Math.max(2, Math.floor(n / 6))));

  /* SVG line points */
  const rawPts    = points.map((p, i) => `${toX(i).toFixed(1)},${toY(Number(p.level)).toFixed(1)}`).join(' ');
  const smoothPts = smoothed.map((p, i) => `${toX(i).toFixed(1)},${toY(Number(p.level)).toFixed(1)}`).join(' ');

  /* Area gradient path under smoothed trend */
  const firstX = toX(0);
  const lastX  = toX(n - 1);
  const bottomY = pad.top + plotH;
  const areaPath = `M ${firstX} ${bottomY} ` +
    smoothed.map((p, i) => `L ${toX(i).toFixed(1)} ${toY(Number(p.level)).toFixed(1)}`).join(' ') +
    ` L ${lastX} ${bottomY} Z`;

  /* Select 4 or 5 clean X-axis ticks that NEVER collide */
  const tickCount = Math.min(5, Math.max(2, n));
  const tickIndices = [];
  for (let k = 0; k < tickCount; k++) {
    tickIndices.push(Math.round((k / (tickCount - 1)) * (n - 1)));
  }

  /* Mouse interaction for interactive tooltip */
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    if (mouseX < pad.left || mouseX > W - pad.right) {
      setHoverIdx(null);
      return;
    }
    let closestDist = Infinity;
    let closestI = 0;
    points.forEach((_, i) => {
      const dist = Math.abs(toX(i) - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestI = i;
      }
    });
    setHoverIdx(closestI);
  };

  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredX = hoverIdx !== null ? toX(hoverIdx) : null;
  const hoveredY = hoveredPoint !== null ? toY(Number(hoveredPoint.level)) : null;

  return (
    <div className="wla-chart-wrapper">
      <svg
        className="wla-trend-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Water-level trend chart"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
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
        </defs>

        {/* Y-axis gridlines & tick labels */}
        {yTicks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} className="wla-gridline" />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" className="wla-axis-tick">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Y-axis unit label */}
        <text
          x={14}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          className="wla-axis-unit"
          transform={`rotate(-90, 14, ${pad.top + plotH / 2})`}
        >Level (cm)</text>

        {/* Leak Alert Threshold Reference Line (Min Safe Level) */}
        {thresholdVal != null && thresholdVal >= yMin && thresholdVal <= yMax && (
          <g>
            <line
              x1={pad.left} y1={toY(thresholdVal).toFixed(1)}
              x2={W - pad.right} y2={toY(thresholdVal).toFixed(1)}
              className="wla-pred-line"
            />
            <text
              x={W - pad.right - 6}
              y={toY(thresholdVal) - 5}
              textAnchor="end"
              className="wla-pred-label"
            >Leak Alert Threshold ({thresholdVal.toFixed(2)} cm)</text>
          </g>
        )}

        {/* Shaded Area fill under smoothed line */}
        <path d={areaPath} fill="url(#wla-area-grad)" />

        {/* Raw sensor readings trace (lighter, shows telemetry fidelity) */}
        <polyline points={rawPts} className="wla-chart-raw-line" />

        {/* Filtered / Smoothed water-level line */}
        <polyline points={smoothPts} stroke="url(#wla-line-grad)" className="wla-chart-line" />

        {/* If fewer points, show clean dots */}
        {n <= 16 && points.map((p, i) => (
          <circle
            key={`${p.t}-${i}`}
            cx={toX(i).toFixed(1)}
            cy={toY(Number(p.level)).toFixed(1)}
            r="2.5"
            className="wla-chart-dot"
          />
        ))}

        {/* Active pulsing marker on the Latest reading (far right) */}
        {n > 0 && (
          <g>
            <circle
              cx={toX(n - 1).toFixed(1)}
              cy={toY(Number(points[n - 1].level)).toFixed(1)}
              r="7"
              className="wla-latest-pulse"
            />
            <circle
              cx={toX(n - 1).toFixed(1)}
              cy={toY(Number(points[n - 1].level)).toFixed(1)}
              r="3.5"
              className="wla-latest-dot"
            />
          </g>
        )}

        {/* Interactive Hover crosshair & dot */}
        {hoverIdx !== null && hoveredPoint && (
          <g>
            <line
              x1={hoveredX} y1={pad.top}
              x2={hoveredX} y2={pad.top + plotH}
              className="wla-crosshair-line"
            />
            <circle
              cx={hoveredX}
              cy={hoveredY}
              r="5"
              className="wla-hover-dot"
            />
            {/* Tooltip Card */}
            <g transform={`translate(${Math.min(Math.max(hoveredX - 60, pad.left), W - pad.right - 120)}, ${Math.max(pad.top + 6, hoveredY - 48)})`}>
              <rect
                width="120"
                height="40"
                rx="6"
                className="wla-tooltip-bg"
              />
              <text x="10" y="16" className="wla-tooltip-time">
                ⏱ {formatChartTime(hoveredPoint.t)}
              </text>
              <text x="10" y="31" className="wla-tooltip-val">
                💧 {Number(hoveredPoint.level).toFixed(3)} cm
              </text>
            </g>
          </g>
        )}

        {/* X-axis bottom border */}
        <line
          x1={pad.left} y1={pad.top + plotH}
          x2={W - pad.right} y2={pad.top + plotH}
          className="wla-axis-border"
        />

        {/* X-axis time tick marks & labels */}
        {tickIndices.map((idx, k) => {
          const x = toX(idx);
          const formatted = formatChartTime(points[idx]?.t);
          return (
            <g key={k}>
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH + 5} className="wla-axis-border" />
              <text
                x={x}
                y={H - 10}
                textAnchor={k === 0 ? 'start' : k === tickIndices.length - 1 ? 'end' : 'middle'}
                className="wla-axis-tick"
              >
                {formatted}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DropGauge (Mathematically Robust & Units Consistent)
   Compares observed water drop against expected evaporation.
   Clamps negative values gracefully and shows clear diagnostics.
───────────────────────────────────────────────────────── */
function DropGauge({ observed, predicted, expectedLoss, threshold, status }) {
  const rawObs   = Number.isFinite(Number(observed))  ? Number(observed)  : null;
  const predRate = Number.isFinite(Number(predicted)) ? Number(predicted) : null;

  if (rawObs == null && predRate == null) {
    return (
      <div className="wla-gauge-unavail">
        Observed vs predicted comparison unavailable — waiting for API telemetry.
      </div>
    );
  }

  // 1. Water Loss magnitude (clamped: negative means water level rose or stayed above baseline)
  const isAboveBaseline = rawObs != null && rawObs < 0;
  const effectiveLoss   = rawObs != null ? Math.max(0, rawObs) : 0;
  
  // 2. Expected evaporation loss in cm
  const expLossVal = Number.isFinite(Number(expectedLoss)) && Number(expectedLoss) > 0
    ? Number(expectedLoss)
    : (predRate != null ? Number(predRate) : 0.010469);

  // 3. Alert threshold buffer
  const threshVal = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.75;
  const leakThresholdVal = expLossVal + threshVal;

  // 4. Maximum scale for percentage bars: leak threshold represents ~85% of full gauge width
  const maxScale = Math.max(leakThresholdVal * 1.15, effectiveLoss * 1.15, 0.10);
  const obsPct   = Math.min((effectiveLoss / maxScale) * 100, 100).toFixed(1);
  const expPct   = Math.min((expLossVal / maxScale) * 100, 100).toFixed(1);

  // 5. Check if flagged as abnormal (strictly match true alert statuses, ignoring 'NO_ABNORMAL_DROP_DETECTED')
  const normalizedStatus = String(status || '').toUpperCase();
  const isAnomalyStatus = [
    'POSSIBLE_LEAK',
    'POSSIBLE_LEAK_OR_ABNORMAL_DROP',
    'ABNORMAL_DROP_DETECTED',
  ].includes(normalizedStatus);
  const exceedsThreshold = rawObs != null && rawObs > leakThresholdVal;
  const flagged = isAnomalyStatus || exceedsThreshold;

  return (
    <div className="wla-gauge-wrap">
      {/* Row 1: Observed Water Loss */}
      <div className="wla-gauge-row">
        <span className="wla-gauge-label">Observed Loss</span>
        <div className="wla-gauge-track">
          <div
            className={`wla-gauge-bar obs${flagged ? ' flagged' : ''}`}
            style={{ width: `${Math.max(0, Number(obsPct))}%` }}
          />
        </div>
        <span className="wla-gauge-val">
          {effectiveLoss.toFixed(4)} cm
        </span>
      </div>

      {/* Row 2: AI Expected Evaporation */}
      <div className="wla-gauge-row">
        <span className="wla-gauge-label">Expected Evap.</span>
        <div className="wla-gauge-track">
          <div className="wla-gauge-bar pred" style={{ width: `${Math.max(0, Number(expPct))}%` }} />
        </div>
        <span className="wla-gauge-val">
          {expLossVal.toFixed(4)} cm
        </span>
      </div>

      {/* Threshold indicator metrics */}
      <div className="wla-gauge-threshold-info">
        <span>Leak Alert Buffer: <strong>+{threshVal.toFixed(2)} cm</strong></span>
        <span>Model Rate: <strong>{predRate != null ? `${predRate.toFixed(6)} cm/hr` : '—'}</strong></span>
      </div>

      {/* Contextual Status Banner */}
      {flagged ? (
        <div className="wla-gauge-flag">
          ⚠ <strong>Abnormal water loss detected!</strong> Observed drop ({effectiveLoss.toFixed(3)} cm) exceeds safe evaporation limit.
          <em> (Demo threshold active · Check physical pool seals)</em>
        </div>
      ) : isAboveBaseline ? (
        <div className="wla-gauge-ok steady">
          ✓ <strong>Water level stable · No water loss</strong> (+{Math.abs(rawObs).toFixed(3)} cm above baseline)
        </div>
      ) : (
        <div className="wla-gauge-ok">
          ✓ <strong>Normal Range · Loss is within expected evaporation limit</strong>
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

  const level        = live?.water_level_cm                    ?? (usingPreview ? 9.94     : null);
  const distance     = live?.distance_cm                       ?? (usingPreview ? 23.74    : null);
  const predicted    = live?.predicted_evaporation_cm_per_hour ?? (usingPreview ? 0.010469 : null);
  const observedDrop = live?.observed_drop_cm                 ?? (usingPreview ? 0.06     : null);
  const status       = live?.status                            ?? (usingPreview ? 'PREVIEW_ONLY' : 'WAITING');

  /* Physical leak threshold bound: baseline level minus allowed noise/evap buffer */
  const initialLevel     = live?.initial_water_level_cm ?? 10.0;
  const thresholdBuffer  = live?.threshold_cm ?? (usingPreview ? 0.10 : 0.75);
  const expectedLoss     = live?.expected_loss_cm ?? (predicted ? predicted * 1 : 0.01);
  const leakThreshold    = Number((initialLevel - expectedLoss - thresholdBuffer).toFixed(2));

  const points = useMemo(
    () =>
      live?.history?.length
        ? live.history.map((p, i) => ({ t: p.timestamp || `${i}`, level: Number(p.water_level_cm) }))
        : previewPoints,
    [live],
  );

  /* Compute quick statistics for the trend panel bottom */
  const stats = useMemo(() => {
    const vals = points.map(p => Number(p.level)).filter(Number.isFinite);
    if (!vals.length) return { min: '—', max: '—', drift: '—', count: 0 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const first = vals[0];
    const last = vals[vals.length - 1];
    const drift = last - first;
    return {
      min: min.toFixed(2),
      max: max.toFixed(2),
      drift: (drift >= 0 ? `+${drift.toFixed(2)}` : drift.toFixed(2)),
      count: vals.length,
    };
  }, [points]);

  /* Get the most recent 4 readings in reverse chronological order */
  const recentLogs = useMemo(() => {
    if (live?.history?.length) {
      return [...live.history].slice(-4).reverse();
    }
    return [...previewPoints].slice(-4).reverse().map(p => ({
      timestamp: p.t,
      water_level_cm: p.level,
      observed_drop_cm: Number((10.00 - p.level).toFixed(2)),
      status: 'NORMAL',
    }));
  }, [live]);

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

        {/* Left: Trend chart + Telemetry Log */}
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
          
          <TrendChart points={points} leakThreshold={leakThreshold} />
          
          <div className="wla-chart-legend">
            <span className="wla-legend-line solid" />
            <span>Water level (Filtered trend)</span>
            <span className="wla-legend-line raw" style={{ marginLeft: 14 }} />
            <span>Raw sensor reading</span>
            <span className="wla-legend-line dashed" style={{ marginLeft: 14 }} />
            <span>Leak Alert Threshold</span>
          </div>

          {/* ── Summary Quick Stats Ribbon ── */}
          <div className="wla-trend-stats-strip">
            <div className="wla-stat-pill">
              <span className="wla-stat-pill-label">Lowest Level</span>
              <strong className="wla-stat-pill-val">{stats.min} cm</strong>
            </div>
            <div className="wla-stat-pill">
              <span className="wla-stat-pill-label">Peak Level</span>
              <strong className="wla-stat-pill-val">{stats.max} cm</strong>
            </div>
            <div className="wla-stat-pill">
              <span className="wla-stat-pill-label">Net Drift</span>
              <strong className="wla-stat-pill-val">{stats.drift} cm</strong>
            </div>
            <div className="wla-stat-pill">
              <span className="wla-stat-pill-label">Telemetry Count</span>
              <strong className="wla-stat-pill-val">{stats.count} samples</strong>
            </div>
          </div>

          {/* ── Recent Telemetry Log Table ── */}
          <div className="wla-table-card">
            <div className="wla-table-card-head">
              <span>Recent Sensor Observations</span>
              <span className="wla-table-live-indicator">
                <span className="wla-table-dot" /> Live Feed
              </span>
            </div>
            <table className="wla-log-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Water Level</th>
                  <th>Observed Drop</th>
                  <th>Detection Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((row, idx) => {
                  const rowStatus = String(row.status || '').toUpperCase();
                  const isAnomaly = [
                    'POSSIBLE_LEAK',
                    'POSSIBLE_LEAK_OR_ABNORMAL_DROP',
                    'ABNORMAL_DROP_DETECTED',
                  ].includes(rowStatus);
                  return (
                    <tr key={idx} className={idx === 0 ? 'is-latest-row' : ''}>
                      <td className="wla-time-cell">
                        {idx === 0 && <span className="wla-latest-badge">LATEST</span>}
                        {formatChartTime(row.timestamp || row.t)}
                      </td>
                      <td className="wla-bold-cell">
                        {Number(row.water_level_cm || row.level).toFixed(2)} cm
                      </td>
                      <td>
                        {row.observed_drop_cm != null
                          ? `${Number(row.observed_drop_cm).toFixed(3)} cm`
                          : '—'}
                      </td>
                      <td>
                        <span className={`wla-status-chip ${isAnomaly ? 'alert' : 'ok'}`}>
                          {isAnomaly ? 'Abnormal Drop' : 'Normal Range'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>

        {/* Right: panels stacked */}
        <div className="wla-right-stack">

          {/* Observed vs Predicted drop */}
          <article className="wla-panel">
            <div className="wla-panel-heading">
              <div>
                <h3>Observed vs Predicted drop</h3>
                <p>Anomaly detection comparison</p>
              </div>
              <span className="wla-chip">LSTM</span>
            </div>
            <DropGauge
              observed={observedDrop}
              predicted={predicted}
              expectedLoss={live?.expected_loss_cm ?? null}
              threshold={live?.threshold_cm ?? (usingPreview ? 0.10 : 0.75)}
              status={status}
            />
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
