/**
 * evaporationModel.js — AI Leak & Evaporation Tracker
 * Phase 1: Pure JavaScript estimation functions (no ML framework)
 *
 * ⚠️  SIMPLIFIED ILLUSTRATIVE DEMO ESTIMATES ONLY.
 *     These formulas are NOT scientifically validated evaporation models.
 *     They are linear approximations for demonstration purposes only.
 *     Do NOT use these values for engineering or safety decisions.
 *
 *     Phase 4 replacement target: replace estimateDailyEvaporation() with
 *     an API call to the trained model served from ml-service/main.py via
 *     GET /api/ml/evaporation-predict
 */

// ---------------------------------------------------------------------------
// Model constants
// All values are clearly labelled as illustrative demo parameters.
// Adjust freely for demo tuning — these are NOT calibrated coefficients.
// ---------------------------------------------------------------------------
export const MODEL_CONSTANTS = {
  /** Illustrative temperature coefficient (mm per °C above base temp) */
  TEMP_COEFFICIENT: 0.18,
  /** Illustrative base temperature below which evaporation is negligible */
  BASE_TEMPERATURE_C: 10,
  /** Illustrative humidity coefficient (effect of dry air on evaporation) */
  HUMIDITY_COEFFICIENT: 0.065,
  /** Illustrative wind coefficient (mm per km/h of wind speed) */
  WIND_COEFFICIENT: 0.10,
  /** Human-readable label shown in the UI and footer disclaimer */
  MODEL_LABEL: 'Simplified Linear Demo (NOT validated)',
}

/**
 * Estimate daily pool evaporation in millimetres.
 *
 * Formula (illustrative linear approximation):
 *   E = α·max(T − T_base, 0)  +  β·(1 − RH/100)·T  +  γ·W
 *
 * Where:
 *   α = TEMP_COEFFICIENT       (illustrative)
 *   T = average daily temperature (°C)
 *   T_base = BASE_TEMPERATURE_C (illustrative)
 *   β = HUMIDITY_COEFFICIENT   (illustrative)
 *   RH = relative humidity (%)
 *   γ = WIND_COEFFICIENT       (illustrative)
 *   W = wind speed (km/h)
 *
 * ⚠️  This is NOT the Penman-Monteith or any other validated method.
 *
 * Phase 4 replacement: swap this function body for an API call to
 * ml-service/main.py which will use a trained model on real historical data.
 *
 * @param {number} tempC        Average daily air temperature (°C)
 * @param {number} humidityPct  Relative humidity (%)
 * @param {number} windSpeedKph Wind speed (km/h)
 * @returns {number}            Estimated evaporation in mm/day (≥ 0)
 */
export function estimateDailyEvaporation(tempC, humidityPct, windSpeedKph) {
  const t = Number(tempC)
  const h = Number(humidityPct)
  const w = Number(windSpeedKph)

  // Defensively guard against missing or non-finite inputs
  if (!Number.isFinite(t) || !Number.isFinite(h) || !Number.isFinite(w)) {
    return null
  }

  const {
    TEMP_COEFFICIENT,
    BASE_TEMPERATURE_C,
    HUMIDITY_COEFFICIENT,
    WIND_COEFFICIENT,
  } = MODEL_CONSTANTS

  const tempTerm  = TEMP_COEFFICIENT * Math.max(t - BASE_TEMPERATURE_C, 0)
  const humidTerm = HUMIDITY_COEFFICIENT * Math.max(0, 1 - h / 100) * t
  const windTerm  = WIND_COEFFICIENT * Math.max(w, 0)

  const raw = tempTerm + humidTerm + windTerm
  return Math.round(Math.max(raw, 0) * 10) / 10
}

/**
 * Compare measured daily water loss against the estimated natural evaporation.
 * Flag as "possible abnormal water loss (demo)" if surplus exceeds the threshold.
 *
 * ⚠️  This is NOT a confirmed physical leak detection algorithm.
 *     It is an illustrative demo threshold comparison on simulated data.
 *
 * @param {number} actualLossMM     Water loss drop for the day (mm, ≥ 0)
 * @param {number} estimatedEvapMM  Output of estimateDailyEvaporation() (mm)
 * @param {number} thresholdMM      Surplus threshold (mm/day) from POOL_CONFIG
 * @returns {{ surplusLossMM: number|null, isPossibleAbnormalLoss: boolean, status: string }}
 */
export function detectPossibleAbnormalLoss(actualLossMM, estimatedEvapMM, thresholdMM) {
  const loss = Number(actualLossMM)
  const evap = Number(estimatedEvapMM)
  const thresh = Number(thresholdMM)

  if (!Number.isFinite(loss) || !Number.isFinite(evap) || !Number.isFinite(thresh)) {
    return {
      surplusLossMM: null,
      isPossibleAbnormalLoss: false,
      status: 'unavailable',
    }
  }

  const surplusLossMM = Math.round((loss - evap) * 10) / 10
  const isPossible = surplusLossMM > thresh

  return {
    surplusLossMM,
    isPossibleAbnormalLoss: isPossible,
    status: isPossible ? 'abnormal' : 'normal',
  }
}

/**
 * Build a "what-if natural-evaporation-only" expected water-level series.
 * Used to draw the expected-level trend line on the chart.
 *
 * @param {number} startLevelMM  Starting water level (mm)
 * @param {Array}  historyRows   Array of weather/level records
 * @returns {number[]}           Expected levels (mm), parallel to historyRows
 */
export function buildExpectedLevelSeries(startLevelMM, historyRows) {
  if (!historyRows || historyRows.length === 0) return []
  const start = Number(startLevelMM)
  if (!Number.isFinite(start)) return []

  const levels = [Math.round(start * 10) / 10]
  for (let i = 1; i < historyRows.length; i++) {
    const row = historyRows[i]
    const tempC = row.tempC
    const humidityPct = row.humidityPct ?? row.humPct
    const windSpeedKph = row.windSpeedKph ?? row.windKph
    const rainMM = Number(row.rainMM) || 0

    const evap = estimateDailyEvaporation(tempC, humidityPct, windSpeedKph)
    const evapLoss = evap !== null ? evap : 0
    const next = levels[i - 1] - evapLoss + rainMM
    levels.push(Math.round(next * 10) / 10)
  }
  return levels
}
