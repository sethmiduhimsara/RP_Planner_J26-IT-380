/**
 * Express router for Pool Orchestrator.
 * Mounted at /api/pool-orchestrator.
 */

const express = require('express');
const axios = require('axios');
const db = require('./poolOrchestratorDatabase');
const {
  getLatestReading,
  getLatestOccupancy,
  getForecast,
  getFiltrationStatus,
  saveSensorReading,
  recordFiltrationEvent,
} = require('./service');
const { defaultForecastService } = require('./poolOrchestratorForecastService');
const { defaultWeatherService } = require('./poolOrchestratorWeatherService');
const { defaultStaffingService } = require('./poolOrchestratorStaffingService');
const { defaultFiltrationService } = require('./poolOrchestratorFiltrationService');
const { defaultResourcePlanService } = require('./poolOrchestratorResourcePlanService');
const { defaultMqttService } = require('./poolOrchestratorMqttService');
const { defaultAutoRetrainService } = require('./poolOrchestratorAutoRetrainService');
const { defaultSettingsService } = require('./poolOrchestratorSettingsService');
const { defaultWhatsAppService } = require('./poolOrchestratorWhatsAppService');
const { defaultStaffService } = require('./poolOrchestratorStaffService');
const { format12HourTime, formatDateWithTime, POOL_TIMEZONE } = require('./poolOrchestratorTimeUtils');

const router = express.Router();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Component health check verifying database, ML service, weather, and operational policies
 */
