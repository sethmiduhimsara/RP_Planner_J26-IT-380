/**
 * LeakEvaporationDashboard.jsx — AI Leak & Evaporation Tracker
 * Phase 1: Polished responsive React dashboard with simulated demo data
 *
 * ⚠️  DEMO DATA — All readings and estimates below are simulated.
 *     The HC-SR04 ultrasonic sensor, ESP32 prototype, backend API,
 *     live weather service, and trained AI/ML model are NOT CONNECTED.
 *     Water-loss calculations are simplified illustrative demo estimates,
 *     NOT a scientifically validated model or an LSTM prediction.
 *
 * Integration roadmap:
 *   Phase 2: Replace DEMO_HISTORY with useWaterLevel() hook (real ESP32 readings)
 *   Phase 3: Replace weather fields with useWeatherData() hook (Open-Meteo API)
 *   Phase 4: Replace estimateDailyEvaporation() with trained ML API call (ml-service/main.py)
 */

import { useState, useMemo } from 'react'
import { DEMO_HISTORY, POOL_CONFIG } from './demoData.js'
import {
  estimateDailyEvaporation,
  detectPossibleAbnormalLoss,
  buildExpectedLevelSeries,
  MODEL_CONSTANTS,
} from './evaporationModel.js'
import './LeakEvaporationDashboard.css'

// ---------------------------------------------------------------------------
// Safe numeric formatting helpers (prevent NaN / Infinity anywhere in UI)
// ---------------------------------------------------------------------------
function fmt(n, decimals = 1) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) {
    return '--'
  }
  return Number(n).toFixed(decimals)
}

function fmtSigned(n, decimals = 1) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) {
    return '--'
  }
  const val = Number(n)
  const sign = val > 0 ? '+' : ''
  return `${sign}${val.toFixed(decimals)}`
}

