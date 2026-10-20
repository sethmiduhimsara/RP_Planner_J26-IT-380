const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const MAX_POOL_TEMP = 35.0;
// A 30kW heater adds ~0.40°C per hour to a 65,000L pool (30 / (65000 * 0.00116) = 0.398°C)
const HEATER_1H_TEMP_RISE = 0.398;

const checkHeatingOptimization = async (ambientTemp, humidity, currentPoolTemp, targetTemp = MAX_POOL_TEMP) => {
    try {
        const currentTempNum = parseFloat(currentPoolTemp);
        const ambientTempNum = parseFloat(ambientTemp);
        const humidityNum = parseFloat(humidity);

        // Simulate the heater being OFF (0) for the next 1 hour
        const simulatedHeaterStatus = 0;

        // Execute the Python AI script with real sensor data
        const command = `python ../ml-service/energy-optimization/predict_temp.py ${ambientTempNum} ${humidityNum} ${simulatedHeaterStatus} ${currentTempNum}`;
        const { stdout } = await execAsync(command);

        const predictedTemp = parseFloat(stdout.trim());
        const tempDiff1H = predictedTemp - currentTempNum;

        // Calculate the dynamic stop temperature based on how much the pool changes in 1 hour:
        // - If naturally heating (tempDiff1H > 0): heater stops at (35.0 - tempDiff1H), e.g., 33.5°C, 34.2°C, 34.5°C, 34.8°C
        // - If naturally cooling (tempDiff1H <= 0): heater stops if running the heater for 1h would exceed 35.0°C
        const dynamicStopTemp = tempDiff1H > 0
            ? Number((targetTemp - tempDiff1H).toFixed(2))
            : Number((targetTemp - HEATER_1H_TEMP_RISE - tempDiff1H).toFixed(2));

        // What the temperature would reach in 1 hour if the heater stayed ON
        const tempIfHeaterRuns1H = predictedTemp + HEATER_1H_TEMP_RISE;

        console.log(
            `[EcoPool Engine] Current: ${currentTempNum.toFixed(2)}°C | Est. 1H (Heater OFF): ${predictedTemp.toFixed(2)}°C | Dynamic Stop Temp: ${dynamicStopTemp.toFixed(2)}°C`
        );

        // Turn OFF heater for the next 1 hour if:
        // 1. Current pool temp is already >= 35.0°C
        // 2. Natural heating alone reaches or exceeds 35.0°C in 1 hour (stops at 33.5°C, 34.2°C, 34.5°C, etc.)
        // 3. Running the heater for the next 1 hour would cause the pool to exceed 35.0°C (e.g., Est. Temp 34.88°C with 0.02°C cooling)
        if (
            currentTempNum >= targetTemp ||
            predictedTemp >= targetTemp ||
            tempIfHeaterRuns1H >= targetTemp
        ) {
            console.log('[EcoPool Engine] Shutting down heater for next 1 hour to prevent exceeding 35.0°C.');
            return {
                action: 'TURN_OFF_HEATER',
                predictedTemp,
                dynamicStopTemp
            };
        }

        console.log('[EcoPool Engine] Keeping heater ON for next 1 hour.');
        return {
            action: 'KEEP_HEATER_ON',
            predictedTemp,
            dynamicStopTemp
        };

    } catch (error) {
        console.error('[EcoPool Engine] Critical AI Prediction Failure:', error.message);
        return { action: 'MAINTAIN_CURRENT_STATE', error: 'AI prediction unavailable' };
    }
};

module.exports = { checkHeatingOptimization };