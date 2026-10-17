/**
 * demoData.js — AI Leak & Evaporation Tracker
 * Phase 1: Simulated sensor + weather readings (no live data connected)
 *
 * ⚠️  DEMO DATA ONLY — All readings below are statically simulated.
 *     No physical HC-SR04 sensor, ESP32, backend API, or live weather
 *     service is connected in Phase 1.
 *
 *     Phase 2 replacement target: replace DEMO_HISTORY with a
 *     useWaterLevel() hook that fetches from GET /api/water-level/history
 *     Phase 3 replacement target: replace weather fields with Open-Meteo API
 */

// ---------------------------------------------------------------------------
// Pool configuration — edit these values to match the real pool specs.
// These are also read by evaporationModel.js and the dashboard component.
// ---------------------------------------------------------------------------
export const POOL_CONFIG = {
  name: 'Aqua Sport Training Pool',
  location: 'Colombo, Sri Lanka',
  surfaceAreaM2: 1250,            // 50 m × 25 m commercial pool
  maxLevelMM: 2000,               // 100 % full mark
  nominalLevelMM: 1850,           // target operating level
  minSafeLevelMM: 1700,           // below this → maintenance required
  /**
   * Configurable leak-detection threshold.
   * If (actualLoss − estimatedEvaporation) > this value on a given day,
   * the day is flagged as "possible abnormal water loss (demo)".
   * Adjust this to tune sensitivity.
   */
  LEAK_THRESHOLD_MM_PER_DAY: 8,
}

