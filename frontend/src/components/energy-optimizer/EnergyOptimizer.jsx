import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'http://localhost:5000/api/energy-optimization';
const POOL_VOLUME_LITERS = 65000;
const SPECIFIC_HEAT_KWH_PER_L_C = 0.00116; // 75.4 kWh per 1°C for 65,000L
const CEB_RATE_LKR_PER_KWH = 40.0; // Rs. 40 per kWh
const MAX_TARGET_TEMP = 35.0;
const HEATER_1H_RISE = 0.398; // 30kW heater temp rise in 1 hour
const AUTO_AI_INTERVAL_SEC = 20;

export default function EnergyOptimizer() {
  // Starts immediately in Live Hardware Mode
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [sensorData, setSensorData] = useState({
    ambientTemp: 31.4,
    humidity: 75.9,
    currentPoolTemp: 34.5
  });

  const [aiResult, setAiResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_AI_INTERVAL_SEC);
  const [hardwareMode, setHardwareMode] = useState('AUTO');
  const [hoveredCard, setHoveredCard] = useState(null);

  const latestSensorRef = useRef(sensorData);
  useEffect(() => {
    latestSensorRef.current = sensorData;
  }, [sensorData]);

  // Trigger Python AI Backend
  const triggerAI = useCallback(async (customData = null) => {
    const payload = customData || latestSensorRef.current;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setAiResult(data);
    } catch (error) {
      setAiResult({ error: 'Failed to connect to AI Engine' });
    }
    setIsLoading(false);
  }, []);

  // Poll live ESP32 data every 1 second when Live Mode is ON
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

  // Auto-run ML prediction every 20 seconds in Live Hardware Mode
  useEffect(() => {
    if (!isLiveMode) {
      setCountdown(AUTO_AI_INTERVAL_SEC);
      return;
    }

    const initialTimer = setTimeout(() => {
      triggerAI(latestSensorRef.current);
      setCountdown(AUTO_AI_INTERVAL_SEC);
    }, 800);

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          triggerAI(latestSensorRef.current);
          return AUTO_AI_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(countdownInterval);
    };
  }, [isLiveMode, triggerAI]);

  // Manual Hardware Control Override
  const sendHardwareCommand = async (command) => {
    try {
      setHardwareMode(command);
      await fetch(`${API_BASE}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: command })
      });
      if (command === 'AUTO') {
        triggerAI(latestSensorRef.current);
      }
    } catch (e) {
      console.error('Hardware Command Failed', e);
    }
  };

  const handleInputChange = (e) => {
    const val = parseFloat(e.target.value);
    setSensorData({ ...sensorData, [e.target.name]: isNaN(val) ? 0 : val });
    setAiResult(null);
  };

  // 1-Hour Thermodynamics Math
  const currentTemp = parseFloat(sensorData.currentPoolTemp) || 0;
  const isAtOrAboveMax = currentTemp >= MAX_TARGET_TEMP;

  const predictedTemp1H =
    aiResult && aiResult.predictedTemp !== undefined
      ? parseFloat(aiResult.predictedTemp)
      : currentTemp;
  const tempDiff1H = predictedTemp1H - currentTemp;

  // Dynamic Cut-Off Point calculated from ML prediction (only relevant when below 35.0°C)
  const dynamicStopTemp =
    tempDiff1H > 0
      ? MAX_TARGET_TEMP - tempDiff1H
      : currentTemp;

  // Free Solar Energy (1 Hour)
  const solarEnergy1H =
    aiResult && tempDiff1H > 0
      ? (tempDiff1H * POOL_VOLUME_LITERS * SPECIFIC_HEAT_KWH_PER_L_C).toFixed(2)
      : '0.00';

  // Master Heater Status Logic
  let isHeaterOff = false;
  let statusMessage = 'HEATER IS ON (Next 1 Hour)';
  let boxColor = '#FFF3CD';
  let borderColor = '#FFEEBA';

  if (isAtOrAboveMax) {
    isHeaterOff = true;
    statusMessage =
      currentTemp > MAX_TARGET_TEMP
        ? 'HEATER IS OFF FOR NEXT 1 HOUR (Pool Above 35.0°C Limit)'
        : 'HEATER IS OFF FOR NEXT 1 HOUR (Max 35.0°C Reached)';
    boxColor = '#D4EDDA';
    borderColor = '#C3E6CB';
  } else if (
    aiResult &&
    (aiResult.action === 'TURN_OFF_HEATER' ||
      predictedTemp1H >= MAX_TARGET_TEMP ||
      predictedTemp1H + HEATER_1H_RISE >= MAX_TARGET_TEMP)
  ) {
    isHeaterOff = true;
    statusMessage = `HEATER IS OFF FOR NEXT 1 HOUR (Stopped at ${currentTemp.toFixed(2)}°C)`;
    boxColor = '#D4EDDA';
    borderColor = '#C3E6CB';
  }

  // Dynamic CEB Cost & Electricity Saved (1 Hour)
  // If pool is already >= 35.0°C, no heating is required at all, so savings are 0 and CEB card is hidden
  const getDynamicSavings = () => {
    if (!isHeaterOff || isAtOrAboveMax) {
      return { savedKWh: '0.00', savedCostLKR: '0.00' };
    }

    const lowestTemp = Math.min(currentTemp, predictedTemp1H);
    const tempSaved = Math.max(0, MAX_TARGET_TEMP - lowestTemp);

    const kwh = tempSaved * POOL_VOLUME_LITERS * SPECIFIC_HEAT_KWH_PER_L_C;
    const cost = kwh * CEB_RATE_LKR_PER_KWH;

    return {
      savedKWh: kwh.toFixed(2),
      savedCostLKR: cost.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    };
  };

  const { savedKWh, savedCostLKR } = getDynamicSavings();

  const cardStyle = (id, isOff) => ({
    flex: '1 1 170px',
    padding: '14px 16px',
    backgroundColor: '#ffffff',
    border: `1px solid ${hoveredCard === id ? (isOff ? '#28A745' : '#D39E00') : isOff ? '#C3E6CB' : '#FFEEBA'}`,
    borderRadius: '6px',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    transform: hoveredCard === id ? 'translateY(-2px)' : 'none',
    boxShadow: hoveredCard === id ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
    cursor: 'default'
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1050px', width: '100%', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
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

      <p style={{ color: '#666', marginTop: 0, marginBottom: '22px', fontSize: '14px' }}>
        Thermodynamics AI Engine • {isLiveMode ? 'Streaming live data from ESP32 (Max Pool Target: 35.0°C)' : 'Override sensors for panel presentation (Max Pool Target: 35.0°C)'}
      </p>

      {/* Sensor Inputs (Widescreen 3-Column Row) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ padding: '14px 16px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', color: '#333' }}>
            Ambient Temp (°C)
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
            Humidity (%)
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

        <div style={{ padding: '14px 16px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', color: '#333' }}>
            Current Pool Temp (°C)
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

      {/* Action Button in Manual Mode OR Auto Status Bar in Live Mode */}
      {!isLiveMode ? (
        <button
          onClick={() => triggerAI(sensorData)}
          disabled={isLoading}
          style={{
            padding: '10px 24px',
            backgroundColor: '#007BFF',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            marginBottom: '20px'
          }}
        >
          {isLoading ? 'Calculating...' : 'AI Simulation'}
        </button>
      ) : (
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#e9f7ef',
            border: '1px solid #c3e6cb',
            borderRadius: '5px',
            color: '#155724',
            fontWeight: 'bold',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}
        >
          <span>{isLoading ? 'Running ML Prediction & Syncing ESP32...' : 'Auto ML Prediction Active (Synced with ESP32 OLED)'}</span>
          <span>Next Auto Check: {countdown}s</span>
        </div>
      )}

      {/* AI Decision & 1-Hour Interactive Cards Panel */}
      {aiResult && !aiResult.error && (
        <div
          style={{
            padding: '20px',
            backgroundColor: boxColor,
            border: `1px solid ${borderColor}`,
            borderRadius: '6px',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: `1px dashed ${isHeaterOff ? '#28A745' : '#B5A642'}` }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: isHeaterOff ? '#155724' : '#856404', textTransform: 'uppercase' }}>
                AI Decision (Next 1 Hour)
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginTop: '4px' }}>
                {statusMessage}
              </div>
            </div>

            {/* Hide ML Stop Point if Pool Temp is already >= 35.0°C (since pool has no cooler) */}
            <div style={{ padding: '6px 12px', backgroundColor: '#ffffff', borderRadius: '4px', border: `1px solid ${borderColor}`, fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
              {isAtOrAboveMax
                ? 'Max Limit: 35.00°C'
                : `Max Limit: 35.00°C | ML Stop Point: ${dynamicStopTemp.toFixed(2)}°C`}
            </div>
          </div>

          {/* Interactive Metric Cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            
            <div
              style={cardStyle('estTemp', isHeaterOff)}
              onMouseEnter={() => setHoveredCard('estTemp')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Est. Temp (Next 1 Hour)</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111', marginTop: '6px' }}>
                {predictedTemp1H.toFixed(2)}°C
              </div>
            </div>

            <div
              style={cardStyle('tempChange', isHeaterOff)}
              onMouseEnter={() => setHoveredCard('tempChange')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>
                {tempDiff1H >= 0 ? 'Natural Heat Gained (1H)' : 'Natural Cooling (1H)'}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111', marginTop: '6px' }}>
                {Math.abs(tempDiff1H).toFixed(2)}°C
              </div>
            </div>

            <div
              style={cardStyle('solar', isHeaterOff)}
              onMouseEnter={() => setHoveredCard('solar')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Free Solar (1H)</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111', marginTop: '6px' }}>
                {solarEnergy1H} kWh
              </div>
            </div>

            <div
              style={cardStyle('grid', isHeaterOff)}
              onMouseEnter={() => setHoveredCard('grid')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Grid Electricity Saved (1H)</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: isHeaterOff && !isAtOrAboveMax ? '#155724' : '#555', marginTop: '6px' }}>
                {savedKWh} kWh
              </div>
            </div>

            {/* Only show CEB Cost Avoided (1H) when Pool Temp is strictly below 35.0°C */}
            {!isAtOrAboveMax && (
              <div
                style={cardStyle('cost', isHeaterOff)}
                onMouseEnter={() => setHoveredCard('cost')}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>CEB Cost Avoided (1H)</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: isHeaterOff ? '#155724' : '#856404', marginTop: '6px' }}>
                  Rs. {savedCostLKR}
                </div>
              </div>
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

    </div>
  );
}