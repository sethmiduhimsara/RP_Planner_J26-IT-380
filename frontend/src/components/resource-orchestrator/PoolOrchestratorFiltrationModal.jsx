import { useState, useEffect } from 'react'

const FILTRATION_PRESETS = [
  {
    stage: 1,
    name: 'Mode 1 — Eco Filtration',
    shortName: 'Eco Filtration',
    relays: '1 Relay Active',
    speed: 'Low speed circulation',
    occupancy: '< 15 swimmers (Off-Peak)',
    description: 'Energy-saving baseline circulation for night hours and low pool activity.',
    theme: 'blue',
  },
  {
    stage: 2,
    name: 'Mode 2 — Standard Filtration',
    shortName: 'Standard Filtration',
    relays: '2 Relays Active',
    speed: 'Moderate circulation flow',
    occupancy: '15–30 swimmers (Moderate Load)',
    description: 'Balanced daily turnover matching standard recreational swimming capacity.',
    theme: 'teal',
  },
  {
    stage: 3,
    name: 'Mode 3 — Boost Filtration',
    shortName: 'Boost Filtration',
    relays: '3 Relays Active',
    speed: 'High speed turnover',
    occupancy: '31–45 swimmers (High Load)',
    description: 'Elevated turnover rate for rising bather density, high heat, or precipitation.',
    theme: 'amber',
  },
  {
    stage: 4,
    name: 'Mode 4 — Peak Filtration',
    shortName: 'Peak Filtration',
    relays: '4 Relays Active (Maximum)',
    speed: 'Maximum permitted flow',
    occupancy: '> 45 swimmers (Peak Demand)',
    description: 'Maximum filtration and chemical dispersal capacity for peak swimming sessions.',
    theme: 'red',
  },
]

const QUICK_REASONS = [
  'Pre-filtering for predicted peak session',
  'Post-event water clarity recovery',
  'Chemical treatment & circulation',
  'Deck maintenance & backwash',
]

