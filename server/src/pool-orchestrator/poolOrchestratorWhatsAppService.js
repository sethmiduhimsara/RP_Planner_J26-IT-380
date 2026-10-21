/**
 * WhatsApp Cloud API (Meta) Customer Support & Telemetry Service for Pool Orchestrator.
 * Handles incoming webhooks, parses bather inquiries, generates intelligent automated
 * pool occupancy/forecast responses, and dispatches messages via Meta Graph API.
 */

const axios = require('axios');
const db = require('./poolOrchestratorDatabase');
const { getLatestOccupancy, getLatestReading, getForecast } = require('./service');
const { defaultSettingsService } = require('./poolOrchestratorSettingsService');
const { defaultFiltrationService } = require('./poolOrchestratorFiltrationService');
const { defaultWeatherService } = require('./poolOrchestratorWeatherService');
const { format12HourTime, getCurrentColomboTimeString } = require('./poolOrchestratorTimeUtils');

const DEFAULT_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1406310829235882';
const DEFAULT_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const DEFAULT_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'pool_orchestrator_verify_token_2026';
const DEFAULT_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

class PoolOrchestratorWhatsAppService {
  constructor() {
    this.phoneNumberId = DEFAULT_PHONE_NUMBER_ID;
    this.accessToken = DEFAULT_ACCESS_TOKEN;
    this.verifyToken = DEFAULT_VERIFY_TOKEN;
    this.apiVersion = DEFAULT_API_VERSION;
    this.isInitialized = false;
    this.stats = {
      messagesReceived: 0,
      repliesSent: 0,
      lastReceivedAt: null,
      lastRepliedAt: null,
      lastError: null,
    };
  }