router.get('/health', async (req, res) => {
  const dbHealth = await db.testConnection();

  let mlHealth = { reachable: false, status: 'unavailable' };
  try {
    const mlRes = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
    mlHealth = { reachable: true, ...mlRes.data };
  } catch (err) {
    mlHealth = { reachable: false, error: err.message };
  }

  const weatherConfigured = defaultWeatherService.isConfigured();
  const staffingConfigured = defaultStaffingService.isConfigured();
  const filtrationConfigured = defaultFiltrationService.isConfigured();
  const mqttStatus = defaultMqttService.getStatus();

  const isHealthy = dbHealth.connected && mlHealth.reachable;

  res.status(isHealthy ? 200 : 503).json({
    component: 'pool-orchestrator',
    facilityName: process.env.POOL_NAME || 'Aquatic Centre Main Pool',
    status: isHealthy ? 'healthy' : 'degraded',
    database: dbHealth,
    mlService: mlHealth,
    weather: {
      configured: weatherConfigured,
      timezone: POOL_TIMEZONE,
    },
    mqtt: mqttStatus,
    operationalPolicies: {
      staffingConfigured,
      filtrationConfigured,
    },
    autoRetrain: defaultAutoRetrainService.getStatus(),
    currentTime: formatDateWithTime(new Date()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Returns latest live sensor reading, occupancy count, filtration status, and active operations
 */
router.get('/latest', async (req, res, next) => {
  try {
    const [reading, occupancy, filtration, predictions] = await Promise.all([
      getLatestReading(),
      getLatestOccupancy(),
      getFiltrationStatus(),
      getForecast(),
    ]);

    const forecastStatus = defaultForecastService.getLastRunStatus();
    const resourcePlan = defaultResourcePlanService.generatePlan(predictions, reading, occupancy, filtration);
    const currentSwimmers = occupancy?.occupancy_count ?? reading?.swimmer_count ?? 0;
    const bulbRecommendation = defaultFiltrationService.getBulbRelayStateForOccupancy(currentSwimmers);

    const [settings, staffAssignments] = await Promise.all([
      defaultSettingsService.getSettings(),
      defaultStaffService.getAssignments(20).catch(() => []),
    ]);

    res.json({
      facilityName: settings.pool_name || process.env.POOL_NAME || 'Aquatic Centre Main Pool',
      settings,
      reading,
      occupancy,
      filtration,
      bulbRecommendation,
      filtrationMode: defaultMqttService.getFiltrationMode(),
      weatherConfigured: defaultWeatherService.isConfigured(),
      forecastStatus,
      resourcePlan,
      staffAssignments,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns the current 6-hour forecast predictions and correlated resource plan
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const [predictions, reading, occupancy, filtration, settings] = await Promise.all([
      getForecast(),
      getLatestReading(),
      getLatestOccupancy(),
      getFiltrationStatus(),
      defaultSettingsService.getSettings(),
    ]);

    const forecastStatus = defaultForecastService.getLastRunStatus();
    const resourcePlan = defaultResourcePlanService.generatePlan(predictions, reading, occupancy, filtration);

    res.json({
      count: predictions.length,
      predictions,
      forecastStatus,
      filtration,
      filtrationMode: defaultMqttService.getFiltrationMode(),
      weatherConfigured: defaultWeatherService.isConfigured(),
      resourcePlan,
      settings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Dedicated endpoint for the 6-hour operational resource plan and manager actions
 */
router.get('/resource-plan', async (req, res, next) => {
  try {
    const [predictions, reading, occupancy, filtration] = await Promise.all([
      getForecast(),
      getLatestReading(),
      getLatestOccupancy(),
      getFiltrationStatus(),
    ]);

    const plan = defaultResourcePlanService.generatePlan(predictions, reading, occupancy, filtration);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

/**
 * Ingests a new sensor reading from ESP32 or test client
 */
router.post('/readings', async (req, res, next) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Expected a JSON sensor reading object.' });
    }

    const saved = await saveSensorReading(payload);

    // Automatically actuate relays according to current occupancy
    const swimmerCount = payload.occupancy ?? payload.swimmer_count;
    if (swimmerCount !== undefined && swimmerCount !== null && !isNaN(swimmerCount)) {
      const bulbState = defaultFiltrationService.getBulbRelayStateForOccupancy(parseInt(swimmerCount, 10));
      defaultMqttService.publishFiltrationCommand(...bulbState.relays).catch((err) => {
        console.warn('[PoolOrchestrator] Auto relay publish notice:', err.message);
      });
    }

    res.status(201).json({ reading: saved });
  } catch (error) {
    next(error);
  }
});

/**
 * Manually or on schedule triggers forecast generation
 */
router.post('/forecast/refresh', async (req, res, next) => {
  try {
    const result = await defaultForecastService.generateForecast(true);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Direct ad-hoc feature prediction forwarding to Python ML service
 */
router.post('/predict', async (req, res, next) => {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      req.body,
      { timeout: 10000 }
    );
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * Returns automated retraining metrics, thresholds, and execution history
 */
router.get('/model/retrain/status', async (req, res) => {
  res.json(await defaultAutoRetrainService.getStatus());
});

/**
 * On-demand endpoint to trigger Random Forest retraining with accumulated observations
 */
router.post('/model/retrain', async (req, res, next) => {
  try {
    const result = await defaultAutoRetrainService.triggerRetrain(null, req.body?.reason || 'Manager on-demand trigger');
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Returns current manager operational settings and threshold bands
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await defaultSettingsService.getSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

/**
 * Updates manager operational settings and immediately recalculates plans
 */
router.put('/settings', async (req, res, next) => {
  try {
    const updated = await defaultSettingsService.updateSettings(req.body);
    res.json({
      success: true,
      message: 'Manager settings updated and applied successfully.',
      settings: updated,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const updated = await defaultSettingsService.updateSettings(req.body);
    res.json({
      success: true,
      message: 'Manager settings updated and applied successfully.',
      settings: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns real-time MQTT subscriber connection status, topics, and message counts
 */
router.get('/mqtt/status', (req, res) => {
  res.json(defaultMqttService.getStatus());
});

/**
 * Publishes a relay command to the ESP32 via MQTT and records the event in public.filtration_events.
 * Supports explicit relays (r1, r2, r3, r4) or 4-stage bulb presets (stage: 1, 2, 3, 4, 0).
 */
router.post('/filtration/control', async (req, res, next) => {
  try {
    let { r1, r2, r3, r4, stage, mode, reason, occupancy: clientOccupancy } = req.body;

    const [latestReading, latestOccupancy] = await Promise.all([
      getLatestReading(),
      getLatestOccupancy(),
    ]);
    const currentSwimmers = clientOccupancy !== undefined
      ? parseInt(clientOccupancy, 10)
      : (latestOccupancy?.occupancy_count ?? latestReading?.swimmer_count ?? 0);

    // If switching to AUTO mode:
    if (mode === 'auto') {
      defaultMqttService.setFiltrationMode('auto');
      const bulbState = defaultFiltrationService.getBulbRelayStateForOccupancy(currentSwimmers);
      [r1, r2, r3, r4] = bulbState.relays;
      reason = reason || `Auto mode engaged: automatically lighting ${bulbState.bulbs} bulb(s) for ${currentSwimmers} swimmers (${bulbState.level} load)`;
    }
    // If switching to MANUAL mode (or explicitly setting manual mode without specific relay override):
    else if (mode === 'manual' && stage === undefined && r1 === undefined) {
      defaultMqttService.setFiltrationMode('manual');
      const bulbState = defaultFiltrationService.getBulbRelayStateForOccupancy(currentSwimmers);
      [r1, r2, r3, r4] = bulbState.relays;
      reason = reason || `Manual mode applied: lit ${bulbState.bulbs} bulb(s) according to current occupancy (${currentSwimmers} swimmers)`;
    }
    // If explicit stage is provided:
    else if (stage !== undefined) {
      defaultMqttService.setFiltrationMode('manual');
      const s = parseInt(stage, 10);
      if (s === 4) {
        [r1, r2, r3, r4] = [1, 1, 1, 1];
        reason = reason || 'Stage 4: Very High Load (4 Bulbs / Relays Active)';
      } else if (s === 3) {
        [r1, r2, r3, r4] = [1, 1, 1, 0];
        reason = reason || 'Stage 3: High Load (3 Bulbs / Relays Active)';
      } else if (s === 2) {
        [r1, r2, r3, r4] = [1, 1, 0, 0];
        reason = reason || 'Stage 2: Moderate Load (2 Bulbs / Relays Active)';
      } else if (s === 1) {
        [r1, r2, r3, r4] = [1, 0, 0, 0];
        reason = reason || 'Stage 1: Low Load (1 Bulb / Relay Active)';
      } else {
        [r1, r2, r3, r4] = [0, 0, 0, 0];
        reason = reason || 'Manual override: All Bulbs Off';
      }
    } else {
      defaultMqttService.setFiltrationMode('manual');
      r1 = r1 ? 1 : 0;
      r2 = r2 ? 1 : 0;
      r3 = r3 ? 1 : 0;
      r4 = r4 ? 1 : 0;
    }

    const commandResult = await defaultMqttService.publishFiltrationCommand(r1, r2, r3, r4);
    const activeBulbs = (r1 ? 1 : 0) + (r2 ? 1 : 0) + (r3 ? 1 : 0) + (r4 ? 1 : 0);
    const relayState = activeBulbs === 0 ? 'off' : `${activeBulbs} bulb${activeBulbs > 1 ? 's' : ''} on`;
    const event = await recordFiltrationEvent(
      relayState,
      reason || `Relays set to ${activeBulbs} bulb${activeBulbs > 1 ? 's' : ''}`,
      mode === 'auto' ? 'manager_auto' : 'manager_manual'
    );

    res.json({
      success: true,
      filtrationMode: defaultMqttService.getFiltrationMode(),
      activeBulbs,
      relays: [r1, r2, r3, r4],
      commandResult,
      recordedEvent: event,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * WhatsApp Cloud API Webhook Verification (GET)
 * Meta calls this endpoint with hub.mode, hub.verify_token, and hub.challenge
 */
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verified = defaultWhatsAppService.verifyWebhook(mode, token, challenge);
  if (verified) {
    return res.status(200).send(verified);
  }
  return res.status(403).send('Verification token mismatch');
});

/**
 * WhatsApp Cloud API Webhook Event Ingestion (POST)
 * Receives incoming customer messages, parses intent, and triggers automated replies
 */
router.post('/whatsapp/webhook', (req, res) => {
  // Return HTTP 200 OK immediately as required by Meta webhook SLA
  res.status(200).send('EVENT_RECEIVED');

  // Process customer message and dispatch automated reply asynchronously
  defaultWhatsAppService.handleIncomingWebhook(req.body).catch((err) => {
    console.error('[PoolOrchestratorRoutes] WhatsApp webhook processing notice:', err.message);
  });
});

/**
 * On-demand endpoint to send a WhatsApp message to a customer or test number
 */
router.post('/whatsapp/send', async (req, res, next) => {
  try {
    const { to, message, senderRole } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Both "to" phone number and "message" body are required.' });
    }

    const result = await defaultWhatsAppService.sendMessage(to, message, senderRole || 'manager');
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Returns grouped customer conversation threads for manager chat UI
 */
router.get('/whatsapp/conversations', async (req, res, next) => {
  try {
    const conversations = await defaultWhatsAppService.getConversations();
    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns chronological message thread for a specific customer phone
 */
router.get('/whatsapp/conversations/:phone', async (req, res, next) => {
  try {
    const { phone } = req.params;
    const messages = await defaultWhatsAppService.getConversationMessages(phone);
    res.json({ success: true, phone, messages });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns WhatsApp integration status and recent customer message logs
 */
router.get('/whatsapp/status', async (req, res, next) => {
  try {
    const status = defaultWhatsAppService.getStatus();
    const messages = await defaultWhatsAppService.getRecentMessages(20);
    res.json({ status, messages });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns facility staff members
 */
router.get('/staff', async (req, res, next) => {
  try {
    const staff = await defaultStaffService.getStaffMembers();
    res.json({ success: true, staff });
  } catch (error) {
    next(error);
  }
});

/**
 * Adds a new staff member to the facility roster
 */
router.post('/staff', async (req, res, next) => {
  try {
    const staff = await defaultStaffService.addStaffMember(req.body);
    res.json({ success: true, staff });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Updates an existing staff member in the facility roster
 */
router.put('/staff/:id', async (req, res, next) => {
  try {
    const staff = await defaultStaffService.updateStaffMember(req.params.id, req.body);
    res.json({ success: true, staff });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Deletes a staff member from the facility roster
 */
router.delete('/staff/:id', async (req, res, next) => {
  try {
    const result = await defaultStaffService.deleteStaffMember(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Returns duty assignment audit history
 */
router.get('/staff/assignments', async (req, res, next) => {
  try {
    const assignments = await defaultStaffService.getAssignments(50);
    res.json({ success: true, assignments });
  } catch (error) {
    next(error);
  }
});

/**
 * Assigns staff to a duty slot/task and dispatches WhatsApp notification
 */
router.post('/staff/assign', async (req, res, next) => {
  try {
    const result = await defaultStaffService.assignStaff(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Cancels a staff duty assignment and dispatches cancellation WhatsApp notification
 */
router.post('/staff/assignments/:id/cancel', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await defaultStaffService.cancelAssignment(req.params.id, reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Manually confirms a staff duty assignment
 */
router.post('/staff/assignments/:id/confirm', async (req, res, next) => {
  try {
    const result = await defaultStaffService.confirmAssignment(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Manually rejects a staff duty assignment
 */
router.post('/staff/assignments/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await defaultStaffService.rejectAssignment(req.params.id, reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