// ---------------------------------------------------------------------------
// Static simulated readings
// Index 0 = 30 days ago · Index 29 = today
//
// Design notes:
//  • Days 0–20: normal evaporation-driven loss (~4–6 mm/day)
//  • Day 14: rainfall event (+22.4 mm)
//  • Day 18: rainfall event (+9.6 mm)
//  • Days 21–29: anomalous high loss (~15–19 mm/day) simulating a possible
//    leak scenario for demo and alert-detection testing
// ---------------------------------------------------------------------------
const RAW_READINGS = [
  // { levelMM, tempC, humidityPct, humPct, windSpeedKph, windKph, rainMM }
  { levelMM: 1862.0, tempC: 29.2, humidityPct: 68, humPct: 68, windSpeedKph: 9.5,  windKph: 9.5,  rainMM: 0.0  }, // Day −29
  { levelMM: 1857.0, tempC: 30.1, humidityPct: 65, humPct: 65, windSpeedKph: 11.2, windKph: 11.2, rainMM: 0.0  }, // Day −28
  { levelMM: 1852.0, tempC: 31.4, humidityPct: 62, humPct: 62, windSpeedKph: 10.8, windKph: 10.8, rainMM: 0.0  }, // Day −27
  { levelMM: 1846.0, tempC: 28.8, humidityPct: 72, humPct: 72, windSpeedKph: 8.3,  windKph: 8.3,  rainMM: 0.0  }, // Day −26
  { levelMM: 1842.0, tempC: 29.5, humidityPct: 70, humPct: 70, windSpeedKph: 9.1,  windKph: 9.1,  rainMM: 0.0  }, // Day −25
  { levelMM: 1838.0, tempC: 32.1, humidityPct: 60, humPct: 60, windSpeedKph: 13.5, windKph: 13.5, rainMM: 0.0  }, // Day −24
  { levelMM: 1832.0, tempC: 30.7, humidityPct: 64, humPct: 64, windSpeedKph: 12.0, windKph: 12.0, rainMM: 0.0  }, // Day −23
  { levelMM: 1828.0, tempC: 29.9, humidityPct: 67, humPct: 67, windSpeedKph: 8.8,  windKph: 8.8,  rainMM: 0.0  }, // Day −22
  { levelMM: 1822.0, tempC: 31.2, humidityPct: 63, humPct: 63, windSpeedKph: 10.5, windKph: 10.5, rainMM: 0.0  }, // Day −21
  { levelMM: 1818.0, tempC: 30.5, humidityPct: 65, humPct: 65, windSpeedKph: 9.3,  windKph: 9.3,  rainMM: 0.0  }, // Day −20
  { levelMM: 1814.0, tempC: 29.8, humidityPct: 69, humPct: 69, windSpeedKph: 8.5,  windKph: 8.5,  rainMM: 0.0  }, // Day −19
  { levelMM: 1810.0, tempC: 30.2, humidityPct: 66, humPct: 66, windSpeedKph: 10.1, windKph: 10.1, rainMM: 0.0  }, // Day −18
  { levelMM: 1805.0, tempC: 31.8, humidityPct: 61, humPct: 61, windSpeedKph: 12.7, windKph: 12.7, rainMM: 0.0  }, // Day −17
  { levelMM: 1800.0, tempC: 28.5, humidityPct: 74, humPct: 74, windSpeedKph: 7.2,  windKph: 7.2,  rainMM: 0.0  }, // Day −16
  { levelMM: 1818.0, tempC: 27.3, humidityPct: 82, humPct: 82, windSpeedKph: 6.5,  windKph: 6.5,  rainMM: 22.4 }, // Day −15 ☔
  { levelMM: 1814.0, tempC: 29.0, humidityPct: 75, humPct: 75, windSpeedKph: 8.0,  windKph: 8.0,  rainMM: 0.0  }, // Day −14
  { levelMM: 1809.0, tempC: 30.4, humidityPct: 68, humPct: 68, windSpeedKph: 9.8,  windKph: 9.8,  rainMM: 0.0  }, // Day −13
  { levelMM: 1805.0, tempC: 31.0, humidityPct: 63, humPct: 63, windSpeedKph: 11.5, windKph: 11.5, rainMM: 0.0  }, // Day −12
  { levelMM: 1812.0, tempC: 26.8, humidityPct: 80, humPct: 80, windSpeedKph: 5.9,  windKph: 5.9,  rainMM: 9.6  }, // Day −11 ☔
  { levelMM: 1807.0, tempC: 28.9, humidityPct: 72, humPct: 72, windSpeedKph: 8.6,  windKph: 8.6,  rainMM: 0.0  }, // Day −10
  { levelMM: 1802.0, tempC: 30.6, humidityPct: 65, humPct: 65, windSpeedKph: 10.3, windKph: 10.3, rainMM: 0.0  }, // Day  −9
  { levelMM: 1798.0, tempC: 31.5, humidityPct: 62, humPct: 62, windSpeedKph: 12.2, windKph: 12.2, rainMM: 0.0  }, // Day  −8 ← anomalous period begins (demo)
  { levelMM: 1782.0, tempC: 30.9, humidityPct: 64, humPct: 64, windSpeedKph: 11.8, windKph: 11.8, rainMM: 0.0  }, // Day  −7 ⚠
  { levelMM: 1765.0, tempC: 31.3, humidityPct: 61, humPct: 61, windSpeedKph: 13.1, windKph: 13.1, rainMM: 0.0  }, // Day  −6 ⚠
  { levelMM: 1748.0, tempC: 30.2, humidityPct: 66, humPct: 66, windSpeedKph: 10.9, windKph: 10.9, rainMM: 0.0  }, // Day  −5 ⚠
  { levelMM: 1730.0, tempC: 29.8, humidityPct: 68, humPct: 68, windSpeedKph: 9.7,  windKph: 9.7,  rainMM: 0.0  }, // Day  −4 ⚠
  { levelMM: 1713.0, tempC: 31.1, humidityPct: 63, humPct: 63, windSpeedKph: 12.5, windKph: 12.5, rainMM: 0.0  }, // Day  −3 ⚠
  { levelMM: 1695.0, tempC: 30.7, humidityPct: 65, humPct: 65, windSpeedKph: 11.3, windKph: 11.3, rainMM: 0.0  }, // Day  −2 ⚠
  { levelMM: 1677.0, tempC: 31.8, humidityPct: 61, humPct: 61, windSpeedKph: 13.8, windKph: 13.8, rainMM: 0.0  }, // Day  −1 ⚠
  { levelMM: 1658.0, tempC: 32.1, humidityPct: 60, humPct: 60, windSpeedKph: 14.2, windKph: 14.2, rainMM: 0.0  }, // Today  ⚠
]

// ---------------------------------------------------------------------------
// Attach dynamic date labels so the chart always shows "the last 30 days"
// regardless of when the app is opened.
// ---------------------------------------------------------------------------
function buildHistory() {
  const today = new Date()
  const total = RAW_READINGS.length
  return RAW_READINGS.map((r, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (total - 1 - i))
    return {
      ...r,
      date: d.toISOString().split('T')[0],
      dayLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      /**
       * isLeakPeriod is used ONLY for chart shading / visual cues.
       * The actual alert flag (isPossibleAbnormalLoss) is computed independently
       * in the component by comparing actualLoss vs estimatedEvaporation.
       */
      isLeakPeriod: i >= 21,
    }
  })
}

export const DEMO_HISTORY = buildHistory()
export const DEMO_CURRENT = DEMO_HISTORY[DEMO_HISTORY.length - 1]
