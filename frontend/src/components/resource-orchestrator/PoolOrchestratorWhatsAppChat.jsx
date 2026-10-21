import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  fetchWhatsAppConversations,
  fetchWhatsAppConversationMessages,
  fetchStaffMembers,
  sendWhatsAppMessage,
} from './services/poolOrchestratorApi'

function formatWhatsAppText(text) {
  if (!text) return ''
  // Format *bold* as <strong>
  const formatted = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
  return formatted
}

export default function PoolOrchestratorWhatsAppChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('customers') // 'customers' | 'staff'
  const [conversations, setConversations] = useState([])
  const [staffList, setStaffList] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sendError, setSendError] = useState(null)

  const messagesEndRef = useRef(null)

  // Scroll to bottom of messages container
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load conversation threads & registered facility staff
  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingConversations(true)
    try {
      const [convRes, staffRes] = await Promise.all([
        fetchWhatsAppConversations().catch(() => ({ conversations: [] })),
        fetchStaffMembers().catch(() => ({ staff: [] })),
      ])
      if (convRes && convRes.conversations) {
        setConversations(convRes.conversations)
      }
      if (staffRes && staffRes.staff) {
        setStaffList(staffRes.staff)
      }
    } catch (err) {
      console.warn('Could not load WhatsApp conversations or staff:', err.message)
    } finally {
      if (!quiet) setLoadingConversations(false)
    }
  }, [])

  // Load message thread for the selected contact
  const loadMessages = useCallback(async (phone, quiet = false) => {
    if (!phone) return
    if (!quiet) setLoadingMessages(true)
    try {
      const data = await fetchWhatsAppConversationMessages(phone)
      if (data && data.messages) {
        setMessages(data.messages)
      }
    } catch (err) {
      console.warn(`Could not load messages for ${phone}:`, err.message)
    } finally {
      if (!quiet) setLoadingMessages(false)
    }
  }, [])

  // Auto-poll conversations and active chat thread when popup is open
  useEffect(() => {
    loadConversations(true) // Initial silent load to get count
    if (!isOpen) return

    loadConversations(false)
    const interval = setInterval(() => {
      loadConversations(true)
      if (selectedContact?.sender_phone) {
        loadMessages(selectedContact.sender_phone, true)
      }
    }, 6000)

    return () => clearInterval(interval)
  }, [isOpen, selectedContact, loadConversations, loadMessages])

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])

  // Partition conversations into Customer Chats and Staff Member Chats
  const { customerConversations, staffConversations } = useMemo(() => {
    const staffPhoneMap = new Map()
    staffList.forEach((s) => {
      const clean = String(s.phone || '').replace(/[^0-9]/g, '')
      if (clean) staffPhoneMap.set(clean, s)
    })

    const customers = []
    const staffMap = new Map()

    // 1. Process active conversations from database
    conversations.forEach((c) => {
      const cleanPhone = String(c.sender_phone || '').replace(/[^0-9]/g, '')
      const matchedStaff = staffPhoneMap.get(cleanPhone)

      if (c.is_staff || matchedStaff) {
        const staffObj = matchedStaff || {}
        staffMap.set(cleanPhone, {
          ...c,
          is_staff: true,
          customer_name: staffObj.name || c.contact_name || c.customer_name || 'Staff Member',
          staff_role: staffObj.role || c.staff_role || 'Operations Staff',
          staff_id: staffObj.id || c.staff_id,
          phone_display: staffObj.phone || `+${c.sender_phone}`,
        })
      } else {
        customers.push({
          ...c,
          is_staff: false,
          customer_name: c.contact_name || c.customer_name || 'Customer',
          phone_display: `+${c.sender_phone}`,
        })
      }
    })

    // 2. Ensure all registered staff members are listed under Staff Operations
    staffList.forEach((s) => {
      const cleanPhone = String(s.phone || '').replace(/[^0-9]/g, '')
      if (cleanPhone && !staffMap.has(cleanPhone)) {
        staffMap.set(cleanPhone, {
          sender_phone: cleanPhone,
          customer_name: s.name,
          contact_name: s.name,
          staff_role: s.role || 'Staff Member',
          staff_id: s.id,
          phone_display: s.phone,
          is_staff: true,
          total_messages: 0,
          last_activity: null,
          last_message: 'Registered staff member · Ready for direct messaging',
          last_status: 'available',
        })
      }
    })

    const staffListArray = Array.from(staffMap.values()).sort((a, b) => {
      if (a.last_activity && b.last_activity) {
        return new Date(b.last_activity) - new Date(a.last_activity)
      }
      if (a.last_activity) return -1
      if (b.last_activity) return 1
      return (a.customer_name || '').localeCompare(b.customer_name || '')
    })

    return {
      customerConversations: customers,
      staffConversations: staffListArray,
    }
  }, [conversations, staffList])

  // Filter list based on active tab and search query
  const filteredList = useMemo(() => {
    const list = activeTab === 'customers' ? customerConversations : staffConversations
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((c) => {
      return (
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.sender_phone && c.sender_phone.includes(q)) ||
        (c.staff_role && c.staff_role.toLowerCase().includes(q)) ||
        (c.last_message && c.last_message.toLowerCase().includes(q))
      )
    })
  }, [activeTab, customerConversations, staffConversations, searchQuery])

  // Handle contact selection
  const handleSelectContact = (contact) => {
    setSelectedContact(contact)
    setSendError(null)
    loadMessages(contact.sender_phone, false)
  }

  // Handle sending a message as manager
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || composerText).trim()
    if (!text || !selectedContact?.sender_phone) return

    setSending(true)
    setSendError(null)
    try {
      await sendWhatsAppMessage(selectedContact.sender_phone, text, 'manager')
      setComposerText('')
      // Refresh messages
      await loadMessages(selectedContact.sender_phone, true)
      await loadConversations(true)
    } catch (err) {
      setSendError(err.message || 'Failed to dispatch message via Meta Cloud API')
    } finally {
      setSending(false)
    }
  }

  // Format timestamp helper
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const totalUnreadCount = conversations.length

  return (
    <>
      {/* =========================================================================
          1. FLOATING WHATSAPP BUTTON (FAB)
          ========================================================================= */}
      <button
        type="button"
        className="po-wa-fab"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="WhatsApp Operations Hub"
        title="WhatsApp Operations Hub (Customer Inquiries & Staff Chats)"
      >
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          fill="currentColor"
          className="po-wa-fab-icon"
          aria-hidden="true"
        >
          <path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A14 14 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.3-4.3 1.1 1.2-4.2-.3-.4A11.5 11.5 0 1 1 16 27.5zm6.3-8.6c-.3-.2-2-.9-2.3-1s-.5-.2-.7.2-.8 1-1 1.2-.4.3-.7.1a8.8 8.8 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.3c-.2-.3 0-.5.2-.7s.3-.4.5-.6l.3-.5c.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.9 1.2 3.3 1.4 3.5 2.4 3.7 5.8 5.1c.8.4 1.4.6 1.9.7.8.3 1.6.2 2.2.1.7-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6s-.3-.2-.6-.4z" />
        </svg>

        {totalUnreadCount > 0 && (
          <span className="po-wa-badge">{totalUnreadCount}</span>
        )}
      </button>

      {/* =========================================================================
          2. WHATSAPP WEB STYLE CHAT MODAL
          ========================================================================= */}
      {isOpen && (
        <div className="po-wa-window">
          {/* Top Bar Header */}
          <div className="po-wa-header">
            <div className="po-wa-header-left">
              {selectedContact ? (
                <>
                  <button
                    type="button"
                    className="po-wa-back-btn"
                    onClick={() => {
                      setSelectedContact(null)
                      loadConversations(true)
                    }}
                    title="Back to conversations list"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  </button>
                  <div className={`po-wa-avatar ${selectedContact.is_staff ? 'staff' : 'customer'}`}>
                    {(selectedContact.customer_name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="po-wa-header-info">
                    <h4>
                      {selectedContact.customer_name || 'Contact'}
                      {selectedContact.is_staff && (
                        <span className="po-wa-header-role-badge">{selectedContact.staff_role}</span>
                      )}
                    </h4>
                    <span>
                      {selectedContact.is_staff ? 'Staff Member · ' : 'Customer Inquiry · '}
                      {selectedContact.phone_display || `+${selectedContact.sender_phone}`}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="po-wa-avatar main-brand">
                    <svg viewBox="0 0 32 32" width="22" height="22" fill="#ffffff" aria-hidden="true">
                      <path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A14 14 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.3-4.3 1.1 1.2-4.2-.3-.4A11.5 11.5 0 1 1 16 27.5z" />
                    </svg>
                  </div>
                  <div className="po-wa-header-info">
                    <h4>WhatsApp Communications Hub</h4>
                    <span>Meta Cloud API · Multi-Channel Dispatch</span>
                  </div>
                </>
              )}
            </div>

            <div className="po-wa-header-actions">
              <button
                type="button"
                className="po-wa-icon-btn"
                onClick={() => {
                  if (selectedContact) {
                    loadMessages(selectedContact.sender_phone, false)
                  } else {
                    loadConversations(false)
                  }
                }}
                title="Refresh conversations"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>

              {selectedContact && (
                <a
                  href={`https://wa.me/${selectedContact.sender_phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="po-wa-icon-btn"
                  title="Open directly in WhatsApp Web"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}

              <button
                type="button"
                className="po-wa-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat window"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="po-wa-body">
            {!selectedContact ? (
              /* =================================================================
                 VIEW A: DUAL-TAB CONVERSATION DIRECTORY
                 ================================================================= */
              <div className="po-wa-list-container">
                {/* 2 Navigation Tabs: Customer Chats & Staff Members Chats */}
                <div className="po-wa-nav-tabs" role="tablist" aria-label="WhatsApp Inbox Channels">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'customers'}
                    className={`po-wa-nav-tab ${activeTab === 'customers' ? 'active' : ''}`}
                    onClick={() => setActiveTab('customers')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Customer Chats</span>
                    <span className="po-wa-tab-count">{customerConversations.length}</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'staff'}
                    className={`po-wa-nav-tab ${activeTab === 'staff' ? 'active' : ''}`}
                    onClick={() => setActiveTab('staff')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>Staff Members</span>
                    <span className="po-wa-tab-count">{staffConversations.length}</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="po-wa-search-box">
                  <input
                    type="text"
                    placeholder={
                      activeTab === 'customers'
                        ? 'Search customer name or phone…'
                        : 'Search staff name, role, or phone…'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {loadingConversations ? (
                  <div className="po-wa-loading">
                    <span className="po-wa-spinner" />
                    <p>Loading {activeTab === 'customers' ? 'customer' : 'staff'} conversations…</p>
                  </div>
                ) : filteredList.length === 0 ? (
                  <div className="po-wa-empty">
                    <div className="po-wa-empty-icon">
                      {activeTab === 'customers' ? (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      )}
                    </div>
                    <h4>{activeTab === 'customers' ? 'No Customer Inquiries Yet' : 'No Staff Messages Found'}</h4>
                    <p>
                      {activeTab === 'customers'
                        ? 'When public visitors message the pool WhatsApp number (+94 76 579 0015), their inquiries will appear here.'
                        : 'Operational duty shift dispatches and staff WhatsApp reply logs will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="po-wa-conversation-list">
                    {filteredList.map((item) => (
                      <div
                        key={item.sender_phone}
                        className={`po-wa-conversation-item ${item.is_staff ? 'is-staff' : 'is-customer'}`}
                        onClick={() => handleSelectContact(item)}
                      >
                        <div className={`po-wa-item-avatar ${item.is_staff ? 'staff' : 'customer'}`}>
                          {(item.customer_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="po-wa-item-content">
                          <div className="po-wa-item-top">
                            <span className="po-wa-item-name">
                              {item.customer_name || 'Contact'}
                              {item.is_staff && item.staff_role && (
                                <span className="po-wa-item-role-badge">{item.staff_role}</span>
                              )}
                            </span>
                            <span className="po-wa-item-time">{formatTime(item.last_activity)}</span>
                          </div>
                          <div className="po-wa-item-bottom">
                            <span className="po-wa-item-phone">{item.phone_display || `+${item.sender_phone}`}</span>
                            <span className="po-wa-item-preview" title={item.last_message}>
                              {item.last_message || 'Active conversation'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* =================================================================
                 VIEW B: ACTIVE CHAT THREAD
                 ================================================================= */
              <div className="po-wa-thread-container">
                {/* Message Bubbles Area */}
                <div className="po-wa-messages-scroll">
                  <div className="po-wa-date-pill">TODAY</div>

                  {loadingMessages ? (
                    <div className="po-wa-loading">
                      <span className="po-wa-spinner" />
                      <p>Loading messages…</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="po-wa-empty">
                      <p>No messages recorded for this contact yet.</p>
                      {selectedContact.is_staff && (
                        <p style={{ fontSize: '11px', color: '#64748b' }}>
                          Type a message below or click a template chip to send a direct WhatsApp briefing to {selectedContact.customer_name}.
                        </p>
                      )}
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id || m.wa_message_id} className="po-wa-message-pair">
                        {/* Customer / Staff Incoming Bubble */}
                        {m.incoming_text && (
                          <div className="po-wa-bubble inbound">
                            <div className="po-wa-sender-label">
                              {selectedContact.customer_name || 'Contact'}
                            </div>
                            <div className="po-wa-bubble-text">{m.incoming_text}</div>
                            <div className="po-wa-bubble-time">
                              {formatTime(m.received_at)}
                            </div>
                          </div>
                        )}

                        {/* Outgoing Bot or Manager Bubble */}
                        {m.reply_text && (
                          <div
                            className={`po-wa-bubble outbound ${
                              m.sender_role === 'manager' ? 'manager' : 'bot'
                            }`}
                          >
                            <div className="po-wa-sender-label">
                              {m.sender_role === 'manager' ? 'Facility Manager' : 'Automated Pool Assistant'}
                            </div>
                            <div
                              className="po-wa-bubble-text formatted"
                              dangerouslySetInnerHTML={{
                                __html: formatWhatsAppText(m.reply_text).replace(/\n/g, '<br />'),
                              }}
                            />
                            <div className="po-wa-bubble-time">
                              {formatTime(m.received_at)} <span className="po-wa-checks">✓✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Canned Response Chips (Tailored for Customer vs Staff) */}
                <div className="po-wa-chips-row">
                  {selectedContact.is_staff ? (
                    <>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('Please report to the pool operations desk 10 minutes prior to your scheduled shift.')}
                        title="Send Duty Arrival Reminder"
                      >
                        Duty Reminder
                      </button>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('Your duty shift attendance has been confirmed and updated in the daily operations roster.')}
                        title="Send Shift Confirmation"
                      >
                        Shift Confirmed
                      </button>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('Please confirm your availability for today’s scheduled operational duties.')}
                        title="Request Availability Check"
                      >
                        Check Availability
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('1')}
                        title="Send Current Condition"
                      >
                        1. Current Condition
                      </button>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('2')}
                        title="Send Future Demand"
                      >
                        2. Future Demand
                      </button>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('3')}
                        title="Send Manager Contact"
                      >
                        3. Contact Manager
                      </button>
                      <button
                        type="button"
                        className="po-wa-chip"
                        onClick={() => handleSendMessage('0')}
                        title="Send Main Menu"
                      >
                        Main Menu
                      </button>
                    </>
                  )}
                </div>

                {sendError && (
                  <div className="po-wa-send-error">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{sendError}</span>
                  </div>
                )}

                {/* Composer Bar */}
                <form
                  className="po-wa-composer"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                >
                  <input
                    type="text"
                    placeholder={`Message ${selectedContact.customer_name || 'contact'}…`}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    className="po-wa-send-btn"
                    disabled={sending || !composerText.trim()}
                    title="Send WhatsApp message"
                  >
                    {sending ? (
                      '…'
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
