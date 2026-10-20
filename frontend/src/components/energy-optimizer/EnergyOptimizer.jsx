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

  // 🛜 Auto-fetch live data every 1 second when Live Mode is ON
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

  // 🧠 Trigger Python AI Backend
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

  // 🎛️ Manual Hardware Control Override
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

  // Clear AI box instantly when typing new numbers to prevent "Ghost Math"
  const handleInputChange = (e) => {
    setSensorData({ ...sensorData, [e.target.name]: parseFloat(e.target.value) || 0 });
    setAiResult(null); 
  };

  // ☀️ Thermodynamics Math Helpers
  const tempDiff1H = aiResult ? (parseFloat(aiResult.predictedTemp) - sensorData.currentPoolTemp) : 0;
  const tempDiff30M = tempDiff1H / 2;

  const getSolarEnergy = (hours) => {
    if (!aiResult || !aiResult.predictedTemp) return 0;
    const gained = parseFloat(aiResult.predictedTemp) - sensorData.currentPoolTemp;
    if (gained <= 0) return 0; // If it's cooling, no solar energy gained
    const totalEnergy = (gained * 65000 * 0.00116);
    return (totalEnergy * hours).toFixed(1); 
  };

  // 🛑 Master Status Logic (Prioritizes the 35°C Auto-Shutoff)
  let isHeaterOff = false;
  let statusMessage = "🔥 HEATER IS ON";
  let boxColor = "#FFF3CD"; // Yellow for ON
  let borderColor = "#FFEEBA";

  if (sensorData.currentPoolTemp >= 35.0) {
    isHeaterOff = true;
    statusMessage = "🛑 HEATER IS OFF (Target 35°C Reached)";
    boxColor = "#D4EDDA"; // Green for OFF
    borderColor = "#C3E6CB";
  } else if (aiResult && aiResult.action === 'TURN_OFF_HEATER') {
    isHeaterOff = true;
    statusMessage = "🛑 HEATER IS OFF (AI Energy Saver Active)";
    boxColor = "#D4EDDA"; // Green for OFF
    borderColor = "#C3E6CB";
  }

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

      {/* 📊 Sensor Input Panel */}
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
        {isLoading ? '🧠 Calculating Future Temp...' : '🚀 Run AI "What-If" Simulation'}
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

      {/* 💰 Results & ROI Panel (Always shows math if AI has run) */}
      {aiResult && !aiResult.error && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: boxColor, border: '1px solid', borderColor: borderColor, borderRadius: '5px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>🤖 AI Decision:</h3>
          <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '5px 0' }}>
            System Status: {statusMessage}
          </p>

          {/* This math box now ALWAYS shows up to prove the sun is working! */}
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: `1px dashed ${isHeaterOff ? '#28A745' : '#B5A642'}` }}>
            <h4 style={{ margin: '0 0 10px 0', color: isHeaterOff ? '#155724' : '#856404' }}>
              {isHeaterOff ? '💰 Financial & Energy Savings' : '☀️ Natural Energy Intake'}
            </h4>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ padding: '10px', backgroundColor: isHeaterOff ? '#c3e6cb' : '#ffeeba', borderRadius: '5px', flex: 1, color: '#000' }}>
                <strong>⏱️ Next 30 Mins</strong><br/>
                Est. Temp: {(sensorData.currentPoolTemp + tempDiff30M).toFixed(2)}°C<br/>
                {tempDiff30M >= 0 ? 'Heat Gained' : 'Natural Cooling'}: {Math.abs(tempDiff30M).toFixed(2)}°C<br/>
                Free Solar: {getSolarEnergy(0.5)} kWh
              </div>
              <div style={{ padding: '10px', backgroundColor: isHeaterOff ? '#c3e6cb' : '#ffeeba', borderRadius: '5px', flex: 1, color: '#000' }}>
                <strong>☀️ Next 1 Hour</strong><br/>
                Est. Temp: {parseFloat(aiResult.predictedTemp).toFixed(2)}°C<br/>
                {tempDiff1H >= 0 ? 'Heat Gained' : 'Natural Cooling'}: {Math.abs(tempDiff1H).toFixed(2)}°C<br/>
                Free Solar: {getSolarEnergy(1.0)} kWh
              </div>
            </div>

            {/* Only show the grid savings money if the heater is actually OFF */}
            <ul style={{ margin: 0, paddingLeft: '20px', color: isHeaterOff ? '#155724' : '#856404', lineHeight: '1.8' }}>
              <li><strong>Grid Electricity Saved:</strong> {isHeaterOff ? '30.0' : '0.0'} kWh <em>(Assuming 30kW Heater)</em> 🔌</li>
              <li><strong>CEB Cost Avoided:</strong> <strong>{isHeaterOff ? 'Rs. 1,200.00' : 'Rs. 0.00 (Heater is burning power)'}</strong> 💸</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}