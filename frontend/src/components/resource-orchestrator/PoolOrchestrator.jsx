import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  fetchLatest,
  fetchForecast,
  fetchHealth,
  triggerForecastRefresh,
  cancelStaffAssignment,
  confirmStaffAssignment,
  sendFiltrationCommand,
} from './services/poolOrchestratorApi'
import {
  format12HourTime,
  formatSlotLabel,
  formatRelativeTime,
  getCurrentColomboTimeString,
} from './utils/poolOrchestratorTimeUtils'
import PoolOrchestratorSettings from './PoolOrchestratorSettings'
import PoolOrchestratorWhatsAppChat from './PoolOrchestratorWhatsAppChat'
import PoolOrchestratorStaffModal from './PoolOrchestratorStaffModal'
import PoolOrchestratorFiltrationModal from './PoolOrchestratorFiltrationModal'
import './PoolOrchestrator.css'

const POLLING_INTERVAL_MS = 20000 // 20-second automatic polling

// Crisp inline SVG Weather Icon component
function WeatherIcon({ category, size = 15, className = '' }) {
  if (category === 'Rainy') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <line x1="16" y1="13" x2="16" y2="21" />
        <line x1="8" y1="13" x2="8" y2="21" />
        <line x1="12" y1="15" x2="12" y2="23" />
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      </svg>
    )
  }
  if (category === 'Cloudy') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </svg>
    )
  }
  if (category === 'Sunny') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    )
  }
  // Default / Fair / Partially Cloudy
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </svg>
  )
}

// ============================================================================
// Filtration Modes Specification (Mode 1 to Mode 4)
// ============================================================================
const FILTRATION_MODES = {
  1: {
    modeNumber: 1,
    name: 'Eco Filtration',
    fullName: 'Mode 1 — Eco Filtration',
    speed: 'Low speed',
    operation: 'Energy-conscious operation',
    theme: 'blue',
  },
  2: {
    modeNumber: 2,
    name: 'Standard Filtration',
    fullName: 'Mode 2 — Standard Filtration',
    speed: 'Medium speed',
    operation: 'Normal operation',
    theme: 'green',
  },
  3: {
    modeNumber: 3,
    name: 'Boost Filtration',
    fullName: 'Mode 3 — Boost Filtration',
    speed: 'High speed',
    operation: 'Increased filtration demand',
    theme: 'amber',
  },
  4: {
    modeNumber: 4,
    name: 'Peak Filtration',
    fullName: 'Mode 4 — Peak Filtration',
    speed: 'Maximum permitted speed',
    operation: 'Peak demand',
    theme: 'red',
  },
}

function FiltrationModeIcon({ mode = 1, size = 16, className = '' }) {
  if (mode === 1) {
    // Mode 1 — Eco Filtration: Speedometer / gauge icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M12 14l2-3" />
        <path d="M3.34 17a10 10 0 1 1 17.32 0" />
      </svg>
    )
  }
  if (mode === 2) {
    // Mode 2 — Standard Filtration: Waves icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      </svg>
    )
  }
  if (mode === 3) {
    // Mode 3 — Boost Filtration: Lightning bolt icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  }
  // Mode 4 — Peak Filtration: Framed peak chart icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 14l3-3 3 3 4-5" />
    </svg>
  )
}

/**
 * Renders duty assignment badges:
 * - Confirmed staff: Green check badge with cancel button
 * - Pending staff: Amber pulsing badge (awaiting WhatsApp confirmation) with confirm/cancel buttons
 * - Declined staff: Red decline badge with decline reason
 * - Add/Assign Staff button
 */
// Helper to deduplicate staff assignments per slot/task, prioritizing confirmed > pending > rejected
function getDeduplicatedAssignments(assignments = []) {
  const map = new Map()
  const priority = { confirmed: 3, pending_confirmation: 2, rejected: 1 }

  const sorted = [...assignments].sort((a, b) => {
    const pA = priority[a.status] || 0
    const pB = priority[b.status] || 0
    if (pB !== pA) return pB - pA
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })

  for (const a of sorted) {
    const key = a.staff_id || a.staff_phone || a.staff_name?.toLowerCase()
    if (key && !map.has(key)) {
      map.set(key, a)
    }
  }

  return Array.from(map.values())
}

