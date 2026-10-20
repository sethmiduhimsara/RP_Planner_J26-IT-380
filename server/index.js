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
    res.json(liveSensorData);
});

// ENERGY OPTIMIZATION API ENDPOINT 
app.post('/api/energy-optimization/check', async (req, res) => {
    try {
        // 1. Grab the live pool data sent from Himsara's React UI
        const { ambientTemp, humidity, currentPoolTemp } = req.body;
        
        // 2. Trigger your AI Controller to run the "What-If" simulation
        const optimizationResult = await checkHeatingOptimization(ambientTemp, humidity, currentPoolTemp);
        
        // 3. Send the final AI decision straight back to the frontend dashboard!
        res.status(200).json(optimizationResult);
        
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
  umiMqtt.end(); // Safely close your MQTT connection
  server.close(async () => {
    await db.closePool();
    console.log('[Express] Database connections closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  defaultMqttService.stop();
  umiMqtt.end(); // Safely close your MQTT connection
  server.close(async () => {
    await db.closePool();
    process.exit(0);
  });
});

module.exports = app;