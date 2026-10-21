import { useState, useEffect, useMemo } from 'react';
import {
  fetchStaffMembers,
  addStaffMember,
  updateStaffMember,
  deleteStaffMember,
  assignStaffTask,
} from './services/poolOrchestratorApi';

export default function PoolOrchestratorStaffModal({
  isOpen,
  onClose,
  taskDetails = {},
  facilityName = 'Colombo Aquatic Centre Main Pool',
  onAssignmentSuccess,
}) {
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [operationalNotes, setOperationalNotes] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // New staff inline registration form state
  const [isAddingNewStaff, setIsAddingNewStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Lifeguard');
  const [newStaffPhone, setNewStaffPhone] = useState('+94');
  const [addingStaffLoading, setAddingStaffLoading] = useState(false);

  // Inline edit staff state
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState('Lifeguard');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [updatingStaffLoading, setUpdatingStaffLoading] = useState(false);
  const [deletingStaffId, setDeletingStaffId] = useState(null);

  const taskTitle = taskDetails?.title || 'Operational Duty Patrol';
  const taskCategory = taskDetails?.category || 'Lifeguard Duty';
  const timeSlot = taskDetails?.timeSlot || taskDetails?.timeframe || '4:00 PM – 5:00 PM';
  const expectedSwimmers = taskDetails?.expectedSwimmers ?? 20;
  const demandLevel = taskDetails?.demandLevel || 'Moderate';
  const slotDate = taskDetails?.slotDate || new Date().toISOString().split('T')[0];

  // Active existing assignments for this task
  const existingAssignments = useMemo(() => {
    return (taskDetails?.existingAssignments || []).filter((a) => a.status !== 'cancelled');
  }, [taskDetails]);

  // Load staff on modal open & pre-select already assigned staff
  useEffect(() => {
    if (!isOpen) return;
    setSuccessResult(null);
    setError(null);
    setLoadingStaff(true);
    setEditingStaffId(null);

    const controller = new AbortController();
    fetchStaffMembers(controller.signal)
      .then((res) => {
        const staff = res?.staff || [];
        setStaffList(staff);

        // Pre-select staff who are already assigned to this duty task
        const activeExisting = (taskDetails?.existingAssignments || []).filter((a) => a.status !== 'cancelled');
        const preSelected = staff
          .filter((s) => {
            return activeExisting.some((a) => {
              const matchId = a.staff_id && String(a.staff_id) === String(s.id);
              const matchPhone = a.staff_phone && String(a.staff_phone).replace(/[^0-9]/g, '') === String(s.phone).replace(/[^0-9]/g, '');
              const matchName = a.staff_name && a.staff_name.toLowerCase().trim() === s.name.toLowerCase().trim();
              return matchId || matchPhone || matchName;
            });
          })
          .map((s) => String(s.id));

        if (preSelected.length > 0) {
          setSelectedStaffIds(preSelected);
        } else {
          // Newly unassigned tasks start with an empty selection
          setSelectedStaffIds([]);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('Could not load staff members:', err.message);
        }
      })
      .finally(() => setLoadingStaff(false));

    // Preset suggested operational briefing note based on task
    if (taskTitle.toLowerCase().includes('peak') || taskTitle.toLowerCase().includes('roster')) {
      setOperationalNotes('Station by the deep-end tower 10 mins prior. Monitor active bather density.');
    } else if (taskTitle.toLowerCase().includes('water') || taskTitle.toLowerCase().includes('test')) {
      setOperationalNotes('Conduct pH and free chlorine titration. Record values in operational log.');
    } else if (taskTitle.toLowerCase().includes('rain') || taskTitle.toLowerCase().includes('weather')) {
      setOperationalNotes('Inspect outdoor deck drainage and position slip-resistant safety mats.');
    } else {
      setOperationalNotes('Report to the operations desk for duty briefing 10 minutes prior to session.');
    }

    return () => controller.abort();
  }, [isOpen, taskTitle, taskDetails]);

  const toggleStaffSelection = (id) => {
    const strId = String(id);
    setSelectedStaffIds((prev) =>
      prev.includes(strId) ? prev.filter((item) => item !== strId) : [...prev, strId]
    );
  };

  const handleSelectAll = () => {
    setSelectedStaffIds(staffList.map((s) => String(s.id)));
  };

  const handleClearSelection = () => {
    setSelectedStaffIds([]);
  };

  const startEditingStaff = (s) => {
    setEditingStaffId(s.id);
    setEditStaffName(s.name);
    setEditStaffRole(s.role || 'Lifeguard');
    setEditStaffPhone(s.phone);
    setError(null);
  };

  const cancelEditingStaff = () => {
    setEditingStaffId(null);
    setEditStaffName('');
    setEditStaffPhone('');
  };

  const handleSaveEditStaff = async (e) => {
    if (e) e.preventDefault();
    if (!editStaffName.trim() || !editStaffPhone.trim()) {
      setError('Staff name and phone number cannot be empty.');
      return;
    }

    setUpdatingStaffLoading(true);
    setError(null);
    try {
      const res = await updateStaffMember(editingStaffId, {
        name: editStaffName.trim(),
        role: editStaffRole,
        phone: editStaffPhone.trim(),
      });
      const updated = res.staff;
      setStaffList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingStaffId(null);
    } catch (err) {
      setError(err.message || 'Failed to update staff member.');
    } finally {
      setUpdatingStaffLoading(false);
    }
  };

  const handleDeleteStaff = async (s) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to remove ${s.name} (${s.phone}) from the facility staff roster?\n\nThis will remove them from future assignments.`
    );
    if (!confirmDelete) return;

    setDeletingStaffId(s.id);
    setError(null);
    try {
      await deleteStaffMember(s.id);
      setStaffList((prev) => prev.filter((item) => item.id !== s.id));
      setSelectedStaffIds((prev) => prev.filter((id) => id !== String(s.id)));
    } catch (err) {
      setError(err.message || 'Failed to remove staff member.');
    } finally {
      setDeletingStaffId(null);
    }
  };

  const selectedStaffMembers = useMemo(() => {
    return staffList.filter((s) => selectedStaffIds.includes(String(s.id)));
  }, [staffList, selectedStaffIds]);

  // Live WhatsApp message preview
  const liveMessagePreview = useMemo(() => {
    const previewName = selectedStaffMembers.length === 1
      ? selectedStaffMembers[0].name
      : selectedStaffMembers.length > 1
      ? `${selectedStaffMembers[0].name} (and ${selectedStaffMembers.length - 1} other${selectedStaffMembers.length > 2 ? 's' : ''})`
      : '[Staff Member Name]';

    return (
      `🏊 *${facilityName} — Operational Duty Assignment*\n\n` +
      `Hello *${previewName}*,\n` +
      `You have been rostered for an operational duty shift by the facility manager:\n\n` +
      `• 📋 *Duty / Task:* *${taskTitle}*\n` +
      `• 🏷️ *Category:* ${taskCategory}\n` +
      `• 📅 *Date:* *${slotDate}*\n` +
      `• 🕒 *Time Slot:* *${timeSlot}*\n` +
      `• 👥 *Predicted Bather Load:* ~*${expectedSwimmers} Swimmers* (${demandLevel} Demand)\n` +
      (operationalNotes ? `• ℹ️ *Operational Note:* ${operationalNotes}\n\n` : '\n') +
      `📍 *Reporting:* Please arrive at the pool operations desk 10 minutes prior to your shift.\n\n` +
      `👉 *PLEASE RESPOND TO CONFIRM AVAILABILITY:*\n` +
      `• Reply *1* or *ACCEPT* to confirm duty shift\n` +
      `• Reply *2 [Reason]* or *REJECT [Reason]* if unavailable (e.g. "2 Medical leave")`
    );
  }, [selectedStaffMembers, facilityName, taskTitle, taskCategory, slotDate, timeSlot, expectedSwimmers, demandLevel, operationalNotes]);

  const handleAddNewStaff = async (e) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPhone.trim()) {
      setError('Please provide staff name and a valid phone number with country code (e.g. +9477...).');
      return;
    }

    setAddingStaffLoading(true);
    setError(null);
    try {
      const res = await addStaffMember({
        name: newStaffName.trim(),
        role: newStaffRole,
        phone: newStaffPhone.trim(),
        status: 'available',
      });
      const created = res.staff;
      setStaffList((prev) => [...prev, created]);
      setSelectedStaffIds((prev) => [...prev, String(created.id)]);
      setIsAddingNewStaff(false);
      setNewStaffName('');
      setNewStaffPhone('+94');
    } catch (err) {
      setError(err.message || 'Failed to save staff member');
    } finally {
      setAddingStaffLoading(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (selectedStaffIds.length === 0) {
      setError('Please select at least one staff member to assign.');
      return;
    }

    // Identify which staff are already assigned vs newly added
    const activeExisting = (taskDetails?.existingAssignments || []).filter((a) => a.status !== 'cancelled');
    const existingStaffIds = new Set(
      staffList.filter((s) => {
        return activeExisting.some((a) => {
          const matchId = a.staff_id && String(a.staff_id) === String(s.id);
          const matchPhone = a.staff_phone && String(a.staff_phone).replace(/[^0-9]/g, '') === String(s.phone).replace(/[^0-9]/g, '');
          const matchName = a.staff_name && a.staff_name.toLowerCase().trim() === s.name.toLowerCase().trim();
          return matchId || matchPhone || matchName;
        });
      }).map((s) => String(s.id))
    );

    const newlySelectedIds = selectedStaffIds.filter((id) => !existingStaffIds.has(String(id)));

    // If all selected staff were already assigned:
    if (newlySelectedIds.length === 0) {
      setError('The selected staff member(s) are already assigned to this duty shift. Select an additional staff member to dispatch new duty shifts.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        staffIds: newlySelectedIds.map((id) => parseInt(id, 10)),
        taskTitle,
        taskCategory,
        timeSlot,
        slotDate,
        expectedSwimmers,
        demandLevel,
        operationalNotes,
        sendWhatsApp,
      };

      const result = await assignStaffTask(payload);
      setSuccessResult(result);
      if (onAssignmentSuccess) {
        onAssignmentSuccess(result);
      }
    } catch (err) {
      setError(err.message || 'Failed to dispatch staff assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="po-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
      <div className="po-modal-container po-modal-container-lg">
        {/* Modal Header */}
        <div className="po-modal-header">
          <div className="po-modal-header-left">
            <div className="po-modal-icon-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="16 11 18 13 22 9" />
              </svg>
            </div>
            <div>
              <h3 id="staff-modal-title">Assign Operational Staff &amp; Dispatch Duty Alerts</h3>
              <p className="po-modal-subtitle">
                Allocate one or multiple team members to forecast-driven shifts with interactive WhatsApp confirmation
              </p>
            </div>
          </div>
          <button
            type="button"
            className="po-modal-close-btn"
            onClick={onClose}
            aria-label="Close duty assignment dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="po-modal-body">
          {error && (
            <div className="po-modal-alert error">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {successResult ? (
            <div className="po-modal-success-card">
              <div className="po-success-icon-wrap">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h4>Duty Shift Invitations Dispatched!</h4>
              <p>
                Assigned <strong>{successResult.count || successResult.assignments?.length || 1} staff member(s)</strong> to <strong>{taskTitle}</strong> for <strong>{timeSlot}</strong>.
              </p>

              <div className="po-assigned-list-preview">
                {(successResult.assignments || [successResult.assignment]).map((a) => (
                  <div key={a.id || a.staff_id} className="po-assigned-member-chip">
                    <span className="po-assigned-member-name">👤 {a.staff_name}</span>
                    <span className="po-assigned-member-phone">({a.staff_phone})</span>
                    <span className="po-assigned-status-tag pending">⏳ Awaiting WhatsApp Reply</span>
                  </div>
                ))}
              </div>

              <div className="po-dispatch-status-banner">
                <span className="po-status-dot online" />
                <span>
                  WhatsApp Duty Alert: <strong>Dispatched via Meta Cloud API</strong>. Each staff member has received <strong>1️⃣ ACCEPT</strong> and <strong>2️⃣ REJECT</strong> options.
                </span>
              </div>

              <div className="po-info-callout">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong>Note:</strong> The dashboard will show these staff as <em>Pending Confirmation</em> until they reply. Once accepted, their name will appear with a green checkmark as officially assigned.
                </span>
              </div>

              <div className="po-success-actions">
                <button
                  type="button"
                  className="po-btn-primary"
                  onClick={onClose}
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAssignSubmit} className="po-staff-form">
              {/* Task Summary Banner */}
              <div className="po-task-summary-banner">
                <div className="po-task-banner-item">
                  <small>Target Slot</small>
                  <strong>{timeSlot}</strong>
                </div>
                <div className="po-task-banner-item">
                  <small>Predicted Attendance</small>
                  <strong>~{expectedSwimmers} swimmers ({demandLevel})</strong>
                </div>
                <div className="po-task-banner-item">
                  <small>Operational Duty</small>
                  <strong>{taskTitle}</strong>
                </div>
              </div>

              {/* Staff Member Multi-Select Section */}
              <div className="po-form-group">
                <div className="po-form-label-row">
                  <label>
                    Select Staff Members to Assign:
                    <span className="po-badge-count">
                      {selectedStaffIds.length} selected
                    </span>
                  </label>
                  <div className="po-select-actions">
                    <button
                      type="button"
                      className="po-link-action"
                      onClick={handleSelectAll}
                    >
                      Select All
                    </button>
                    <span className="po-divider-dot">·</span>
                    <button
                      type="button"
                      className="po-link-action"
                      onClick={handleClearSelection}
                    >
                      Clear
                    </button>
                    <span className="po-divider-dot">·</span>
                    {!isAddingNewStaff && (
                      <button
                        type="button"
                        className="po-link-action"
                        onClick={() => setIsAddingNewStaff(true)}
                      >
                        + Register New Staff
                      </button>
                    )}
                  </div>
                </div>

                {loadingStaff ? (
                  <div className="po-input-loading">Loading facility staff roster…</div>
                ) : staffList.length === 0 ? (
                  <div className="po-empty-staff-list">
                    No staff members registered. Please click "+ Register New Staff" to add staff.
                  </div>
                ) : (
                  <div className="po-staff-checklist" role="group" aria-label="Facility Staff Members">
                    {staffList.map((s) => {
                      const isSelected = selectedStaffIds.includes(String(s.id));
                      const isEditing = editingStaffId === s.id;

                      const existingAssign = existingAssignments.find((a) => {
                        const matchId = a.staff_id && String(a.staff_id) === String(s.id);
                        const matchPhone = a.staff_phone && String(a.staff_phone).replace(/[^0-9]/g, '') === String(s.phone).replace(/[^0-9]/g, '');
                        const matchName = a.staff_name && a.staff_name.toLowerCase().trim() === s.name.toLowerCase().trim();
                        return matchId || matchPhone || matchName;
                      });

                      if (isEditing) {
                        return (
                          <div key={s.id} className="po-staff-check-item editing">
                            <div className="po-staff-inline-edit-form">
                              <div className="po-inline-edit-fields">
                                <div className="po-inline-field">
                                  <label>Full Name:</label>
                                  <input
                                    type="text"
                                    value={editStaffName}
                                    onChange={(e) => setEditStaffName(e.target.value)}
                                    placeholder="Full Name"
                                    autoFocus
                                  />
                                </div>
                                <div className="po-inline-field">
                                  <label>Role:</label>
                                  <select
                                    value={editStaffRole}
                                    onChange={(e) => setEditStaffRole(e.target.value)}
                                  >
                                    <option value="Senior Lifeguard">Senior Lifeguard</option>
                                    <option value="Lifeguard">Lifeguard</option>
                                    <option value="Deck Operations & Chemical Control">Deck Operations &amp; Chemical Control</option>
                                    <option value="Pool Plant & Maintenance">Pool Plant &amp; Maintenance</option>
                                  </select>
                                </div>
                                <div className="po-inline-field">
                                  <label>WhatsApp Number:</label>
                                  <input
                                    type="text"
                                    value={editStaffPhone}
                                    onChange={(e) => setEditStaffPhone(e.target.value)}
                                    placeholder="+94..."
                                  />
                                </div>
                              </div>
                              <div className="po-inline-edit-buttons">
                                <button
                                  type="button"
                                  className="po-btn-save-sm"
                                  onClick={handleSaveEditStaff}
                                  disabled={updatingStaffLoading}
                                >
                                  {updatingStaffLoading ? 'Saving…' : 'Save Changes'}
                                </button>
                                <button
                                  type="button"
                                  className="po-btn-cancel-sm"
                                  onClick={cancelEditingStaff}
                                  disabled={updatingStaffLoading}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={s.id}
                          className={`po-staff-check-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleStaffSelection(s.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStaffSelection(s.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="po-staff-checkbox"
                          />
                          <div className="po-staff-check-avatar">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="po-staff-check-info">
                            <div className="po-staff-check-title">
                              <strong>{s.name}</strong>
                              <span className="po-staff-role-badge">{s.role}</span>
                            </div>
                            <div className="po-staff-check-phone">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              <span>{s.phone}</span>
                            </div>
                          </div>
                          <div className="po-staff-check-status">
                            {existingAssign ? (
                              existingAssign.status === 'confirmed' ? (
                                <span className="po-status-pill assigned-confirmed" title="Already confirmed for this shift">
                                  ✓ Assigned (Confirmed)
                                </span>
                              ) : (
                                <span className="po-status-pill assigned-pending" title="Awaiting WhatsApp confirmation for this shift">
                                  ⏳ Assigned (Pending)
                                </span>
                              )
                            ) : (
                              <span className="po-status-pill available">Available</span>
                            )}
                          </div>
                          <div className="po-staff-check-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="po-staff-micro-btn edit"
                              title="Edit staff member details"
                              aria-label={`Edit ${s.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingStaff(s);
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="po-staff-micro-btn delete"
                              title="Remove staff member from roster"
                              aria-label={`Delete ${s.name}`}
                              disabled={deletingStaffId === s.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStaff(s);
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Inline Add New Staff Form */}
              {isAddingNewStaff && (
                <div className="po-inline-add-staff">
                  <div className="po-inline-add-head">
                    <h5>Register New Pool Staff Member</h5>
                    <button
                      type="button"
                      className="po-link-action"
                      onClick={() => setIsAddingNewStaff(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="po-form-grid-2">
                    <div>
                      <label htmlFor="new-staff-name">Full Name:</label>
                      <input
                        id="new-staff-name"
                        type="text"
                        placeholder="e.g. Asanka Perera"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="new-staff-role">Role:</label>
                      <select
                        id="new-staff-role"
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value)}
                      >
                        <option value="Senior Lifeguard">Senior Lifeguard</option>
                        <option value="Lifeguard">Lifeguard</option>
                        <option value="Deck Operations & Chemical Control">Deck Operations &amp; Chemical Control</option>
                        <option value="Pool Plant & Maintenance">Pool Plant &amp; Maintenance</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <label htmlFor="new-staff-phone">WhatsApp Number (with country code):</label>
                    <input
                      id="new-staff-phone"
                      type="text"
                      placeholder="e.g. +94771234567"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    className="po-btn-secondary"
                    style={{ marginTop: '10px' }}
                    onClick={handleAddNewStaff}
                    disabled={addingStaffLoading}
                  >
                    {addingStaffLoading ? 'Saving…' : 'Save & Select Staff'}
                  </button>
                </div>
              )}

              {/* Operational Instructions / Notes */}
              <div className="po-form-group">
                <label htmlFor="operational-notes">Operational Instructions &amp; Briefing:</label>
                <textarea
                  id="operational-notes"
                  rows={2}
                  className="po-textarea"
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  placeholder="Instructions for staff on arrival (e.g. station location, specific duties)..."
                />
              </div>

              {/* WhatsApp Notification Dispatch Toggle */}
              <div className="po-checkbox-group">
                <label className="po-checkbox-label">
                  <input
                    type="checkbox"
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                  />
                  <span>
                    Dispatch interactive WhatsApp notification with <strong>1️⃣ ACCEPT</strong> &amp; <strong>2️⃣ REJECT</strong> options
                  </span>
                </label>
              </div>

              {/* Live WhatsApp Message Preview Bubble */}
              {sendWhatsApp && (
                <div className="po-wa-preview-wrap">
                  <div className="po-wa-preview-head">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366" aria-hidden="true">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                    </svg>
                    <span>
                      Live WhatsApp Preview — Will dispatch to {selectedStaffMembers.length} staff member{selectedStaffMembers.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <pre className="po-wa-bubble">{liveMessagePreview}</pre>
                </div>
              )}

              {/* Action Buttons */}
              <div className="po-modal-actions">
                <button
                  type="button"
                  className="po-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="po-btn-primary"
                  disabled={submitting || selectedStaffIds.length === 0}
                >
                  {submitting ? (
                    <>
                      <div className="po-btn-spinner" />
                      <span>Dispatching to {selectedStaffIds.length} Staff…</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span>
                        Assign {selectedStaffIds.length > 0 ? `(${selectedStaffIds.length}) ` : ''}&amp; Dispatch WhatsApp
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