// Compact name formatter: "Anura Kumara" -> "Anura K."
function formatCompactName(fullName = '') {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`
}

/**
 * Renders duty assignment badges in a compact horizontal flex layout:
 * - Deduplicates assignments per slot
 * - Formats names compactly ("Anura K.")
 * - Caps visible items to maxVisible (default 2) with a "+N more" overflow pill
 * - Floating popover shows all assignees with WhatsApp status and action buttons
 * - Guarantees footer and table rows NEVER wrap or balloon vertically
 */
function StaffAssignmentBadges({
  assignments = [],
  onCancel,
  onConfirm,
  onAssignMore,
  buttonLabel = 'Assign Staff',
  maxVisible = 1,
  showButton = true,
  variant = 'default', // 'default' | 'count'
}) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!showPopover) return
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowPopover(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowPopover(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showPopover])

  const uniqueAssignments = getDeduplicatedAssignments(assignments)
  const hasAnyStaff = uniqueAssignments.length > 0
  const hasMultiple = uniqueAssignments.length > 1
  const cleanLabel = (hasAnyStaff ? 'Add' : buttonLabel).replace(/^\+\s*/, '')

  if (!hasAnyStaff && !showButton && variant !== 'count') {
    return null
  }

  const primaryStaff = uniqueAssignments[0]
  const overflowCount = uniqueAssignments.length - 1
  const hasPending = uniqueAssignments.some((a) => a.status === 'pending_confirmation')
  const allConfirmed = uniqueAssignments.every((a) => a.status === 'confirmed')
  const statusClass = hasPending ? 'pending' : allConfirmed ? 'confirmed' : 'mixed'

  const renderPopover = () => (
    <div className="po-roster-popover" role="dialog" aria-label="Assigned duty staff">
      <div className="po-roster-popover-header">
        <span className="po-roster-popover-title">
          Assigned Staff ({uniqueAssignments.length})
        </span>
        <button
          type="button"
          className="po-roster-popover-close"
          onClick={(e) => {
            e.stopPropagation()
            setShowPopover(false)
          }}
          title="Close popup"
        >
          ✕
        </button>
      </div>
      <div className="po-roster-popover-list">
        {uniqueAssignments.map((a) => {
          const isConfirmed = a.status === 'confirmed'
          const isPending = a.status === 'pending_confirmation'
          const isRejected = a.status === 'rejected'

          return (
            <div key={a.id} className={`po-roster-popover-item ${a.status}`}>
              <div className="po-popover-item-info">
                <div className="po-popover-item-name-row">
                  <span className={`po-status-dot-sm ${isConfirmed ? 'online' : isPending ? 'pending' : 'offline'}`} />
                  <span className="po-popover-item-name">{a.staff_name}</span>
                  <span className={`po-popover-item-badge ${a.status}`}>
                    {isConfirmed ? 'Confirmed' : isPending ? 'Pending' : 'Declined'}
                  </span>
                </div>
                <div className="po-popover-item-phone">
                  {a.staff_phone || 'No phone recorded'}
                  {a.rejection_reason && ` · Reason: ${a.rejection_reason}`}
                </div>
              </div>
              <div className="po-popover-item-actions">
                {isPending && (
                  <button
                    type="button"
                    className="po-popover-action-btn confirm"
                    title="Confirm shift"
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfirm(a)
                    }}
                  >
                    ✓ Confirm
                  </button>
                )}
                {!isRejected && (
                  <button
                    type="button"
                    className="po-popover-action-btn cancel"
                    title="Cancel shift"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancel(a)
                    }}
                  >
                    ✕ Cancel
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // Count variant: e.g. "0 Assigned", "1 Assigned 👁️", "2 Assigned 👁️"
  if (variant === 'count') {
    if (!hasAnyStaff) {
      return (
        <span className="po-unassigned-badge" title="No staff assigned to this time slot yet">
          <span className="po-unassigned-dot" />
          <span>0 Assigned</span>
        </span>
      )
    }

    const count = uniqueAssignments.length
    return (
      <div className="po-staff-roster-row">
        <div className="po-popover-anchor" ref={popoverRef}>
          <button
            type="button"
            className={`po-assigned-count-pill ${statusClass} ${showPopover ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setShowPopover((prev) => !prev)
            }}
            title={`View ${count} assigned staff member(s)`}
            aria-expanded={showPopover}
          >
            {hasPending ? (
              <span className="po-mini-pulse" />
            ) : allConfirmed ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <span className="po-mini-dot mixed" />
            )}
            <span>{count} Assigned</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="po-view-eye-icon"
              aria-hidden="true"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          {showPopover && renderPopover()}
        </div>

        {showButton && (
          <button
            type="button"
            className={`po-btn-assign ${hasAnyStaff ? 'compact' : ''}`}
            onClick={onAssignMore}
            title={hasAnyStaff ? 'Assign additional staff to this slot' : 'Assign staff to this slot'}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{cleanLabel}</span>
          </button>
        )}
      </div>
    )
  }

  const renderSinglePill = (a) => {
    if (a.status === 'confirmed') {
      return (
        <span
          key={a.id}
          className="po-assigned-pill confirmed"
          title={`Duty Confirmed: ${a.staff_name} (${a.staff_phone || 'WhatsApp'})`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="po-staff-name-text">{formatCompactName(a.staff_name)}</span>
          <button
            type="button"
            className="po-mini-cancel-btn"
            title="Cancel shift (notifies staff via WhatsApp)"
            onClick={(e) => {
              e.stopPropagation()
              onCancel(a)
            }}
          >
            ✕
          </button>
        </span>
      )
    }
    if (a.status === 'pending_confirmation') {
      return (
        <span
          key={a.id}
          className="po-assigned-pill pending"
          title={`Awaiting WhatsApp confirmation: ${a.staff_name} (${a.staff_phone || ''})`}
        >
          <span className="po-mini-pulse" />
          <span className="po-staff-name-text">{formatCompactName(a.staff_name)}</span>
          <button
            type="button"
            className="po-mini-action-btn confirm"
            title="Mark confirmed manually (if agreed verbally)"
            onClick={(e) => {
              e.stopPropagation()
              onConfirm(a)
            }}
          >
            ✓
          </button>
          <button
            type="button"
            className="po-mini-cancel-btn"
            title="Cancel shift invitation"
            onClick={(e) => {
              e.stopPropagation()
              onCancel(a)
            }}
          >
            ✕
          </button>
        </span>
      )
    }
    return (
      <span
        key={a.id}
        className="po-assigned-pill rejected"
        title={`Declined by ${a.staff_name}: ${a.rejection_reason || 'Unavailable'}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span className="po-staff-name-text">Declined: {formatCompactName(a.staff_name)}</span>
      </span>
    )
  }

  return (
    <div className="po-staff-roster-row">
      {/* 1. Single Staff Member (Only 1 assigned) */}
      {hasAnyStaff && !hasMultiple && renderSinglePill(primaryStaff)}

      {/* 2. Multiple Staff Members: Single Unified Pill that toggles Popover */}
      {hasMultiple && (
        <div className="po-popover-anchor" ref={popoverRef}>
          <button
            type="button"
            className={`po-unified-roster-pill ${statusClass} ${showPopover ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setShowPopover((prev) => !prev)
            }}
            title={`View all ${uniqueAssignments.length} assigned staff (click to manage)`}
          >
            {hasPending && <span className="po-mini-pulse" />}
            {!hasPending && allConfirmed && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span className="po-staff-name-text">{formatCompactName(primaryStaff.staff_name)}</span>
            <span className="po-staff-more-tag">+{overflowCount} more</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`po-unified-chevron ${showPopover ? 'open' : ''}`} aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showPopover && renderPopover()}
        </div>
      )}

      {/* 3. Compact Assign / Add Staff Button */}
      {showButton && (
        <button
          type="button"
          className={`po-btn-assign ${hasAnyStaff ? 'compact' : ''}`}
          onClick={onAssignMore}
          title={hasAnyStaff ? 'Assign additional staff to this slot' : 'Assign staff to this slot'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{cleanLabel}</span>
        </button>
      )}
    </div>
  )
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

  // Staff Assignment State
  const [staffModalOpen, setStaffModalOpen] = useState(false)
  const [activeTaskToAssign, setActiveTaskToAssign] = useState(null)
  const [assignedTasksMap, setAssignedTasksMap] = useState({})

  // Filtration Cycle Override State
  const [filtrationModalOpen, setFiltrationModalOpen] = useState(false)
  const [controllingFiltration, setControllingFiltration] = useState(false)
  const [modalInitialStage, setModalInitialStage] = useState(null)
  const [modalInitialReason, setModalInitialReason] = useState(null)

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
        if (latestRes.staffAssignments && Array.isArray(latestRes.staffAssignments)) {
          const map = {}
          latestRes.staffAssignments.forEach((a) => {
            if (a.status === 'cancelled') return
            if (a.task_title) {
              if (!map[a.task_title]) map[a.task_title] = []
              map[a.task_title].push(a)
            }
            if (a.time_slot) {
              if (!map[a.time_slot]) map[a.time_slot] = []
              map[a.time_slot].push(a)
            }
          })
          setAssignedTasksMap(map)
        }
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
        setActionNotice('Forecast telemetry synchronized from Open-Meteo and ML pipeline.')
      }
      await loadData()
    } catch (err) {
      setActionNotice(`Refresh notice: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const handleCancelAssignment = async (assignment) => {
    const reason = window.prompt(
      `Cancel duty shift for ${assignment.staff_name} (${assignment.task_title || assignment.time_slot})?\n\nEnter reason for cancellation (dispatched to staff via WhatsApp):`,
      'Operational schedule adjustment'
    )
    if (reason === null) return // user dismissed prompt

    try {
      await cancelStaffAssignment(assignment.id, reason || 'Operational schedule adjustment')
      setActionNotice(`Shift assignment for ${assignment.staff_name} cancelled and WhatsApp notice dispatched.`)
      await loadData()
    } catch (err) {
      setActionNotice(`Could not cancel assignment: ${err.message}`)
    }
  }

  const handleConfirmAssignment = async (assignment) => {
    try {
      await confirmStaffAssignment(assignment.id)
      setActionNotice(`Duty assignment confirmed for ${assignment.staff_name}.`)
      await loadData()
    } catch (err) {
      setActionNotice(`Could not confirm assignment: ${err.message}`)
    }
  }

  // Filtration Cycle manual regulation handlers
  const handleOpenFiltrationModal = (stage = null, reason = null) => {
    setModalInitialStage(stage)
    setModalInitialReason(reason)
    setFiltrationModalOpen(true)
  }

  const handleEngageFiltration = async (stageOrOptions, reason) => {
    try {
      setControllingFiltration(true)
      let payload = {}
      if (stageOrOptions === 'auto') {
        payload = { mode: 'auto', reason }
      } else if (typeof stageOrOptions === 'number' || !isNaN(Number(stageOrOptions))) {
        payload = { stage: Number(stageOrOptions), reason }
      } else if (typeof stageOrOptions === 'object') {
        payload = stageOrOptions
      }

      const res = await sendFiltrationCommand(payload)
      if (res?.filtrationMode === 'auto') {
        setActionNotice('Filtration resumed to Auto-Regulated ML mode based on bather occupancy.')
      } else {
        const bulbs = res?.activeBulbs || stageOrOptions
        setActionNotice(`Manual filtration override active: Mode ${bulbs} engaged (${bulbs} relay${bulbs > 1 ? 's' : ''} active via MQTT).`)
      }
      setFiltrationModalOpen(false)
      await loadData()
    } catch (err) {
      setActionNotice(`Could not actuate filtration relays: ${err.message}`)
    } finally {
      setControllingFiltration(false)
    }
  }

  // Derived state & operational metrics
  const settings = latestData?.settings || forecastData?.settings || null
  const facilityName = settings?.pool_name || latestData?.facilityName || healthData?.facilityName || 'Aquatic Centre Main Pool'
  const currentOccupancy = latestData?.occupancy?.occupancy_count ?? null
  const latestSensor = latestData?.reading ?? null

  const lowDemandMax = settings?.low_demand_max ?? 15
  const modDemandMax = settings?.moderate_demand_max ?? 30
  const highDemandMax = settings?.high_demand_max ?? 45

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

  const { weatherDisplayValue, weatherDetailText, weatherCategory } = useMemo(() => {
    if (latestSensor && latestSensor.rain_detected === true) {
      const tempPart = latestSensor.temperature_c ? `${latestSensor.temperature_c}°C · ` : ''
      return {
        weatherDisplayValue: 'Rain Detected',
        weatherDetailText: `${tempPart}ESP32 rain sensor active`,
        weatherCategory: 'Rainy',
      }
    }
    if (predictions.length > 0 && predictions[0]?.input_features?.weather) {
      const currentFeat = predictions[0].input_features
      const temp = currentFeat.weather_details?.temperatureC
      const tempText = temp ? `${temp}°C · ` : ''
      return {
        weatherDisplayValue: currentFeat.weather,
        weatherDetailText: `${tempText}${currentFeat.weather_details?.description || 'Open-Meteo observation'}`,
        weatherCategory: currentFeat.weather,
      }
    }
    if (!weatherConfigured) {
      return {
        weatherDisplayValue: 'Setup Needed',
        weatherDetailText: 'Configure POOL_LATITUDE in server/.env',
        weatherCategory: 'Fair',
      }
    }
    return {
      weatherDisplayValue: 'Fair / Clear',
      weatherDetailText: 'No precipitation detected',
      weatherCategory: 'Sunny',
    }
  }, [latestSensor, predictions, weatherConfigured])

  // Dynamic filtration mode, cycle name, and operational detail
  const currentFiltrationMode = useMemo(() => {
    const filtrationData = latestData?.filtration || forecastData?.filtration || null
    const isManual = latestData?.filtrationMode === 'manual' || filtrationData?.source === 'manager_manual'
    const occ = currentOccupancy ?? 0

    let autoModeKey = 1
    let tierRange = `< ${lowDemandMax} swimmers`

    if (occ > highDemandMax) {
      autoModeKey = 4
      tierRange = `> ${highDemandMax} swimmers`
    } else if (occ > modDemandMax) {
      autoModeKey = 3
      tierRange = `${modDemandMax + 1}–${highDemandMax} swimmers`
    } else if (occ >= lowDemandMax) {
      autoModeKey = 2
      tierRange = `${lowDemandMax}–${modDemandMax} swimmers`
    }

    let modeKey = autoModeKey
    if (isManual && filtrationData?.activeBulbs !== undefined && filtrationData.activeBulbs > 0) {
      modeKey = Math.min(4, Math.max(1, filtrationData.activeBulbs))
    }

    const mode = FILTRATION_MODES[modeKey] || FILTRATION_MODES[1]

    let detail = ''
    let tooltip = ''
    if (isManual) {
      const activeCount = filtrationData?.activeBulbs || modeKey
      detail = `Mode ${mode.modeNumber} · ${activeCount} relay${activeCount > 1 ? 's' : ''} active (${mode.speed})`
      tooltip = `Manual Override: ${filtrationData?.reason || mode.fullName}. Auto load regulation paused.`
    } else {
      detail = currentOccupancy !== null
        ? `Mode ${mode.modeNumber} · ${mode.speed} (${tierRange})`
        : `Mode ${mode.modeNumber} · ${mode.speed} (Baseline circulation)`
      tooltip = currentOccupancy !== null
        ? `${mode.fullName}: ${mode.speed} · ${mode.operation} (Auto-regulated for ${occ} swimmers: ${tierRange})`
        : `${mode.fullName}: ${mode.speed} · ${mode.operation} (Baseline circulation)`
    }

    return {
      ...mode,
      isManual,
      occupancyTierRange: tierRange,
      detailText: detail,
      tooltipText: tooltip,
      filtrationData,
    }
  }, [currentOccupancy, latestData, forecastData, lowDemandMax, modDemandMax, highDemandMax])

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
  }, [predictions, highDemandMax, modDemandMax, lowDemandMax])

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
    ? 'Backend Disconnected'
    : (!weatherConfigured ? 'Coordinates Setup Needed' : 'System Connected')

  return (
    <main className="pool-orchestrator">
      {/* ================= Facility Operations Header ================= */}
      <div className="po-header-card">
        <div className="po-header-info">
          <div className="po-header-title-row">
            <h2>Predictive Resource Orchestrator</h2>
          </div>
          <div className="po-header-meta">
            <span className="po-facility-name-meta">{facilityName}</span>
            <span className="po-meta-bullet" aria-hidden="true">·</span>
            <div className="po-clock-display" aria-label="Current pool local time in Asia/Colombo">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{currentTimeStr} (Asia/Colombo)</span>
            </div>
            <span className="po-meta-bullet" aria-hidden="true">·</span>
            <div className="po-status">
              <span className={`po-status-dot ${statusClass}`} />
              <span>{statusText}</span>
            </div>
          </div>
        </div>

        <div className="po-header-actions">
          <button
            className="po-refresh-button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Poll latest sensors and refresh forecast"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? 'po-spin' : ''}
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>{refreshing ? 'Syncing…' : 'Sync Telemetry'}</span>
          </button>
        </div>
      </div>

      {/* ================= Modern Segmented Navigation Pill Control ================= */}
      <nav className="po-segmented-nav" aria-label="Module Navigation">
        <div className="po-segmented-control">
          <button
            type="button"
            className={`po-segment-pill ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            <span>Operations Dashboard</span>
          </button>
          <button
            type="button"
            className={`po-segment-pill ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Facility Policies &amp; Thresholds</span>
          </button>
        </div>
      </nav>

      {/* ================= Operational Notices & Warnings ================= */}
      {error && (
        <div className="po-alert-banner warning">
          <div className="po-alert-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{error}</span>
          </div>
          <button className="po-alert-action" onClick={() => loadData()}>Retry</button>
        </div>
      )}

      {actionNotice && (
        <div className="po-alert-banner info">
          <div className="po-alert-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{actionNotice}</span>
          </div>
          <button className="po-alert-action" onClick={() => setActionNotice(null)}>Dismiss</button>
        </div>
      )}

      {activeTab === 'settings' ? (
        <PoolOrchestratorSettings
          onBackToDashboard={() => setActiveTab('dashboard')}
          onSettingsApplied={(newSettings) => {
            loadData()
            setActionNotice(`Operational parameters updated for "${newSettings.pool_name || 'facility'}". Demand boundaries and relay schedules active.`)
            setActiveTab('dashboard')
          }}
        />
      ) : (
        <>
          {!weatherConfigured && isOnline && (
            <div className="po-alert-banner warning">
              <div className="po-alert-left">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong>Telemetry Location Required:</strong> Configure <code>POOL_LATITUDE</code> and <code>POOL_LONGITUDE</code> in <code>server/.env</code> to activate live Open-Meteo forecasts.
                </span>
              </div>
            </div>
          )}

          {/* ================= Current Operations KPI Summary ================= */}
          <section aria-labelledby="kpi-heading">
            <div className="po-section-heading">
              <div className="po-section-title-wrap">
                <h2 id="kpi-heading">Current Operations Telemetry</h2>
                <span className="po-section-subtitle">
                  {lastRefreshedAt ? `Last synchronized ${format12HourTime(lastRefreshedAt)}` : 'Connecting to edge telemetry...'}
                </span>
              </div>
            </div>

            <div className="po-metrics-grid">
              {/* 1. Current Occupancy */}
              <article className="po-metric-card">
                <div className="po-metric-header">
                  <span className="po-metric-title">Current Occupancy</span>
                  <div className="po-metric-icon blue" title="Live Bather Count">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                </div>
                <div className="po-metric-main">
                  <span className="po-metric-value">{currentOccupancy !== null ? currentOccupancy : '--'}</span>
                  <span className="po-metric-unit">swimmers</span>
                </div>
                <p className="po-metric-detail">
                  {currentOccupancy !== null && latestSensor?.recorded_at
                    ? `Observed ${format12HourTime(latestSensor.recorded_at)} (${formatRelativeTime(latestSensor.recorded_at)})`
                    : 'Awaiting sensor observation'}
                </p>
              </article>

              {/* 2. Predicted Peak */}
              <article className="po-metric-card">
                <div className="po-metric-header">
                  <span className="po-metric-title">Peak 6h Demand</span>
                  <div className="po-metric-icon purple" title="Projected Peak Swimmer Load">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                  </div>
                </div>
                <div className="po-metric-main">
                  <span className="po-metric-value">{peakSwimmers !== null ? peakSwimmers : '--'}</span>
                  {occupancyDeltaText && <span className="po-metric-delta">{occupancyDeltaText}</span>}
                </div>
                <p className="po-metric-detail">
                  {peakPrediction ? `Peak expected at ${peakTime12Hour}` : 'No active forecast model'}
                </p>
              </article>

              {/* 3. Weather Conditions */}
              <article className="po-metric-card">
                <div className="po-metric-header">
                  <span className="po-metric-title">Atmospheric &amp; Rain</span>
                  <div className="po-metric-icon amber" title="Local Meteorology">
                    <WeatherIcon category={weatherCategory} size={16} />
                  </div>
                </div>
                <div className="po-metric-main">
                  <span className="po-metric-value">{weatherDisplayValue}</span>
                </div>
                <p className="po-metric-detail">{weatherDetailText}</p>
              </article>

              {/* 4. Filtration Mode & Cycle */}
              <article className="po-metric-card po-metric-filtration-card">
                <div className="po-metric-header">
                  <span className="po-metric-title">Filtration Cycle</span>
                  <div className="po-metric-header-right">
                    <button
                      type="button"
                      className="po-filtration-change-btn"
                      onClick={() => handleOpenFiltrationModal()}
                      title="Change filtration cycle manually or resume auto mode"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>Change</span>
                    </button>
                    <div
                      className={`po-metric-icon ${currentFiltrationMode.theme}`}
                      title={currentFiltrationMode.tooltipText}
                    >
                      <FiltrationModeIcon mode={currentFiltrationMode.modeNumber} size={16} />
                    </div>
                  </div>
                </div>

                <div className="po-metric-main po-metric-filtration-main">
                  <span className="po-metric-value po-metric-filtration-name">
                    {currentFiltrationMode.name}
                  </span>
                  {currentFiltrationMode.isManual ? (
                    <span className="po-manual-override-tag" title="Filtration is in manual override mode">
                      Manual Override
                    </span>
                  ) : (
                    <span className="po-auto-regulated-tag" title="Auto load-based regulation via ML & occupancy thresholds">
                      Auto (ML)
                    </span>
                  )}
                </div>

                <p className="po-metric-detail" title={currentFiltrationMode.tooltipText}>
                  {currentFiltrationMode.detailText}
                </p>
              </article>
            </div>
          </section>

          {/* ================= Six-Hour Demand Forecast Section ================= */}
          <section className="po-panel" aria-labelledby="forecast-heading">
            <div className="po-panel-header">
              <div>
                <h2 id="forecast-heading">6-Hour Swimmer Demand Forecast</h2>
                <p className="po-panel-subtitle">
                  Projected hourly bather load based on recent occupancy and meteorological observations
                </p>
              </div>
            </div>

            {loading ? (
              <div className="po-empty-chart">
                <div className="po-inline-spinner" />
                <p>Synchronizing operational forecast projections...</p>
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
                              className={`po-bar ${item.demand.toLowerCase().replace(/\s+/g, '-')}`}
                              style={{
                                height: `${Math.min(100, (item.swimmers / maxChartValue) * 100)}%`,
                              }}
                            />
                          </div>

                          <span className="po-bar-time">{item.time}</span>
                          <span className="po-bar-weather" title={`${item.weather} (${item.weatherDesc})`}>
                            <WeatherIcon category={item.weather} size={12} />
                            <span>{item.weather}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="po-chart-legend">
                  <span><i className="legend-low" /> Low (&lt;{lowDemandMax} swimmers)</span>
                  <span><i className="legend-moderate" /> Moderate ({lowDemandMax}–{modDemandMax} swimmers)</span>
                  <span><i className="legend-high" /> High ({modDemandMax + 1}–{highDemandMax} swimmers)</span>
                  <span><i className="legend-very-high" /> Very High (&gt;{highDemandMax} swimmers)</span>
                </div>

                {/* Clean Tabular Forecast View */}
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
                            <span className={`po-cell-tag ${item.demand.toLowerCase().replace(/\s+/g, '-')}`}>
                              {item.demand}
                            </span>
                          </td>
                          <td>
                            <div className="po-cell-weather">
                              <WeatherIcon category={item.weather} size={14} />
                              <span>{item.weather}</span>
                            </div>
                          </td>
                          <td>
                            {item.rain ? (
                              <span className="po-rain-indicated">
                                <WeatherIcon category="Rainy" size={13} />
                                <span>Precipitation Expected</span>
                              </span>
                            ) : (
                              <span className="po-dry-indicated">Dry</span>
                            )}
                          </td>
                          <td>{item.demand === 'High' || item.demand === 'Very High' ? 'Station backup lifeguard' : 'Standard roster'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="po-chart-meta-footer">
              <div className="po-chart-meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong>Operational Intelligence:</strong> Projections derived from automated edge telemetry and environmental observation models. Workload schedules dynamically adapt to configured facility thresholds.
                </span>
              </div>
            </div>
          </section>

          {/* ================= Operational Resource Plan Table ================= */}
          <section className="po-panel" aria-labelledby="plan-heading">
            <div className="po-panel-header">
              <div>
                <h2 id="plan-heading">Operational Resource Plan</h2>
                <p className="po-panel-subtitle">
                  Scheduled lifeguard staffing, filtration cycle regulation, and routine facility tasks
                </p>
              </div>
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
                      <th className="po-col-assigned-staff">Assigned Staff</th>
                      <th className="po-col-action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planRows.map((row) => (
                      <tr key={row.slotIndex} title={row.rationale ? `Rationale: ${row.rationale}` : undefined}>
                        <td>
                          <strong>{row.timeLabel}</strong>
                          <div className="po-slot-subtext">{row.day}</div>
                        </td>
                        <td>
                          <strong>{row.expectedSwimmers}</strong> swimmers
                          <div>
                            <span className={`po-cell-tag ${row.demandLevel.toLowerCase().replace(/\s+/g, '-')}`}>
                              {row.demandLevel}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="po-staff-cell-wrap">
                            <span className="po-staff-guideline" title="Forecast-driven recommended staffing capacity">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                              <span>{row.staffing.summary}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`po-filtration-pill ${row.filtration.requiresApproval ? 'approval' : ''}`}
                            title={row.filtration.executionStatus || undefined}
                          >
                            <span className="po-relay-stage-indicator">
                              {row.filtration.stage ? `Mode ${row.filtration.stage}` : (
                                row.demandLevel === 'Very High' ? 'Mode 4' :
                                row.demandLevel === 'High' ? 'Mode 3' :
                                row.demandLevel === 'Moderate' ? 'Mode 2' : 'Mode 1'
                              )}
                            </span>
                            <span>{row.filtration.recommendation || row.filtration.mode}</span>
                            {row.filtration.requiresApproval && <span className="po-req-tag">Approval Req</span>}
                          </span>
                        </td>
                        <td>
                          <span className="po-maintenance-pill">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9 11l3 3L22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                            <span>{row.maintenance.taskName}</span>
                          </span>
                        </td>
                        <td className="po-col-assigned-staff">
                          <StaffAssignmentBadges
                            assignments={assignedTasksMap[row.timeLabel] || []}
                            onCancel={handleCancelAssignment}
                            onConfirm={handleConfirmAssignment}
                            onAssignMore={() => {
                              setActiveTaskToAssign({
                                title: `Roster Duty: ${row.staffing.summary}`,
                                category: 'Lifeguard & Operations Duty',
                                timeSlot: row.timeLabel,
                                expectedSwimmers: row.expectedSwimmers,
                                demandLevel: row.demandLevel,
                                existingAssignments: assignedTasksMap[row.timeLabel] || [],
                              })
                              setStaffModalOpen(true)
                            }}
                            buttonLabel="Assign Staff"
                            showButton={false}
                            variant="count"
                          />
                        </td>
                        <td className="po-col-action">
                          <button
                            type="button"
                            className="po-btn-assign"
                            onClick={() => {
                              setActiveTaskToAssign({
                                title: `Roster Duty: ${row.staffing.summary}`,
                                category: 'Lifeguard & Operations Duty',
                                timeSlot: row.timeLabel,
                                expectedSwimmers: row.expectedSwimmers,
                                demandLevel: row.demandLevel,
                                existingAssignments: assignedTasksMap[row.timeLabel] || [],
                              })
                              setStaffModalOpen(true)
                            }}
                            title={
                              (assignedTasksMap[row.timeLabel] || []).length > 0
                                ? 'Assign additional staff to this slot'
                                : 'Assign staff to this slot'
                            }
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <span>Assign Staff</span>
                          </button>
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
                <h2 id="actions-heading">Operational Recommendations</h2>
                <p className="po-panel-subtitle">
                  Supervisory actions derived from live occupancy thresholds and facility safety policies
                </p>
              </div>
            </div>

            {managerActions.length === 0 ? (
              <p className="po-empty-actions">No pending action items identified at this time.</p>
            ) : (
              <div className={`po-actions-grid count-${managerActions.length}`}>
                {managerActions.map((act) => {
                  const cleanDesc = (act.description || '').replace(
                    /(\d+)\s+minutes\s+ago/gi,
                    (match, minsStr) => {
                      const mins = parseInt(minsStr, 10);
                      if (mins >= 1440) {
                        const days = Math.round(mins / 1440);
                        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
                      }
                      if (mins >= 60) {
                        const hours = Math.round(mins / 60);
                        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
                      }
                      return match;
                    }
                  );

                  const cleanTimeframe = /^\d{1,2}:\d{2}\s*(?:AM|PM)$/i.test(act.timeframe || '')
                    ? `Expected at ${act.timeframe}`
                    : act.timeframe;

                  const cleanSource = (act.source === 'public.sensor_readings' || act.source === 'Telemetry Ingestion')
                    ? 'IoT Sensor Telemetry'
                    : (act.source === 'ML Forecast Pipeline')
                    ? 'Occupancy Forecast'
                    : act.source;

                  return (
                    <article className={`po-action-card ${act.priority.toLowerCase()}`} key={act.id}>
                      <div>
                        <div className="po-action-header">
                          <span className={`po-action-priority ${act.priority.toLowerCase()}`}>
                            {act.priority} Priority
                          </span>
                          <div className="po-action-header-right">
                            <span className={`po-action-status-tag ${
                              act.status === 'Action Required' ? 'urgent' :
                              act.status === 'Recommended' ? 'recommended' :
                              act.status === 'Due Soon' ? 'due-soon' : ''
                            }`}>
                              {act.status}
                            </span>
                            <span className="po-action-time">{cleanTimeframe}</span>
                          </div>
                        </div>
                        <h3 className="po-action-title">{act.title}</h3>
                        <p className="po-action-desc">{cleanDesc}</p>
                      </div>

                      <div className="po-action-footer">
                        <span className="po-action-source">Source: {cleanSource}</span>
                        <div className="po-action-footer-roster">
                          <StaffAssignmentBadges
                            assignments={assignedTasksMap[act.title] || []}
                            onCancel={handleCancelAssignment}
                            onConfirm={handleConfirmAssignment}
                            onAssignMore={() => {
                              setActiveTaskToAssign({
                                title: act.title,
                                category: act.category || 'Duty Roster',
                                timeSlot: cleanTimeframe,
                                expectedSwimmers: peakSwimmers || 25,
                                demandLevel: 'Moderate',
                                existingAssignments: assignedTasksMap[act.title] || [],
                              })
                              setStaffModalOpen(true)
                            }}
                            buttonLabel="Assign Staff"
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* ================= Data Quality & System Diagnostics ================= */}
          <section className="po-panel" aria-labelledby="diag-heading">
            <div className="po-panel-header">
              <div>
                <h2 id="diag-heading">System &amp; Telemetry Health</h2>
                <p className="po-panel-subtitle">
                  Live connection status across IoT sensors, database, and inference services
                </p>
              </div>
            </div>

            <div className="po-diagnostics-grid">
              {/* Sensor Freshness */}
              <div className="po-diag-card">
                <h4 className="po-diag-title">ESP32 Sensor Telemetry</h4>
                <div className="po-diag-status">
                  <span className={`po-status-dot ${latestSensor ? 'online' : 'pending'}`} />
                  <span>{latestSensor ? 'Active Observation' : 'Awaiting Sensor Telemetry'}</span>
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
                  <span>{healthData?.database?.connected ? 'PostgreSQL Connected' : 'Disconnected'}</span>
                </div>
                <p className="po-diag-meta">
                  Schema: public · SSL Connection Pooler
                </p>
              </div>

              {/* Prediction Service */}
              <div className="po-diag-card">
                <h4 className="po-diag-title">Prediction Service</h4>
                <div className="po-diag-status">
                  <span className={`po-status-dot ${healthData?.mlService?.model_loaded ? 'online' : 'offline'}`} />
                  <span>{healthData?.mlService?.model_loaded ? 'Pipeline Active (Port 8000)' : 'Model Unavailable'}</span>
                </div>
                <p className="po-diag-meta">
                  Model: {healthData?.mlService?.model_version || 'v1.0.0'} · Auto-Retrain Enabled
                </p>
              </div>

              {/* Weather API Freshness */}
              <div className="po-diag-card">
                <h4 className="po-diag-title">Open-Meteo Weather API</h4>
                <div className="po-diag-status">
                  <span className={`po-status-dot ${weatherConfigured ? 'online' : 'pending'}`} />
                  <span>{weatherConfigured ? 'Live Hourly Forecast' : 'Coordinates Unconfigured'}</span>
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
                  <span>{healthData?.mqtt?.connected ? 'Broker Connected' : 'Connecting to Broker…'}</span>
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


      {/* Staff Duty Assignment & WhatsApp Dispatch Modal */}
      <PoolOrchestratorStaffModal
        isOpen={staffModalOpen}
        onClose={() => setStaffModalOpen(false)}
        taskDetails={activeTaskToAssign}
        facilityName={facilityName}
        onAssignmentSuccess={async (result) => {
          await loadData()
          const count = result?.count || result?.assignments?.length || 1
          setActionNotice(`Duty invitations dispatched via WhatsApp to ${count} staff member(s). Assignments will show as 'Awaiting Response' until confirmed.`)
        }}
      />

      {/* Manual Filtration Cycle Regulation Modal */}
      <PoolOrchestratorFiltrationModal
        isOpen={filtrationModalOpen}
        onClose={() => setFiltrationModalOpen(false)}
        currentMode={currentFiltrationMode}
        currentFiltrationData={currentFiltrationMode?.filtrationData}
        initialStage={modalInitialStage}
        initialReason={modalInitialReason}
        onEngageMode={handleEngageFiltration}
        loading={controllingFiltration}
      />

      {/* Floating WhatsApp Customer Chat Manager Widget */}
      <PoolOrchestratorWhatsAppChat />
    </main>
  )
}
