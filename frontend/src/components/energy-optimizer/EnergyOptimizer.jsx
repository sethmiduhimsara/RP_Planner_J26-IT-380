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
        } catch (err) {}
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

  const sendHardwareCommand = async (command) => {
    try {
      await fetch('http://localhost:5000/api/energy-optimization/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: command })
      });
      alert(`Hardware Command Sent: [${command}]`);
    } catch (e) {
      console.error("Hardware Command Failed", e);
    }
  };

  const handleInputChange = (e) => {
    setSensorData({ ...sensorData, [e.target.name]: parseFloat(e.target.value) || 0 });
  };

  // 🧠 Upgraded ROI Math for partial hours
  const getSolarEnergy = (hours) => {
    if (!aiResult || !aiResult.predictedTemp) return 0;
    const gained = Math.max(0, parseFloat(aiResult.predictedTemp) - sensorData.currentPoolTemp);
    const totalEnergy = (gained * 65000 * 0.00116);
    return (totalEnergy * hours).toFixed(1); 
  };

  // Calculate temp differences cleanly
  const tempDiff1H = aiResult ? (parseFloat(aiResult.predictedTemp) - sensorData.currentPoolTemp) : 0;
  const tempDiff30M = tempDiff1H / 2;

  return (
    <div style={{ padding: '20px', maxWidth: '600px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>⚡ Algorithmic Energy Optimization</h2>
        <button 
          onClick={() => setIsLiveMode(!isLiveMode)}
          style={{ padding: '8px 15px', backgroundColor: isLiveMode ? '#28A745' : '#6C757D', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}
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
          <input type="number" name="ambientTemp" value={sensorData.ambientTemp} onChange={handleInputChange} disabled={isLiveMode} style={{ marginLeft: '10px', padding: '5px' }} />
        </div>
        <div>
          <label style={{ fontWeight: 'bold' }}>Humidity (%): </label>
          <input type="number" name="humidity" value={sensorData.humidity} onChange={handleInputChange} disabled={isLiveMode} style={{ marginLeft: '10px', padding: '5px' }} />
        </div>
        <div>
          <label style={{ fontWeight: 'bold' }}>Current Pool Temp (°C): </label>
          <input type="number" name="currentPoolTemp" value={sensorData.currentPoolTemp} onChange={handleInputChange} disabled={isLiveMode} style={{ marginLeft: '10px', padding: '5px' }} />
        </div>
      </div>

      <button onClick={triggerAI} disabled={isLoading} style={{ padding: '10px 20px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
        {isLoading ? '🧠 Calculating...' : '🚀 Run AI "What-If" Simulation'}
      </button>

      {/* 🎛️ Manual Hardware Control Panel */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '5px' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>🎛️ Manual Hardware Control</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => sendHardwareCommand('ON')} style={{ flex: 1, padding: '8px', backgroundColor: '#DC3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>🔥 Force ON</button>
          <button onClick={() => sendHardwareCommand('OFF')} style={{ flex: 1, padding: '8px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>🛑 Force OFF</button>
          <button onClick={() => sendHardwareCommand('AUTO')} style={{ flex: 1, padding: '8px', backgroundColor: '#28A745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>🤖 Auto Mode</button>
        </div>
      </div>

      {/* Results & ROI Panel */}
      {aiResult && !aiResult.error && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: aiResult.action === 'TURN_OFF_HEATER' ? '#D4EDDA' : '#FFF3CD', border: '1px solid', borderColor: aiResult.action === 'TURN_OFF_HEATER' ? '#C3E6CB' : '#FFEEBA', borderRadius: '5px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>🤖 AI Decision:</h3>
          <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0' }}>
            Action: {aiResult.action === 'TURN_OFF_HEATER' ? '🛑 TURN OFF HEATER (Command Sent)' : '🔥 KEEP HEATER ON'}
          </p>

          {/* 💰 The Upgraded Money Maker Box! */}
          {aiResult.action === 'TURN_OFF_HEATER' && (
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #28A745' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>💰 Financial & Energy Savings</h4>
              
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div style={{ padding: '10px', backgroundColor: '#c3e6cb', borderRadius: '5px', flex: 1 }}>
                  <strong>⏱️ Next 30 Mins</strong><br/>
                  Est. Temp: {(sensorData.currentPoolTemp + tempDiff30M).toFixed(2)}°C<br/>
                  {tempDiff30M >= 0 ? 'Heat Gained' : 'Natural Cooling'}: {Math.abs(tempDiff30M).toFixed(2)}°C<br/>
                  Free Solar: {getSolarEnergy(0.5)} kWh
                </div>
                <div style={{ padding: '10px', backgroundColor: '#c3e6cb', borderRadius: '5px', flex: 1 }}>
                  <strong>☀️ Next 1 Hour</strong><br/>
                  Est. Temp: {parseFloat(aiResult.predictedTemp).toFixed(2)}°C<br/>
                  {tempDiff1H >= 0 ? 'Heat Gained' : 'Natural Cooling'}: {Math.abs(tempDiff1H).toFixed(2)}°C<br/>
                  Free Solar: {getSolarEnergy(1.0)} kWh
                </div>
              </div>

              <ul style={{ margin: 0, paddingLeft: '20px', color: '#155724', lineHeight: '1.8' }}>
                <li><strong>Grid Electricity Saved:</strong> 30.0 kWh <em>(Assuming 30kW Heater)</em> 🔌</li>
                <li><strong>CEB Cost Avoided:</strong> <strong>Rs. 1,200.00</strong> 💸</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}