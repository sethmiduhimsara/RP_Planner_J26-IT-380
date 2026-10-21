import { useState, useEffect } from 'react'
import { fetchSettings, saveSettings } from './services/poolOrchestratorApi'

const PRESETS = [
  {
    id: 'boutique',
    name: 'Small / Hotel / Therapy Pool',
    category: 'Boutique Facility',
    description: 'Designed for boutique hotels, wellness centers, or hydrotherapy pools with lower swimmer volumes (Max ~30 bathers).',
    values: {
      low_demand_max: 8,
      moderate_demand_max: 18,
      high_demand_max: 28,
      swimmer_to_lifeguard_ratio: 15,
      min_lifeguards: 1,
      min_operational_staff: 1,
    },
  },
  {
    id: 'community',
    name: 'Standard Community / Club Pool',
    category: 'Community Standard',
    description: 'Standard 25m recreational or athletic club pool accommodating regular public swimming sessions (Max ~50–60 bathers).',
    values: {
      low_demand_max: 15,
      moderate_demand_max: 30,
      high_demand_max: 45,
      swimmer_to_lifeguard_ratio: 20,
      min_lifeguards: 1,
      min_operational_staff: 1,
    },
  },
  {
    id: 'olympic',
    name: 'Olympic / Aquatic Stadium',
    category: 'High-Capacity Stadium',
    description: 'Full 50m competition venue, waterpark, or multi-lane municipal stadium with heavy bather throughput (Max 100+ bathers).',
    values: {
      low_demand_max: 30,
      moderate_demand_max: 65,
      high_demand_max: 100,
      swimmer_to_lifeguard_ratio: 25,
      min_lifeguards: 2,
      min_operational_staff: 2,
    },
  },
]

function PresetIcon({ id }) {
  if (id === 'boutique') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      </svg>
    )
  }
  if (id === 'community') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    )
  }
  // Olympic
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  )
}

