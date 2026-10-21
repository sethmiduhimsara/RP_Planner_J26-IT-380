import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:5000/api/energy-optimization';
const POOL_VOLUME_LITERS = 65000;
const SPECIFIC_HEAT_KWH_PER_L_C = 0.00116; // 75.4 kWh per 1°C (7.54 kWh per 0.1°C) for 65,000L
const CEB_COMMERCIAL_RATE_LKR = 38.0; // Rs. 38.00/kWh
const MAX_TARGET_TEMP = 35.0;
const MIN_COMFORT_TEMP = 33.0; // Hotel comfort range: 33.0°C - 35.0°C
const AUTO_AI_INTERVAL_SEC = 20 * 60; // 20 Minutes (1200 seconds) per segment

export default function EnergyOptimizer() {
  // Navigation Tabs: 'optimizer' | 'savingsLog'
  const [activeTab, setActiveTab] = useState('optimizer');

  // Starts immediately in Live Hardware Mode, but DOES NOT show Heater ON/OFF until manager clicks Run ML!
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [hasStartedML, setHasStartedML] = useState(false);

  const [sensorData, setSensorData] = useState({
    ambientTemp: 31.5,
    humidity: 76.0,
    currentPoolTemp: 33.5
  });

  // Manual Mode custom override inputs for Next 20 Min Env Temp & Natural Pool Heat (20 Min)
  const [manualForecast, setManualForecast] = useState({
    isCustom: false,
    next20MEnvTemp: 34.3,
    naturalPoolHeat20M: 0.2
  });

  // Hysteresis state: once pool heats up to ML Stop Point / 35°C, heater stays OFF until pool drops below 33.0°C
  const [isWaitingFor33Drop, setIsWaitingFor33Drop] = useState(false);
  const isWaitingFor33Ref = useRef(false);
  useEffect(() => {
    isWaitingFor33Ref.current = isWaitingFor33Drop;
  }, [isWaitingFor33Drop]);

  const [aiResult, setAiResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_AI_INTERVAL_SEC);
  const countdownRef = useRef(AUTO_AI_INTERVAL_SEC);
  const [hardwareMode, setHardwareMode] = useState('AUTO');
  const [hoveredCard, setHoveredCard] = useState(null);

  // Locks to prevent React StrictMode from firing or logging twice at the same second
  const isTriggeringRef = useRef(false);
  const lastLogTimestampRef = useRef(0);

  // Low Temperature (< 33.0°C) Notification Popup State
  const [lowTempDismissed, setLowTempDismissed] = useState(false);

  // 20-Minute Savings Ledger History
  const [savingsHistory, setSavingsHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('ecopool_20min_savings_log');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const latestSensorRef = useRef(sensorData);
  useEffect(() => {
    latestSensorRef.current = sensorData;
  }, [sensorData]);

  // Format 1200 seconds into "MMm SSs" (e.g., "19m 45s")
  const formatCountdown = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // Append a 20-minute savings record ONLY when money is actually saved (with duplicate protection)
  const record20MinSavingSegment = useCallback((poolTempVal, env20MVal, naturalGainVal, stopPointVal, kwhVal, costVal, triggerSource) => {
    if (costVal <= 0 || kwhVal <= 0) return;

    const nowMs = Date.now();
    // Prevent duplicate entries within 3 seconds (fixes React StrictMode double-logging)
    if (nowMs - lastLogTimestampRef.current < 3000) {
      return;
    }
    lastLogTimestampRef.current = nowMs;

    const newEntry = {
      id: nowMs,
      timestamp: new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: new Date(nowMs).toLocaleDateString(),
      source: triggerSource,
      poolTemp: Number(poolTempVal).toFixed(2),
      envTemp20M: Number(env20MVal).toFixed(2),
      naturalGain20M: Number(naturalGainVal).toFixed(2),
      mlStopPoint: Number(stopPointVal).toFixed(2),
      savedKWh: Number(kwhVal).toFixed(2),
      savedCostLKR: Number(costVal).toFixed(2)
    };

    setSavingsHistory((prev) => {
      const updated = [newEntry, ...prev];
      try {
        localStorage.setItem('ecopool_20min_savings_log', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, []);

  // Helper to sync physical ESP32 LEDs, Relay & OLED
  const syncHardwareState = useCallback(async (shouldTurnOff, keepAuto = true) => {
    try {
      const command = shouldTurnOff ? 'OFF' : 'ON';
      await fetch(`${API_BASE}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: command, keepAutoMode: keepAuto })
      });
    } catch (e) {
      console.error('ESP32 Sync Error', e);
    }
  }, []);

  // Trigger AI Backend (Only runs AFTER manager clicks Run ML button, then every 20 mins)
  const triggerAI = useCallback(async (customData = null, sourceLabel = '20-Min Auto ML Cycle', forceWaitState = null) => {
    if (isTriggeringRef.current) return;
    isTriggeringRef.current = true;

    const payload = customData || latestSensorRef.current;
    const currentWaitState = forceWaitState !== null ? forceWaitState : isWaitingFor33Ref.current;

    setIsLoading(true);
    setHasStartedML(true); // Reveal the AI Decision & Heater Status panel

    try {
      const response = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          isWaitingFor33Drop: currentWaitState
        }),
      });
      const data = await response.json();
      setAiResult(data);

      if (data && !data.error) {
        const ambNow = parseFloat(payload.ambientTemp) || 0;
        const humNow = parseFloat(payload.humidity) || 0;
        const poolNow = parseFloat(payload.currentPoolTemp) || 0;

        let fallbackEnvChange20M = humNow <= 85
          ? Math.min(3.0, Math.max(0.15, Math.max(0.2, 2.2 - (ambNow - 31.0) * 0.3) * (humNow <= 78 ? 1.0 : Math.max(0.25, 1.0 - (humNow - 78) * 0.08))))
          : -0.15;

        const calcEnv20M = data.predictedAmbientTemp20M !== undefined
          ? parseFloat(data.predictedAmbientTemp20M)
          : Number((ambNow + fallbackEnvChange20M).toFixed(2));

        const calcPoolGain20M = data.naturalPoolHeatGain20M !== undefined
          ? parseFloat(data.naturalPoolHeatGain20M)
          : Math.max(-0.30, Math.min(0.50, Number(((calcEnv20M - poolNow) * 0.10).toFixed(2))));

        setManualForecast({
          isCustom: false,
          next20MEnvTemp: calcEnv20M,
          naturalPoolHeat20M: calcPoolGain20M
        });

        const posGain = Math.max(0, calcPoolGain20M);
        const stopTemp = Number((MAX_TARGET_TEMP - posGain).toFixed(2));

        // Apply 33°C - 35°C Hysteresis Rule
        let nextWaitingFor33 = currentWaitState;
        if (poolNow < MIN_COMFORT_TEMP) {
          nextWaitingFor33 = false; // Dropped below 33°C -> Start heating up to 35°C (ML Stop Point)
        } else if (poolNow >= MAX_TARGET_TEMP || poolNow >= stopTemp) {
          nextWaitingFor33 = true; // Reached ML Stop Point / 35°C -> Turn OFF & wait until < 33°C
        }

        setIsWaitingFor33Drop(nextWaitingFor33);
        const shouldTurnOff = nextWaitingFor33 || poolNow >= MAX_TARGET_TEMP || poolNow >= stopTemp;
        syncHardwareState(shouldTurnOff, true);

        // Calculate 20-min savings and record to Savings Log Tab if money is saved
        const savedTemp = poolNow <= MAX_TARGET_TEMP && posGain > 0 ? posGain : 0;
        const kwhSaved = savedTemp * POOL_VOLUME_LITERS * SPECIFIC_HEAT_KWH_PER_L_C;
        const costSaved = kwhSaved * CEB_COMMERCIAL_RATE_LKR;

        if (costSaved > 0) {
          record20MinSavingSegment(
            poolNow,
            calcEnv20M,
            calcPoolGain20M,
            stopTemp,
            kwhSaved,
            costSaved,
            sourceLabel
          );
        }
      }
    } catch (error) {
      setAiResult({ error: 'Failed to connect to AI Engine' });
    } finally {
      setIsLoading(false);
      isTriggeringRef.current = false;
    }
  }, [syncHardwareState, record20MinSavingSegment]);

  // 1. Poll live ESP32 sensor data every 1 second when Live Mode is ON
  useEffect(() => {
    if (!isLiveMode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/live-sensors`);
        const liveData = await res.json();
        if (liveData) {
          setSensorData((prev) => ({
            ambientTemp: liveData.ambientTemp ? parseFloat(liveData.ambientTemp) : prev.ambientTemp,
            humidity: liveData.humidity ? parseFloat(liveData.humidity) : prev.humidity,
            currentPoolTemp: liveData.currentPoolTemp ? parseFloat(liveData.currentPoolTemp) : prev.currentPoolTemp,
          }));
          if (liveData.hardwareControlMode) {
            setHardwareMode(liveData.hardwareControlMode);
          }
        }
      } catch (err) {}
    }, 1000);

    return () => clearInterval(interval);
  }, [isLiveMode]);

  // 2. Auto-run ML prediction every 20 Minutes (1200s) ONLY AFTER manager has clicked Run ML
  // Uses countdownRef outside setCountdown so React StrictMode never triggers it twice!
  useEffect(() => {
    if (!hasStartedML) {
      countdownRef.current = AUTO_AI_INTERVAL_SEC;
      setCountdown(AUTO_AI_INTERVAL_SEC);
      return;
    }

    const countdownInterval = setInterval(() => {
      if (countdownRef.current <= 1) {
        countdownRef.current = AUTO_AI_INTERVAL_SEC;
        setCountdown(AUTO_AI_INTERVAL_SEC);
        triggerAI(latestSensorRef.current, '20-Min Auto ML Cycle');
      } else {
        countdownRef.current -= 1;
        setCountdown(countdownRef.current);
      }
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [hasStartedML, triggerAI]);

  // --- 20-Minute Environment & Natural Pool Heat Calculations ---
  const ambientNow = parseFloat(sensorData.ambientTemp) || 0;
  const humidityNow = parseFloat(sensorData.humidity) || 0;
  const poolNow = parseFloat(sensorData.currentPoolTemp) || 0;
  const isAboveMax = poolNow > MAX_TARGET_TEMP;
  const isAtOrAboveMax = poolNow >= MAX_TARGET_TEMP;
  const isBelow33Alert = poolNow > 0 && poolNow < MIN_COMFORT_TEMP;

  // Reset the <33°C popup dismissal if the pool warms back up >= 33°C
  useEffect(() => {
    if (poolNow >= MIN_COMFORT_TEMP && lowTempDismissed) {
      setLowTempDismissed(false);
    }
  }, [poolNow, lowTempDismissed]);

  let fallbackEnvChange20M = 0;
  if (humidityNow <= 85) {
    const baseRise20M = Math.max(0.2, 2.2 - (ambientNow - 31.0) * 0.3);
    const humidityFactor = humidityNow <= 78 ? 1.0 : Math.max(0.25, 1.0 - (humidityNow - 78) * 0.08);
    fallbackEnvChange20M = Math.min(3.0, Math.max(0.15, baseRise20M * humidityFactor));
  } else {
    fallbackEnvChange20M = -0.15;
  }

  const predictedAmbient20M = !isLiveMode
    ? parseFloat(manualForecast.next20MEnvTemp) || 0
    : aiResult && aiResult.predictedAmbientTemp20M !== undefined
    ? parseFloat(aiResult.predictedAmbientTemp20M)
    : Number((ambientNow + fallbackEnvChange20M).toFixed(2));

  const envChange20M = predictedAmbient20M - ambientNow;

  const fallbackPoolGain20M = Math.max(
    -0.30,
    Math.min(0.50, Number(((predictedAmbient20M - poolNow) * 0.10).toFixed(2)))
  );

  const naturalPoolGain20M = !isLiveMode
    ? parseFloat(manualForecast.naturalPoolHeat20M) || 0
    : aiResult && aiResult.naturalPoolHeatGain20M !== undefined
    ? parseFloat(aiResult.naturalPoolHeatGain20M)
    : fallbackPoolGain20M;

  const predictedPool20M = Number((poolNow + naturalPoolGain20M).toFixed(2));
  const isNaturallyHeating = naturalPoolGain20M > 0;

  // Exact ML Heater Stop Point (e.g., 35.00 - 0.20 = 34.80°C)
  const positiveNaturalGain = Math.max(0, naturalPoolGain20M);
  const mlStopPoint = Number((MAX_TARGET_TEMP - positiveNaturalGain).toFixed(2));

  // LIVE STOP-POINT & 33°C WATCHER (Only active after manager has started ML)
  useEffect(() => {
    if (!hasStartedML || hardwareMode !== 'AUTO') return;

    if (!isWaitingFor33Drop && (poolNow >= mlStopPoint || poolNow >= MAX_TARGET_TEMP)) {
      setIsWaitingFor33Drop(true);
      syncHardwareState(true, true); // Sends 'OFF' to ESP32 Relay, Red LED ON, OLED OFF
      countdownRef.current = AUTO_AI_INTERVAL_SEC;
      setCountdown(AUTO_AI_INTERVAL_SEC);
    }
  }, [hasStartedML, poolNow, mlStopPoint, isWaitingFor33Drop, hardwareMode, syncHardwareState]);

  // 20-Minute Segment Saved Electricity (kWh) and CEB Money Saved (LKR)
  const savedTempC = !isAboveMax && isNaturallyHeating ? positiveNaturalGain : 0;
  const savedKWhNum = savedTempC * POOL_VOLUME_LITERS * SPECIFIC_HEAT_KWH_PER_L_C;
  const savedCostNum = savedKWhNum * CEB_COMMERCIAL_RATE_LKR;
  const isMoneySaved = savedCostNum > 0;

  const savedKWh = savedKWhNum.toFixed(2);
  const savedCostLKR = savedCostNum.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Manual Re-Run ML Button Handler
  const handleManualMLRecheck = () => {
    countdownRef.current = AUTO_AI_INTERVAL_SEC;
    setCountdown(AUTO_AI_INTERVAL_SEC);
    const nextWaitState = poolNow < MIN_COMFORT_TEMP ? false : isWaitingFor33Drop;
    setIsWaitingFor33Drop(nextWaitState);

    triggerAI(
      sensorData,
      !hasStartedML
        ? 'Initial Manager ML Start'
        : poolNow < MIN_COMFORT_TEMP
        ? 'Below 33°C Re-Heat Trigger'
        : 'Manual Manager ML Check',
      nextWaitState
    );

    if (poolNow < MIN_COMFORT_TEMP) {
      setLowTempDismissed(true);
    }
  };

  // Manual Hardware Control Override Buttons (Bottom Panel)
  const sendHardwareCommand = async (command) => {
    try {
      setHardwareMode(command);
      await fetch(`${API_BASE}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: command, keepAutoMode: false })
      });
      if (command === 'AUTO' && hasStartedML) {
        triggerAI(latestSensorRef.current, 'Auto Mode Resumed');
      }
    } catch (e) {
      console.error('Hardware Command Failed', e);
    }
  };

  // Handle Top 3 Sensor Input Changes in Manual Demo Mode
  const handleInputChange = (e) => {
    const val = parseFloat(e.target.value);
    const numVal = isNaN(val) ? 0 : val;
    const updatedSensors = { ...sensorData, [e.target.name]: numVal };
    setSensorData(updatedSensors);

    if (e.target.name === 'currentPoolTemp' && hasStartedML) {
      const posGain = Math.max(0, parseFloat(manualForecast.naturalPoolHeat20M) || 0);
      const stopPoint = Number((MAX_TARGET_TEMP - posGain).toFixed(2));

      if (numVal >= stopPoint || numVal >= MAX_TARGET_TEMP) {
        setIsWaitingFor33Drop(true);
        syncHardwareState(true, true);
      } else if (!isWaitingFor33Drop && numVal < stopPoint) {
        syncHardwareState(false, true);
      }
    }
  };

  // Handle Manual Override of Next 20 Min Environment Temp & Natural Pool Heat (20 Min)
  const handleManualForecastChange = (e) => {
    const val = parseFloat(e.target.value);
    const numVal = isNaN(val) ? 0 : val;
    const updated = {
      ...manualForecast,
      isCustom: true,
      [e.target.name]: numVal
    };
    setManualForecast(updated);

    if (hasStartedML) {
      const currentP = parseFloat(sensorData.currentPoolTemp) || 0;
      const posGain = Math.max(0, parseFloat(updated.naturalPoolHeat20M) || 0);
      const stopPoint = Number((MAX_TARGET_TEMP - posGain).toFixed(2));
      if (currentP >= stopPoint || currentP >= MAX_TARGET_TEMP) {
        setIsWaitingFor33Drop(true);
        syncHardwareState(true, true);
      } else if (!isWaitingFor33Drop) {
        syncHardwareState(false, true);
      }
    }
  };

  // 1-Click Demo Helper: Jumps Current Pool Temp to exact ML Stop Point, turns Heater OFF, and waits for < 33.0°C
  const simulateReachingStopPoint = (targetStopTemp) => {
    setHasStartedML(true);
    setIsWaitingFor33Drop(true);
    setSensorData((prev) => ({
      ...prev,
      currentPoolTemp: targetStopTemp
    }));
    countdownRef.current = AUTO_AI_INTERVAL_SEC;
    setCountdown(AUTO_AI_INTERVAL_SEC);
    syncHardwareState(true, true);
    if (isMoneySaved) {
      record20MinSavingSegment(
        targetStopTemp,
        predictedAmbient20M,
        naturalPoolGain20M,
        targetStopTemp,
        savedKWhNum,
        savedCostNum,
        `Stopped @ ${targetStopTemp.toFixed(2)}°C (20-Min Cycle)`
      );
    }
  };

  // Clear Savings History Log
  const clearSavingsHistory = () => {
    setSavingsHistory([]);
    try {
      localStorage.removeItem('ecopool_20min_savings_log');
    } catch (e) {}
  };

  // Cumulative Totals for the 20-Min Savings Log Tab
  const totalSavedKWhAllSegments = savingsHistory.reduce((acc, item) => acc + (parseFloat(item.savedKWh) || 0), 0);
  const totalSavedCostAllSegments = savingsHistory.reduce((acc, item) => acc + (parseFloat(item.savedCostLKR) || 0), 0);

  // Master Heater Status Banner (Only displayed when hasStartedML === true)
  let isHeaterOff = false;
  let statusMessage = '';
  let subStatusMessage = '';
  let boxColor = '#FFF3CD';
  let borderColor = '#FFEEBA';

  if (isAtOrAboveMax) {
    isHeaterOff = true;
    statusMessage =
      poolNow > MAX_TARGET_TEMP
        ? 'HEATER IS OFF — Pool Above 35.0°C Max Limit (Waiting Until < 33.0°C)'
        : 'HEATER IS OFF — Max 35.0°C Reached (Waiting Until < 33.0°C)';
    subStatusMessage = 'Heater will remain OFF across 20-minute checks until pool cools below 33.0°C.';
    boxColor = '#D4EDDA';
    borderColor = '#C3E6CB';
  } else if (poolNow >= mlStopPoint) {
    isHeaterOff = true;
    statusMessage = `HEATER IS OFF — Stopped at ML Stop Point (${mlStopPoint.toFixed(2)}°C)`;
    subStatusMessage = `Natural heat (+${positiveNaturalGain.toFixed(2)}°C in 20m) carries pool to 35.00°C. Heater stays OFF until pool drops below 33.0°C.`;
    boxColor = '#D4EDDA';
    borderColor = '#C3E6CB';
  } else if (isWaitingFor33Drop && poolNow >= MIN_COMFORT_TEMP) {
    isHeaterOff = true;
    statusMessage = `HEATER IS OFF — Comfort Standby (${poolNow.toFixed(2)}°C is within 33.0°C – 35.0°C)`;
    subStatusMessage = 'Pool already heated to target. Heater stays OFF and checks every 20 mins until pool drops below 33.0°C.';
    boxColor = '#D4EDDA';
    borderColor = '#C3E6CB';
  } else {
    isHeaterOff = false;
    if (isNaturallyHeating) {
      statusMessage = `HEATER IS ON — Heating up to ML Stop Point (${mlStopPoint.toFixed(2)}°C)`;
      subStatusMessage = `Next 20m env temp (${predictedAmbient20M.toFixed(2)}°C) naturally heats pool by +${positiveNaturalGain.toFixed(2)}°C. Heater will auto-stop at ${mlStopPoint.toFixed(2)}°C.`;
    } else {
      statusMessage = 'HEATER IS ON — Heating up to 35.00°C';
      subStatusMessage = `No natural heating in next 20 mins (Pool cools by ${Math.abs(naturalPoolGain20M).toFixed(2)}°C). Heater runs up to 35.00°C.`;
    }
    boxColor = '#FFF3CD';
    borderColor = '#FFEEBA';
  }

  const cardStyle = (id, highlightGreen) => ({
    flex: '1 1 175px',
    padding: '14px 16px',
    backgroundColor: '#ffffff',
    border: `1px solid ${hoveredCard === id ? (highlightGreen ? '#28A745' : '#D39E00') : highlightGreen ? '#C3E6CB' : '#FFEEBA'}`,
    borderRadius: '6px',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    transform: hoveredCard === id ? 'translateY(-2px)' : 'none',
    boxShadow: hoveredCard === id ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
    cursor: 'default'
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1080px', width: '100%', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
      {/* SUDDEN DROP (< 33.0°C) NOTIFICATION POPUP */}
      {isBelow33Alert && !lowTempDismissed && (
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#f8d7da',
            border: '2px solid #dc3545',
            borderRadius: '8px',
            color: '#721c24',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 4px 12px rgba(220, 53, 69, 0.18)'
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc3545' }}>
              Low Pool Temperature Alert (Below 33.0°C Comfort Limit)
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px', color: '#721c24' }}>
              Pool Temperature Dropped to {poolNow.toFixed(2)}°C!
            </div>
            <div style={{ fontSize: '13px', marginTop: '3px', color: '#721c24' }}>
              Click the button on the right to run the 20-minute ML prediction and turn the heater ON.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleManualMLRecheck}
              disabled={isLoading}
              style={{
                padding: '10px 18px',
                backgroundColor: '#dc3545',
                color: '#ffffff',
                border: 'none',
                borderRadius: '5px',
                fontWeight: 'bold',
                fontSize: '13.5px',
                cursor: 'pointer'
              }}
            >
              {isLoading ? 'Running ML...' : 'Run ML & Turn Heater ON'}
            </button>
            <button
              onClick={() => setLowTempDismissed(true)}
              style={{
                padding: '10px 12px',
                backgroundColor: 'transparent',
                color: '#721c24',
                border: '1px solid #f5c6cb',
                borderRadius: '5px',
                fontWeight: 'bold',
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#111' }}>
          Algorithmic Energy Optimization
        </h2>
        <button
          onClick={() => setIsLiveMode(!isLiveMode)}
          style={{
            padding: '9px 18px',
            backgroundColor: isLiveMode ? '#28A745' : '#6C757D',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px'
          }}
        >
          {isLiveMode ? 'LIVE HARDWARE MODE' : 'MANUAL DEMO MODE'}
        </button>
      </div>

      <p style={{ color: '#666', marginTop: 0, marginBottom: '18px', fontSize: '14px' }}>
        Thermodynamics AI Engine • 20-Min Predictive Segments (Hotel Comfort Range: 33.0°C – 35.0°C Max)
      </p>

      {/* Navigation Tabs: Optimizer vs. 20-Min Savings Log */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #dee2e6', marginBottom: '22px' }}>
        <button
          onClick={() => setActiveTab('optimizer')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            border: 'none',
            borderBottom: activeTab === 'optimizer' ? '3px solid #007BFF' : '3px solid transparent',
            backgroundColor: activeTab === 'optimizer' ? '#eef6ff' : 'transparent',
            color: activeTab === 'optimizer' ? '#007BFF' : '#555',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0'
          }}
        >
          Live Optimizer & Control
        </button>
        <button
          onClick={() => setActiveTab('savingsLog')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            border: 'none',
            borderBottom: activeTab === 'savingsLog' ? '3px solid #28A745' : '3px solid transparent',
            backgroundColor: activeTab === 'savingsLog' ? '#e9f7ef' : 'transparent',
            color: activeTab === 'savingsLog' ? '#155724' : '#555',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>20-Min Savings Log ({savingsHistory.length})</span>
          {totalSavedCostAllSegments > 0 && (
            <span style={{ padding: '2px 8px', backgroundColor: '#28A745', color: '#fff', borderRadius: '12px', fontSize: '11.5px' }}>
              Rs. {totalSavedCostAllSegments.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: LIVE OPTIMIZER & CONTROL */}
      {activeTab === 'optimizer' ? (
        <>
          {/* Sensor Inputs (Always visible on initial load) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div style={{ padding: '14px 16px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', color: '#333' }}>
                Current Environment Temp (°C)
              </label>
              <input
                type="number"
                step="0.1"
                name="ambientTemp"
                value={sensorData.ambientTemp}
                onChange={handleInputChange}
                disabled={isLiveMode}
                style={{ width: '100%', padding: '7px 10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ padding: '14px 16px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', color: '#333' }}>
                Environment Humidity (%)
              </label>
              <input
                type="number"
                step="0.1"
                name="humidity"
                value={sensorData.humidity}
                onChange={handleInputChange}
                disabled={isLiveMode}
                style={{ width: '100%', padding: '7px 10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ padding: '14px 16px', backgroundColor: isBelow33Alert ? '#fff5f5' : '#f8f9fa', border: `1px solid ${isBelow33Alert ? '#dc3545' : '#dee2e6'}`, borderRadius: '6px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', color: isBelow33Alert ? '#dc3545' : '#333' }}>
                Current Pool Temp (°C) {isBelow33Alert ? '(BELOW 33°C)' : ''}
              </label>
              <input
                type="number"
                step="0.01"
                name="currentPoolTemp"
                value={sensorData.currentPoolTemp}
                onChange={handleInputChange}
                disabled={isLiveMode}
                style={{ width: '100%', padding: '7px 10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* CONTROL BAR: Shows Run ML Button on first load; shows 20-Min Timer + Manual Button after ML starts */}
          {!isLiveMode ? (
            <div style={{ padding: '14px 16px', backgroundColor: '#eef6ff', border: '1px solid #b8daff', borderRadius: '6px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#004085', marginBottom: '10px', textTransform: 'uppercase' }}>
                Manual Demo Controls — 20-Min Segment Inputs & Simulation
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12.5px', marginBottom: '5px', color: '#333' }}>
                    Manual Next 20 Min Env Temp (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="next20MEnvTemp"
                    value={manualForecast.next20MEnvTemp}
                    onChange={handleManualForecastChange}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '15px', borderRadius: '4px', border: '1px solid #80bdff', boxSizing: 'border-box', backgroundColor: '#fff' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12.5px', marginBottom: '5px', color: '#333' }}>
                    Manual Natural Pool Heat (20 Min) (°C)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="naturalPoolHeat20M"
                    value={manualForecast.naturalPoolHeat20M}
                    onChange={handleManualForecastChange}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '15px', borderRadius: '4px', border: '1px solid #80bdff', boxSizing: 'border-box', backgroundColor: '#fff' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleManualMLRecheck}
                    disabled={isLoading}
                    style={{
                      flex: 1,
                      padding: '9px 14px',
                      backgroundColor: '#007BFF',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px'
                    }}
                  >
                    {isLoading ? 'Running...' : hasStartedML ? 'Run ML Again' : 'Run ML Prediction'}
                  </button>

                  {hasStartedML && !isHeaterOff && !isAtOrAboveMax && (
                    <button
                      onClick={() => simulateReachingStopPoint(mlStopPoint)}
                      title="Simulates pool reaching ML Stop Point, turns heater OFF, and waits until < 33°C"
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        backgroundColor: '#28A745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '12.5px'
                      }}
                    >
                      Demo Stop @ {mlStopPoint.toFixed(2)}°C
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '14px 18px',
                backgroundColor: hasStartedML ? '#e9f7ef' : '#f8f9fa',
                border: `1px solid ${hasStartedML ? '#c3e6cb' : '#dee2e6'}`,
                borderRadius: '6px',
                color: hasStartedML ? '#155724' : '#333',
                fontWeight: 'bold',
                fontSize: '13.5px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px'
              }}
            >
              <div>
                <span>
                  {!hasStartedML
                    ? 'Live ESP32 sensor telemetry ready. Click "Run ML Prediction" to start optimization.'
                    : isLoading
                    ? 'Running 20-Min ML Prediction & Syncing ESP32...'
                    : '20-Min Auto ML Cycle Active (Live ESP32 Pool Temp Streaming)'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {hasStartedML && (
                  <span style={{ padding: '6px 12px', backgroundColor: '#ffffff', border: '1px solid #28A745', borderRadius: '4px', color: '#155724' }}>
                    Next Auto Check (20-Min): {formatCountdown(countdown)}
                  </span>
                )}

                <button
                  onClick={handleManualMLRecheck}
                  disabled={isLoading}
                  style={{
                    padding: '9px 18px',
                    backgroundColor: '#007BFF',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '5px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {isLoading
                    ? 'Running ML...'
                    : hasStartedML
                    ? 'Run ML Prediction Again'
                    : 'Run ML Prediction'}
                </button>
              </div>
            </div>
          )}

          {/* AI DECISION & 20-MIN CARDS PANEL: ONLY SHOWN AFTER MANAGER CLICKS RUN ML */}
          {hasStartedML && (!aiResult || !aiResult.error) && (
            <div
              style={{
                padding: '20px',
                backgroundColor: boxColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                marginBottom: '20px'
              }}
            >
              {/* Top Decision Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: `1px dashed ${isHeaterOff ? '#28A745' : '#B5A642'}` }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: isHeaterOff ? '#155724' : '#856404', textTransform: 'uppercase' }}>
                    AI Decision (20-Minute Segment • 33.0°C – 35.0°C Band)
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginTop: '4px' }}>
                    {statusMessage}
                  </div>
                  <div style={{ fontSize: '13px', color: '#444', marginTop: '4px' }}>
                    {subStatusMessage}
                  </div>
                </div>

                <div style={{ padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '4px', border: `1px solid ${borderColor}`, fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
                  {isAtOrAboveMax
                    ? 'Comfort Band: 33.0°C – 35.0°C'
                    : `Max Limit: 35.00°C | ML Stop Point: ${mlStopPoint.toFixed(2)}°C`}
                </div>
              </div>

              {/* 20-Minute Step-by-Step Cards */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                
                {/* Card 1: Next 20 Min Environment Temp */}
                <div
                  style={cardStyle('env20m', isHeaterOff)}
                  onMouseEnter={() => setHoveredCard('env20m')}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                    Next 20 Min Environment Temp
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111', marginTop: '6px' }}>
                    {predictedAmbient20M.toFixed(2)}°C
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#666', marginTop: '4px' }}>
                    {envChange20M >= 0
                      ? `Rises +${envChange20M.toFixed(2)}°C from ${ambientNow.toFixed(1)}°C`
                      : `Drops ${envChange20M.toFixed(2)}°C from ${ambientNow.toFixed(1)}°C`}
                  </div>
                </div>

                {/* Card 2: Natural Pool Heat Gain / Cooling in Next 20 Min */}
                <div
                  style={cardStyle('pool20m', isHeaterOff)}
                  onMouseEnter={() => setHoveredCard('pool20m')}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                    {isNaturallyHeating ? 'Natural Pool Heat (20 Min)' : 'Natural Pool Cooling (20 Min)'}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: isNaturallyHeating ? '#155724' : '#555', marginTop: '6px' }}>
                    {isNaturallyHeating ? `+${naturalPoolGain20M.toFixed(2)}°C` : `${naturalPoolGain20M.toFixed(2)}°C`}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#666', marginTop: '4px' }}>
                    Pool reaches {predictedPool20M.toFixed(2)}°C naturally
                  </div>
                </div>

                {/* Card 3: Exact ML Heater Stop Point (Hidden only if pool is already >= 35.0°C) */}
                {!isAtOrAboveMax && (
                  <div
                    style={cardStyle('stopPoint', isHeaterOff)}
                    onMouseEnter={() => setHoveredCard('stopPoint')}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                      ML Heater Stop Point
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0056b3', marginTop: '6px' }}>
                      {mlStopPoint.toFixed(2)}°C
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#666', marginTop: '4px' }}>
                      {isNaturallyHeating
                        ? `Stops at ${mlStopPoint.toFixed(2)}°C, then waits for < 33.0°C`
                        : 'No natural heat (heats to 35.00°C)'}
                    </div>
                  </div>
                )}

                {/* Card 4 & Card 5: Displayed both while heating AND after stopping at ML Stop Point if natural heating > 0 */}
                {isMoneySaved && (
                  <>
                    <div
                      style={cardStyle('kwhSaved', true)}
                      onMouseEnter={() => setHoveredCard('kwhSaved')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                        Electricity Saved (20 Min)
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#155724', marginTop: '6px' }}>
                        {savedKWh} kWh
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#666', marginTop: '4px' }}>
                        By not heating +{savedTempC.toFixed(2)}°C (0.1°C = 7.54 kWh)
                      </div>
                    </div>

                    <div
                      style={cardStyle('costSaved', true)}
                      onMouseEnter={() => setHoveredCard('costSaved')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                        CEB Cost Saved (20 Min)
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#155724', marginTop: '6px' }}>
                        Rs. {savedCostLKR}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#666', marginTop: '4px' }}>
                        @ Rs. 38/kWh (0.1°C = Rs. 286.52)
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>
          )}

          {/* Manual Hardware Control Panel (At the Bottom of the Page) */}
          <div style={{ padding: '16px 20px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#222' }}>Manual Hardware Control</h4>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
                Active Mode: [{hardwareMode}]
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => sendHardwareCommand('ON')}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#DC3545',
                  color: 'white',
                  border: hardwareMode === 'ON' ? '2px solid #111' : 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Force ON
              </button>
              <button
                onClick={() => sendHardwareCommand('OFF')}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#007BFF',
                  color: 'white',
                  border: hardwareMode === 'OFF' ? '2px solid #111' : 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Force OFF
              </button>
              <button
                onClick={() => sendHardwareCommand('AUTO')}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#28A745',
                  color: 'white',
                  border: hardwareMode === 'AUTO' ? '2px solid #111' : 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Auto Mode
              </button>
            </div>
          </div>
        </>
      ) : (
        /* TAB 2: 20-MINUTE SAVINGS LEDGER & ACCUMULATED ROI HISTORY */
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #dee2e6', borderRadius: '6px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#111' }}>
                Accumulated 20-Minute Energy & CEB Cost Savings Log
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                Every 20-minute segment where natural heating saved electricity and CEB cost is recorded below (0.1°C = 7.54 kWh = Rs. 286.52).
              </p>
            </div>

            {savingsHistory.length > 0 && (
              <button
                onClick={clearSavingsHistory}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '12.5px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Clear Saved History
              </button>
            )}
          </div>

          {/* Cumulative Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: '#e9f7ef', border: '1px solid #c3e6cb', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#155724', textTransform: 'uppercase' }}>
                Total 20-Min Saving Segments
              </div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#111', marginTop: '6px' }}>
                {savingsHistory.length} Segments
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#e9f7ef', border: '1px solid #c3e6cb', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#155724', textTransform: 'uppercase' }}>
                Total Electricity Saved
              </div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#155724', marginTop: '6px' }}>
                {totalSavedKWhAllSegments.toFixed(2)} kWh
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#e9f7ef', border: '1px solid #c3e6cb', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#155724', textTransform: 'uppercase' }}>
                Total CEB Cost Saved
              </div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#155724', marginTop: '6px' }}>
                Rs. {totalSavedCostAllSegments.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* 20-Minute Segments Table */}
          {savingsHistory.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '6px', color: '#666', fontSize: '14px' }}>
              No 20-minute saving segments recorded yet. Click "Run ML Prediction" when natural pool heat is positive to log savings.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>Segment #</th>
                    <th style={{ padding: '10px 12px' }}>Time</th>
                    <th style={{ padding: '10px 12px' }}>Trigger Mode</th>
                    <th style={{ padding: '10px 12px' }}>Pool Temp</th>
                    <th style={{ padding: '10px 12px' }}>20M Env Temp</th>
                    <th style={{ padding: '10px 12px' }}>20M Natural Gain</th>
                    <th style={{ padding: '10px 12px' }}>ML Stop Point</th>
                    <th style={{ padding: '10px 12px' }}>Saved (20M)</th>
                    <th style={{ padding: '10px 12px' }}>CEB Saved (20M)</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsHistory.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>#{savingsHistory.length - idx}</td>
                      <td style={{ padding: '10px 12px', color: '#555' }}>{item.timestamp}</td>
                      <td style={{ padding: '10px 12px' }}>{item.source}</td>
                      <td style={{ padding: '10px 12px' }}>{item.poolTemp}°C</td>
                      <td style={{ padding: '10px 12px' }}>{item.envTemp20M}°C</td>
                      <td style={{ padding: '10px 12px', color: '#155724', fontWeight: 'bold' }}>+{item.naturalGain20M}°C</td>
                      <td style={{ padding: '10px 12px', color: '#0056b3', fontWeight: 'bold' }}>{item.mlStopPoint}°C</td>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#155724' }}>{item.savedKWh} kWh</td>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#155724' }}>
                        Rs. {parseFloat(item.savedCostLKR).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}