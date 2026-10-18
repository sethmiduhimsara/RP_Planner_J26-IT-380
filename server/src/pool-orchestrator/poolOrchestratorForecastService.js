/**
 * Forecast Generation and Persistence Service for Pool Orchestrator.
 * Computes future 6 hourly slots in Asia/Colombo, integrates Open-Meteo weather
 * and calendar holidays, queries the Python ML service, and idempotently persists predictions.
 */

const axios = require('axios');
const db = require('./poolOrchestratorDatabase');
const { defaultWeatherService } = require('./poolOrchestratorWeatherService');
const { defaultHolidayService } = require('./poolOrchestratorHolidayService');
const { format12HourTime } = require('./poolOrchestratorTimeUtils');

const DEFAULT_TIMEZONE = process.env.POOL_TIMEZONE || 'Asia/Colombo';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const SENSOR_REFRESH_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes debounce

class PoolOrchestratorForecastService {
  constructor() {
    this.lastRunTimestamp = 0;
    this.lastRunStatus = {
      success: null,
      generatedAt: null,
      error: null,
      count: 0,
    };
    this.isGenerating = false;
  }

  /**
   * Calculates the next six discrete hourly target slots starting from the next top-of-hour
   * in the specified pool timezone (Asia/Colombo).
   * Robust against midnight crossing, weekday rollover, month/year boundaries.
   */
  getNextSixHourlySlots(baseDate = new Date(), timezone = DEFAULT_TIMEZONE) {
    // 1. Get current time parts in target timezone
    const partsFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = partsFormatter.formatToParts(baseDate);
    const p = {};
    parts.forEach((item) => {
      p[item.type] = item.value;
    });

    const currentYear = parseInt(p.year, 10);
    const currentMonth = parseInt(p.month, 10);
    const currentDay = parseInt(p.day, 10);
    const currentHour = parseInt(p.hour === '24' ? '0' : p.hour, 10);

    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });

    const slots = [];

    // Generate consecutive discrete hourly slots starting from current ongoing hour (offset 0)
    // through the next 6 future hours (offset 6).
    // All slots are anchored to exact round top-of-the-hour clock times (:00) in Asia/Colombo (+05:30)
    for (let offset = 0; offset <= 6; offset++) {
      const localSlotHour = currentHour + offset;
      const targetUtcDate = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay, localSlotHour, 0, 0, 0));

      // In Asia/Colombo (UTC+05:30), the true UTC instant is local time minus 5h 30m
      const colomboOffsetMs = (5 * 3600 + 30 * 60) * 1000;
      const slotEpochMs = targetUtcDate.getTime() - colomboOffsetMs;
      const slotDate = new Date(slotEpochMs);

      // Verify formatted parts of slotDate in Asia/Colombo
      const slotParts = partsFormatter.formatToParts(slotDate);
      const sp = {};
      slotParts.forEach((item) => {
        sp[item.type] = item.value;
      });

      const weekday = weekdayFormatter.format(slotDate);
      const isWeekend = (weekday === 'Saturday' || weekday === 'Sunday') ? 1 : 0;

      // Format ISO prefix for weather matching (YYYY-MM-DDTHH:00)
      const slotHourPadded = String(sp.hour === '24' ? '00' : sp.hour).padStart(2, '0');
      const isoPrefix = `${sp.year}-${sp.month}-${sp.day}T${slotHourPadded}:00`;

      slots.push({
        targetTime: slotDate.toISOString(), // Exact top of the hour (:00:00.000Z)
        isoPrefix,
        hour: parseInt(slotHourPadded, 10),
        day: weekday,
        weekend: isWeekend,
        calendarDate: `${sp.year}-${sp.month}-${sp.day}`,
      });
    }

    return slots;
  }

  /**
   * Generates predictions for the next 6 hours and persists them to public.predictions.
   * @param {boolean} force If true, bypasses the sensor refresh debounce window
   */
  async generateForecast(force = false) {
    const now = Date.now();
    if (!force && (now - this.lastRunTimestamp < SENSOR_REFRESH_DEBOUNCE_MS)) {
      console.log('[PoolOrchestratorForecast] Skipping refresh: within debounce window.');
      return { skipped: true, reason: 'Debounce window active', lastRunStatus: this.lastRunStatus };
    }

    if (this.isGenerating) {
      console.log('[PoolOrchestratorForecast] Forecast generation already in progress.');
      return { skipped: true, reason: 'In-progress' };
    }

    this.isGenerating = true;

    try {
      const slots = this.getNextSixHourlySlots(new Date(), DEFAULT_TIMEZONE);
      const featureRows = [];

      for (const slot of slots) {
        // 1. Holiday check for local calendar date
        const holidayCheck = defaultHolidayService.checkHoliday(slot.calendarDate);
        const holiday = holidayCheck.holidayFeature;

        // 2. Weather check for local target hour from Open-Meteo
        let rain = 0;
        let weather = 'Sunny';
        let weatherDetails = null;

        if (defaultWeatherService.isConfigured()) {
          try {
            const w = await defaultWeatherService.getWeatherForSlot(slot.isoPrefix);
            rain = w.rain;
            weather = w.weather;
            weatherDetails = w;
          } catch (wErr) {
            console.warn(`[PoolOrchestratorForecast] Weather lookup error for ${slot.isoPrefix}:`, wErr.message);
            throw new Error(`Weather forecast unavailable: ${wErr.message}`);
          }
        } else {
          throw new Error('Pool coordinates not configured. Cannot generate forecast without verified weather.');
        }

        featureRows.push({
          hour: slot.hour,
          day: slot.day,
          weekend: slot.weekend,
          holiday,
          rain,
          weather,
          target_time: slot.targetTime,
          weather_details: weatherDetails,
          holiday_details: holidayCheck,
        });
      }

      // 3. Call Python ML Service
      const mlResponse = await axios.post(
        `${ML_SERVICE_URL}/predict`,
        {
          features: featureRows.map((f) => ({
            hour: f.hour,
            day: f.day,
            weekend: f.weekend,
            holiday: f.holiday,
            rain: f.rain,
            weather: f.weather,
            target_time: f.target_time,
          })),
        },
        { timeout: 10000 }
      );

      if (!mlResponse.data || !Array.isArray(mlResponse.data.predictions)) {
        throw new Error('Invalid prediction response from Python ML service.');
      }

      const predictions = mlResponse.data.predictions;
      const modelVersion = mlResponse.data.model_version || '1.0.0';
      const generatedAt = new Date().toISOString();

      // 4. Idempotently persist to public.predictions
      const savedPredictions = [];
      for (let i = 0; i < predictions.length; i++) {
        const pred = predictions[i];
        const slot = slots[i];
        const rowFeatures = featureRows[i];

        // Ensure single record per hour by deleting any prior prediction for this exact hourly slot in Colombo
        try {
          await db.query(
            `DELETE FROM public.pool_predictions
             WHERE date_trunc('hour', target_time AT TIME ZONE 'Asia/Colombo') = date_trunc('hour', $1::timestamptz AT TIME ZONE 'Asia/Colombo')`,
            [slot.targetTime]
          );
        } catch {
          // Ignore if table not created yet
        }

        try {
          await db.query(
            `DELETE FROM public.pool_orchestrator_predictions
             WHERE date_trunc('hour', target_time AT TIME ZONE 'Asia/Colombo') = date_trunc('hour', $1::timestamptz AT TIME ZONE 'Asia/Colombo')`,
            [slot.targetTime]
          );
        } catch {
          // Ignore if table not created yet
        }

        const featurePayload = JSON.stringify({
          hour: rowFeatures.hour,
          day: rowFeatures.day,
          weekend: rowFeatures.weekend,
          holiday: rowFeatures.holiday,
          rain: rowFeatures.rain,
          weather: rowFeatures.weather,
          demand_level: pred.demand_level,
          rounded_swimmers: pred.rounded_swimmers,
          weather_details: rowFeatures.weather_details,
          holiday_details: rowFeatures.holiday_details,
        });

        let insertedRow = null;

        // Primary: insert into public.pool_predictions
        try {
          const insertRes = await db.query(
            `INSERT INTO public.pool_predictions
              (target_time, time_slot, hour, day, predicted_swimmers, demand_level, weather, rain, model_version, generated_at, input_features)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
              slot.targetTime,
              slot.time12Hour || slot.time || format12HourTime(slot.targetTime),
              rowFeatures.hour,
              rowFeatures.day,
              pred.predicted_swimmers,
              pred.demand_level || 'Low',
              rowFeatures.weather,
              rowFeatures.rain ? 1 : 0,
              modelVersion,
              generatedAt,
              featurePayload,
            ]
          );
          insertedRow = insertRes.rows[0];
        } catch {
          // Fallback if table not created yet
        }

        // Secondary / fallback: insert into public.pool_orchestrator_predictions
        try {
          const insertResOld = await db.query(
            `INSERT INTO public.pool_orchestrator_predictions
              (target_time, predicted_swimmers, model_version, generated_at, input_features)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
              slot.targetTime,
              pred.predicted_swimmers,
              modelVersion,
              generatedAt,
              featurePayload,
            ]
          );
          if (!insertedRow) insertedRow = insertResOld.rows[0];
        } catch {
          // Expected when old table is dropped
        }

        if (insertedRow) {
          savedPredictions.push(insertedRow);
        }
      }

      this.lastRunTimestamp = now;
      this.lastRunStatus = {
        success: true,
        generatedAt,
        error: null,
        count: savedPredictions.length,
      };

      console.log(`[PoolOrchestratorForecast] Successfully generated & saved ${savedPredictions.length} predictions.`);
      return {
        success: true,
        generatedAt,
        predictions: savedPredictions,
      };
    } catch (err) {
      console.error('[PoolOrchestratorForecast] Forecast generation failed:', err.message);
      this.lastRunStatus = {
        success: false,
        generatedAt: this.lastRunStatus.generatedAt,
        error: err.message,
        count: this.lastRunStatus.count,
      };
      throw err;
    } finally {
      this.isGenerating = false;
    }
  }

  getLastRunStatus() {
    return this.lastRunStatus;
  }
}

const defaultForecastService = new PoolOrchestratorForecastService();

module.exports = {
  PoolOrchestratorForecastService,
  defaultForecastService,
};