// ---------------------------------------------------------------------------
// Sub-component: Responsive SVG Water Level Trend Chart
// ---------------------------------------------------------------------------
function WaterLevelChart({ processedHistory, expectedLevels, config }) {
  const W = 900
  const H = 290
  const PAD = { top: 40, right: 68, bottom: 48, left: 62 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  // Extract all valid finite values to define a clean Y domain with proper headroom
  const rawValues = [
    ...processedHistory.map(d => d.levelMM),
    ...expectedLevels,
    config.minSafeLevelMM,
    config.nominalLevelMM,
  ]
  const finiteValues = rawValues.filter(Number.isFinite)
  const minVal = finiteValues.length > 0 ? Math.min(...finiteValues) : 1600
  const maxVal = finiteValues.length > 0 ? Math.max(...finiteValues) : 1900

  const yMin = Math.floor((minVal - 30) / 50) * 50
  const yMax = Math.ceil((maxVal + 30) / 50) * 50

  const xScale = (i) =>
    PAD.left + (i / Math.max(processedHistory.length - 1, 1)) * plotW
  const yScale = (v) =>
    PAD.top + plotH - ((v - yMin) / Math.max(yMax - yMin, 1)) * plotH

  // Build SVG polyline points (guaranteed finite coordinates)
  const actualPts = processedHistory
    .map((d, i) => `${xScale(i).toFixed(1)},${yScale(d.levelMM).toFixed(1)}`)
    .join(' ')

  const expectedPts = expectedLevels
    .map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
    .join(' ')

  // Y-axis grid ticks every 50 mm
  const yTicks = []
  for (let v = yMin; v <= yMax; v += 50) {
    yTicks.push(v)
  }

  // X-axis date labels: dynamically adapt step to selected range
  const count = processedHistory.length
  const step = count <= 7 ? 1 : count <= 14 ? 2 : 5
  const xLabelIndices = processedHistory
    .map((_, i) => i)
    .filter(i => i % step === 0 || i === count - 1)

  // Abnormal period identification using the unified alert rule
  const abnormalIndices = processedHistory
    .map((d, i) => (d.isPossibleAbnormalLoss ? i : -1))
    .filter(i => i !== -1)

  const hasAbnormal = abnormalIndices.length > 0
  const firstAbn = hasAbnormal ? abnormalIndices[0] : -1
  const lastAbn = hasAbnormal ? abnormalIndices[abnormalIndices.length - 1] : -1
  const rectX = hasAbnormal ? xScale(firstAbn) : 0
  const rectW = hasAbnormal ? Math.max(xScale(lastAbn) - rectX, 14) : 0

  const lastIdx = processedHistory.length - 1
  const todayEntry = processedHistory[lastIdx]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="leak-tracker__chart-svg"
      role="img"
      aria-label="Water level trend chart showing actual level vs expected natural evaporation baseline"
    >
      {/* ── Abnormal loss period background shading ── */}
      {hasAbnormal && (
        <g>
          <rect
            x={rectX.toFixed(1)}
            y={PAD.top}
            width={rectW.toFixed(1)}
            height={plotH}
            fill="rgba(248, 113, 113, 0.08)"
            rx="4"
          />
          <text
            x={(rectX + rectW / 2).toFixed(1)}
            y={PAD.top + 14}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="#f87171"
          >
            ⚠ Possible Abnormal Loss Period (Demo)
          </text>
        </g>
      )}

      {/* ── Y-axis gridlines ── */}
      {yTicks.map(v => (
        <line
          key={v}
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={yScale(v).toFixed(1)}
          y2={yScale(v).toFixed(1)}
          stroke="rgba(148, 163, 184, 0.10)"
          strokeWidth="1"
        />
      ))}

      {/* ── Nominal level reference line ── */}
      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={yScale(config.nominalLevelMM).toFixed(1)}
        y2={yScale(config.nominalLevelMM).toFixed(1)}
        stroke="rgba(45, 212, 191, 0.45)"
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />
      <text
        x={PAD.left + plotW + 5}
        y={yScale(config.nominalLevelMM) + 3}
        fontSize="9"
        fill="rgba(45, 212, 191, 0.7)"
      >
        Nominal
      </text>

      {/* ── Min-safe level reference line ── */}
      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={yScale(config.minSafeLevelMM).toFixed(1)}
        y2={yScale(config.minSafeLevelMM).toFixed(1)}
        stroke="rgba(248, 113, 113, 0.5)"
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />
      <text
        x={PAD.left + plotW + 5}
        y={yScale(config.minSafeLevelMM) + 3}
        fontSize="9"
        fill="rgba(248, 113, 113, 0.7)"
      >
        Min Safe
      </text>

      {/* ── Expected (natural evaporation only) level line ── */}
      {expectedPts && (
        <polyline
          points={expectedPts}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="2"
          strokeDasharray="7,5"
          opacity="0.75"
          strokeLinejoin="round"
        />
      )}

      {/* ── Actual water level line ── */}
      {actualPts && (
        <polyline
          points={actualPts}
          fill="none"
          stroke="#00b4d8"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* ── Data point dots (subsampled by step + last entry) ── */}
      {processedHistory.map((d, i) => {
        if (i % step !== 0 && i !== lastIdx) return null
        const isToday = i === lastIdx
        const dotColor = d.isPossibleAbnormalLoss ? '#f87171' : '#00b4d8'
        return (
          <g key={d.date}>
            <circle
              cx={xScale(i).toFixed(1)}
              cy={yScale(d.levelMM).toFixed(1)}
              r={isToday ? 5.5 : 4}
              fill={dotColor}
              stroke="#0d1b2a"
              strokeWidth="2"
            />
            <title>
              {`${d.dayLabel}: ${fmt(d.levelMM, 0)} mm (${d.levelChangeMM > 0 ? '+' : ''}${fmt(d.levelChangeMM, 1)} mm)${
                d.isPossibleAbnormalLoss ? ' ⚠ Possible abnormal loss (demo)' : ''
              }`}
            </title>
          </g>
        )
      })}

      {/* ── "Today" label positioned safely above/below dot ── */}
      {todayEntry && (() => {
        const todayY = yScale(todayEntry.levelMM)
        const isNearTop = todayY < PAD.top + 26
        const textY = isNearTop ? todayY + 16 : todayY - 9
        return (
          <text
            x={(xScale(lastIdx) - 6).toFixed(1)}
            y={textY.toFixed(1)}
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill="#00b4d8"
          >
            Today ({fmt(todayEntry.levelMM, 0)} mm)
          </text>
        )
      })()}

      {/* ── Y-axis numerical labels (every 100 mm) ── */}
      {yTicks
        .filter(v => v % 100 === 0)
        .map(v => (
          <text
            key={v}
            x={PAD.left - 8}
            y={(yScale(v) + 4).toFixed(1)}
            textAnchor="end"
            fontSize="11"
            fill="rgba(148, 163, 184, 0.80)"
          >
            {v}
          </text>
        ))}

      {/* ── X-axis date labels ── */}
      {xLabelIndices.map(i => {
        const d = processedHistory[i]
        const anchor = i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'
        return (
          <text
            key={d.date}
            x={xScale(i).toFixed(1)}
            y={H - 12}
            textAnchor={anchor}
            fontSize="11"
            fill="rgba(148, 163, 184, 0.80)"
          >
            {d.dayLabel}
          </text>
        )
      })}

      {/* ── Axis lines ── */}
      <line
        x1={PAD.left}
        x2={PAD.left}
        y1={PAD.top}
        y2={PAD.top + plotH}
        stroke="rgba(148, 163, 184, 0.22)"
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        x2={PAD.left + plotW}
        y1={PAD.top + plotH}
        y2={PAD.top + plotH}
        stroke="rgba(148, 163, 184, 0.22)"
        strokeWidth="1"
      />

      {/* ── Y-axis title ── */}
      <text
        x={14}
        y={PAD.top + plotH / 2}
        textAnchor="middle"
        fontSize="11"
        fill="rgba(148, 163, 184, 0.65)"
        transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}
      >
        Water Level (mm)
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Stat Card
// ---------------------------------------------------------------------------
function StatCard({ label, icon, value, unit, sub, variant, gauge }) {
  return (
    <div className={`leak-tracker__stat-card leak-tracker__stat-card--${variant}`}>
      <div className="leak-tracker__stat-label">
        <span aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div className="leak-tracker__stat-value">
        {value}
        {unit && <span className="leak-tracker__stat-unit">{unit}</span>}
      </div>
      {gauge !== undefined && (
        <div className="leak-tracker__level-gauge" aria-label={`Level: ${gauge}%`}>
          <div
            className="leak-tracker__level-gauge-fill"
            style={{ width: `${Math.min(Math.max(gauge, 0), 100)}%` }}
          />
        </div>
      )}
      {sub !== undefined && sub !== null && (
        <div className="leak-tracker__stat-sub">{sub}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Alert Banner (shown only when abnormal loss is detected)
// ---------------------------------------------------------------------------
function AlertBanner({ consecutiveDays, surplusToday, status, threshold }) {
  const isCritical = status === 'critical'
  const surplusStr = Number.isFinite(surplusToday)
    ? `+${fmt(surplusToday, 1)} mm`
    : '--'

  return (
    <div
      className={`leak-tracker__alert-banner leak-tracker__alert-banner--${status}`}
      role="alert"
      aria-live="polite"
    >
      <span className="leak-tracker__alert-icon" aria-hidden="true">
        {isCritical ? '🚨' : '⚠️'}
      </span>
      <div>
        <p className="leak-tracker__alert-title">
          {isCritical ? 'Critical (Demo):' : 'Warning (Demo):'} Possible Abnormal Water Loss — {consecutiveDays} Consecutive Day
          {consecutiveDays !== 1 ? 's' : ''}
        </p>
        <p className="leak-tracker__alert-desc">
          Triggered by demo condition: daily water loss exceeded the estimated evaporation baseline by{' '}
          <strong>{surplusStr}</strong> today (demo threshold: surplus &gt; {threshold} mm/day for {consecutiveDays} consecutive days;
          ≥3 days triggers Critical). This illustrates alert detection for suspected leak patterns.
        </p>
        <p className="leak-tracker__alert-disclaimer">
          ℹ SIMULATED DEMO ALERT: No physical leak is confirmed. The ESP32 sensor, weather API, backend, and AI model are not connected.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Weather Card
// ---------------------------------------------------------------------------
function WeatherCard({ current }) {
  const humidity = current?.humidityPct ?? current?.humPct
  const wind = current?.windSpeedKph ?? current?.windKph
  const temp = current?.tempC
  const rain = current?.rainMM ?? 0

  const conditionIcon =
    rain > 0 ? '🌧️' :
    temp > 32 ? '☀️' :
    humidity > 75 ? '🌥️' : '⛅'

  return (
    <div className="leak-tracker__card">
      <h3 className="leak-tracker__section-title">
        <span aria-hidden="true">🌡️</span>
        Current Weather Conditions
        <span
          style={{ fontSize: '11px', fontWeight: 400, color: 'var(--lt-subtext)', marginLeft: 6 }}
        >
          (Demo — simulated values)
        </span>
      </h3>
      <div className="leak-tracker__weather-grid">
        <div className="leak-tracker__weather-item">
          <span className="leak-tracker__weather-icon" aria-hidden="true">🌡️</span>
          <span className="leak-tracker__weather-value">
            {Number.isFinite(temp) ? `${fmt(temp, 1)}°C` : '--'}
          </span>
          <span className="leak-tracker__weather-label">Air Temperature</span>
        </div>
        <div className="leak-tracker__weather-item">
          <span className="leak-tracker__weather-icon" aria-hidden="true">💧</span>
          <span className="leak-tracker__weather-value">
            {Number.isFinite(humidity) ? `${fmt(humidity, 0)}%` : '--'}
          </span>
          <span className="leak-tracker__weather-label">Relative Humidity</span>
        </div>
        <div className="leak-tracker__weather-item">
          <span className="leak-tracker__weather-icon" aria-hidden="true">🌬️</span>
          <span className="leak-tracker__weather-value">
            {Number.isFinite(wind) ? `${fmt(wind, 1)} km/h` : '--'}
          </span>
          <span className="leak-tracker__weather-label">Wind Speed</span>
        </div>
        <div className="leak-tracker__weather-item">
          <span className="leak-tracker__weather-icon" aria-hidden="true">{conditionIcon}</span>
          <span className="leak-tracker__weather-value">
            {rain > 0 ? `${fmt(rain, 1)} mm` : '0.0 mm'}
          </span>
          <span className="leak-tracker__weather-label">Rainfall Today</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: System Status Card
// ---------------------------------------------------------------------------
function StatusCard({ consecutiveAlertDays, status, config }) {
  const alertChipVariant =
    status === 'critical' ? 'critical' :
    status === 'warning' ? 'warning' :
    status === 'unavailable' ? 'offline' : 'normal'

  const alertChipText =
    status === 'unavailable' ? '-- Unavailable' :
    consecutiveAlertDays > 0
      ? `${consecutiveAlertDays} day${consecutiveAlertDays !== 1 ? 's' : ''}`
      : 'None (0 days)'

  return (
    <div className="leak-tracker__card">
      <h3 className="leak-tracker__section-title">
        <span aria-hidden="true">📡</span>
        System Connection Status
      </h3>
      <div className="leak-tracker__status-rows">
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">Operating Mode</span>
          <span className="leak-tracker__status-chip leak-tracker__status-chip--demo">Demo Data Only</span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">HC-SR04 Sensor</span>
          <span className="leak-tracker__status-chip leak-tracker__status-chip--offline">Not Connected</span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">ESP32 → Backend API</span>
          <span className="leak-tracker__status-chip leak-tracker__status-chip--offline">Not Connected</span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">Weather API</span>
          <span className="leak-tracker__status-chip leak-tracker__status-chip--offline">Not Connected</span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">AI / ML Model</span>
          <span className="leak-tracker__status-chip leak-tracker__status-chip--offline">Not Trained</span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">Consecutive Alert Days</span>
          <span className={`leak-tracker__status-chip leak-tracker__status-chip--${alertChipVariant}`}>
            {alertChipText}
          </span>
        </div>
        <div className="leak-tracker__status-row">
          <span className="leak-tracker__status-row-label">Demo Alert Condition</span>
          <span className="leak-tracker__status-row-value">
            Surplus &gt; {config.LEAK_THRESHOLD_MM_PER_DAY} mm/day (≥3 days: Critical)
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: History Table
// ---------------------------------------------------------------------------
function HistoryTable({ rows }) {
  const [showAll, setShowAll] = useState(false)

  // Most-recent-first ordering
  const reversed = useMemo(() => [...rows].reverse(), [rows])
  const displayed = showAll ? reversed : reversed.slice(0, 10)

  return (
    <div>
      <div className="leak-tracker__section-header">
        <h3 className="leak-tracker__section-title">
          <span aria-hidden="true">📋</span>
          Water Level History
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--lt-subtext)' }}>
          Showing {displayed.length} of {rows.length} entries (most recent first)
        </span>
      </div>
      <div className="leak-tracker__table-scroll">
        <table className="leak-tracker__table" aria-label="Water level history">
          <thead>
            <tr>
              <th>Date</th>
              <th>Level (mm)</th>
              <th>Change (mm)</th>
              <th>Water Loss (mm)</th>
              <th>Evap Est. (mm)</th>
              <th>Surplus (mm)</th>
              <th>Temp (°C)</th>
              <th>Humidity</th>
              <th>Rainfall</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, idx) => {
              const isToday = idx === 0
              const isAlert = row.isPossibleAbnormalLoss
              const rowClass = isToday
                ? 'leak-tracker__table-row--today'
                : isAlert
                ? 'leak-tracker__table-row--alert'
                : ''

              // Change: current - previous (negative when dropping)
              const changeDisplay = fmtSigned(row.levelChangeMM, 1)
              const changeClass =
                row.levelChangeMM < 0
                  ? 'leak-tracker__cell-loss'
                  : row.levelChangeMM > 0
                  ? 'leak-tracker__cell-gain'
                  : 'leak-tracker__cell-normal'

              // Water loss: positive magnitude (0 when level rises)
              const lossDisplay = fmt(row.waterLossMM, 1)

              // Surplus: surplus above estimated evaporation
              const surplusDisplay = fmtSigned(row.surplusLossMM, 1)
              const surplusClass = isAlert
                ? 'leak-tracker__cell-alert'
                : 'leak-tracker__cell-normal'

              const humidity = row.humidityPct ?? row.humPct
              const humidityStr = Number.isFinite(humidity) ? `${fmt(humidity, 0)}%` : '--'

              const statusChip =
                row.status === 'unavailable' ? (
                  <span className="leak-tracker__table-chip leak-tracker__table-chip--unavailable">
                    -- Unavailable
                  </span>
                ) : isAlert ? (
                  <span className="leak-tracker__table-chip leak-tracker__table-chip--alert">
                    ⚠ Abnormal (Demo)
                  </span>
                ) : (
                  <span className="leak-tracker__table-chip leak-tracker__table-chip--normal">
                    ✓ Normal
                  </span>
                )

              return (
                <tr key={row.date} className={rowClass}>
                  <td>
                    {row.dayLabel}
                    {isToday && (
                      <span
                        className="leak-tracker__table-chip leak-tracker__table-chip--today"
                        style={{ marginLeft: 7 }}
                      >
                        Today
                      </span>
                    )}
                  </td>
                  <td>{fmt(row.levelMM, 1)}</td>
                  <td className={changeClass}>{changeDisplay}</td>
                  <td>{lossDisplay}</td>
                  <td>{fmt(row.estimatedEvap, 1)}</td>
                  <td className={surplusClass}>{surplusDisplay}</td>
                  <td>{fmt(row.tempC, 1)}</td>
                  <td>{humidityStr}</td>
                  <td>{row.rainMM > 0 ? `${fmt(row.rainMM, 1)} mm` : '—'}</td>
                  <td>{statusChip}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button
          type="button"
          className="leak-tracker__table-toggle"
          onClick={() => setShowAll(prev => !prev)}
        >
          {showAll ? '▲ Show recent 10 only' : `▼ Show all ${rows.length} entries`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
export default function LeakEvaporationDashboard() {
  const [selectedRange, setSelectedRange] = useState(30)

  // ── Phase 2 replacement: swap DEMO_HISTORY for useWaterLevel(selectedRange)
  const visibleHistory = useMemo(
    () => DEMO_HISTORY.slice(-selectedRange),
    [selectedRange]
  )

  // Compute metrics per day with standardized definitions
  const processedHistory = useMemo(() => {
    return visibleHistory.map((row, i) => {
      // Look up previous record to calculate 24h change & loss
      const fullIdx = DEMO_HISTORY.length - selectedRange + i
      const prevRow = fullIdx > 0 ? DEMO_HISTORY[fullIdx - 1] : null
      const prevLevel = prevRow ? prevRow.levelMM : row.levelMM

      const currentLevel = row.levelMM
      // 1. Water-level change: currentLevel - previousLevel (negative if dropping)
      const levelChangeMM = Math.round((currentLevel - prevLevel) * 10) / 10

      // 2. Water loss: max(0, previousLevel - currentLevel) (positive magnitude)
      const waterLossMM = Math.round(Math.max(0, prevLevel - currentLevel) * 10) / 10

      // Rainfall adjustment for water physically lost
      const rainMM = Number(row.rainMM) || 0
      const netWaterLost = Math.round(Math.max(0, (prevLevel - currentLevel) + rainMM) * 10) / 10

      // 3. Illustrative demo evaporation estimate
      const humidity = row.humidityPct ?? row.humPct
      const wind = row.windSpeedKph ?? row.windKph
      const estimatedEvap = estimateDailyEvaporation(row.tempC, humidity, wind)

      // 4. Consistent alert rule across all views
      const alertResult = detectPossibleAbnormalLoss(
        netWaterLost,
        estimatedEvap,
        POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY
      )

      return {
        ...row,
        prevLevel,
        levelChangeMM,
        waterLossMM,
        netWaterLost,
        estimatedEvap,
        surplusLossMM: alertResult.surplusLossMM,
        isPossibleAbnormalLoss: alertResult.isPossibleAbnormalLoss,
        status: alertResult.status,
      }
    })
  }, [visibleHistory, selectedRange])

  // Expected natural evaporation series for chart baseline
  const expectedLevels = useMemo(
    () =>
      buildExpectedLevelSeries(
        visibleHistory[0]?.levelMM ?? POOL_CONFIG.nominalLevelMM,
        visibleHistory
      ),
    [visibleHistory]
  )

  // Count consecutive alert days ending at today
  const consecutiveAlertDays = useMemo(() => {
    let count = 0
    for (let i = processedHistory.length - 1; i >= 0; i--) {
      if (processedHistory[i].isPossibleAbnormalLoss) {
        count++
      } else {
        break
      }
    }
    return count
  }, [processedHistory])

  const today = processedHistory[processedHistory.length - 1]

  const monitoringStatus = useMemo(() => {
    if (!today || today.status === 'unavailable') return 'unavailable'
    if (consecutiveAlertDays >= 3) return 'critical'
    if (consecutiveAlertDays >= 1) return 'warning'
    return 'normal'
  }, [today, consecutiveAlertDays])

  // Mathematically verified distance relative to safe & nominal operational thresholds
  const levelSubtext = useMemo(() => {
    if (!today || !Number.isFinite(today.levelMM)) return '--'
    const current = today.levelMM
    const minSafe = POOL_CONFIG.minSafeLevelMM
    const nominal = POOL_CONFIG.nominalLevelMM

    if (current < minSafe) {
      const diff = Math.round(minSafe - current)
      return `${diff} mm below minimum safe level (${minSafe} mm)`
    }
    if (current < nominal) {
      const diff = Math.round(nominal - current)
      return `${diff} mm below nominal target (${nominal} mm)`
    }
    const diff = Math.round(current - nominal)
    return diff === 0
      ? `At nominal target (${nominal} mm)`
      : `${diff} mm above nominal target (${nominal} mm)`
  }, [today])

  const nowStr = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  if (!today) return null

  return (
    <div className="leak-tracker__wrapper">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="leak-tracker__header">
        <div>
          <p className="leak-tracker__breadcrumb">
            Pool Management System · AI Monitoring
          </p>
          <h1 className="leak-tracker__title">
            💧 AI Leak &amp; Evaporation Tracker
          </h1>
          <p className="leak-tracker__subtitle">
            {POOL_CONFIG.name} &nbsp;·&nbsp; {POOL_CONFIG.location} &nbsp;·&nbsp;
            Surface area: {POOL_CONFIG.surfaceAreaM2.toLocaleString()} m²
          </p>
        </div>
        <div className="leak-tracker__header-right">
          <span className="leak-tracker__demo-badge" role="status">
            Demo Data
          </span>
          <span className="leak-tracker__timestamp">Last updated: {nowStr}</span>
        </div>
      </header>

      {/* ── Demo Notice Bar ─────────────────────────────────── */}
      <div className="leak-tracker__demo-notice" role="note">
        <span aria-hidden="true">⚠️</span>
        <span>
          <strong>DEMO MODE:</strong> All readings are simulated. The HC-SR04
          sensor, ESP32, backend API, weather service, and AI model are{' '}
          <strong>not connected</strong>. Water-loss estimates use a simplified
          illustrative formula — not a validated evaporation model or an LSTM prediction.
          Do not use for engineering or safety decisions.
        </span>
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="leak-tracker__content">

        {/* Range Selector */}
        <div className="leak-tracker__range-row">
          <span className="leak-tracker__range-label">Time Range:</span>
          {[7, 14, 30].map(r => (
            <button
              key={r}
              type="button"
              className={`leak-tracker__range-btn${
                selectedRange === r ? ' leak-tracker__range-btn--active' : ''
              }`}
              onClick={() => setSelectedRange(r)}
              aria-pressed={selectedRange === r}
            >
              {r} Days
            </button>
          ))}
        </div>

        {/* ── Stat Cards ──────────────────────────────────────── */}
        <div className="leak-tracker__stats-grid">
          <StatCard
            label="Current Water Level"
            icon="📊"
            value={fmt(today.levelMM, 0)}
            unit="mm"
            variant="primary"
            sub={levelSubtext}
          />
          <StatCard
            label="Today's Water Loss"
            icon="📉"
            value={fmt(today.waterLossMM, 1)}
            unit="mm"
            variant={today.isPossibleAbnormalLoss ? 'danger' : 'success'}
            sub={
              today.isPossibleAbnormalLoss
                ? `Change: ${fmtSigned(today.levelChangeMM, 1)} mm · Exceeds demo evaporation`
                : `Change: ${fmtSigned(today.levelChangeMM, 1)} mm · Within normal demo range`
            }
          />
          <StatCard
            label="Evaporation Estimate"
            icon="☁️"
            value={fmt(today.estimatedEvap, 1)}
            unit="mm/day"
            variant="warning"
            sub={`Illustrative Demo Formula (${MODEL_CONSTANTS.MODEL_LABEL})`}
          />
          <StatCard
            label="Monitoring Status"
            icon="🔔"
            value={
              monitoringStatus === 'critical' ? 'Critical (Demo)' :
              monitoringStatus === 'warning' ? 'Warning (Demo)' :
              monitoringStatus === 'unavailable' ? 'Unavailable' :
              'Normal (Demo)'
            }
            variant={
              monitoringStatus === 'critical' ? 'danger' :
              monitoringStatus === 'warning' ? 'warning' :
              monitoringStatus === 'unavailable' ? 'offline' : 'success'
            }
            sub={
              monitoringStatus === 'critical'
                ? `${consecutiveAlertDays} consecutive days with simulated surplus loss > ${POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY} mm/day`
                : monitoringStatus === 'warning'
                ? `${consecutiveAlertDays} day(s) with simulated surplus loss > ${POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY} mm/day`
                : monitoringStatus === 'unavailable'
                ? 'Demo calculation unavailable'
                : `Simulated loss within normal demo range (≤ ${POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY} mm/day surplus)`
            }
          />
        </div>

        {/* ── Alert Banner (rendered if abnormal loss detected) ── */}
        {consecutiveAlertDays > 0 && monitoringStatus !== 'normal' && (
          <AlertBanner
            consecutiveDays={consecutiveAlertDays}
            surplusToday={today.surplusLossMM}
            status={monitoringStatus}
            threshold={POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY}
          />
        )}

        {/* ── Water Level Trend Chart ─────────────────────────── */}
        <div className="leak-tracker__chart-section">
          <div className="leak-tracker__section-header">
            <h3 className="leak-tracker__section-title">
              <span aria-hidden="true">📈</span>
              Water Level Trend — Last {selectedRange} Days
            </h3>
            <div className="leak-tracker__chart-legend" aria-label="Chart legend">
              <span className="leak-tracker__legend-item">
                <span className="leak-tracker__legend-swatch leak-tracker__legend-swatch--actual" />
                Actual Level
              </span>
              <span className="leak-tracker__legend-item">
                <span className="leak-tracker__legend-swatch leak-tracker__legend-swatch--expected" />
                Expected Baseline (Evap Only)
              </span>
              <span className="leak-tracker__legend-item">
                <span className="leak-tracker__legend-swatch leak-tracker__legend-swatch--nominal" />
                Nominal ({POOL_CONFIG.nominalLevelMM} mm)
              </span>
              <span className="leak-tracker__legend-item">
                <span className="leak-tracker__legend-swatch leak-tracker__legend-swatch--minsafe" />
                Min Safe ({POOL_CONFIG.minSafeLevelMM} mm)
              </span>
            </div>
          </div>
          <WaterLevelChart
            processedHistory={processedHistory}
            expectedLevels={expectedLevels}
            config={POOL_CONFIG}
          />
        </div>

        {/* ── Info Grid: Weather + Connection Status ──────────── */}
        <div className="leak-tracker__info-grid">
          <WeatherCard current={today} />
          <StatusCard
            consecutiveAlertDays={consecutiveAlertDays}
            status={monitoringStatus}
            config={POOL_CONFIG}
          />
        </div>

        {/* ── History Table ────────────────────────────────────── */}
        <div className="leak-tracker__table-section">
          <HistoryTable rows={processedHistory} />
        </div>

      </main>

      {/* ── Footer Disclaimer ────────────────────────────────── */}
      <footer className="leak-tracker__footer">
        <span className="leak-tracker__footer-icon" aria-hidden="true">ℹ️</span>
        <span>
          <strong>Phase 1 Demo Disclaimer:</strong> All values are simulated.
          Water-loss estimates use &ldquo;{MODEL_CONSTANTS.MODEL_LABEL}&rdquo; with
          illustrative coefficients. This is <em>not</em> a scientifically validated
          physical model and does not confirm a physical leak. Threshold is configured in{' '}
          <code>demoData.js → POOL_CONFIG.LEAK_THRESHOLD_MM_PER_DAY</code>.
          Phase 2 will integrate live HC-SR04 readings via ESP32. Phase 3 will connect a live weather API.
          Phase 4 will train and serve an ML model via <code>ml-service/main.py</code>.
        </span>
      </footer>

    </div>
  )
}
