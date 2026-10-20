/**
 * Service operations for Pool Orchestrator.
 * Encapsulates database queries, sensor data ingestion, occupancy tracking,
 * and forecast retrieval.
 */

const db = require('./poolOrchestratorDatabase');
const { defaultForecastService } = require('./poolOrchestratorForecastService');
const { defaultAutoRetrainService } = require('./poolOrchestratorAutoRetrainService');
const { format12HourTime } = require('./poolOrchestratorTimeUtils');

/**
 * Retrieves the latest person traffic observation or sensor reading
 */
async function getLatestReading() {
  try {
    const result = await db.query(`
      SELECT 
        id, 
        event_type AS event, 
        occupancy_after AS swimmer_count, 
        sensor_id, 
        time_12h, 
        hour, 
        recorded_at, 
        raw_payload
      FROM public.person_traffic_events
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `);
    if (result.rows.length > 0) return result.rows[0];
  } catch {
    // Fallback if table not created yet
  }

  try {
    const result = await db.query(`
      SELECT *
      FROM public.sensor_readings
      ORDER BY recorded_at DESC, received_at DESC
      LIMIT 1
    `);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the latest validated occupancy record
 */
async function getLatestOccupancy() {
  try {
    const result = await db.query(`
      SELECT 
        id, 
        occupancy_after AS occupancy_count, 
        event_type, 
        recorded_at, 
        time_12h
      FROM public.person_traffic_events
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `);
    if (result.rows.length > 0) return result.rows[0];
  } catch {
    // Fallback if table not created yet
  }

  try {
    const result = await db.query(`
      SELECT *
      FROM public.occupancy_history
      ORDER BY recorded_at DESC
      LIMIT 1
    `);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the next 6 future predictions
 */
async function getForecast() {
  try {
    const result = await db.query(`
      WITH ranked_predictions AS (
        SELECT 
          id, 
          target_time, 
          predicted_swimmers, 
          model_version, 
          generated_at, 
          input_features,
          ROW_NUMBER() OVER (
            PARTITION BY date_trunc('hour', target_time AT TIME ZONE 'Asia/Colombo') 
            ORDER BY generated_at DESC, id DESC
          ) as rn
        FROM public.pool_predictions
        WHERE target_time >= (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo') - INTERVAL '5 minutes'
      )
      SELECT id, target_time, predicted_swimmers, model_version, generated_at, input_features
      FROM ranked_predictions
      WHERE rn = 1
      ORDER BY target_time ASC
      LIMIT 6
    `);
    if (result.rows.length > 0) return result.rows;
  } catch {
    // Fallback if table not created yet
  }

  try {
    const result = await db.query(`
      WITH ranked_predictions AS (
        SELECT 
          id, 
          target_time, 
          predicted_swimmers, 
          model_version, 
          generated_at, 
          input_features,
          ROW_NUMBER() OVER (
            PARTITION BY date_trunc('hour', target_time AT TIME ZONE 'Asia/Colombo') 
            ORDER BY generated_at DESC, id DESC
          ) as rn
        FROM public.pool_orchestrator_predictions
        WHERE target_time >= (date_trunc('hour', NOW() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo') - INTERVAL '5 minutes'
      )
      SELECT id, target_time, predicted_swimmers, model_version, generated_at, input_features
      FROM ranked_predictions
      WHERE rn = 1
      ORDER BY target_time ASC
      LIMIT 6
    `);
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Retrieves latest filtration event or reports unacknowledged status
 */
async function getFiltrationStatus() {
  try {
    const result = await db.query(`
      SELECT *
      FROM public.filtration_events
      ORDER BY recorded_at DESC
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        relayState: row.relay_state,
        reason: row.reason,
        recordedAt: row.recorded_at,
        source: row.source,
        acknowledged: true,
      };
    }
  } catch (err) {
    console.warn('[PoolOrchestratorService] Notice querying filtration status, using fallback:', err.message);
  }

  return {
    relayState: 'unknown',
    reason: 'Awaiting hardware acknowledgement from ESP32 relay controller',
    recordedAt: null,
    source: 'device',
    acknowledged: false,
  };
}

/**
 * Validates and saves an incoming sensor reading.
 * Writes to public.sensor_readings and public.occupancy_history.
 * Triggers debounced forecast refresh.
 */
async function saveSensorReading(reading) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    throw new Error('Invalid sensor payload: expected a JSON object.');
  }

  const sensorId = typeof reading.sensor_id === 'string' && reading.sensor_id.trim()
    ? reading.sensor_id.trim()
    : 'pool-sensor-01';

  // Entry and Exit counts
  let entryCount = Number.isInteger(reading.entry_count) && reading.entry_count >= 0
    ? reading.entry_count
    : 0;

  let exitCount = Number.isInteger(reading.exit_count) && reading.exit_count >= 0
    ? reading.exit_count
    : 0;

  if (reading.event === 'entry' && entryCount === 0) {
    entryCount = 1;
  } else if (reading.event === 'exit' && exitCount === 0) {
    exitCount = 1;
  }

  // Swimmer count validation (accepts swimmer_count or occupancy)
  let swimmerCount = null;
  const rawCount = reading.swimmer_count !== undefined ? reading.swimmer_count : reading.occupancy;
  if (rawCount !== undefined && rawCount !== null) {
    const parsedSwimmers = parseInt(rawCount, 10);
    if (!isNaN(parsedSwimmers) && parsedSwimmers >= 0) {
      swimmerCount = parsedSwimmers;
    }
  }

  // Rain detected is boolean in database (accepts rain_detected, rain, rainDetectedThisHour, or rain events)
  let rainDetected = null;
  if (typeof reading.rain_detected === 'boolean') {
    rainDetected = reading.rain_detected;
  } else if (
    reading.rain === 1 ||
    reading.rain === '1' ||
    reading.event === 'rain' ||
    reading.event === 'rain_start' ||
    reading.rain_detected === true ||
    reading.rain_detected === 'true' ||
    reading.rain_detected === 1 ||
    reading.rainDetectedThisHour === true ||
    reading.rainDetectedThisHour === 'true' ||
    reading.rainDetectedThisHour === 1 ||
    reading.rain_detected_this_hour === true ||
    reading.weather === 'Rainy'
  ) {
    rainDetected = true;
  } else if (reading.rain === 0 || reading.rain === '0' || reading.event === 'rain_stop' || reading.rain_detected === false || reading.rain_detected === 'false' || reading.rain_detected === 0) {
    rainDetected = false;
  }

  // Light and temperature
  const lightLux = (reading.light_lux !== undefined && reading.light_lux !== null && !isNaN(Number(reading.light_lux)))
    ? parseFloat(reading.light_lux)
    : null;

  const temperatureC = (reading.temperature_c !== undefined && reading.temperature_c !== null && !isNaN(Number(reading.temperature_c)))
    ? parseFloat(reading.temperature_c)
    : null;

  // Sensor timestamp
  let recordedAt = new Date();
  if (reading.recorded_at) {
    const parsedDate = new Date(reading.recorded_at);
    if (!isNaN(parsedDate.getTime())) {
      recordedAt = parsedDate;
    }
  }

  const eventType = (reading.event === 'exit' || exitCount > 0) ? 'exit' : 'entry';
  const time12h = format12HourTime(recordedAt);
  const hourVal = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(recordedAt), 10);
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Colombo' }).format(recordedAt);
  const isWeekend = ['Saturday', 'Sunday'].includes(dayName) ? 1 : 0;
  const rainVal = rainDetected ? 1 : 0;
  const weatherVal = rainVal ? 'Rainy' : (reading.weather || 'Sunny');

  // Duplicate event protection: ignore identical observation if received within 500ms
  try {
    const dupCheck = await db.query(
      `SELECT id FROM public.person_traffic_events
       WHERE sensor_id = $1
         AND event_type = $2
         AND occupancy_after = $3
         AND recorded_at >= NOW() - INTERVAL '500 milliseconds'
       LIMIT 1`,
      [sensorId, eventType, swimmerCount ?? 0]
    );

    if (dupCheck.rows.length > 0) {
      console.log('[PoolOrchestratorService] Duplicate traffic event ignored:', sensorId);
      return {
        duplicate: true,
        id: dupCheck.rows[0].id,
        message: 'Duplicate person traffic observation skipped.',
      };
    }
  } catch {
    // Fallback if table not created
  }

  let saved = null;

  // 1. Primary write: Exactly 1 record per person movement into public.person_traffic_events
  try {
    const trafficRes = await db.query(
      `INSERT INTO public.person_traffic_events
        (event_type, occupancy_after, sensor_id, time_12h, hour, recorded_at, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        eventType,
        swimmerCount ?? 0,
        sensorId,
        time12h,
        isNaN(hourVal) ? 0 : hourVal,
        recordedAt.toISOString(),
        JSON.stringify(reading),
      ]
    );
    saved = trafficRes.rows[0];
  } catch (err) {
    // Fallback if table not created yet
  }

  // 2. Aggregate into public.hourly_pool_occupancy (in '1:00 PM', '2:00 PM' format with ML training features)
  try {
    const timeSlotLabel = format12HourTime(new Date(recordedAt.getFullYear(), recordedAt.getMonth(), recordedAt.getDate(), hourVal, 0, 0));
    await db.query(
      `INSERT INTO public.hourly_pool_occupancy
        (target_hour, time_slot, hour, day, weekend, holiday, rain, weather, temperature_c, occupancy_count, total_entries, total_exits, recorded_at)
       VALUES (
         date_trunc('hour', $1::timestamptz AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo',
         $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
       )
       ON CONFLICT (target_hour) DO UPDATE SET
         occupancy_count = EXCLUDED.occupancy_count,
         total_entries = public.hourly_pool_occupancy.total_entries + EXCLUDED.total_entries,
         total_exits = public.hourly_pool_occupancy.total_exits + EXCLUDED.total_exits,
         rain = GREATEST(COALESCE(public.hourly_pool_occupancy.rain, 0), EXCLUDED.rain),
         weather = CASE
           WHEN COALESCE(public.hourly_pool_occupancy.rain, 0) = 1 OR EXCLUDED.rain = 1 THEN 'Rainy'
           ELSE EXCLUDED.weather
         END,
         temperature_c = COALESCE(EXCLUDED.temperature_c, public.hourly_pool_occupancy.temperature_c),
         recorded_at = NOW()`,
      [
        recordedAt.toISOString(),
        timeSlotLabel,
        isNaN(hourVal) ? 0 : hourVal,
        dayName,
        isWeekend,
        0,
        rainVal,
        weatherVal,
        temperatureC,
        swimmerCount ?? 0,
        entryCount,
        exitCount,
      ]
    );
  } catch (err) {
    // Fallback if table not created yet
  }

  // 3. Fallback compatibility writes for previous tables (if still present)
  try {
    const fallbackRes = await db.query(
      `INSERT INTO public.sensor_readings
        (sensor_id, swimmer_count, entry_count, exit_count,
         rain_detected, light_lux, temperature_c, recorded_at, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [sensorId, swimmerCount, entryCount, exitCount, rainDetected, lightLux, temperatureC, recordedAt.toISOString(), JSON.stringify(reading)]
    );
    if (!saved) saved = fallbackRes.rows[0];
  } catch {
    // Expected when old table is dropped
  }

  try {
    if (swimmerCount !== null) {
      await db.query(
        `INSERT INTO public.occupancy_history (occupancy_count, source, recorded_at) VALUES ($1, $2, $3)`,
        [swimmerCount, 'sensor', recordedAt.toISOString()]
      );
    }
  } catch {
    // Expected when old table is dropped
  }

  // Trigger debounced forecast refresh in the background
  defaultForecastService.generateForecast(false).catch((err) => {
    console.warn('[PoolOrchestratorService] Debounced forecast refresh deferred:', err.message);
  });

  // Trigger automated model retraining check (monitors 100-row accumulation)
  defaultAutoRetrainService.checkAndTriggerAutoRetrain().catch((err) => {
    console.warn('[PoolOrchestratorService] Auto-retrain check deferred:', err.message);
  });

  return saved;
}

/**
 * Records a relay actuation event in public.filtration_events
 */
async function recordFiltrationEvent(relayState, reason = null, source = 'esp32_relay', activeBulbs = null, relays = null) {
  let bulbs = activeBulbs;
  let relayStr = relays;

  if (bulbs === null || bulbs === undefined) {
    if (typeof relayState === 'string') {
      const match = relayState.match(/(\d+)\s*bulb/i);
      if (match) {
        bulbs = parseInt(match[1], 10);
      } else if (relayState.toLowerCase() === 'off') {
        bulbs = 0;
      } else {
        bulbs = 1;
      }
    } else {
      bulbs = 1;
    }
  }

  if (!relayStr) {
    const arr = [0, 0, 0, 0];
    for (let i = 0; i < Math.min(4, Math.max(0, bulbs)); i++) {
      arr[i] = 1;
    }
    relayStr = arr.join(',');
  }

  const result = await db.query(
    `INSERT INTO public.filtration_events
      (relay_state, active_bulbs, relays, reason, source, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [relayState, bulbs, relayStr, reason, source]
  );

  try {
    await db.query(
      `INSERT INTO public.pool_orchestrator_events
        (source_event_id, sensor_id, event_type, event_timestamp, received_at, raw_payload)
       VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
      [null, 'filtration_actuator', 'filtration_relay', JSON.stringify({ relayState, reason, source })]
    );
  } catch (err) {
    // optional audit
  }

  return result.rows[0];
}

module.exports = {
  getLatestReading,
  getLatestOccupancy,
  getForecast,
  getFiltrationStatus,
  saveSensorReading,
  recordFiltrationEvent,
};
