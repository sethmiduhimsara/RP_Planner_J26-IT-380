/**
 * Automated Model Retraining Service for Pool Orchestrator.
 * Monitors the ground truth dataset in public.hourly_pool_occupancy and
 * automatically retrains the Random Forest pipeline whenever ~100 new hourly observations accumulate.
 */

const axios = require('axios');
const db = require('./poolOrchestratorDatabase');
const { defaultForecastService } = require('./poolOrchestratorForecastService');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const DEFAULT_RETRAIN_INTERVAL = parseInt(process.env.ML_RETRAIN_INTERVAL || '100', 10);

class PoolOrchestratorAutoRetrainService {
  constructor() {
    this.retrainInterval = DEFAULT_RETRAIN_INTERVAL;
    this.lastRetrainedRowCount = 0;
    this.lastRetrainedAt = null;
    this.lastRetrainStatus = null;
    this.isRetraining = false;
    this.initialized = false;
  }

  setRetrainInterval(interval) {
    const val = parseInt(interval, 10);
    if (!isNaN(val) && val >= 10) {
      this.retrainInterval = val;
      console.log(`[PoolOrchestratorAutoRetrain] Updated retrain interval to ${this.retrainInterval} rows.`);
    }
  }

  /**
   * Synchronizes the baseline trained count with the loaded model in ml-service
   * to guarantee that server restarts do not trigger unwanted retrains.
   */
  async ensureBaselineInitialized(totalRows) {
    if (this.initialized) return;

    try {
      const mlRes = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
      const version = mlRes.data?.model_version || '';
      const match = version.match(/retrained-(\d+)-obs/i);
      if (match) {
        this.lastRetrainedRowCount = parseInt(match[1], 10);
        console.log(`[PoolOrchestratorAutoRetrain] Baseline synced with ML model version '${version}' (${this.lastRetrainedRowCount} trained rows).`);
      } else {
        this.lastRetrainedRowCount = Math.floor(totalRows / this.retrainInterval) * this.retrainInterval;
        console.log(`[PoolOrchestratorAutoRetrain] Baseline set to ${this.lastRetrainedRowCount} rows (Current: ${totalRows}). Next retrain at ${this.lastRetrainedRowCount + this.retrainInterval} rows.`);
      }
    } catch {
      this.lastRetrainedRowCount = Math.floor(totalRows / this.retrainInterval) * this.retrainInterval;
    }

    this.initialized = true;
  }

  /**
   * Returns live status of automated retraining metrics and remaining rows
   */
  async getStatus() {
    let currentTotalRows = 0;
    try {
      const countRes = await db.query('SELECT COUNT(*) FROM public.hourly_pool_occupancy');
      currentTotalRows = parseInt(countRes.rows[0]?.count || '0', 10);
      await this.ensureBaselineInitialized(currentTotalRows);
    } catch {
      // Fallback if table not ready
    }

    const nextRetrainAt = this.lastRetrainedRowCount + this.retrainInterval;
    const rowsUntilNextRetrain = Math.max(0, nextRetrainAt - currentTotalRows);

    return {
      enabled: true,
      retrainInterval: this.retrainInterval,
      currentTotalRows,
      lastRetrainedRowCount: this.lastRetrainedRowCount,
      nextRetrainAtRows: nextRetrainAt,
      rowsUntilNextRetrain,
      modelPolicy: rowsUntilNextRetrain > 0
        ? `Serving predictions from existing trained model until ${rowsUntilNextRetrain} more hourly records accumulate.`
        : `Ready for retraining threshold (${nextRetrainAt} rows).`,
      lastRetrainedAt: this.lastRetrainedAt,
      lastRetrainStatus: this.lastRetrainStatus,
      isRetraining: this.isRetraining,
    };
  }

