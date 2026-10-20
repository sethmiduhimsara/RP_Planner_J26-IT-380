/**
 * Express Application Entry Point.
 * Mounts component routers under isolated namespaces.
 */

require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt'); // <-- Added MQTT library for Umi's live stream

// energy-optimization
const { checkHeatingOptimization } = require('./src/energy-optimization/optimizationController');

const poolOrchestratorRouter = require('./src/pool-orchestrator/routes');
const db = require('./src/pool-orchestrator/poolOrchestratorDatabase');
const { defaultMqttService } = require('./src/pool-orchestrator/poolOrchestratorMqttService');

const app = express();
const PORT = process.env.PORT || 5001;

// Global middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Component Mounts - Pool Orchestrator
app.use('/api/pool-orchestrator', poolOrchestratorRouter);

// 🌍 UMI'S LIVE HARDWARE DATA STREAM 🌍
const umiMqtt = mqtt.connect('mqtt://broker.hivemq.com:1883');
let liveSensorData = { ambientTemp: 0, humidity: 0, currentPoolTemp: 0 };
let hardwareControlMode = 'AUTO'; // Tracks 'AUTO', 'ON', or 'OFF'

// Listen to a custom topic just for Umi's UI!
umiMqtt.on('connect', () => {
    console.log("[Express] Umi's Live Hardware MQTT Connected to Cloud! ☁️");
    umiMqtt.subscribe('ecopool/umi/sensors'); 
});

// Update the variables the millisecond the ESP32 sends a new reading
umiMqtt.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        liveSensorData = { ...liveSensorData, ...data };
    } catch (e) {
        console.error("MQTT Parse Error:", e);
    }
});

// Endpoint to Send Live Data to the React Dashboard
app.get('/api/energy-optimization/live-sensors', (req, res) => {
    res.json({ ...liveSensorData, hardwareControlMode });
});

// 🌍 MANUAL HARDWARE OVERRIDE ENDPOINT 🌍
app.post('/api/energy-optimization/override', (req, res) => {
    try {
        const { action } = req.body; // 'ON', 'OFF', or 'AUTO'
        hardwareControlMode = action;
        umiMqtt.publish('ecopool/umi/control', action);
        console.log(`[Express] Umi Hardware Intercept: Mode set to [${action}]`);
        res.json({ success: true, command: action, hardwareControlMode });
    } catch (error) {
        res.status(500).json({ error: "Failed to intercept hardware" });
    }
});

// 🌍 ENERGY OPTIMIZATION API ENDPOINT (UPDATED FOR AUTO 1H SEGMENTS) 🌍
app.post('/api/energy-optimization/check', async (req, res) => {
    try {
        const { ambientTemp, humidity, currentPoolTemp } = req.body;
        const optimizationResult = await checkHeatingOptimization(ambientTemp, humidity, currentPoolTemp);
        
        // Automatically command the ESP32 OLED & Relay unless manually locked to Force ON/OFF
        if (hardwareControlMode === 'AUTO') {
            if (optimizationResult.action === 'TURN_OFF_HEATER') {
                umiMqtt.publish('ecopool/umi/control', 'OFF');
                console.log("[Express] 🛑 AI Auto-Shutoff Command ('OFF') Sent to ESP32 OLED & Relay!");
            } else if (optimizationResult.action === 'KEEP_HEATER_ON') {
                umiMqtt.publish('ecopool/umi/control', 'ON');
                console.log("[Express] 🔥 AI Active-Heating Command ('ON') Sent to ESP32 OLED & Relay!");
            }
        } else {
            console.log(`[Express] ⚠️ Hardware is in Manual Override [${hardwareControlMode}] — skipping auto MQTT publish.`);
        }
        
        res.status(200).json({
            ...optimizationResult,
            hardwareControlMode
        });
        
    } catch (error) {
        console.error("Endpoint Error:", error);
        res.status(500).json({ error: "AI Engine Offline" });
    }
});

// Root health check
app.get('/api/health', (req, res) => {
  res.json({
    app: 'RP Planner Backend Server',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    component: 'pool-orchestrator',
  });
});

const server = app.listen(PORT, () => {
  console.log(`[Express] Server running on http://localhost:${PORT}`);
  console.log(`[Express] Pool Orchestrator mounted at http://localhost:${PORT}/api/pool-orchestrator`);
  console.log(`[Express] Umi's AI Engine mounted at http://localhost:${PORT}/api/energy-optimization/check`);
  console.log(`[Express] Umi's Live Data mounted at http://localhost:${PORT}/api/energy-optimization/live-sensors`);

  // Start background MQTT subscriber for ESP32 sensor telemetry
  try {
    defaultMqttService.start();
  } catch (mqttErr) {
    console.warn('[Express] Failed to initialize MQTT service:', mqttErr.message);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Express] Shutting down gracefully...');
  defaultMqttService.stop();
  umiMqtt.end();
  server.close(async () => {
    await db.closePool();
    console.log('[Express] Database connections closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  defaultMqttService.stop();
  umiMqtt.end();
  server.close(async () => {
    await db.closePool();
    process.exit(0);
  });
});

module.exports = app;