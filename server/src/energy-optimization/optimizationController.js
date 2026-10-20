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

        let predictedTemp = parseFloat(stdout.trim());

        // THERMODYNAMIC GUARDRAIL FOR OUT-OF-DATASET INPUTS (< 28°C or > 35.5°C):
        // Since the ML dataset was trained on 28°C–35°C, if someone enters 17°C in Manual Demo Mode,
        // prevent the model from jumping +11°C in 1 hour by clamping max natural 1H change to ±0.85°C.
        const rawDiff = predictedTemp - currentTempNum;
        if (Math.abs(rawDiff) > 0.85) {
            const realisticShift = (ambientTempNum - currentTempNum) * 0.05;
            const clampedShift = Math.max(-0.5, Math.min(0.85, realisticShift));
            predictedTemp = Number((currentTempNum + clampedShift).toFixed(2));
        }

        const tempDiff1H = predictedTemp - currentTempNum;

        // Dynamic Stop Point: where the heater can turn off so 1H change doesn't exceed 35.0°C
        const dynamicStopTemp = tempDiff1H > 0
            ? Number((targetTemp - tempDiff1H).toFixed(2))
            : Number((targetTemp - HEATER_1H_TEMP_RISE - tempDiff1H).toFixed(2));

        // What the temperature would reach in 1 hour if the heater stayed ON
        const tempIfHeaterRuns1H = predictedTemp + HEATER_1H_TEMP_RISE;

        console.log(
            `[EcoPool Engine] Current: ${currentTempNum.toFixed(2)}°C | Est. 1H (Heater OFF): ${predictedTemp.toFixed(2)}°C | Dynamic Stop Temp: ${dynamicStopTemp.toFixed(2)}°C`
        );

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