import React, { useState, useEffect } from 'react';

export default function EnergyOptimizer() {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [sensorData, setSensorData] = useState({
    ambientTemp: 32.5,
    humidity: 75.0,
    currentPoolTemp: 33.0
  });
  
  const [aiResult, setAiResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-fetch live data every 1 second when Live Mode is ON 🏎️
  useEffect(() => {
    let interval;
    if (isLiveMode) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('http://localhost:5000/api/energy-optimization/live-sensors');
          const liveData = await res.json();
          if (liveData) {
            setSensorData({
              ambientTemp: liveData.ambientTemp || sensorData.ambientTemp,
              humidity: liveData.humidity || sensorData.humidity,
              currentPoolTemp: liveData.currentPoolTemp || sensorData.currentPoolTemp
            });
          }
        } catch (err) {
          console.log("Waiting for live hardware data...");
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLiveMode, sensorData]);

  const triggerAI = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/energy-optimization/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorData),
      });
      const data = await response.json();
      setAiResult(data);
    } catch (error) {
      setAiResult({ error: 'Failed to connect to Umi AI Engine' });
    }
    setIsLoading(false);
  };

  const handleInputChange = (e) => {
    setSensorData({ ...sensorData, [e.target.name]: parseFloat(e.target.value) || 0 });
  };

  // 🧠 Umi's Business ROI Math Helper
  const getSolarEnergy = () => {
    if (!aiResult || !aiResult.predictedTemp) return 0;
    const gained = Math.max(0, parseFloat(aiResult.predictedTemp) - sensorData.currentPoolTemp);
    return (gained * 65000 * 0.00116).toFixed(1); // 65,000L * 0.00116 kWh/L/°C
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>⚡ Algorithmic Energy Optimization</h2>
        
        {/* THE DEMO / LIVE TOGGLE SWITCH */}
        <button 
          onClick={() => setIsLiveMode(!isLiveMode)}
          style={{
            padding: '8px 15px',
            backgroundColor: isLiveMode ? '#28A745' : '#6C757D',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isLiveMode ? '🔴 LIVE HARDWARE MODE' : '🛠️ MANUAL DEMO MODE'}
        </button>
      </div>

      <p style={{ color: '#666', marginBottom: '20px' }}>
        Thermodynamics AI Engine • {isLiveMode ? 'Streaming data from ESP32...' : 'Override sensors for panel presentation.'}
      </p>

      {/* Sensor Input Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
        <div>
          <label style={{ fontWeight: 'bold' }}>Ambient Temp (°C): </label>
          <input 
            type="number" name="ambientTemp" value={sensorData.ambientTemp} 
            onChange={handleInputChange} disabled={isLiveMode}
            style={{ marginLeft: '10px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: isLiveMode ? '#e9ecef' : 'white' }}
          />
        </div>
        <div>
          <label style={{ fontWeight: 'bold' }}>Humidity (%): </label>
          <input 
            type="number" name="humidity" value={sensorData.humidity} 
            onChange={handleInputChange} disabled={isLiveMode}
            style={{ marginLeft: '10px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: isLiveMode ? '#e9ecef' : 'white' }}
          />
        </div>
        <div>
          <label style={{ fontWeight: 'bold' }}>Current Pool Temp (°C): </label>
          <input 
            type="number" name="currentPoolTemp" value={sensorData.currentPoolTemp} 
            onChange={handleInputChange} disabled={isLiveMode}
            style={{ marginLeft: '10px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: isLiveMode ? '#e9ecef' : 'white' }}
          />
        </div>
      </div>

      <button 
        onClick={triggerAI} disabled={isLoading}
        style={{ padding: '10px 20px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        {isLoading ? '🧠 Calculating...' : '🚀 Run AI "What-If" Simulation'}
      </button>

      {/* Results & ROI Panel */}
      {aiResult && !aiResult.error && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: aiResult.action === 'TURN_OFF_HEATER' ? '#D4EDDA' : '#FFF3CD', border: '1px solid', borderColor: aiResult.action === 'TURN_OFF_HEATER' ? '#C3E6CB' : '#FFEEBA', borderRadius: '5px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>🤖 AI Decision:</h3>
          <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0' }}>
            Action: {aiResult.action === 'TURN_OFF_HEATER' ? '🛑 TURN OFF HEATER (Save Energy)' : '🔥 KEEP HEATER ON'}
          </p>
          {aiResult.predictedTemp && (
            <p style={{ margin: '5px 0' }}>Predicted Temp in 1 Hour: <strong>{aiResult.predictedTemp}°C</strong></p>
          )}

          {/* 💰 The Money Maker Box! Only shows when the AI saves energy! */}
          {aiResult.action === 'TURN_OFF_HEATER' && (
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #28A745' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>💰 Financial & Energy Savings (Next 1 Hour)</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#155724', lineHeight: '1.8' }}>
                <li><strong>Heater Sleep Duration:</strong> 1.0 Hour ⏱️</li>
                <li><strong>Free Solar Energy Harvested:</strong> {getSolarEnergy()} kWh ☀️</li>
                <li><strong>Grid Electricity Saved:</strong> 30.0 kWh <em>(Assuming 30kW Heater)</em> 🔌</li>
                <li><strong>CEB Cost Avoided:</strong> <strong>Rs. 1,200.00</strong> <em>(At ~Rs. 40/unit)</em> 💸</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}