/**
 * MQTT Sensor Ingestion & Relay Telemetry Service for Pool Orchestrator.
 * Connects to the HiveMQ broker, subscribes to ESP32 sensor topic and filtration topic,
 * parses movement (entry/exit), occupancy, and rain telemetry, and persists directly to Supabase.
 */

const mqtt = require('mqtt');
const { saveSensorReading, recordFiltrationEvent } = require('./service');
const { defaultFiltrationService } = require('./poolOrchestratorFiltrationService');

const DEFAULT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
const DEFAULT_SENSOR_TOPIC = process.env.MQTT_SENSOR_TOPIC || 'poolproject/pool-a7f29c81/sensors';
const DEFAULT_FILTRATION_TOPIC = process.env.MQTT_FILTRATION_TOPIC || 'poolproject/pool-a7f29c81/filtration';
const DEFAULT_SENSOR_ID = process.env.POOL_SENSOR_ID || 'pool-a7f29c81';

class PoolOrchestratorMqttService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.brokerUrl = DEFAULT_BROKER;
    this.sensorTopic = DEFAULT_SENSOR_TOPIC;
    this.filtrationTopic = DEFAULT_FILTRATION_TOPIC;
    this.sensorId = DEFAULT_SENSOR_ID;
    this.lastAutoRelayPayload = null;
    this.filtrationMode = 'auto'; // 'auto' | 'manual'
    this.stats = {
      messagesReceived: 0,
      lastMessageAt: null,
      lastPayload: null,
      lastError: null,
    };
  }

  /**
   * Initializes MQTT connection and sets up event handlers
   */
  start() {
    if (this.client) {
      console.log('[PoolOrchestratorMQTT] MQTT service is already running.');
      return;
    }

    console.log(`[PoolOrchestratorMQTT] Connecting to MQTT broker: ${this.brokerUrl}...`);

    this.client = mqtt.connect(this.brokerUrl, {
      clientId: `PoolOrchestrator-Backend-${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
      keepalive: 60,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log(`[PoolOrchestratorMQTT] Successfully connected to broker: ${this.brokerUrl}`);

      // Subscribe to ESP32 sensor telemetry topic
      this.client.subscribe(this.sensorTopic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`[PoolOrchestratorMQTT] Subscription failed for ${this.sensorTopic}:`, err.message);
        } else {
          console.log(`[PoolOrchestratorMQTT] Subscribed to Sensor Topic: ${this.sensorTopic}`);
        }
      });

      // Subscribe to filtration topic to track relay actuation feedback
      this.client.subscribe(this.filtrationTopic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`[PoolOrchestratorMQTT] Subscription failed for ${this.filtrationTopic}:`, err.message);
        } else {
          console.log(`[PoolOrchestratorMQTT] Subscribed to Filtration Topic: ${this.filtrationTopic}`);
        }
      });
    });

    this.client.on('message', async (topic, payloadBuffer) => {
      const payloadStr = payloadBuffer.toString().trim();
      this.stats.messagesReceived++;
      this.stats.lastMessageAt = new Date().toISOString();
      this.stats.lastPayload = payloadStr;

      try {
        if (topic === this.sensorTopic) {
          await this.handleSensorMessage(payloadStr);
        } else if (topic === this.filtrationTopic) {
          await this.handleFiltrationMessage(payloadStr);
        }
      } catch (err) {
        this.stats.lastError = err.message;
        console.error(`[PoolOrchestratorMQTT] Error processing MQTT message on ${topic}:`, err.message);
      }
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      this.stats.lastError = err.message;
      console.error('[PoolOrchestratorMQTT] MQTT error:', err.message);
    });

    this.client.on('offline', () => {
      this.isConnected = false;
      console.warn('[PoolOrchestratorMQTT] MQTT client is offline. Will attempt reconnect...');
    });

    this.client.on('reconnect', () => {
      console.log('[PoolOrchestratorMQTT] Attempting to reconnect to MQTT broker...');
    });
  }

  /**
   * Processes incoming ESP32 sensor telemetry payload:
   * e.g. {"event":"entry","occupancy":5,"uptime_ms":12345}
   * or {"event":"rain_start","occupancy":5,"rain":1}
   */
  async handleSensorMessage(rawString) {
    let data;
    try {
      data = JSON.parse(rawString);
    } catch {
      console.warn('[PoolOrchestratorMQTT] Received non-JSON sensor message:', rawString);
      return;
    }

    console.log('[PoolOrchestratorMQTT] Ingesting sensor payload from ESP32:', data);

    const swimmerCount = (data.occupancy !== undefined && data.occupancy !== null)
      ? parseInt(data.occupancy, 10)
      : (data.swimmer_count !== undefined ? parseInt(data.swimmer_count, 10) : null);

    const event = typeof data.event === 'string' ? data.event.toLowerCase() : '';
    const entryCount = event === 'entry' ? 1 : (Number.isInteger(data.entry_count) ? data.entry_count : 0);
    const exitCount = event === 'exit' ? 1 : (Number.isInteger(data.exit_count) ? data.exit_count : 0);

    let rainDetected = null;
    if (typeof data.rain_detected === 'boolean') {
      rainDetected = data.rain_detected;
    } else if (
      data.rain === 1 ||
      data.rain === '1' ||
      event === 'rain' ||
      event === 'rain_start' ||
      data.rain_detected === 1 ||
      data.rain_detected === '1' ||
      data.rainDetectedThisHour === true ||
      data.rainDetectedThisHour === 'true' ||
      data.rainDetectedThisHour === 1 ||
      data.rain_detected_this_hour === true ||
      data.rain_detected_this_hour === 1 ||
      data.weather === 'Rainy'
    ) {
      rainDetected = true;
    } else if (data.rain === 0 || data.rain === '0' || event === 'rain_stop') {
      rainDetected = false;
    }

    const reading = {
      sensor_id: data.sensor_id || this.sensorId,
      swimmer_count: swimmerCount,
      entry_count: entryCount,
      exit_count: exitCount,
      rain_detected: rainDetected,
      rain: rainDetected ? 1 : 0,
      rainDetectedThisHour: Boolean(data.rainDetectedThisHour || rainDetected),
      weather: rainDetected ? 'Rainy' : (data.weather || 'Sunny'),
      light_lux: data.light_lux ?? null,
      temperature_c: data.temperature_c ?? null,
      recorded_at: data.recorded_at || new Date().toISOString(),
      raw_payload: data,
    };

    const saved = await saveSensorReading(reading);
    if (saved && !saved.duplicate) {
      console.log(`[PoolOrchestratorMQTT] Successfully stored reading in Supabase! ID: ${saved.id}, Occupancy: ${swimmerCount}`);
    }

    // In AUTO mode, automatically actuate the 4-relay filtration board according to current occupancy:
    // - Low (< 15 swimmers): 1 bulb (1,0,0,0)
    // - Moderate (15 - 30 swimmers): 2 bulbs (1,1,0,0)
    // - High (31 - 45 swimmers): 3 bulbs (1,1,1,0)
    // - Very High (> 45 swimmers): 4 bulbs (1,1,1,1)
    if (swimmerCount !== null && !isNaN(swimmerCount)) {
      if (this.filtrationMode === 'auto') {
        const bulbState = defaultFiltrationService.getBulbRelayStateForOccupancy(swimmerCount);
        if (this.lastAutoRelayPayload !== bulbState.relayPayload) {
          console.log(`[PoolOrchestratorMQTT] [AUTO MODE] Auto-adjusting filtration bulbs for occupancy ${swimmerCount} (${bulbState.level} load -> ${bulbState.bulbs} bulb${bulbState.bulbs > 1 ? 's' : ''}): ${bulbState.relayPayload}`);
          try {
            await this.publishFiltrationCommand(
              bulbState.relays[0],
              bulbState.relays[1],
              bulbState.relays[2],
              bulbState.relays[3]
            );
            this.lastAutoRelayPayload = bulbState.relayPayload;
          } catch (pubErr) {
            console.warn('[PoolOrchestratorMQTT] Failed to publish auto-occupancy relay command:', pubErr.message);
          }
        }
      } else {
        console.log(`[PoolOrchestratorMQTT] [MANUAL MODE] Reading saved (Occupancy: ${swimmerCount}). Automated relay update deferred.`);
      }
    }
  }

  /**
   * Processes incoming relay feedback command:
   * e.g. "1,0,0,0" (1 bulb) or "1,1,0,0" (2 bulbs)
   */
  async handleFiltrationMessage(rawString) {
    console.log('[PoolOrchestratorMQTT] Received relay actuation event on MQTT:', rawString);
    const parts = rawString.split(',').map((p) => p.trim());
    if (parts.length >= 4) {
      const activeBulbs = parts.filter((p) => p === '1').length;
      const relayState = activeBulbs === 0 ? 'off' : `${activeBulbs} bulb${activeBulbs > 1 ? 's' : ''} on`;
      const reason = `ESP32 relay telemetry confirmed: ${rawString} (${activeBulbs} bulb${activeBulbs === 1 ? '' : 's'} illuminated)`;

      await recordFiltrationEvent(relayState, reason, 'esp32_mqtt', activeBulbs, rawString);
      console.log(`[PoolOrchestratorMQTT] Recorded filtration relay event: ${relayState.toUpperCase()}`);
    }
  }

  /**
   * Publishes a relay actuation command to the ESP32
   * @param {number} r1 0 or 1 (Relay 1 - Filtration)
   * @param {number} r2 0 or 1
   * @param {number} r3 0 or 1
   * @param {number} r4 0 or 1
   */
  async publishFiltrationCommand(r1 = 0, r2 = 0, r3 = 0, r4 = 0) {
    if (!this.isConnected || !this.client) {
      throw new Error('MQTT client is not connected to broker.');
    }

    const payload = `${r1 ? 1 : 0},${r2 ? 1 : 0},${r3 ? 1 : 0},${r4 ? 1 : 0}`;
    return new Promise((resolve, reject) => {
      this.client.publish(this.filtrationTopic, payload, { qos: 0 }, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[PoolOrchestratorMQTT] Published filtration command to ${this.filtrationTopic}: ${payload}`);
          resolve({ published: true, topic: this.filtrationTopic, payload });
        }
      });
    });
  }

  getFiltrationMode() {
    return this.filtrationMode;
  }

  setFiltrationMode(mode) {
    if (mode === 'auto' || mode === 'manual') {
      this.filtrationMode = mode;
      console.log(`[PoolOrchestratorMQTT] Filtration mode switched to: ${this.filtrationMode.toUpperCase()}`);
    }
    return this.filtrationMode;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      broker: this.brokerUrl,
      sensorTopic: this.sensorTopic,
      filtrationTopic: this.filtrationTopic,
      sensorId: this.sensorId,
      filtrationMode: this.filtrationMode,
      ...this.stats,
    };
  }

  stop() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.isConnected = false;
      console.log('[PoolOrchestratorMQTT] MQTT service stopped.');
    }
  }
}

const defaultMqttService = new PoolOrchestratorMqttService();

module.exports = {
  PoolOrchestratorMqttService,
  defaultMqttService,
};
