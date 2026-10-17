import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchWhatsAppConversations,
  fetchWhatsAppConversationMessages,
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
  const [conversations, setConversations] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
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

  // Load conversation threads
  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingConversations(true)
    try {
      const data = await fetchWhatsAppConversations()
      if (data && data.conversations) {
        setConversations(data.conversations)
      }
    } catch (err) {
      console.warn('Could not load WhatsApp conversations:', err.message)
    } finally {
      if (!quiet) setLoadingConversations(false)
    }
  }, [])

  // Load message thread for the selected customer
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
      if (selectedCustomer?.sender_phone) {
        loadMessages(selectedCustomer.sender_phone, true)
      }
    }, 6000)

    return () => clearInterval(interval)
  }, [isOpen, selectedCustomer, loadConversations, loadMessages])

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages])

  // Handle customer selection
  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer)
    setSendError(null)
    loadMessages(customer.sender_phone, false)
  }

  // Handle sending a message as manager
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || composerText).trim()
    if (!text || !selectedCustomer?.sender_phone) return

    setSending(true)
    setSendError(null)
    try {
      await sendWhatsAppMessage(selectedCustomer.sender_phone, text, 'manager')
      setComposerText('')
      // Refresh messages
      await loadMessages(selectedCustomer.sender_phone, true)
      await loadConversations(true)
    } catch (err) {
      setSendError(err.message || 'Failed to dispatch message via Meta Cloud API')
    } finally {
      setSending(false)
    }
  }

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase()
    return (
      (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
      (c.sender_phone && c.sender_phone.includes(q)) ||
      (c.last_message && c.last_message.toLowerCase().includes(q))
    )
  })

  // Format timestamp helper
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* =========================================================================
          1. FLOATING WHATSAPP BUTTON (FAB)
          ========================================================================= */}
      <button
        type="button"
        className="po-wa-fab"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="WhatsApp Customer Chats"
        title="WhatsApp Customer Chats (Live)"
      >
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          fill="currentColor"
          className="po-wa-fab-icon"
        >
          <path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A14 14 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.3-4.3 1.1 1.2-4.2-.3-.4A11.5 11.5 0 1 1 16 27.5zm6.3-8.6c-.3-.2-2-.9-2.3-1s-.5-.2-.7.2-.8 1-1 1.2-.4.3-.7.1a8.8 8.8 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.3c-.2-.3 0-.5.2-.7s.3-.4.5-.6l.3-.5c.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.9 1.2 3.3 1.4 3.5 2.4 3.7 5.8 5.1c.8.4 1.4.6 1.9.7.8.3 1.6.2 2.2.1.7-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6s-.3-.2-.6-.4z" />
        </svg>

        {conversations.length > 0 && (
          <span className="po-wa-badge">{conversations.length}</span>
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
              {selectedCustomer ? (
                <>
                  <button
                    type="button"
                    className="po-wa-back-btn"
                    onClick={() => {
                      setSelectedCustomer(null)
                      loadConversations(true)
                    }}
                    title="Back to all customer chats"
                  >
                    ←
                  </button>
                  <div className="po-wa-avatar">
                    {(selectedCustomer.customer_name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="po-wa-header-info">
                    <h4>{selectedCustomer.customer_name || 'Customer'}</h4>
                    <span>+{selectedCustomer.sender_phone} · Online</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="po-wa-avatar main-brand">
                    <svg viewBox="0 0 32 32" width="22" height="22" fill="#ffffff">
                      <path d="M16 2a13.9 13.9 0 0 0-12 21L2 30l7.2-1.9A14 14 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.9-1.6l-.4-.3-4.3 1.1 1.2-4.2-.3-.4A11.5 11.5 0 1 1 16 27.5z" />
                    </svg>
                  </div>
                  <div className="po-wa-header-info">
                    <h4>WhatsApp Customer Chats</h4>
                    <span>Meta Cloud API · +94 76 579 0015</span>
                  </div>
                </>
              )}
            </div>

            <div className="po-wa-header-actions">
              <button
                type="button"
                className="po-wa-icon-btn"
                onClick={() => {
                  if (selectedCustomer) {
                    loadMessages(selectedCustomer.sender_phone, false)
                  } else {
                    loadConversations(false)
                  }
                }}
                title="Refresh messages"
              >
                🔄
              </button>

              {selectedCustomer && (
                <a
                  href={`https://wa.me/${selectedCustomer.sender_phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="po-wa-icon-btn"
                  title="Open directly in WhatsApp Web"
                >
                  ↗
                </a>
              )}

              <button
                type="button"
                className="po-wa-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat window"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="po-wa-body">
            {!selectedCustomer ? (
              /* =================================================================
                 VIEW A: CUSTOMER CONVERSATION LIST
                 ================================================================= */
              <div className="po-wa-list-container">
                {/* Search Bar */}
                <div className="po-wa-search-box">
                  <input
                    type="text"
                    placeholder="Search customer name or phone…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {loadingConversations ? (
                  <div className="po-wa-loading">
                    <span className="po-wa-spinner" />
                    <p>Loading customer conversations…</p>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="po-wa-empty">
                    <div className="po-wa-empty-icon">💬</div>
                    <h4>No Customer Chats Yet</h4>
                    <p>
                      When bathers send a WhatsApp message to <strong>+94 76 579 0015</strong>, their chat will automatically appear here in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="po-wa-conversation-list">
                    {filteredConversations.map((item) => (
                      <div
                        key={item.sender_phone}
                        className="po-wa-conversation-item"
                        onClick={() => handleSelectCustomer(item)}
                      >
                        <div className="po-wa-item-avatar">
                          {(item.customer_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div className="po-wa-item-content">
                          <div className="po-wa-item-top">
                            <span className="po-wa-item-name">{item.customer_name || 'Customer'}</span>
                            <span className="po-wa-item-time">{formatTime(item.last_activity)}</span>
                          </div>
                          <div className="po-wa-item-bottom">
                            <span className="po-wa-item-phone">+{item.sender_phone}</span>
                            <span className="po-wa-item-preview">
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
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id || m.wa_message_id} className="po-wa-message-pair">
                        {/* Customer Incoming Bubble */}
                        {m.incoming_text && (
                          <div className="po-wa-bubble inbound">
                            <div className="po-wa-sender-label">
                              {selectedCustomer.customer_name || 'Customer'}
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
                              {m.sender_role === 'manager' ? '👤 Manager' : '🤖 AI Automated Pool Bot'}
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

                {/* Quick Canned Response Chips */}
                <div className="po-wa-chips-row">
                  <button
                    type="button"
                    className="po-wa-chip"
                    onClick={() => handleSendMessage('1')}
                    title="Send Current Condition"
                  >
                    🏊 1. Current Condition
                  </button>
                  <button
                    type="button"
                    className="po-wa-chip"
                    onClick={() => handleSendMessage('2')}
                    title="Send Future Demand"
                  >
                    📊 2. Future Demand
                  </button>
                  <button
                    type="button"
                    className="po-wa-chip"
                    onClick={() => handleSendMessage('3')}
                    title="Send Manager Contact"
                  >
                    📞 3. Contact to Manager
                  </button>
                  <button
                    type="button"
                    className="po-wa-chip"
                    onClick={() => handleSendMessage('0')}
                    title="Send Main Menu"
                  >
                    👋 Main Menu
                  </button>
                </div>

                {sendError && (
                  <div className="po-wa-send-error">
                    ⚠️ {sendError}
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
                    placeholder={`Reply to ${selectedCustomer.customer_name || 'customer'}…`}
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
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
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
