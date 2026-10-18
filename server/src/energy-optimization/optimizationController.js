const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const checkHeatingOptimization = async (ambientTemp, humidity, currentPoolTemp, targetTemp = 35.0) => {
    try {
        // The "What-If" scenario: simulate the heater being turned OFF (0)
        const simulatedHeaterStatus = 0;
        
        // Execute the Python AI script dynamically with real sensor data
        const command = `python ../ml-service/energy-optimization/predict_temp.py ${ambientTemp} ${humidity} ${simulatedHeaterStatus} ${currentPoolTemp}`;
        const { stdout } = await execAsync(command);
        
        const predictedTemp = parseFloat(stdout.trim());
        console.log(`[EcoPool Engine] Current: ${currentPoolTemp}°C | Predicted (Heater OFF): ${predictedTemp}°C`);

        // The core energy-saving decision matrix
        if (predictedTemp >= targetTemp) {
            console.log('[EcoPool Engine] ☀️ Natural heating sufficient. Shutting down heater.');
            return { action: 'TURN_OFF_HEATER', predictedTemp };
        }

        console.log('[EcoPool Engine] ❄️ Natural heating insufficient. Keeping heater active.');
        return { action: 'KEEP_HEATER_ON', predictedTemp };

    } catch (error) {
        console.error('[EcoPool Engine] Critical AI Prediction Failure:', error.message);
        // Fallback safety mechanism if the AI crashes
        return { action: 'MAINTAIN_CURRENT_STATE', error: 'AI prediction unavailable' };
    }
};

module.exports = { checkHeatingOptimization };