export default function PoolOrchestratorFiltrationModal({
  isOpen,
  onClose,
  currentMode,
  currentFiltrationData,
  initialStage,
  initialReason,
  onEngageMode,
  loading = false,
}) {
  const [selectedType, setSelectedType] = useState('stage') // 'stage' | 'auto'
  const [selectedStage, setSelectedStage] = useState(3)
  const [reason, setReason] = useState('Pre-filtering for predicted peak session')

  useEffect(() => {
    if (isOpen) {
      if (initialStage !== undefined && initialStage !== null) {
        setSelectedStage(Number(initialStage))
        setSelectedType('stage')
      } else if (currentMode?.modeNumber) {
        setSelectedStage(currentMode.modeNumber)
      }
      if (initialReason) {
        setReason(initialReason)
      } else {
        setReason('Pre-filtering for predicted peak session')
      }
    }
  }, [isOpen, initialStage, initialReason, currentMode])

  if (!isOpen) return null

  const isManualActive = currentMode?.isOverride || currentFiltrationData?.source === 'manager_manual'
  const activeBulbs = currentFiltrationData?.activeBulbs ?? currentMode?.modeNumber ?? 2

  const handleSubmit = (e) => {
    e.preventDefault()
    if (selectedType === 'auto') {
      onEngageMode('auto', reason || 'Manager resumed auto load-based regulation')
    } else {
      onEngageMode(selectedStage, reason || `Manual override to Mode ${selectedStage}`)
    }
  }

  return (
    <div className="po-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="filtration-modal-title">
      <div className="po-modal-container po-modal-container-lg">
        {/* Modal Header */}
        <div className="po-modal-header">
          <div className="po-modal-header-left">
            <div className="po-modal-icon-badge filtration">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <h3 id="filtration-modal-title">Manual Filtration Cycle Regulation</h3>
              <p className="po-modal-subtitle">
                Actuate ESP32 4-relay filtration hardware via MQTT in advance of predicted peak bather loads
              </p>
            </div>
          </div>
          <button
            type="button"
            className="po-modal-close-btn"
            onClick={onClose}
            aria-label="Close filtration control dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="po-modal-body po-filtration-form">
          {/* Current Hardware Telemetry Banner */}
          <div className="po-filt-telemetry-banner">
            <div className="po-filt-banner-item">
              <small>Operating Mode</small>
              <div className="po-filt-status-wrap">
                <span className={`po-status-dot ${isManualActive ? 'pending' : 'online'}`} />
                <strong>{isManualActive ? 'Manual Override Active' : 'Auto-Regulated (ML Load)'}</strong>
              </div>
            </div>
            <div className="po-filt-banner-item">
              <small>Active Cycle</small>
              <strong className="po-filt-cycle-name">
                Mode {activeBulbs} — {FILTRATION_PRESETS.find((p) => p.stage === activeBulbs)?.shortName || 'Filtration'}
              </strong>
            </div>
            <div className="po-filt-banner-item">
              <small>ESP32 Relay Board</small>
              <div className="po-filt-relays-preview">
                {[1, 2, 3, 4].map((relayNum) => {
                  const isOn = relayNum <= activeBulbs
                  return (
                    <span
                      key={relayNum}
                      className={`po-relay-chip ${isOn ? 'active' : 'idle'}`}
                      title={`Relay ${relayNum}: ${isOn ? 'Energized (Active)' : 'Open (Standby)'}`}
                    >
                      R{relayNum}: {isOn ? 'ON' : 'OFF'}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Mode Selection Options */}
          <div className="po-form-group">
            <label className="po-section-label">Select Filtration Regulation Mode:</label>

            {/* Auto Mode Option Card */}
            <div
              className={`po-filt-mode-card auto-card ${selectedType === 'auto' ? 'selected' : ''}`}
              onClick={() => setSelectedType('auto')}
            >
              <input
                type="radio"
                name="filtration-type"
                checked={selectedType === 'auto'}
                onChange={() => setSelectedType('auto')}
                className="po-filt-radio"
              />
              <div className="po-filt-card-body">
                <div className="po-filt-card-title">
                  <strong>Auto-Regulated Mode (ML Telemetry &amp; Predictions)</strong>
                  <span className="po-filt-tag auto">Recommended Baseline</span>
                </div>
                <p>
                  Automatically adjusts filtration speed and actuates relays (1 to 4 bulbs) based on live ESP32 occupancy telemetry and forecast thresholds.
                </p>
              </div>
            </div>

            {/* 4 Manual Preset Mode Cards */}
            <div className="po-filt-grid-4">
              {FILTRATION_PRESETS.map((preset) => {
                const isSelected = selectedType === 'stage' && selectedStage === preset.stage
                const isCurrentlyActive = isManualActive && activeBulbs === preset.stage

                return (
                  <div
                    key={preset.stage}
                    className={`po-filt-mode-card stage-card ${preset.theme} ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedType('stage')
                      setSelectedStage(preset.stage)
                    }}
                  >
                    <div className="po-filt-card-top">
                      <input
                        type="radio"
                        name="filtration-stage"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedType('stage')
                          setSelectedStage(preset.stage)
                        }}
                        className="po-filt-radio"
                      />
                      <span className={`po-stage-pill ${preset.theme}`}>
                        {preset.relays}
                      </span>
                    </div>

                    <div className="po-filt-card-main">
                      <h4>{preset.name}</h4>
                      <div className="po-filt-card-meta">
                        <span>⚡ {preset.speed}</span>
                        <span>👥 {preset.occupancy}</span>
                      </div>
                      <p>{preset.description}</p>
                    </div>

                    {isCurrentlyActive && (
                      <div className="po-active-pill">
                        ✓ Currently Engaged
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Operational Reason & Briefing */}
          <div className="po-form-group">
            <label htmlFor="filtration-reason">Operational Rationale / Note:</label>
            <div className="po-filt-quick-reasons">
              {QUICK_REASONS.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  className={`po-reason-chip ${reason === qr ? 'active' : ''}`}
                  onClick={() => setReason(qr)}
                >
                  {qr}
                </button>
              ))}
            </div>
            <input
              id="filtration-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Pre-filtering for predicted peak bather density"
              className="po-filt-input"
            />
          </div>

          {/* Action Footer */}
          <div className="po-modal-footer">
            <button
              type="button"
              className="po-btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="po-btn-primary"
              disabled={loading}
            >
              {loading ? (
                'Actuating Relays…'
              ) : selectedType === 'auto' ? (
                'Resume Auto-Regulated Mode'
              ) : (
                `Engage Mode ${selectedStage} (${FILTRATION_PRESETS.find((p) => p.stage === selectedStage)?.shortName})`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
