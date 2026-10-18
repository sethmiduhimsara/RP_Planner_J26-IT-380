import { useState, useEffect } from 'react'
import { fetchSettings, saveSettings, fetchWhatsAppStatus, sendWhatsAppMessage } from './services/poolOrchestratorApi'

const PRESETS = [
  {
    name: 'Small / Hotel / Therapy Pool',
    icon: '🏊',
    description: 'Boutique or hotel facility with lower swimmer volume (Max ~30 bathers)',
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
    name: 'Standard Community / Club Pool',
    icon: '🏟️',
    description: 'Standard 25m recreational public facility (Max ~50-60 bathers)',
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
    name: 'Olympic / High-Capacity Aquatic Centre',
    icon: '🌊',
    description: 'Full 50m competition venue or waterpark (High swimmer throughput)',
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

  // WhatsApp Assistant integration state
  const [waStatus, setWaStatus] = useState(null)
  const [waMessages, setWaMessages] = useState([])
  const [testPhone, setTestPhone] = useState('94743158325')
  const [testMessage, setTestMessage] = useState('Hello! Colombo Aquatic Centre Main Pool is open today until 10:00 PM.')
  const [sendingWa, setSendingWa] = useState(false)
  const [waFeedback, setWaFeedback] = useState(null)

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
      }

      try {
        const waData = await fetchWhatsAppStatus()
        if (isMounted && waData) {
          setWaStatus(waData.status)
          setWaMessages(waData.messages || [])
        }
      } catch (waErr) {
        console.warn('Could not load WhatsApp integration status:', waErr.message)
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
        message: 'Settings successfully saved! Operational thresholds, filtration bulb logic, and forecast badges updated.',
      })

      if (onSettingsApplied) {
        onSettingsApplied(result.settings || formData)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save settings. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSendTestWhatsApp = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!testPhone || !testMessage) return
    setSendingWa(true)
    setWaFeedback(null)
    try {
      await sendWhatsAppMessage(testPhone, testMessage)
      setWaFeedback({
        type: 'success',
        text: `Message dispatched successfully to ${testPhone} via Meta Cloud API!`,
      })
      const updated = await fetchWhatsAppStatus()
      if (updated) {
        setWaStatus(updated.status)
        setWaMessages(updated.messages || [])
      }
    } catch (err) {
      setWaFeedback({
        type: 'error',
        text: `Failed to dispatch WhatsApp message: ${err.message}`,
      })
    } finally {
      setSendingWa(false)
    }
  }

  const lowVal = parseInt(formData.low_demand_max, 10) || 15
  const modVal = parseInt(formData.moderate_demand_max, 10) || 30
  const highVal = parseInt(formData.high_demand_max, 10) || 45

  return (
    <div className="po-settings-page">
      {/* Top Banner Navigation */}
      <div className="po-settings-header">
        <div>
          <button className="po-btn-back" onClick={onBackToDashboard} title="Back to Operations Dashboard">
            ← Back to Dashboard
          </button>
          <h1 className="po-settings-title">Manager Operational Settings</h1>
          <p className="po-settings-subtitle">
            Configure custom swimmer demand limits, 4-bulb filtration actuation bands, and facility safety policies
            suited to your pool size and bather density.
          </p>
        </div>
        <div className="po-settings-badge">
          <span>⚙️ FACILITY CONFIGURATION</span>
        </div>
      </div>

      {feedback && (
        <div className={`po-settings-alert ${feedback.type}`}>
          {feedback.type === 'success' ? '✓ ' : '⚠ '}
          {feedback.message}
        </div>
      )}

      {validationError && (
        <div className="po-settings-alert error">
          ⚠ {validationError}
        </div>
      )}

      {loading ? (
        <div className="po-loading-state">
          <p>Loading operational settings from database...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="po-settings-form">
          {/* Section 1: Quick Presets */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Facility Size Presets (Quick Setup)</h3>
              <p>Select a pre-configured template that matches your swimming pool capacity:</p>
            </div>
            <div className="po-preset-grid">
              {PRESETS.map((p) => (
                <div key={p.name} className="po-preset-card">
                  <div className="po-preset-icon">{p.icon}</div>
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

          {/* Section 2: Swimmer Demand & Bulb Thresholds (Core User Request) */}
          <section className="po-settings-card highlight">
            <div className="po-card-head">
              <h3>Swimmer Demand &amp; Filtration Bulb Thresholds</h3>
              <p>
                Define the swimmer counts that trigger each demand category and automatically light up the corresponding
                filtration relay bulbs:
              </p>
            </div>

            <div className="po-thresholds-grid">
              {/* Low Demand */}
              <div className="po-threshold-box low">
                <div className="po-th-header">
                  <span className="po-th-badge low">Low Demand</span>
                  <span className="po-bulb-tag">💡 1 Bulb ON</span>
                </div>
                <label htmlFor="low_demand_max">Upper Swimmer Limit (&lt; X swimmers):</label>
                <input
                  id="low_demand_max"
                  type="number"
                  min="1"
                  max="500"
                  value={formData.low_demand_max}
                  onChange={(e) => handleChange('low_demand_max', e.target.value)}
                  required
                />
                <span className="po-th-hint">0 to {lowVal - 1} swimmers (Mandatory baseline circulation)</span>
              </div>

              {/* Moderate Demand */}
              <div className="po-threshold-box moderate">
                <div className="po-th-header">
                  <span className="po-th-badge moderate">Moderate Demand</span>
                  <span className="po-bulb-tag">💡💡 2 Bulbs ON</span>
                </div>
                <label htmlFor="moderate_demand_max">Upper Swimmer Limit (to Y swimmers):</label>
                <input
                  id="moderate_demand_max"
                  type="number"
                  min={lowVal + 1}
                  max="500"
                  value={formData.moderate_demand_max}
                  onChange={(e) => handleChange('moderate_demand_max', e.target.value)}
                  required
                />
                <span className="po-th-hint">{lowVal} to {modVal} swimmers (Standard daily circulation)</span>
              </div>

              {/* High Demand */}
              <div className="po-threshold-box high">
                <div className="po-th-header">
                  <span className="po-th-badge high">High Demand</span>
                  <span className="po-bulb-tag">💡💡💡 3 Bulbs ON</span>
                </div>
                <label htmlFor="high_demand_max">Upper Swimmer Limit (to Z swimmers):</label>
                <input
                  id="high_demand_max"
                  type="number"
                  min={modVal + 1}
                  max="500"
                  value={formData.high_demand_max}
                  onChange={(e) => handleChange('high_demand_max', e.target.value)}
                  required
                />
                <span className="po-th-hint">{modVal + 1} to {highVal} swimmers (Elevated bather circulation)</span>
              </div>

              {/* Very High Demand */}
              <div className="po-threshold-box very-high">
                <div className="po-th-header">
                  <span className="po-th-badge very-high">Very High Demand</span>
                  <span className="po-bulb-tag">💡💡💡💡 4 Bulbs ON</span>
                </div>
                <label>Automatic Trigger Level:</label>
                <div className="po-static-value">&gt; {highVal} swimmers</div>
                <span className="po-th-hint">{highVal + 1}+ swimmers (Maximum turnover, requires manager review)</span>
              </div>
            </div>

            {/* Visual Capacity Preview Bar */}
            <div className="po-capacity-preview">
              <label>Live Operational Demand Preview:</label>
              <div className="po-preview-bar">
                <div className="po-bar-seg low" style={{ flex: lowVal }}>
                  <span>Low (&lt;{lowVal})</span>
                  <small>1 Bulb</small>
                </div>
                <div className="po-bar-seg moderate" style={{ flex: Math.max(5, modVal - lowVal) }}>
                  <span>Moderate ({lowVal}–{modVal})</span>
                  <small>2 Bulbs</small>
                </div>
                <div className="po-bar-seg high" style={{ flex: Math.max(5, highVal - modVal) }}>
                  <span>High ({modVal + 1}–{highVal})</span>
                  <small>3 Bulbs</small>
                </div>
                <div className="po-bar-seg very-high" style={{ flex: 15 }}>
                  <span>Very High (&gt;{highVal})</span>
                  <small>4 Bulbs</small>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Facility Identity & Staffing Policies */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Facility Safety &amp; Staffing Policies</h3>
              <p>Configure aquatic safety ratios, minimum guard floors, and facility operational hours:</p>
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
                <span className="po-field-sub">1 lifeguard per {formData.swimmer_to_lifeguard_ratio} swimmers</span>
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
                <span className="po-field-sub">Never deploy fewer than this count during open hours</span>
              </div>

              <div className="po-form-group">
                <label htmlFor="min_operational_staff">Minimum Ops/Desk Staff:</label>
                <input
                  id="min_operational_staff"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.min_operational_staff}
                  onChange={(e) => handleChange('min_operational_staff', e.target.value)}
                  required
                />
                <span className="po-field-sub">Floor for check-in and facility operations</span>
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

          {/* Section 4: Continuous Learning MLOps */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <h3>Continuous Learning &amp; Automated Retraining</h3>
              <p>Configure the observation accumulation threshold for automated Random Forest retraining:</p>
            </div>

            <div className="po-form-row">
              <div className="po-form-group">
                <label htmlFor="auto_retrain_interval">Retrain Cadence (Observations):</label>
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
                  Automatically retrains the ML model every time {formData.auto_retrain_interval} new hourly records accumulate in the database.
                </span>
              </div>
            </div>
          </section>

          {/* Section 5: Customer WhatsApp Assistant */}
          <section className="po-settings-card">
            <div className="po-card-head">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3>Customer WhatsApp Assistant (Meta Cloud API)</h3>
                  <p>Automated 24/7 conversational pool bather assistant for customer inquiries.</p>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: waStatus?.enabled ? '#ecfdf5' : '#fef2f2',
                    color: waStatus?.enabled ? '#059669' : '#dc2626',
                    border: `1px solid ${waStatus?.enabled ? '#a7f3d0' : '#fecaca'}`,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: waStatus?.enabled ? '#10b981' : '#ef4444' }} />
                  {waStatus?.enabled ? 'Meta API Connected' : 'Webhook Disconnected'}
                </span>
              </div>
            </div>

            {/* Meta Configuration Info */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Phone Number ID:</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                  {waStatus?.phoneNumberId || '1406310829235882'}
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Webhook Endpoint:</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0284c7' }}>
                  {waStatus?.webhookEndpoint || '/api/pool-orchestrator/whatsapp/webhook'}
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Verification Token:</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                  pool_orchestrator_verify_token_2026
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Messages Handled:</span>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                  📥 {waStatus?.messagesReceived ?? 0} received / 📤 {waStatus?.repliesSent ?? 0} auto-replied
                </div>
              </div>
            </div>

            {/* Live Test Sender */}
            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '14px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                Dispatch Test WhatsApp Message
              </h4>
              <div className="po-form-row">
                <div className="po-form-group">
                  <label htmlFor="test_wa_phone">Destination Phone Number (with Country Code):</label>
                  <input
                    id="test_wa_phone"
                    type="text"
                    placeholder="e.g. 94743158325"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                  <span className="po-field-sub">Sri Lanka format: 94XXXXXXXXX (no + sign)</span>
                </div>
                <div className="po-form-group">
                  <label htmlFor="test_wa_msg">Test Message Body:</label>
                  <input
                    id="test_wa_msg"
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                  />
                  <span className="po-field-sub">Custom notification or announcement text</span>
                </div>
              </div>

              {waFeedback && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: waFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    color: waFeedback.type === 'success' ? '#15803d' : '#b91c1c',
                    border: `1px solid ${waFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  }}
                >
                  {waFeedback.text}
                </div>
              )}

              <button
                type="button"
                className="po-btn-secondary"
                disabled={sendingWa || !testPhone || !testMessage}
                onClick={handleSendTestWhatsApp}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                {sendingWa ? 'Sending...' : '📲 Send WhatsApp Test Message'}
              </button>
            </div>

            {/* Recent Conversations Table */}
            {waMessages && waMessages.length > 0 && (
              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '14px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                  Recent Customer Inquiries &amp; Automated Replies ({waMessages.length})
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #cbd5e1' }}>Customer</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #cbd5e1' }}>Phone</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #cbd5e1' }}>Customer Message</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #cbd5e1' }}>Automated Reply Dispatched</th>
                        <th style={{ padding: '8px 10px', borderBottom: '1px solid #cbd5e1' }}>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waMessages.slice(0, 5).map((m) => (
                        <tr key={m.id || m.wa_message_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>{m.customer_name || 'Customer'}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#64748b' }}>{m.sender_phone}</td>
                          <td style={{ padding: '8px 10px', color: '#1e293b' }}>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px' }}>
                              {m.incoming_text}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#334155', maxWidth: '300px', whiteSpace: 'pre-wrap' }}>
                            {m.reply_text ? m.reply_text.split('\n')[0] : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {m.received_at ? new Date(m.received_at).toLocaleTimeString() : 'Just now'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Form Action Buttons */}
          <div className="po-settings-actions">
            <button
              type="button"
              className="po-btn-secondary"
              onClick={onBackToDashboard}
            >
              Cancel / Back to Dashboard
            </button>

            <button
              type="submit"
              className="po-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving & Applying…' : '✓ Save & Apply Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