  /**
   * Checks if accumulated hourly observations have exceeded the 100-row threshold.
   * If < 100 new rows, skips retraining and preserves existing trained model.
   * If >= 100 new rows, automatically retrains the entire model.
   */
  async checkAndTriggerAutoRetrain() {
    if (this.isRetraining) {
      console.log('[PoolOrchestratorAutoRetrain] Retraining already in progress. Skipping check.');
      return;
    }

    try {
      const countRes = await db.query('SELECT COUNT(*) FROM public.hourly_pool_occupancy');
      const totalRows = parseInt(countRes.rows[0]?.count || '0', 10);

      await this.ensureBaselineInitialized(totalRows);

      // Only retrain when exactly 100 or more NEW rows have accumulated since last training
      if (totalRows >= this.lastRetrainedRowCount + this.retrainInterval) {
        console.log(
          `[PoolOrchestratorAutoRetrain] 100-row threshold reached! Total rows: ${totalRows}, Last retrained: ${this.lastRetrainedRowCount}. Retraining entire model...`
        );
        await this.triggerRetrain(totalRows, `Automated retraining triggered at ${totalRows} hourly observations`);
      } else {
        const remaining = (this.lastRetrainedRowCount + this.retrainInterval) - totalRows;
        console.log(
          `[PoolOrchestratorAutoRetrain] New records logged: ${totalRows} total (${remaining} more hourly records required for next retraining). Serving predictions from existing trained model.`
        );
      }
    } catch (err) {
      console.warn('[PoolOrchestratorAutoRetrain] Auto-retrain check notice:', err.message);
    }
  }

  /**
   * Performs the retraining process by streaming historical ground truth rows
   * from public.hourly_pool_occupancy to the ML service's /retrain endpoint.
   */
  async triggerRetrain(totalRows = null, reason = 'Automated retraining') {
    if (this.isRetraining) {
      throw new Error('Retraining already in progress.');
    }

    this.isRetraining = true;

    try {
      // 1. Fetch all validated ground truth observations from database
      const rowsRes = await db.query(`
        SELECT 
          hour, 
          day, 
          weekend, 
          holiday, 
          rain, 
          weather, 
          occupancy_count
        FROM public.hourly_pool_occupancy
        ORDER BY target_hour ASC
      `);

      const records = rowsRes.rows.map((r) => ({
        hour: parseInt(r.hour, 10),
        day: String(r.day),
        weekend: parseInt(r.weekend, 10),
        holiday: parseInt(r.holiday, 10),
        rain: parseInt(r.rain, 10),
        weather: String(r.weather),
        occupancy_count: parseFloat(r.occupancy_count),
      }));

      if (records.length < 10) {
        throw new Error(`Insufficient ground truth data. Need at least 10 rows in hourly_pool_occupancy, found ${records.length}.`);
      }

      console.log(`[PoolOrchestratorAutoRetrain] Sending ${records.length} hourly training samples to Python ML service...`);

      // 2. Call Python ML Service /retrain endpoint
      const mlRes = await axios.post(
        `${ML_SERVICE_URL}/retrain`,
        {
          records,
          trigger_reason: reason,
        },
        { timeout: 30000 }
      );

      const result = mlRes.data;
      this.lastRetrainedRowCount = records.length;
      this.lastRetrainedAt = new Date().toISOString();
      this.lastRetrainStatus = {
        success: true,
        samplesTrained: result.samples_trained,
        mae: result.mean_absolute_error,
        r2: result.r2_score,
        modelVersion: result.model_version,
        message: result.message,
      };

      console.log(
        `[PoolOrchestratorAutoRetrain] Model successfully retrained! Samples: ${result.samples_trained}, MAE: ${result.mean_absolute_error}, R2: ${result.r2_score}, Version: ${result.model_version}`
      );

      // 3. Immediately refresh future 6-hour forecast using newly retrained model
      defaultForecastService.generateForecast(true).catch((fErr) => {
        console.warn('[PoolOrchestratorAutoRetrain] Post-retrain forecast refresh notice:', fErr.message);
      });

      return this.lastRetrainStatus;
    } catch (err) {
      this.lastRetrainStatus = {
        success: false,
        error: err.response?.data?.detail || err.message,
      };
      console.error('[PoolOrchestratorAutoRetrain] Retraining failed:', err.message);
      throw err;
    } finally {
      this.isRetraining = false;
    }
  }
}

const defaultAutoRetrainService = new PoolOrchestratorAutoRetrainService();

module.exports = {
  PoolOrchestratorAutoRetrainService,
  defaultAutoRetrainService,
};
