import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  fetchLatest,
  fetchForecast,
  fetchHealth,
  triggerForecastRefresh,
} from './services/poolOrchestratorApi'
import {
  format12HourTime,
  formatSlotLabel,
  formatRelativeTime,
  getCurrentColomboTimeString,
} from './utils/poolOrchestratorTimeUtils'
import PoolOrchestratorSettings from './PoolOrchestratorSettings'
import PoolOrchestratorWhatsAppChat from './PoolOrchestratorWhatsAppChat'
import './PoolOrchestrator.css'

const POLLING_INTERVAL_MS = 20000 // 20-second automatic polling

function getWeatherIcon(category) {
  switch (category) {
    case 'Rainy': return '🌧'
    case 'Cloudy': return '☁'
    case 'Sunny': return '☀'
    default: return '🌤'
  }
}

export default function PoolOrchestrator() {
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'settings'
  const [latestData, setLatestData] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [healthData, setHealthData] = useState(null)
  const [currentTimeStr, setCurrentTimeStr] = useState(getCurrentColomboTimeString())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionNotice, setActionNotice] = useState(null)
  const [error, setError] = useState(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)

  // Update live clock every 30 seconds
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTimeStr(getCurrentColomboTimeString())
    }, 30000)
    return () => clearInterval(clockTimer)
  }, [])

  const loadData = useCallback(async (signal) => {
    try {
      const [healthRes, latestRes, forecastRes] = await Promise.all([
        fetchHealth(signal).catch((err) => ({ status: 'unavailable', error: err.message })),
        fetchLatest(signal).catch((err) => {
          console.warn('Could not fetch latest operational state:', err.message)
          return null
        }),
        fetchForecast(signal).catch((err) => {
          console.warn('Could not fetch forecast predictions:', err.message)
          return null
        }),
      ])

      setHealthData(healthRes)
      if (latestRes) {
        setLatestData(latestRes)
      }
      if (forecastRes) setForecastData(forecastRes)

      setError(null)
      setLastRefreshedAt(new Date())
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to connect to backend server')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const executeLoad = async () => {
      await loadData(controller.signal)
    }
    executeLoad()

    const intervalId = setInterval(() => {
      loadData(controller.signal)
    }, POLLING_INTERVAL_MS)

    return () => {
      controller.abort()
      clearInterval(intervalId)
    }
  }, [loadData])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    setActionNotice(null)
    try {
      if (healthData?.weather?.configured) {
        await triggerForecastRefresh()
        setActionNotice('Forecast refreshed from Open-Meteo and ML pipeline.')
      }
      await loadData()
    } catch (err) {
      setActionNotice(`Refresh notice: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  // Derived state & operational metrics
  const settings = latestData?.settings || forecastData?.settings || null
  const facilityName = settings?.pool_name || latestData?.facilityName || healthData?.facilityName || 'Aquatic Centre Main Pool'
  const currentOccupancy = latestData?.occupancy?.occupancy_count ?? null
  const latestSensor = latestData?.reading ?? null
  const filtrationEvent = latestData?.filtration ?? null
  const bulbRecommendation = latestData?.bulbRecommendation ?? null

  const lowDemandMax = settings?.low_demand_max ?? 15
  const modDemandMax = settings?.moderate_demand_max ?? 30
  const highDemandMax = settings?.high_demand_max ?? 45

  // Automatically light bulbs according to current occupancy using configured thresholds:
  // <lowDemandMax -> 1 Bulb, lowDemandMax-modDemandMax -> 2 Bulbs, modDemandMax-highDemandMax -> 3 Bulbs, >highDemandMax -> 4 Bulbs
  const activeBulbCount = useMemo(() => {
    const occ = currentOccupancy ?? latestSensor?.swimmer_count ?? null
    if (occ !== null && !isNaN(occ)) {
      if (occ > highDemandMax) return 4
      if (occ > modDemandMax) return 3
      if (occ >= lowDemandMax) return 2
      return 1
    }
    return bulbRecommendation?.bulbs ?? 1
  }, [currentOccupancy, latestSensor, bulbRecommendation, lowDemandMax, modDemandMax, highDemandMax])

  const predictions = useMemo(() => forecastData?.predictions || [], [forecastData])
  const resourcePlan = useMemo(() => latestData?.resourcePlan || forecastData?.resourcePlan || null, [latestData, forecastData])
  const planRows = useMemo(() => resourcePlan?.planRows || [], [resourcePlan])
  const managerActions = useMemo(() => resourcePlan?.managerActions || [], [resourcePlan])

  // Peak forecast calculation
  const peakPrediction = useMemo(() => {
    if (predictions.length === 0) return null
    return predictions.reduce((prev, curr) =>
      Number(curr.predicted_swimmers) > Number(prev.predicted_swimmers) ? curr : prev
    )
  }, [predictions])

  const peakSwimmers = peakPrediction ? Math.round(Number(peakPrediction.predicted_swimmers)) : null
  const peakTime12Hour = peakPrediction ? formatSlotLabel(peakPrediction.target_time) : '--'

  const occupancyDeltaText = useMemo(() => {
    if (peakSwimmers === null || currentOccupancy === null) return null
    const diff = peakSwimmers - currentOccupancy
    if (diff > 0) return `+${diff} above current`
    if (diff < 0) return `${diff} below current`
    return 'Consistent with current'
  }, [peakSwimmers, currentOccupancy])

  // Weather & Rain status derivation
  const weatherConfigured = healthData?.weather?.configured ?? forecastData?.weatherConfigured ?? false

  const { weatherDisplayValue, weatherDetailText } = useMemo(() => {
    if (latestSensor && latestSensor.rain_detected === true) {
      const tempPart = latestSensor.temperature_c ? `${latestSensor.temperature_c}°C · ` : ''
      return {
        weatherDisplayValue: 'Rain Detected',
        weatherDetailText: `${tempPart}ESP32 rain sensor active`,
      }
    }
    if (predictions.length > 0 && predictions[0]?.input_features?.weather) {
      const currentFeat = predictions[0].input_features
      const temp = currentFeat.weather_details?.temperatureC
      const tempText = temp ? `${temp}°C · ` : ''
      return {
        weatherDisplayValue: currentFeat.weather,
        weatherDetailText: `${tempText}${currentFeat.weather_details?.description || 'Open-Meteo observation'}`,
      }
    }
    if (!weatherConfigured) {
      return {
        weatherDisplayValue: 'Setup Needed',
        weatherDetailText: 'Configure POOL_LATITUDE in server/.env',
      }
    }
    return {
      weatherDisplayValue: 'Fair / Clear',
      weatherDetailText: 'No precipitation detected',
    }
  }, [latestSensor, predictions, weatherConfigured])

  // Filtration status, occupancy tier, and operational detail
  const { filtrationStateName, occupancyTierRange, filtrationDetailText } = useMemo(() => {
    const occ = currentOccupancy ?? 0
    let stateName = 'Low'
    let tierRange = `< ${lowDemandMax} swimmers`

    if (occ > highDemandMax) {
      stateName = 'Very High'
      tierRange = `> ${highDemandMax} swimmers`
    } else if (occ > modDemandMax) {
      stateName = 'High'
      tierRange = `${modDemandMax + 1}–${highDemandMax} swimmers`
    } else if (occ >= lowDemandMax) {
      stateName = 'Moderate'
      tierRange = `${lowDemandMax}–${modDemandMax} swimmers`
    }

    const detail = currentOccupancy !== null
      ? `Auto-regulated for ${occ} swimmers (${tierRange})`
      : 'Auto load-based baseline circulation'

    return {
      filtrationStateName: stateName,
      occupancyTierRange: tierRange,
      filtrationDetailText: detail,
    }
  }, [currentOccupancy, lowDemandMax, modDemandMax, highDemandMax])

  // Chart data normalization
  const chartData = useMemo(() => {
    if (predictions.length === 0) return []
    const seenTimes = new Set()
    const uniqueList = []

    for (const pred of predictions) {
      const time = format12HourTime(pred.target_time)
      if (seenTimes.has(time)) continue
      seenTimes.add(time)

      const feat = pred.input_features || {}
      const swimmers = Math.round(Number(pred.predicted_swimmers) || 0)
      const rawSwimmers = Number(pred.predicted_swimmers) || 0
      const weather = feat.weather || (feat.rain ? 'Rainy' : 'Sunny')

      let dynamicDemand = 'Low'
      if (swimmers > highDemandMax) dynamicDemand = 'Very High'
      else if (swimmers > modDemandMax) dynamicDemand = 'High'
      else if (swimmers >= lowDemandMax) dynamicDemand = 'Moderate'

      uniqueList.push({
        id: pred.id || pred.target_time,
        time,
        fullLabel: formatSlotLabel(pred.target_time),
        swimmers,
        rawSwimmers,
        demand: dynamicDemand,
        weather,
        rain: feat.rain === 1,
        weatherDesc: feat.weather_details?.description || '',
      })
    }
    return uniqueList
  }, [predictions])

  const maxChartValue = useMemo(() => {
    if (chartData.length === 0) return 40
    const maxVal = Math.max(...chartData.map((d) => d.swimmers))
    return Math.max(40, Math.ceil((maxVal + 5) / 10) * 10)
  }, [chartData])

  const chartScaleSteps = useMemo(() => {
    const step = maxChartValue / 4
    return [maxChartValue, step * 3, step * 2, step, 0]
  }, [maxChartValue])

  // Backend connection status indicators
  const isOnline = healthData && (healthData.status === 'healthy' || healthData.status === 'ok')
  const statusClass = !isOnline ? 'offline' : (!weatherConfigured ? 'pending' : 'online')
  const statusText = !isOnline
    ? 'Backend Offline'
    : (!weatherConfigured ? 'Coordinates Setup Needed' : 'System Connected')

  return (
    <main className="pool-orchestrator">
      {/* ================= Compact Operations Topbar ================= */}
      <header className="po-topbar">
        <div className="po-title-group">
          <p className="po-breadcrumb">POOL RESOURCE ORCHESTRATOR / DECISION SUPPORT</p>
          <div className="po-heading-row">
            <h1>{facilityName}</h1>
            <span className="po-facility-badge">Facility ID: POOL-01</span>
          </div>
          <div className="po-clock-display" aria-label="Current pool local time in Asia/Colombo">
            🕒 {currentTimeStr} (Asia/Colombo)
          </div>
        </div>

        <div className="po-topbar-actions">
          <button
            className="po-refresh-button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Poll latest sensors and refresh forecast"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh data'}
          </button>

          <span className="po-status">
            <span className={`po-status-dot ${statusClass}`} />
            {statusText}
          </span>
        </div>
      </header>

      {/* ================= Navigation Tabs (Dashboard vs Settings) ================= */}
      <nav className="po-nav-tabs" aria-label="Module Navigation">
        <button
          type="button"
          className={`po-nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Operational Dashboard
        </button>
        <button
          type="button"
          className={`po-nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Manager Settings
        </button>
      </nav>

      {/* ================= Operational Notices & Warnings ================= */}
      {error && (
        <div className="po-alert-banner warning">
          <span>⚠ {error}</span>
          <button className="po-refresh-button" onClick={() => loadData()}>Retry</button>
        </div>
      )}

      {actionNotice && (
        <div className="po-alert-banner">
          <span>ⓘ {actionNotice}</span>
          <button className="po-refresh-button" onClick={() => setActionNotice(null)}>Dismiss</button>
        </div>
      )}

      {activeTab === 'settings' ? (
        <PoolOrchestratorSettings
          onBackToDashboard={() => setActiveTab('dashboard')}
          onSettingsApplied={(newSettings) => {
            loadData()
            setActionNotice(`Manager settings applied for "${newSettings.pool_name || 'facility'}". Demand levels and operational thresholds updated.`)
            setActiveTab('dashboard')
          }}
        />
      ) : (
        <>
          {!weatherConfigured && isOnline && (
            <div className="po-alert-banner warning">
              <span>
                📍 <strong>Coordinates Configuration Needed:</strong> Set <code>POOL_LATITUDE</code> and <code>POOL_LONGITUDE</code> in <code>server/.env</code> to activate live Open-Meteo forecasts.
              </span>
            </div>
          )}

          {/* ================= Current Operations KPI Summary ================= */}
          <section aria-labelledby="kpi-heading">
        <div className="po-section-heading">
          <h2 id="kpi-heading">Current Operations Overview</h2>
          <span className="po-section-subtitle">
            {lastRefreshedAt ? `Last updated ${format12HourTime(lastRefreshedAt)}` : 'Connecting to backend...'}
          </span>
        </div>

        <div className="po-metrics-grid">
          {/* 1. Current Occupancy */}
          <article className="po-metric-card">
            <div className="po-metric-header">
              <span className="po-metric-title">Current Occupancy</span>
              <div className="po-metric-icon blue">◉</div>
            </div>
            <div className="po-metric-main">
              <span className="po-metric-value">{currentOccupancy !== null ? currentOccupancy : '--'}</span>
              <span className="po-metric-unit">swimmers</span>
            </div>
            <p className="po-metric-detail">
              {currentOccupancy !== null && latestSensor?.recorded_at
                ? `Measured at ${format12HourTime(latestSensor.recorded_at)} (${formatRelativeTime(latestSensor.recorded_at)})`
                : 'Awaiting sensor observation'}
            </p>
          </article>

          {/* 2. Predicted Peak */}
          <article className="po-metric-card">
            <div className="po-metric-header">
              <span className="po-metric-title">Peak 6h Demand</span>
              <div className="po-metric-icon purple">↗</div>
            </div>
            <div className="po-metric-main">
              <span className="po-metric-value">{peakSwimmers !== null ? peakSwimmers : '--'}</span>
              {occupancyDeltaText && <span className="po-metric-delta">{occupancyDeltaText}</span>}
            </div>
            <p className="po-metric-detail">
              {peakPrediction ? `Peak expected at ${peakTime12Hour}` : 'No forecast data'}
            </p>
          </article>

          {/* 3. Weather Conditions */}
          <article className="po-metric-card">
            <div className="po-metric-header">
              <span className="po-metric-title">Weather & Rain</span>
              <div className="po-metric-icon amber">☁</div>
            </div>
            <div className="po-metric-main">
              <span className="po-metric-value">{weatherDisplayValue}</span>
            </div>
            <p className="po-metric-detail">{weatherDetailText}</p>
          </article>

          {/* 4. Filtration Relay Board */}
          <article className="po-metric-card">
            <div className="po-metric-header">
              <span className="po-metric-title">Filtration Relay Board</span>
              <div className="po-metric-icon green">⟳</div>
            </div>

            <div className="po-metric-main">
              <span className="po-metric-value">{filtrationStateName}</span>
              <span className="po-metric-unit">Load</span>
            </div>

            {/* Compact Bulb Status Strip Underneath Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '2px 0 6px 0' }}>
              {[1, 2, 3, 4].map((bulbNum) => {
                const isLit = bulbNum <= activeBulbCount
                return (
                  <span
                    key={bulbNum}
                    title={`Bulb / Relay ${bulbNum} (${isLit ? 'ON' : 'OFF'})`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      fontSize: '11px',
                      backgroundColor: isLit ? '#fef08a' : '#f8fafc',
                      border: isLit ? '1.5px solid #eab308' : '1px solid #cbd5e1',
                      boxShadow: isLit ? '0 0 6px rgba(234, 179, 8, 0.65)' : 'none',
                      transition: 'all 0.2s ease',
                      opacity: isLit ? 1 : 0.35,
                    }}
                  >
                    💡
                  </span>
                )
              })}
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginLeft: '4px' }}>
                {activeBulbCount} of 4 bulbs active
              </span>
            </div>

            <p className="po-metric-detail">{filtrationDetailText}</p>
          </article>
        </div>
      </section>

      {/* ================= Six-Hour Demand Forecast Section ================= */}
      <section className="po-panel" aria-labelledby="forecast-heading">
        <div className="po-panel-header">
          <div>
            <h2 id="forecast-heading">Six-Hour Swimmer Demand Forecast</h2>
            <p className="po-panel-subtitle">
              Predictive occupancy model projecting hourly bather demand in 12-hour Asia/Colombo local time
            </p>
          </div>
          <span className="po-badge blue">NEXT 6 HOURS</span>
        </div>

        {loading ? (
          <div className="po-empty-chart">
            <p>Loading machine learning forecast projections...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="po-empty-chart">
            <p>No active predictions found for the upcoming 6-hour window.</p>
            <button
              className="po-retry-button"
              onClick={handleManualRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Generating Forecast…' : 'Generate 6-Hour Forecast'}
            </button>
          </div>
        ) : (
          <>
            {/* Visual Bar Chart */}
            <div className="po-chart" role="region" aria-label="Hourly swimmer demand chart">
              <div className="po-chart-scale" aria-hidden="true">
                {chartScaleSteps.map((val) => (
                  <span key={val}>{val}</span>
                ))}
              </div>

              <div className="po-chart-content">
                <div className="po-grid-lines" aria-hidden="true">
                  {chartScaleSteps.map((val) => (
                    <span key={val} />
                  ))}
                </div>

                <div className="po-bars">
                  {chartData.map((item) => (
                    <div className="po-bar-column" key={item.id}>
                      <span className="po-bar-value">{item.swimmers}</span>

                      <div
                        className="po-bar-track"
                        role="img"
                        aria-label={`${item.fullLabel}: ${item.rawSwimmers.toFixed(1)} predicted swimmers (${item.demand} demand, ${item.weather})`}
                      >
                        <div
                          className={`po-bar ${item.demand.toLowerCase()}`}
                          style={{
                            height: `${Math.min(100, (item.swimmers / maxChartValue) * 100)}%`,
                          }}
                        />
                      </div>

                      <span className="po-bar-time">{item.time}</span>
                      <span className="po-bar-weather" title={`${item.weather} (${item.weatherDesc})`}>
                        {getWeatherIcon(item.weather)} {item.weather}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="po-chart-legend">
              <span><i className="legend-low" /> Low Demand (&lt;{lowDemandMax} swimmers)</span>
              <span><i className="legend-moderate" /> Moderate Demand ({lowDemandMax}–{modDemandMax} swimmers)</span>
              <span><i className="legend-high" /> High Demand (&gt;{modDemandMax} swimmers)</span>
            </div>

            {/* Accessible Tabular Forecast View */}
            <div className="po-table-container">
              <table className="po-data-table" aria-label="Hourly swimmer demand details">
                <thead>
                  <tr>
                    <th>Time Slot</th>
                    <th>Expected Swimmers</th>
                    <th>Demand Level</th>
                    <th>Weather Condition</th>
                    <th>Precipitation</th>
                    <th>Staffing Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.fullLabel}</strong></td>
                      <td>{item.swimmers} swimmers</td>
                      <td>
                        <span className={`po-cell-tag ${item.demand.toLowerCase()}`}>
                          {item.demand}
                        </span>
                      </td>
                      <td>{getWeatherIcon(item.weather)} {item.weather}</td>
                      <td>{item.rain ? '🌧 Rain Indicated' : 'Dry'}</td>
                      <td>{item.demand === 'High' ? 'Station backup lifeguard' : 'Standard roster'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="po-chart-legend" style={{ marginTop: '14px', borderTop: 'none', color: '#64748b', fontSize: '11px' }}>
          <span>
            ⓘ <strong>Model Metadata:</strong> Trained Scikit-Learn 1.6.1 Pipeline (RandomForestRegressor). Whole-person counts rounded for operational scheduling. Empirical confidence bounds pending historical calibration dataset.
          </span>
        </div>
      </section>

      {/* ================= Operational Resource Plan Table ================= */}
      <section className="po-panel" aria-labelledby="plan-heading">
        <div className="po-panel-header">
          <div>
            <h2 id="plan-heading">Operational Resource Plan (Next 6 Hours)</h2>
            <p className="po-panel-subtitle">
              Time-slot-based operational resource schedule combining staffing ratios, circulation windows, and routine tasks
            </p>
          </div>
          <span className="po-badge green">OPERATIONAL SCHEDULE</span>
        </div>

        {planRows.length === 0 ? (
          <div className="po-empty-chart">
            <p>Resource planning schedule will appear after generating 6-hour forecast.</p>
          </div>
        ) : (
          <div className="po-table-container">
            <table className="po-data-table po-plan-table" aria-label="Operational resource planning schedule">
              <thead>
                <tr>
                  <th>Time Slot</th>
                  <th>Expected Swimmers</th>
                  <th>Recommended Staff</th>
                  <th>Filtration Recommendation</th>
                  <th>Maintenance &amp; Deck Tasks</th>
                  <th>Operational Rationale</th>
                </tr>
              </thead>
              <tbody>
                {planRows.map((row) => (
                  <tr key={row.slotIndex}>
                    <td>
                      <strong>{row.timeLabel}</strong>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{row.day}</div>
                    </td>
                    <td>
                      <strong>{row.expectedSwimmers}</strong> swimmers
                      <div>
                        <span className={`po-cell-tag ${row.demandLevel.toLowerCase()}`}>
                          {row.demandLevel}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="po-staff-pill">
                        👥 {row.staffing.summary}
                      </span>
                    </td>
                    <td>
                      <span className={`po-filtration-pill ${row.filtration.requiresApproval ? 'approval' : ''}`}>
                        {row.filtration.bulbs ? '💡'.repeat(row.filtration.bulbs) + ' ' : '⟳ '}
                        {row.filtration.recommendation}
                        {row.filtration.requiresApproval && ' (Approval Req)'}
                      </span>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        {row.filtration.executionStatus}
                      </div>
                    </td>
                    <td>
                      <span className="po-maintenance-pill">
                        📋 {row.maintenance.taskName}
                      </span>
                    </td>
                    <td>
                      <div className="po-rationale-text">{row.rationale}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================= Prioritized Manager Action List ================= */}
      <section className="po-panel" aria-labelledby="actions-heading">
        <div className="po-panel-header">
          <div>
            <h2 id="actions-heading">Prioritized Manager Action List</h2>
            <p className="po-panel-subtitle">
              Concise operational decisions and follow-ups recommended by real-time data and configured policies
            </p>
          </div>
          <span className="po-badge amber">ACTIONABLE ITEMS</span>
        </div>

        {managerActions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '12px' }}>No pending action items identified at this time.</p>
        ) : (
          <div className="po-actions-grid">
            {managerActions.map((act) => (
              <article className={`po-action-card ${act.priority.toLowerCase()}`} key={act.id}>
                <div>
                  <div className="po-action-header">
                    <span className={`po-action-priority ${act.priority.toLowerCase()}`}>
                      {act.priority} Priority
                    </span>
                    <span className="po-action-time">{act.timeframe}</span>
                  </div>
                  <h3 className="po-action-title">{act.title}</h3>
                  <p className="po-action-desc">{act.description}</p>
                </div>

                <div className="po-action-footer">
                  <span>Source: {act.source}</span>
                  <span className={`po-action-status-tag ${act.status === 'Action Required' ? 'urgent' : ''}`}>
                    {act.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ================= Data Quality & System Diagnostics ================= */}
      <section className="po-panel" aria-labelledby="diag-heading">
        <div className="po-panel-header">
          <div>
            <h2 id="diag-heading">Data Quality &amp; System Telemetry</h2>
            <p className="po-panel-subtitle">
              Real-time connectivity and telemetry status across backend services, Supabase PostgreSQL, and ML models
            </p>
          </div>
          <span className="po-badge blue">SYSTEM DIAGNOSTICS</span>
        </div>

        <div className="po-diagnostics-grid">
          {/* Sensor Freshness */}
          <div className="po-diag-card">
            <h4 className="po-diag-title">ESP32 Sensor Telemetry</h4>
            <div className="po-diag-status">
              <span className={`po-status-dot ${latestSensor ? 'online' : 'pending'}`} />
              {latestSensor ? 'Active Observation' : 'Awaiting Sensor Telemetry'}
            </div>
            <p className="po-diag-meta">
              {latestSensor?.recorded_at
                ? `Node: ${latestSensor.sensor_id} · ${format12HourTime(latestSensor.recorded_at)}`
                : 'No sensor packet recorded'}
            </p>
          </div>

          {/* Database Connectivity */}
          <div className="po-diag-card">
            <h4 className="po-diag-title">Supabase Database</h4>
            <div className="po-diag-status">
              <span className={`po-status-dot ${healthData?.database?.connected ? 'online' : 'offline'}`} />
              {healthData?.database?.connected ? 'PostgreSQL Connected' : 'Disconnected'}
            </div>
            <p className="po-diag-meta">
              Schema: public · SSL Connection Pooler
            </p>
          </div>

          {/* ML Model Inference */}
          <div className="po-diag-card">
            <h4 className="po-diag-title">ML Inference Engine</h4>
            <div className="po-diag-status">
              <span className={`po-status-dot ${healthData?.mlService?.model_loaded ? 'online' : 'offline'}`} />
              {healthData?.mlService?.model_loaded ? 'Pipeline Active (Port 8000)' : 'Model Unavailable'}
            </div>
            <p className="po-diag-meta">
              Model: {healthData?.mlService?.model_version || 'v1.0.0'} · Auto-retrain: every 100 hrs
            </p>
          </div>

          {/* Weather API Freshness */}
          <div className="po-diag-card">
            <h4 className="po-diag-title">Open-Meteo Weather API</h4>
            <div className="po-diag-status">
              <span className={`po-status-dot ${weatherConfigured ? 'online' : 'pending'}`} />
              {weatherConfigured ? 'Live Hourly Forecast' : 'Coordinates Unconfigured'}
            </div>
            <p className="po-diag-meta">
              {weatherConfigured ? 'Cache: 15min TTL · Asia/Colombo' : 'Set POOL_LATITUDE in server/.env'}
            </p>
          </div>

          {/* MQTT Broker Gateway */}
          <div className="po-diag-card">
            <h4 className="po-diag-title">HiveMQ MQTT Gateway</h4>
            <div className="po-diag-status">
              <span className={`po-status-dot ${healthData?.mqtt?.connected ? 'online' : 'offline'}`} />
              {healthData?.mqtt?.connected ? 'Broker Connected' : 'Connecting to Broker…'}
            </div>
            <p className="po-diag-meta">
              {healthData?.mqtt?.messagesReceived !== undefined
                ? `Packets: ${healthData.mqtt.messagesReceived} · Topic: ${healthData.mqtt.sensorTopic || 'sensors'}`
                : 'broker.hivemq.com:1883'}
            </p>
          </div>
        </div>
      </section>
      </>
      )}

      {/* ================= Footer ================= */}
      <footer className="po-footer">
        <div>
          <strong>Pool Resource Orchestrator</strong> · AI-Powered Pool Operations &amp; Resource Planning
        </div>
        <div>
          <span>Timezone: Asia/Colombo</span> · <span>12-Hour Operational Standard</span>
        </div>
      </footer>

      {/* Floating WhatsApp Customer Chat Manager Widget */}
      <PoolOrchestratorWhatsAppChat />
    </main>
  )
}
