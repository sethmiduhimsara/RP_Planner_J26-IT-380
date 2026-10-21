const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const MAX_POOL_TEMP = 35.0;
const MIN_COMFORT_TEMP = 33.0;
const POOL_VOLUME_LITERS = 65000;
const SPECIFIC_HEAT_KWH_PER_L_C = 0.00116; // 75.4 kWh per 1°C for 65,000L
const CEB_COMMERCIAL_RATE_LKR = 38.0; // Commercial CEB Tariff: Rs. 38.00/kWh

const checkHeatingOptimization = async (
    ambientTemp,
    humidity,
    currentPoolTemp,
    isWaitingFor33Drop = false,
    targetTemp = MAX_POOL_TEMP
) => {
    try {
        const currentPoolNum = parseFloat(currentPoolTemp) || 0;
        const ambientNum = parseFloat(ambientTemp) || 0;
        const humidityNum = parseFloat(humidity) || 0;

        // 1. Run the Python ML script with live/simulated sensor inputs
        const simulatedHeaterStatus = 0;
        let rawMlOutput = currentPoolNum;
        try {
            const command = `python ../ml-service/energy-optimization/predict_temp.py ${ambientNum} ${humidityNum} ${simulatedHeaterStatus} ${currentPoolNum}`;
            const { stdout } = await execAsync(command);
            const parsed = parseFloat(stdout.trim());
            if (!isNaN(parsed)) {
                rawMlOutput = parsed;
            }
        } catch (pyErr) {
            console.warn('[EcoPool Engine] Python script fallback used:', pyErr.message);
        }

        // 2. Predict Next 20-Minute Environment (Ambient) Temperature
        let envTempChange20M = 0;
        if (humidityNum <= 85) {
            const baseRise20M = Math.max(0.2, 2.2 - (ambientNum - 31.0) * 0.3);
            const humidityFactor = humidityNum <= 78 ? 1.0 : Math.max(0.25, 1.0 - (humidityNum - 78) * 0.08);
            envTempChange20M = Math.min(3.0, Math.max(0.15, baseRise20M * humidityFactor));
        } else {
            envTempChange20M = -0.15;
        }
        const predictedAmbientTemp20M = Number((ambientNum + envTempChange20M).toFixed(2));

        // 3. Calculate How Much the Pool Will Heat Naturally in Next 20 Minutes
        let naturalPoolHeatGain20M = Number(((predictedAmbientTemp20M - currentPoolNum) * 0.10).toFixed(2));
        naturalPoolHeatGain20M = Math.max(-0.30, Math.min(0.50, naturalPoolHeatGain20M));

        const predictedPoolTemp20M = Number((currentPoolNum + naturalPoolHeatGain20M).toFixed(2));

        // 4. Calculate Exact ML Heater Stop Point (e.g., 35.00 - 0.20 = 34.80°C)
        const positiveNaturalGain = Math.max(0, naturalPoolHeatGain20M);
        const mlStopPoint = Number((targetTemp - positiveNaturalGain).toFixed(2));

        // 5. Calculate 20-Minute Segment Saved Electricity (kWh) and CEB Cost Saved (LKR)
        // Shows savings when pool is at or below 35.0°C and natural heating is doing the job (> 0)
        const savedTempC = currentPoolNum <= targetTemp ? positiveNaturalGain : 0;
        const savedKWh = Number((savedTempC * POOL_VOLUME_LITERS * SPECIFIC_HEAT_KWH_PER_L_C).toFixed(2));
        const savedCostLKR = Number((savedKWh * CEB_COMMERCIAL_RATE_LKR).toFixed(2));

        // 6. 33.0°C - 35.0°C Hotel Comfort Hysteresis Decision Logic
        let updatedWaitingFor33 = Boolean(isWaitingFor33Drop);
        let action = 'KEEP_HEATER_ON';

        if (currentPoolNum < MIN_COMFORT_TEMP) {
            // Dropped below 33.0°C -> Must turn heater ON and heat back up to ML Stop Point (35.0°C)
            updatedWaitingFor33 = false;
            action = 'KEEP_HEATER_ON';
        } else if (currentPoolNum >= targetTemp || currentPoolNum >= mlStopPoint) {
            // Reached ML Stop Point or 35.0°C -> Turn heater OFF and wait until pool drops below 33.0°C
            updatedWaitingFor33 = true;
            action = 'TURN_OFF_HEATER';
        } else if (updatedWaitingFor33) {
            // Pool already reached 35.0°C / ML Stop Point earlier and is now between 33.0°C and 35.0°C -> Keep OFF until < 33.0°C
            action = 'TURN_OFF_HEATER';
        } else {
            // Currently in active heating phase toward ML Stop Point -> Keep ON
            action = 'KEEP_HEATER_ON';
        }

        console.log(
            `[EcoPool 20M Engine] Env Now: ${ambientNum}°C -> Env 20M: ${predictedAmbientTemp20M}°C | Pool Now: ${currentPoolNum}°C | Natural Gain 20M: ${naturalPoolHeatGain20M >= 0 ? '+' : ''}${naturalPoolHeatGain20M}°C | ML Stop Point: ${mlStopPoint}°C | WaitingFor33C: ${updatedWaitingFor33} | Action: ${action}`
        );

        return {
            action,
            isWaitingFor33Drop: updatedWaitingFor33,
            predictedTemp: predictedPoolTemp20M,
            predictedAmbientTemp20M,
            envTempChange20M: Number(envTempChange20M.toFixed(2)),
            naturalPoolHeatGain20M,
            mlStopPoint,
            savedTempC,
            savedKWh,
            savedCostLKR,
            cebRateLKR: CEB_COMMERCIAL_RATE_LKR,
            rawMlOutput
        };

    } catch (error) {
        console.error('[EcoPool Engine] Critical AI Prediction Failure:', error.message);
        return { action: 'MAINTAIN_CURRENT_STATE', error: 'AI prediction unavailable' };
    }
};

module.exports = { checkHeatingOptimization };