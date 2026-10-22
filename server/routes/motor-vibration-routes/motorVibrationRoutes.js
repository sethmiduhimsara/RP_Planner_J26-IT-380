const express = require('express');
const router = express.Router();
const MotorVibrationModel = require('../../models/motor-vibration-model/motorVibrationModel');

// In-memory cache for ultra-low latency real-time telemetry
let latestTelemetry = {
  deviceId: 'ESP32_MOTOR_01',
  vibration: 0.0,
  smoothedVibration: 0.0,
  axes: { x: 0.0, y: 0.0, z: 0.0 },
  status: 'OFF',
  confidence: 100.0,
  faultCounter: 0,
  isAlarm: false,
  timestamp: new Date().toISOString(),
};

const historyBuffer = [];
const MAX_HISTORY = 100;

/**
 * @route   POST /api/motor-vibration/telemetry
 * @desc    Receive real-time telemetry from ESP32 Edge Impulse inference
 */
router.post('/telemetry', async (req, res) => {
  try {
    const {
      deviceId,
      vibration,
      smoothedVibration,
      axes,
      status,
      confidence,
      faultCounter,
      isAlarm,
    } = req.body;

    const parsedData = {
      deviceId: deviceId || 'ESP32_MOTOR_01',
      vibration: typeof vibration === 'number' ? vibration : parseFloat(vibration) || 0.0,
      smoothedVibration:
        typeof smoothedVibration === 'number'
          ? smoothedVibration
          : parseFloat(smoothedVibration) || 0.0,
      axes: {
        x: axes && typeof axes.x === 'number' ? axes.x : parseFloat(axes?.x) || 0.0,
        y: axes && typeof axes.y === 'number' ? axes.y : parseFloat(axes?.y) || 0.0,
        z: axes && typeof axes.z === 'number' ? axes.z : parseFloat(axes?.z) || 0.0,
      },
      status: status || 'Normal',
      confidence:
        typeof confidence === 'number' ? confidence : parseFloat(confidence) || 0.0,
      faultCounter:
        typeof faultCounter === 'number' ? faultCounter : parseInt(faultCounter, 10) || 0,
      isAlarm: Boolean(isAlarm),
      timestamp: new Date().toISOString(),
    };

    // Update in-memory state
    latestTelemetry = parsedData;
    console.log(
      `[Telemetry Ingest] Status: ${parsedData.status} | Vib: ${parsedData.vibration}g | Conf: ${parsedData.confidence}%`
    );

    historyBuffer.push(parsedData);
    if (historyBuffer.length > MAX_HISTORY) {
      historyBuffer.shift();
    }

    // Broadcast to all connected React clients via Socket.io immediately
    if (req.io) {
      req.io.emit('motor_vibration_update', parsedData);
    }

    // Asynchronously log to Supabase PostgreSQL table via MotorVibrationModel
    MotorVibrationModel.insertTelemetry(parsedData).catch((err) => {
      console.warn('[MotorVibrationRoutes] Supabase insert warning:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Telemetry received, broadcasted, and logged to Supabase',
      data: parsedData,
    });
  } catch (error) {
    console.error('[MotorVibrationRoutes] Telemetry ingestion error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/motor-vibration/latest
 * @desc    Get the most recent telemetry snapshot
 */
router.get('/latest', (req, res) => {
  return res.status(200).json({
    success: true,
    data: latestTelemetry,
  });
});

/**
 * @route   GET /api/motor-vibration/history
 * @desc    Get historical buffer of recent readings from Supabase or memory
 */
router.get('/history', async (req, res) => {
  try {
    const supabaseData = await MotorVibrationModel.getRecentHistory(50);
    if (supabaseData && supabaseData.length > 0) {
      return res.status(200).json({
        success: true,
        source: 'supabase',
        count: supabaseData.length,
        data: supabaseData,
      });
    }
  } catch (err) {
    console.warn('[MotorVibrationRoutes] Supabase history fallback to in-memory');
  }

  return res.status(200).json({
    success: true,
    source: 'memory',
    count: historyBuffer.length,
    data: historyBuffer,
  });
});

module.exports = router;