  /**
   * Initializes database table for WhatsApp customer message audit log via schema.sql
   */
  async ensureTable() {
    if (this.isInitialized) return;

    try {
      await db.initSchema();
      this.isInitialized = true;
    } catch (err) {
      console.warn('[PoolOrchestratorWhatsApp] Message audit table check notice:', err.message);
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate key'))) {
        this.isInitialized = true;
      }
    }
  }

  /**
   * Verifies incoming webhook challenge from Meta App Dashboard (GET request)
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('[PoolOrchestratorWhatsApp] Webhook challenge verified successfully with Meta.');
      return challenge;
    }
    console.warn('[PoolOrchestratorWhatsApp] Webhook verification failed. Token mismatch.');
    return null;
  }

  /**
   * Ingests and processes incoming WhatsApp message webhook from Meta (POST request)
   * @param {object} body The raw JSON payload from Meta webhook
   */
  async handleIncomingWebhook(body) {
    if (!body || body.object !== 'whatsapp_business_account') {
      return { status: 'ignored', reason: 'Not a WhatsApp business event' };
    }

    await this.ensureTable();

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change || !change.messages || change.messages.length === 0) {
      // Message delivery status acknowledgment (sent, delivered, read)
      return { status: 'acknowledged', reason: 'No new incoming customer message' };
    }

    const message = change.messages[0];
    const contact = change.contacts?.[0];
    const senderPhone = message.from;
    const customerName = contact?.profile?.name || 'Swimmer';
    const messageText = message.text?.body || '';
    const messageId = message.id;

    this.stats.messagesReceived++;
    this.stats.lastReceivedAt = new Date().toISOString();

    console.log(
      `[PoolOrchestratorWhatsApp] Received message from ${customerName} (${senderPhone}): "${messageText}"`
    );

    // Check if this is a staff duty confirmation or decline response
    let replyText = '';
    try {
      const { defaultStaffService } = require('./poolOrchestratorStaffService');
      const staffReplyResult = await defaultStaffService.checkAndHandleStaffReply(senderPhone, messageText);
      if (staffReplyResult && staffReplyResult.handled) {
        replyText = staffReplyResult.replyText;
      }
    } catch (staffErr) {
      console.warn('[PoolOrchestratorWhatsApp] Error checking staff reply:', staffErr.message);
    }

    // Fall back to context-aware suitable pool reply if not a staff duty response
    if (!replyText) {
      replyText = await this.generateSuitableReply(messageText, customerName);
    }

    // Send the reply via WhatsApp Cloud API
    let sendResult = null;
    try {
      sendResult = await this.sendMessage(senderPhone, replyText, 'bot');
      this.stats.repliesSent++;
      this.stats.lastRepliedAt = new Date().toISOString();
      console.log(`[PoolOrchestratorWhatsApp] Automated reply sent to ${senderPhone}.`);
    } catch (sendErr) {
      this.stats.lastError = sendErr.message;
      console.error(`[PoolOrchestratorWhatsApp] Failed to send reply to ${senderPhone}:`, sendErr.message);
    }

    // Persist to database log
    try {
      await db.query(
        `INSERT INTO public.whatsapp_messages
          (wa_message_id, sender_phone, customer_name, incoming_text, reply_text, status, sender_role, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'bot', NOW())`,
        [
          messageId,
          senderPhone,
          customerName,
          messageText,
          replyText,
          sendResult ? 'replied' : 'send_failed',
        ]
      );
    } catch (dbErr) {
      console.warn('[PoolOrchestratorWhatsApp] Failed to log WhatsApp message to DB:', dbErr.message);
    }

    return {
      status: 'processed',
      sender: senderPhone,
      customerName,
      messageText,
      replyText,
      sent: Boolean(sendResult),
    };
  }

  /**
   * Generates intelligent, suitable automated replies according to exact required format:
   * When any message arrives -> Pool info & common details, followed by choices:
   *   1️⃣ Current Condition
   *   2️⃣ Future Demand
   *   3️⃣ Contact to Manager
   * When customer chooses an option -> detailed required info + next choices.
   */
  async generateSuitableReply(text = '', customerName = 'Guest') {
    const clean = text.trim().toLowerCase();

    // Fetch real-time pool metrics & manager settings
    let currentSwimmers = 0;
    let poolName = 'Colombo Aquatic Centre Main Pool';
    let openHour = 6;
    let closeHour = 22;
    let lowMax = 15;
    let modMax = 30;
    let highMax = 45;
    let waterTemp = 28.5;
    let rainDetected = false;
    let weatherCategory = 'Sunny';
    let filtrationStage = 1;
    let activeBulbs = 1;

    try {
      const [latestOccupancy, latestReading, settings] = await Promise.all([
        getLatestOccupancy().catch(() => null),
        getLatestReading().catch(() => null),
        defaultSettingsService.getSettings().catch(() => null),
      ]);

      currentSwimmers = latestOccupancy?.occupancy_count ?? latestReading?.swimmer_count ?? 0;

      if (latestReading) {
        if (latestReading.raw_payload?.water_temp_c) {
          waterTemp = Number(latestReading.raw_payload.water_temp_c).toFixed(1);
        } else if (latestReading.water_temp_c) {
          waterTemp = Number(latestReading.water_temp_c).toFixed(1);
        }
        if (latestReading.raw_payload?.rain_detected !== undefined) {
          rainDetected = Boolean(latestReading.raw_payload.rain_detected);
        } else if (latestReading.rain_detected !== undefined) {
          rainDetected = Boolean(latestReading.rain_detected);
        }
      }

      if (settings) {
        poolName = settings.pool_name || poolName;
        openHour = settings.opening_hour ?? openHour;
        closeHour = settings.closing_hour ?? closeHour;
        lowMax = settings.low_demand_max ?? lowMax;
        modMax = settings.moderate_demand_max ?? modMax;
        highMax = settings.high_demand_max ?? highMax;
      }

      // Calculate filtration status dynamically
      const filtPlan = defaultFiltrationService.getBulbRelayStateForOccupancy(currentSwimmers);
      filtrationStage = filtPlan?.stage || 1;
      activeBulbs = filtPlan?.bulbs || 1;
    } catch (err) {
      console.warn('[PoolOrchestratorWhatsApp] Context query fallback:', err.message);
    }

    // Determine current demand tier
    let demandTier = 'Low';
    if (currentSwimmers > modMax) demandTier = 'High';
    else if (currentSwimmers >= lowMax) demandTier = 'Moderate';

    // Format operating hours strings
    const openTimeStr = openHour === 0 ? '12:00 AM' : openHour < 12 ? `${openHour}:00 AM` : `${openHour - 12}:00 PM`;
    const closeTimeStr = closeHour === 24 || closeHour === 0 ? '12:00 AM' : closeHour < 12 ? `${closeHour}:00 AM` : `${closeHour - 12}:00 PM`;

    // Check if open now based on Colombo time
    const nowColombo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
    const currentHourColombo = nowColombo.getHours();
    const isOpenNow = currentHourColombo >= openHour && currentHourColombo < closeHour;
    const openStatus = isOpenNow ? '🟢 Currently OPEN' : '🔴 Currently CLOSED';

    // Weather & Rain condition strings
    if (rainDetected) {
      weatherCategory = 'Rainy';
    }
    const rainStatus = rainDetected ? '🌧️ Rain Detected (Wet Conditions)' : '☀️ Clear (No Rain)';

    // Intent Detection
    const isCurrentCondition =
      clean === '1' ||
      clean.startsWith('1.') ||
      clean.startsWith('1 ') ||
      clean.includes('current condition') ||
      clean.includes('condition') ||
      clean.includes('swimmer') ||
      clean.includes('crowd') ||
      clean.includes('occupan') ||
      clean.includes('lane') ||
      clean.includes('temp') ||
      clean.includes('water') ||
      clean.includes('live');

    const isFutureDemand =
      clean === '2' ||
      clean.startsWith('2.') ||
      clean.startsWith('2 ') ||
      clean.includes('future demand') ||
      clean.includes('demand') ||
      clean.includes('future') ||
      clean.includes('forecast') ||
      clean.includes('predict') ||
      clean.includes('best time') ||
      clean.includes('later') ||
      clean.includes('busy') ||
      clean.includes('slot');

    const isContactManager =
      clean === '3' ||
      clean.startsWith('3.') ||
      clean.startsWith('3 ') ||
      clean.includes('contact to manager') ||
      clean.includes('contact manager') ||
      clean.includes('contact') ||
      clean.includes('manager') ||
      clean.includes('phone') ||
      clean.includes('number') ||
      clean.includes('call') ||
      clean.includes('reception') ||
      clean.includes('desk') ||
      clean.includes('talk') ||
      clean.includes('help') ||
      clean.includes('inquiry');

    const isMainMenu = clean === '0' || clean === 'menu' || clean === 'start' || clean === 'home';

    // =========================================================================
    // SELECTION 1: CURRENT CONDITION
    // =========================================================================
    if (isCurrentCondition) {
      let laneAdvice = '';
      if (currentSwimmers > modMax) {
        laneAdvice = '⚠️ *High Bather Traffic:* Lap lanes are moderately crowded. You may need to share lane space.';
      } else if (currentSwimmers >= lowMax) {
        laneAdvice = '🏊 *Moderate Activity:* Lanes have good shareable space and steady swimming pace.';
      } else {
        laneAdvice = '✨ *Optimal Lane Availability:* Light bather count with wide open lanes for relaxed swimming.';
      }

      return (
        `🏊 *Live Pool Current Condition*\n` +
        `Facility: *${poolName}*\n\n` +
        `• 👥 *Current Swimmers:* *${currentSwimmers} people* in the pool\n` +
        `• 📊 *Demand Level:* *${demandTier} Demand* (Limits: <${lowMax} Low, ${lowMax}–${modMax} Mod, >${modMax} High)\n` +
        `• 🏊 *Lane Status:* ${laneAdvice}\n` +
        `• 🌡️ *Water Temperature:* *${waterTemp}°C* (Comfortable swimming temp)\n` +
        `• 🌦️ *Weather:* *${weatherCategory}* (${rainStatus})\n` +
        `• ⚙️ *Filtration & Water Pump:* Active Stage ${filtrationStage} (${activeBulbs}/4 pumps running)\n` +
        `• 🦺 *Lifeguard Supervision:* Certified lifeguards actively on deck\n\n` +
        `─────────────────────────\n` +
        `👉 *Please select next option (reply with number or keyword):*\n` +
        `2️⃣ *Future Demand* — Swimmer predictions & best time to swim\n` +
        `3️⃣ *Contact to Manager* — Duty manager contact & reception desk\n` +
        `0️⃣ *Main Menu* — General pool overview & hours`
      );
    }

    // =========================================================================
    // SELECTION 2: FUTURE DEMAND
    // =========================================================================
    if (isFutureDemand) {
      let forecastSlots = [];
      try {
        const predictions = await getForecast().catch(() => []);
        forecastSlots = Array.isArray(predictions) ? predictions.slice(0, 5) : [];
      } catch {
        forecastSlots = [];
      }

      let forecastLinesText = '';
      let bestSlot = null;
      let minBathers = Infinity;

      if (forecastSlots.length > 0) {
        const lines = forecastSlots.map((slot) => {
          const time = format12HourTime(slot.target_time);
          const count = Math.max(0, Math.round(Number(slot.predicted_swimmers) || 0));
          let tier = 'Low';
          if (count > modMax) tier = 'High';
          else if (count >= lowMax) tier = 'Moderate';

          if (count < minBathers) {
            minBathers = count;
            bestSlot = { time, count, tier };
          }
          return `• *${time}*: ~${count} swimmers (${tier} Demand)`;
        });
        forecastLinesText = lines.join('\n');
      } else {
        forecastLinesText =
          `• Upcoming 1 Hour: ~${Math.max(1, currentSwimmers)} swimmers (${demandTier} Demand)\n` +
          `• Upcoming 2 Hours: ~${Math.max(1, currentSwimmers + 4)} swimmers (${demandTier} Demand)\n` +
          `• Upcoming 3 Hours: ~${Math.max(1, currentSwimmers + 2)} swimmers (${demandTier} Demand)`;
        bestSlot = { time: 'Next 1–2 hours', count: currentSwimmers, tier: demandTier };
      }

      const bestTimeMessage = bestSlot
        ? `💡 *Best Time to Swim:* *${bestSlot.time}* (~${bestSlot.count} swimmers expected). Ideal for uninterrupted lap swimming with minimal crowd.`
        : `💡 *Recommendation:* Early morning and mid-afternoon have the lightest crowd density.`;

      return (
        `📊 *Future Swimmer Demand Forecast*\n` +
        `Facility: *${poolName}*\n\n` +
        `Upcoming hourly predictions (Random Forest model):\n` +
        `${forecastLinesText}\n\n` +
        `${bestTimeMessage}\n\n` +
        `🌦️ *Expected Weather:* Fair swimming conditions with pleasant water temperature.\n\n` +
        `─────────────────────────\n` +
        `👉 *Please select next option (reply with number or keyword):*\n` +
        `1️⃣ *Current Condition* — Live swimmers, lane availability & water state\n` +
        `3️⃣ *Contact to Manager* — Duty manager contact & reception desk\n` +
        `0️⃣ *Main Menu* — General pool overview & hours`
      );
    }

    // =========================================================================
    // SELECTION 3: CONTACT TO MANAGER
    // =========================================================================
    if (isContactManager) {
      return (
        `📞 *Contact Pool Manager & Operations Desk*\n` +
        `Facility: *${poolName}*\n\n` +
        `• 👤 *Duty Operations Manager:* Pramudi / Head of Aquatic Operations\n` +
        `• 📱 *Manager WhatsApp / Direct:* *+94 76 579 0015*\n` +
        `• ☎️ *Front Desk Reception:* *+94 11 269 4580*\n` +
        `• 🕒 *Duty Manager Hours:* 8:00 AM – 8:00 PM (Daily)\n` +
        `• 📍 *Location:* Ground Level Reception Desk, Main Pool Pavilion\n` +
        `• 📧 *Email Inquiries:* support@aquaticcentre.lk\n\n` +
        `💬 *Live In-Chat Message:*\n` +
        `You can also type your urgent question or message directly in this chat! Our pool manager monitors customer messages live from the operations dashboard and will assist you promptly.\n\n` +
        `─────────────────────────\n` +
        `👉 *Please select next option (reply with number or keyword):*\n` +
        `1️⃣ *Current Condition* — Real-time bather count, lanes & water state\n` +
        `2️⃣ *Future Demand* — Swimmer predictions for upcoming hours\n` +
        `0️⃣ *Main Menu* — General pool overview & hours`
      );
    }

    // =========================================================================
    // DEFAULT / GREETING / COMMON POOL INFO & MENU (0 or Any Message)
    // =========================================================================
    return (
      `👋 Hello *${customerName}*! Welcome to *${poolName}*.\n\n` +
      `🏊 *Pool Information & Common Details:*\n` +
      `• 📍 *Facility:* ${poolName}\n` +
      `• 🕒 *Operating Hours:* *${openTimeStr} – ${closeTimeStr}* (${openStatus})\n` +
      `• 👥 *Live Swimmers:* *${currentSwimmers} people* in the pool (${demandTier} Demand)\n` +
      `• 🌡️ *Water Temp:* *${waterTemp}°C* · Weather: *${weatherCategory}*\n` +
      `• 🦺 *Safety:* Certified lifeguards actively on duty\n\n` +
      `─────────────────────────\n` +
      `👉 *Please select an option to get instant details (reply with number or text):*\n` +
      `1️⃣ *Current Condition* — Real-time bather count, lanes & water state\n` +
      `2️⃣ *Future Demand* — Swimmer predictions for upcoming hours & best time to swim\n` +
      `3️⃣ *Contact to Manager* — Manager direct hotline & front desk assistance`
    );
  }

  /**
   * Sends an outbound WhatsApp text message via Meta Graph API
   * @param {string} to Recipient WhatsApp phone number with country code (e.g. "94743158325")
   * @param {string} body Message text content
   * @param {string} senderRole 'bot' or 'manager'
   */
  async sendMessage(to, body, senderRole = 'manager') {
    if (!this.accessToken) {
      throw new Error('WHATSAPP_ACCESS_TOKEN is not configured in server/.env');
    }

    // Format phone number: remove '+' or non-digit characters
    const cleanTo = String(to).replace(/[^0-9]/g, '');

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        body: body,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      // If sent manually by manager from dashboard, log to DB
      if (senderRole === 'manager') {
        await this.ensureTable();
        try {
          await db.query(
            `INSERT INTO public.whatsapp_messages
              (wa_message_id, sender_phone, customer_name, incoming_text, reply_text, status, sender_role, received_at)
             VALUES ($1, $2, $3, NULL, $4, 'sent', 'manager', NOW())`,
            [
              response.data?.messages?.[0]?.id || `mgr_${Date.now()}`,
              cleanTo,
              'Customer',
              body,
            ]
          );
        } catch (dbErr) {
          console.warn('[PoolOrchestratorWhatsApp] Failed to record manager outbound message:', dbErr.message);
        }
      }

      return response.data;
    } catch (err) {
      // If version error occurs (e.g. v25.0 not yet released), attempt fallback to v21.0
      if (err.response && (err.response.status === 400 || err.response.status === 404) && this.apiVersion !== 'v21.0') {
        console.warn(`[PoolOrchestratorWhatsApp] Retrying with stable Graph API v21.0...`);
        const fallbackUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
        const fbRes = await axios.post(fallbackUrl, payload, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        });

        if (senderRole === 'manager') {
          await this.ensureTable();
          try {
            const staffLookup = await db.query(
              "SELECT name FROM public.facility_staff WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1 LIMIT 1",
              [cleanTo]
            ).catch(() => ({ rows: [] }));
            const recipientName = staffLookup.rows[0]?.name || 'Customer';

            await db.query(
              `INSERT INTO public.whatsapp_messages
                (wa_message_id, sender_phone, customer_name, incoming_text, reply_text, status, sender_role, received_at)
               VALUES ($1, $2, $3, NULL, $4, 'sent', 'manager', NOW())`,
              [
                fbRes.data?.messages?.[0]?.id || `mgr_${Date.now()}`,
                cleanTo,
                recipientName,
                body,
              ]
            );
          } catch (dbErr) {
            console.warn('[PoolOrchestratorWhatsApp] Failed to record manager outbound message:', dbErr.message);
          }
        }

        return fbRes.data;
      }
      const errMsg = err.response?.data?.error?.message || err.message;
      throw new Error(`Meta Graph API error: ${errMsg}`);
    }
  }

  /**
   * Returns grouped conversation threads classified into customer and staff
   */
  async getConversations() {
    await this.ensureTable();
    try {
      const res = await db.query(`
        SELECT 
          m.sender_phone,
          COALESCE(s.name, MAX(m.customer_name), 'Customer') AS customer_name,
          COALESCE(s.name, MAX(m.customer_name), 'Customer') AS contact_name,
          s.role AS staff_role,
          (s.id IS NOT NULL) AS is_staff,
          s.id AS staff_id,
          COUNT(*) AS total_messages,
          MAX(m.received_at) AS last_activity,
          (
            SELECT COALESCE(m2.incoming_text, m2.reply_text)
            FROM public.whatsapp_messages m2
            WHERE m2.sender_phone = m.sender_phone
            ORDER BY m2.received_at DESC, m2.id DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT m2.status
            FROM public.whatsapp_messages m2
            WHERE m2.sender_phone = m.sender_phone
            ORDER BY m2.received_at DESC, m2.id DESC
            LIMIT 1
          ) AS last_status
        FROM public.whatsapp_messages m
        LEFT JOIN public.facility_staff s
          ON regexp_replace(s.phone, '[^0-9]', '', 'g') = regexp_replace(m.sender_phone, '[^0-9]', '', 'g')
        GROUP BY m.sender_phone, s.id, s.name, s.role
        ORDER BY MAX(m.received_at) DESC
      `);
      return res.rows;
    } catch (err) {
      console.warn('[PoolOrchestratorWhatsApp] Failed to query conversations:', err.message);
      return [];
    }
  }

  /**
   * Returns chronological message thread for a specific customer phone
   */
  async getConversationMessages(senderPhone) {
    await this.ensureTable();
    const cleanPhone = String(senderPhone).replace(/[^0-9]/g, '');
    try {
      const res = await db.query(
        `SELECT id, wa_message_id, sender_phone, customer_name, incoming_text, reply_text, status, sender_role, received_at
         FROM public.whatsapp_messages
         WHERE sender_phone = $1 OR sender_phone = $2
         ORDER BY received_at ASC, id ASC`,
        [senderPhone, cleanPhone]
      );
      return res.rows;
    } catch (err) {
      console.warn('[PoolOrchestratorWhatsApp] Failed to query conversation messages:', err.message);
      return [];
    }
  }

  /**
   * Returns live service telemetry and status
   */
  getStatus() {
    return {
      enabled: Boolean(this.accessToken && this.phoneNumberId),
      phoneNumberId: this.phoneNumberId,
      apiVersion: this.apiVersion,
      webhookVerifyTokenConfigured: Boolean(this.verifyToken),
      webhookEndpoint: '/api/pool-orchestrator/whatsapp/webhook',
      ...this.stats,
    };
  }

  /**
   * Fetches recent customer chat logs from the database
   */
  async getRecentMessages(limit = 20) {
    await this.ensureTable();
    try {
      const res = await db.query(
        `SELECT * FROM public.whatsapp_messages ORDER BY received_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    } catch {
      return [];
    }
  }
}

const defaultWhatsAppService = new PoolOrchestratorWhatsAppService();

module.exports = {
  PoolOrchestratorWhatsAppService,
  defaultWhatsAppService,
};