export default function PoolOrchestratorSettings({ onBackToDashboard, onSettingsApplied }) {
  const [formData, setFormData] = useState({
    pool_name: 'Colombo Aquatic Centre Main Pool',
    low_demand_max: 15,
    moderate_demand_max: 30,
    high_demand_max: 45,
    swimmer_to_lifeguard_ratio: 20,
    min_lifeguards: 1,
    min_operational_staff: 1,
    opening_hour: 6,
    closing_hour: 22,
    auto_retrain_interval: 100,
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [validationError, setValidationError] = useState(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const data = await fetchSettings()
        if (isMounted && data) {
          setFormData({
            pool_name: data.pool_name || 'Colombo Aquatic Centre Main Pool',
            low_demand_max: data.low_demand_max ?? 15,
            moderate_demand_max: data.moderate_demand_max ?? 30,
            high_demand_max: data.high_demand_max ?? 45,
            swimmer_to_lifeguard_ratio: data.swimmer_to_lifeguard_ratio ?? 20,
            min_lifeguards: data.min_lifeguards ?? 1,
            min_operational_staff: data.min_operational_staff ?? 1,
            opening_hour: data.opening_hour ?? 6,
            closing_hour: data.closing_hour ?? 22,
            auto_retrain_interval: data.auto_retrain_interval ?? 100,
          })
        }
      } catch (err) {
        console.warn('Could not load current settings from server:', err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  const handleChange = (field, value) => {
    setFeedback(null)
    setValidationError(null)
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const applyPreset = (preset) => {
    setFeedback(null)
    setValidationError(null)
    setFormData((prev) => ({
      ...prev,
      ...preset.values,
    }))
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setFeedback(null)
    setValidationError(null)

    // Validation
    const low = parseInt(formData.low_demand_max, 10)
    const mod = parseInt(formData.moderate_demand_max, 10)
    const high = parseInt(formData.high_demand_max, 10)

    if (isNaN(low) || isNaN(mod) || isNaN(high)) {
      setValidationError('All demand limit thresholds must be valid numbers.')
      setSaving(false)
      return
    }

    if (low >= mod) {
      setValidationError(`Low Demand Limit (${low}) must be strictly less than Moderate Demand Limit (${mod}).`)
      setSaving(false)
      return
    }

    if (mod >= high) {
      setValidationError(`Moderate Demand Limit (${mod}) must be strictly less than High Demand Limit (${high}).`)
      setSaving(false)
      return
    }

    try {
      const result = await saveSettings({
        ...formData,
        low_demand_max: low,
        moderate_demand_max: mod,
        high_demand_max: high,
        swimmer_to_lifeguard_ratio: parseInt(formData.swimmer_to_lifeguard_ratio, 10) || 20,
        min_lifeguards: parseInt(formData.min_lifeguards, 10) || 1,
        min_operational_staff: parseInt(formData.min_operational_staff, 10) || 1,
        opening_hour: parseInt(formData.opening_hour, 10) || 6,
        closing_hour: parseInt(formData.closing_hour, 10) || 22,
        auto_retrain_interval: parseInt(formData.auto_retrain_interval, 10) || 100,
      })

      setFeedback({
        type: 'success',
        message: 'Settings successfully applied! Operational thresholds, filtration relay actuation bands, and forecasting models updated.',
      })

      if (onSettingsApplied) {
        onSettingsApplied(result.settings || formData)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save settings. Please check server connection.',
      })
    } finally {
      setSaving(false)
    }
  }

  const lowVal = parseInt(formData.low_demand_max, 10) || 15
  const modVal = parseInt(formData.moderate_demand_max, 10) || 30
  const highVal = parseInt(formData.high_demand_max, 10) || 45

  return (
    <div className="po-settings-page">
      {/* Top Banner Navigation */}
      <div className="po-settings-header">
        <div className="po-settings-header-left">
          <button className="po-btn-back" onClick={onBackToDashboard} title="Back to Operations Dashboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Dashboard</span>
          </button>
          <h1 className="po-settings-title">Manager Operational Settings</h1>
          <p className="po-settings-subtitle">
            Configure custom swimmer demand limits, 4-stage filtration relay actuation bands, and facility safety policies
            suited to your pool volume and bather density.
          </p>
        </div>
        <div className="po-settings-badge">
          <span>FACILITY CONFIGURATION</span>
        </div>
      </div>

      {feedback && (
        <div className={`po-settings-alert ${feedback.type}`}>
          <div className="po-alert-content">
            {feedback.type === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {validationError && (
        <div className="po-settings-alert error">
          <div className="po-alert-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{validationError}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="po-loading-state">
          <div className="po-inline-spinner" />
          <p>Loading operational settings from database...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="po-settings-form">
          {/* Section 1: Quick Presets */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Facility Size Templates</h3>
              <p>Choose an operational profile matching your swimming pool scale and bather throughput:</p>
            </div>
            <div className="po-preset-grid">
              {PRESETS.map((p) => (
                <div key={p.id} className="po-preset-card">
                  <div className="po-preset-top">
                    <div className="po-preset-icon-wrap">
                      <PresetIcon id={p.id} />
                    </div>
                    <span className="po-preset-category">{p.category}</span>
                  </div>
                  <h4>{p.name}</h4>
                  <p>{p.description}</p>
                  <div className="po-preset-tags">
                    <span>Low: &lt;{p.values.low_demand_max}</span>
                    <span>Mod: {p.values.low_demand_max}–{p.values.moderate_demand_max}</span>
                    <span>High: &gt;{p.values.moderate_demand_max}</span>
                  </div>
                  <button
                    type="button"
                    className="po-btn-preset"
                    onClick={() => applyPreset(p)}
                  >
                    Apply Template
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Swimmer Demand & Relay Actuation Thresholds */}
          <section className="po-settings-card highlight">
            <div className="po-card-head">
              <h3>Swimmer Demand &amp; Relay Actuation Thresholds</h3>
              <p>
                Define the swimmer thresholds that classify bather density and actuate the corresponding
                stages of the 4-channel filtration relay board:
              </p>
            </div>

            <div className="po-thresholds-grid">
              {/* Stage 1: Low Demand */}
              <div className="po-threshold-box low">
                <div className="po-th-card-header">
                  <div className="po-th-header-top">
                    <span className="po-th-stage-pill low">Stage 1</span>
                    <div className="po-th-relay-indicator" title="1 of 4 Relays Energized (Eco Circulation)">
                      <span className="po-relay-led active" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led-text">1 Bulb</span>
                    </div>
                  </div>
                  <div className="po-th-header-titles">
                    <h4 className="po-th-title">Low Demand</h4>
                    <span className="po-th-mode-badge low">Mode 1 · Eco Filtration</span>
                  </div>
                </div>

                <div className="po-th-card-body">
                  <label htmlFor="low_demand_max" className="po-th-label">
                    <span>Upper Swimmer Limit</span>
                    <small className="po-th-limit-rule">(&lt; X swimmers)</small>
                  </label>
                  <div className="po-input-with-unit">
                    <input
                      id="low_demand_max"
                      type="number"
                      min="1"
                      max="500"
                      value={formData.low_demand_max}
                      onChange={(e) => handleChange('low_demand_max', e.target.value)}
                      required
                    />
                    <span className="po-unit-suffix">swimmers</span>
                  </div>
                </div>

                <div className="po-th-card-footer">
                  <span className="po-th-range-pill">0 to {lowVal - 1} swimmers</span>
                  <p className="po-th-hint">Low speed continuous · Energy-conscious baseline turnover</p>
                </div>
              </div>

              {/* Stage 2: Moderate Demand */}
              <div className="po-threshold-box moderate">
                <div className="po-th-card-header">
                  <div className="po-th-header-top">
                    <span className="po-th-stage-pill moderate">Stage 2</span>
                    <div className="po-th-relay-indicator" title="2 of 4 Relays Energized (Standard Circulation)">
                      <span className="po-relay-led active" />
                      <span className="po-relay-led active" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led-text">2 Bulbs</span>
                    </div>
                  </div>
                  <div className="po-th-header-titles">
                    <h4 className="po-th-title">Moderate Demand</h4>
                    <span className="po-th-mode-badge moderate">Mode 2 · Standard Filtration</span>
                  </div>
                </div>

                <div className="po-th-card-body">
                  <label htmlFor="moderate_demand_max" className="po-th-label">
                    <span>Upper Swimmer Limit</span>
                    <small className="po-th-limit-rule">(to Y swimmers)</small>
                  </label>
                  <div className="po-input-with-unit">
                    <input
                      id="moderate_demand_max"
                      type="number"
                      min={lowVal + 1}
                      max="500"
                      value={formData.moderate_demand_max}
                      onChange={(e) => handleChange('moderate_demand_max', e.target.value)}
                      required
                    />
                    <span className="po-unit-suffix">swimmers</span>
                  </div>
                </div>

                <div className="po-th-card-footer">
                  <span className="po-th-range-pill">{lowVal} to {modVal} swimmers</span>
                  <p className="po-th-hint">Medium speed circulation · Standard daytime turnover</p>
                </div>
              </div>

              {/* Stage 3: High Demand */}
              <div className="po-threshold-box high">
                <div className="po-th-card-header">
                  <div className="po-th-header-top">
                    <span className="po-th-stage-pill high">Stage 3</span>
                    <div className="po-th-relay-indicator" title="3 of 4 Relays Energized (Boost Filtration)">
                      <span className="po-relay-led active" />
                      <span className="po-relay-led active" />
                      <span className="po-relay-led active" />
                      <span className="po-relay-led" />
                      <span className="po-relay-led-text">3 Bulbs</span>
                    </div>
                  </div>
                  <div className="po-th-header-titles">
                    <h4 className="po-th-title">High Demand</h4>
                    <span className="po-th-mode-badge high">Mode 3 · Boost Filtration</span>
                  </div>
                </div>

                <div className="po-th-card-body">
                  <label htmlFor="high_demand_max" className="po-th-label">
                    <span>Upper Swimmer Limit</span>
                    <small className="po-th-limit-rule">(to Z swimmers)</small>
                  </label>
                  <div className="po-input-with-unit">
                    <input
                      id="high_demand_max"
                      type="number"
                      min={modVal + 1}
                      max="500"
                      value={formData.high_demand_max}
                      onChange={(e) => handleChange('high_demand_max', e.target.value)}
                      required
                    />
                    <span className="po-unit-suffix">swimmers</span>
                  </div>
                </div>

                <div className="po-th-card-footer">
                  <span className="po-th-range-pill">{modVal + 1} to {highVal} swimmers</span>
                  <p className="po-th-hint">High speed boost · Accelerated turnover for heavy bather load</p>
                </div>
              </div>

              {/* Stage 4: Very High Demand */}
              <div className="po-threshold-box very-high">
                <div className="po-th-card-header">
                  <div className="po-th-header-top">
                    <span className="po-th-stage-pill very-high">Stage 4</span>
                    <div className="po-th-relay-indicator" title="4 of 4 Relays Energized (Peak Capacity)">
                      <span className="po-relay-led active alert" />
                      <span className="po-relay-led active alert" />
                      <span className="po-relay-led active alert" />
                      <span className="po-relay-led active alert" />
                      <span className="po-relay-led-text">4 Bulbs</span>
                    </div>
                  </div>
                  <div className="po-th-header-titles">
                    <h4 className="po-th-title">Very High Demand</h4>
                    <span className="po-th-mode-badge very-high">Mode 4 · Peak Filtration</span>
                  </div>
                </div>

                <div className="po-th-card-body">
                  <label className="po-th-label">
                    <span>Trigger Threshold</span>
                    <small className="po-th-limit-rule">(auto-computed)</small>
                  </label>
                  <div className="po-input-with-unit po-input-readonly-wrap">
                    <input
                      type="text"
                      value={`> ${highVal}`}
                      readOnly
                      disabled
                      className="po-input-readonly"
                      aria-label="Automatic trigger above high demand limit"
                    />
                    <span className="po-unit-suffix">swimmers</span>
                  </div>
                </div>

                <div className="po-th-card-footer">
                  <span className="po-th-range-pill very-high">{highVal + 1}+ swimmers</span>
                  <p className="po-th-hint">Maximum pump velocity · Peak emergency bather clearance</p>
                </div>
              </div>
            </div>

            {/* Visual Capacity Preview Bar */}
            <div className="po-capacity-preview">
              <div className="po-capacity-preview-head">
                <div className="po-capacity-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>Continuous Capacity Allocation Preview</span>
                </div>
                <span className="po-capacity-hint">Dynamic filtration bands automatically scaled by your configured thresholds</span>
              </div>
              <div className="po-preview-bar">
                <div className="po-bar-seg low" style={{ flex: lowVal }}>
                  <span className="po-seg-label">Low (&lt;{lowVal})</span>
                  <small className="po-seg-sub">Mode 1 · Eco (1 Bulb)</small>
                </div>
                <div className="po-bar-seg moderate" style={{ flex: Math.max(5, modVal - lowVal) }}>
                  <span className="po-seg-label">Moderate ({lowVal}–{modVal})</span>
                  <small className="po-seg-sub">Mode 2 · Standard (2 Bulbs)</small>
                </div>
                <div className="po-bar-seg high" style={{ flex: Math.max(5, highVal - modVal) }}>
                  <span className="po-seg-label">High ({modVal + 1}–{highVal})</span>
                  <small className="po-seg-sub">Mode 3 · Boost (3 Bulbs)</small>
                </div>
                <div className="po-bar-seg very-high" style={{ flex: 15 }}>
                  <span className="po-seg-label">Very High (&gt;{highVal})</span>
                  <small className="po-seg-sub">Mode 4 · Peak (4 Bulbs)</small>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Facility Identity & Staffing Policies */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Facility Safety &amp; Staffing Policies</h3>
              <p>Configure aquatic safety ratios, minimum lifeguard roster floors, and facility operational hours:</p>
            </div>

            <div className="po-form-row">
              <div className="po-form-group">
                <label htmlFor="pool_name">Facility Pool Name:</label>
                <input
                  id="pool_name"
                  type="text"
                  value={formData.pool_name}
                  onChange={(e) => handleChange('pool_name', e.target.value)}
                  required
                />
              </div>

              <div className="po-form-group">
                <label htmlFor="swimmer_to_lifeguard_ratio">Swimmer-to-Lifeguard Ratio:</label>
                <input
                  id="swimmer_to_lifeguard_ratio"
                  type="number"
                  min="5"
                  max="50"
                  value={formData.swimmer_to_lifeguard_ratio}
                  onChange={(e) => handleChange('swimmer_to_lifeguard_ratio', e.target.value)}
                  required
                />
                <span className="po-field-sub">1 lifeguard deployed per {formData.swimmer_to_lifeguard_ratio} active swimmers</span>
              </div>
            </div>

            <div className="po-form-row">
              <div className="po-form-group">
                <label htmlFor="min_lifeguards">Minimum Lifeguard Floor:</label>
                <input
                  id="min_lifeguards"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.min_lifeguards}
                  onChange={(e) => handleChange('min_lifeguards', e.target.value)}
                  required
                />
                <span className="po-field-sub">Never deploy fewer than this count during facility open hours</span>
              </div>

              <div className="po-form-group">
                <label htmlFor="min_operational_staff">Minimum Ops / Deck Staff:</label>
                <input
                  id="min_operational_staff"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.min_operational_staff}
                  onChange={(e) => handleChange('min_operational_staff', e.target.value)}
                  required
                />
                <span className="po-field-sub">Floor for check-in reception, equipment, and facility operations</span>
              </div>
            </div>

            <div className="po-form-row">
              <div className="po-form-group">
                <label htmlFor="opening_hour">Pool Opening Hour (0–23):</label>
                <select
                  id="opening_hour"
                  value={formData.opening_hour}
                  onChange={(e) => handleChange('opening_hour', parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM (Midnight)' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM (Noon)' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="po-form-group">
                <label htmlFor="closing_hour">Pool Closing Hour (0–24):</label>
                <select
                  id="closing_hour"
                  value={formData.closing_hour}
                  onChange={(e) => handleChange('closing_hour', parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 25 }).map((_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM (Midnight)' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM (Noon)' : i === 24 ? '12:00 AM (Next Day)' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Section 4: Prediction Model Retraining */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Prediction Model Retraining Cadence</h3>
              <p>Set how many new observations must accumulate before the occupancy prediction model is automatically retrained:</p>
            </div>

            <div className="po-form-row">
              <div className="po-form-group">
                <label htmlFor="auto_retrain_interval">Retrain Interval (Observations):</label>
                <input
                  id="auto_retrain_interval"
                  type="number"
                  min="10"
                  max="1000"
                  step="10"
                  value={formData.auto_retrain_interval}
                  onChange={(e) => handleChange('auto_retrain_interval', e.target.value)}
                  required
                />
                <span className="po-field-sub">
                  The prediction model retrains automatically after every {formData.auto_retrain_interval} new hourly sensor records are logged.
                </span>
              </div>
            </div>
          </section>

          {/* Form Action Buttons */}
          <div className="po-settings-actions">
            <button
              type="button"
              className="po-btn-secondary"
              onClick={onBackToDashboard}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="po-btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="po-btn-spinner" />
                  <span>Applying Settings…</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Save &amp; Apply Settings</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
