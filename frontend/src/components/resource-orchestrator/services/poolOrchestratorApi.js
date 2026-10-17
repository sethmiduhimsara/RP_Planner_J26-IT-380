/**
 * API client helper for Pool Orchestrator.
 * Connects the React dashboard to the Express backend endpoints.
 */

const BACKEND_BASE_URL =
  (import.meta.env && import.meta.env.VITE_BACKEND_URL) || 'http://localhost:5001';

const API_BASE = `${BACKEND_BASE_URL}/api/pool-orchestrator`;

/**
 * Fetch latest sensor reading, occupancy count, filtration relay state, and active resource plan
 */
export async function fetchLatest(signal) {
  const response = await fetch(`${API_BASE}/latest`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest pool state (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetch the current 6-hour swimmer occupancy predictions and resource plan from the database
 */
export async function fetchForecast(signal) {
  const response = await fetch(`${API_BASE}/forecast`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch forecast predictions (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetch dedicated operational resource plan and manager action list
 */
export async function fetchResourcePlan(signal) {
  const response = await fetch(`${API_BASE}/resource-plan`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch resource plan (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetch backend component health, database connection, and ML service readiness
 */
export async function fetchHealth(signal) {
  const response = await fetch(`${API_BASE}/health`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  return response.json();
}

/**
 * Ingest a sensor reading payload
 */
export async function submitSensorReading(payload) {
  const response = await fetch(`${API_BASE}/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to submit sensor reading (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Trigger an on-demand forecast refresh on the backend
 */
export async function triggerForecastRefresh() {
  const response = await fetch(`${API_BASE}/forecast/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Forecast refresh failed (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Publishes relay actuation command to ESP32 hardware via MQTT.
 * Supports either positional parameters (r1, r2, r3, r4, reason) or an options object ({ stage, r1, r2, r3, r4, reason }).
 */
export async function sendFiltrationCommand(r1OrOptions = 0, r2 = 0, r3 = 0, r4 = 0, reason = 'Manager manual trigger') {
  let body = {};
  if (typeof r1OrOptions === 'object' && r1OrOptions !== null) {
    body = r1OrOptions;
  } else {
    body = { r1: r1OrOptions, r2, r3, r4, reason };
  }

  const response = await fetch(`${API_BASE}/filtration/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to send filtration command (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches real-time MQTT subscriber connection and packet stats
 */
export async function fetchMqttStatus(signal) {
  const response = await fetch(`${API_BASE}/mqtt/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch MQTT status (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches current manager operational settings and threshold bands
 */
export async function fetchSettings(signal) {
  const response = await fetch(`${API_BASE}/settings`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch settings (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Updates manager operational settings, demand thresholds, and policies
 */
export async function saveSettings(payload) {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || errorBody.message || `Failed to save settings (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches WhatsApp Cloud API integration status and recent customer messages
 */
export async function fetchWhatsAppStatus(signal) {
  const response = await fetch(`${API_BASE}/whatsapp/status`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch WhatsApp status (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Dispatches an on-demand WhatsApp message via Meta Cloud API
 */
export async function sendWhatsAppMessage(to, message, senderRole = 'manager') {
  const response = await fetch(`${API_BASE}/whatsapp/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ to, message, senderRole }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to send WhatsApp message (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches grouped customer conversation threads for manager WhatsApp chat
 */
export async function fetchWhatsAppConversations(signal) {
  const response = await fetch(`${API_BASE}/whatsapp/conversations`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch WhatsApp conversations (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches chronological message history for a specific customer phone
 */
export async function fetchWhatsAppConversationMessages(phone, signal) {
  const cleanPhone = encodeURIComponent(String(phone).replace(/[^0-9]/g, ''));
  const response = await fetch(`${API_BASE}/whatsapp/conversations/${cleanPhone}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversation messages for ${phone} (HTTP ${response.status})`);
  }

  return response.json();
}
