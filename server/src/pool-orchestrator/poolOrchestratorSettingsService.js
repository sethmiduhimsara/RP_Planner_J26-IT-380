/**
 * Manager Settings & Operational Policy Service for Pool Orchestrator.
 * Stores and manages customizable pool capacity thresholds, demand levels,
 * staffing ratios, and operating hours in public.pool_orchestrator_settings.
 */

const db = require('./poolOrchestratorDatabase');
const { defaultStaffingService } = require('./poolOrchestratorStaffingService');
const { defaultFiltrationService } = require('./poolOrchestratorFiltrationService');
const { defaultAutoRetrainService } = require('./poolOrchestratorAutoRetrainService');
const { defaultForecastService } = require('./poolOrchestratorForecastService');

const DEFAULT_SETTINGS = {
  id: 'current',
  pool_name: process.env.POOL_NAME || 'Colombo Aquatic Centre Main Pool',
  low_demand_max: 15,
  moderate_demand_max: 30,
  high_demand_max: 45,
  swimmer_to_lifeguard_ratio: parseInt(process.env.POOL_SWIMMER_TO_LIFEGUARD_RATIO || '20', 10),
  min_lifeguards: parseInt(process.env.POOL_MIN_LIFEGUARDS || '1', 10),
  min_operational_staff: parseInt(process.env.POOL_MIN_OPERATIONAL_STAFF || '1', 10),
  opening_hour: parseInt(process.env.POOL_OPENING_HOUR || '6', 10),
  closing_hour: parseInt(process.env.POOL_CLOSING_HOUR || '22', 10),
  auto_retrain_interval: parseInt(process.env.ML_RETRAIN_INTERVAL || '100', 10),
};

class PoolOrchestratorSettingsService {
  constructor() {
    this.cachedSettings = { ...DEFAULT_SETTINGS };
    this.isInitialized = false;
    this.lastFetchedAt = 0;
    this.lastAppliedHash = '';
  }

  /**
   * Initializes the settings table in PostgreSQL if not already present
   */
  async ensureTable() {
    if (this.isInitialized) return;

    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.pool_orchestrator_settings (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'current',
          pool_name VARCHAR(100) NOT NULL DEFAULT 'Colombo Aquatic Centre Main Pool',
          low_demand_max INTEGER NOT NULL DEFAULT 15,
          moderate_demand_max INTEGER NOT NULL DEFAULT 30,
          high_demand_max INTEGER NOT NULL DEFAULT 45,
          swimmer_to_lifeguard_ratio INTEGER NOT NULL DEFAULT 20,
          min_lifeguards INTEGER NOT NULL DEFAULT 1,
          min_operational_staff INTEGER NOT NULL DEFAULT 1,
          opening_hour INTEGER NOT NULL DEFAULT 6,
          closing_hour INTEGER NOT NULL DEFAULT 22,
          auto_retrain_interval INTEGER NOT NULL DEFAULT 100,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Seed baseline record if missing
      await db.query(
        `INSERT INTO public.pool_orchestrator_settings
          (id, pool_name, low_demand_max, moderate_demand_max, high_demand_max,
           swimmer_to_lifeguard_ratio, min_lifeguards, min_operational_staff,
           opening_hour, closing_hour, auto_retrain_interval, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          DEFAULT_SETTINGS.id,
          DEFAULT_SETTINGS.pool_name,
          DEFAULT_SETTINGS.low_demand_max,
          DEFAULT_SETTINGS.moderate_demand_max,
          DEFAULT_SETTINGS.high_demand_max,
          DEFAULT_SETTINGS.swimmer_to_lifeguard_ratio,
          DEFAULT_SETTINGS.min_lifeguards,
          DEFAULT_SETTINGS.min_operational_staff,
          DEFAULT_SETTINGS.opening_hour,
          DEFAULT_SETTINGS.closing_hour,
          DEFAULT_SETTINGS.auto_retrain_interval,
        ]
      );

      this.isInitialized = true;
    } catch (err) {
      console.warn('[PoolOrchestratorSettings] Table check notice:', err.message);
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate key'))) {
        this.isInitialized = true;
      }
    }
  }

  /**
   * Returns current active settings from database (falling back to defaults)
   */
  async getSettings() {
    const now = Date.now();
    // Cache in memory for 10 seconds to prevent hammering database on rapid polling
    if (this.lastFetchedAt && now - this.lastFetchedAt < 10000) {
      return this.cachedSettings;
    }

    await this.ensureTable();

    try {
      const res = await db.query(
        `SELECT * FROM public.pool_orchestrator_settings WHERE id = 'current' LIMIT 1`
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        this.cachedSettings = {
          id: row.id,
          pool_name: row.pool_name,
          low_demand_max: parseInt(row.low_demand_max, 10),
          moderate_demand_max: parseInt(row.moderate_demand_max, 10),
          high_demand_max: parseInt(row.high_demand_max, 10),
          swimmer_to_lifeguard_ratio: parseInt(row.swimmer_to_lifeguard_ratio, 10),
          min_lifeguards: parseInt(row.min_lifeguards, 10),
          min_operational_staff: parseInt(row.min_operational_staff, 10),
          opening_hour: parseInt(row.opening_hour, 10),
          closing_hour: parseInt(row.closing_hour, 10),
          auto_retrain_interval: parseInt(row.auto_retrain_interval, 10),
          updated_at: row.updated_at,
        };
      }
      this.lastFetchedAt = now;
    } catch (err) {
      console.warn('[PoolOrchestratorSettings] Failed to fetch settings from DB, using cached:', err.message);
      this.lastFetchedAt = now;
    }

    const currentHash = JSON.stringify(this.cachedSettings);
    if (currentHash !== this.lastAppliedHash) {
      this._applyToServices(this.cachedSettings);
      this.lastAppliedHash = currentHash;
    }

    return this.cachedSettings;
  }

  /**
   * Updates manager settings, applies them to operational services, and saves to database
   * @param {object} payload Updated settings values
   */
  async updateSettings(payload = {}) {
    await this.ensureTable();

    const low = Math.max(1, parseInt(payload.low_demand_max ?? this.cachedSettings.low_demand_max, 10));
    const moderate = Math.max(low + 1, parseInt(payload.moderate_demand_max ?? this.cachedSettings.moderate_demand_max, 10));
    const high = Math.max(moderate + 1, parseInt(payload.high_demand_max ?? this.cachedSettings.high_demand_max, 10));

    const ratio = Math.max(1, parseInt(payload.swimmer_to_lifeguard_ratio ?? this.cachedSettings.swimmer_to_lifeguard_ratio, 10));
    const minLifeguards = Math.max(1, parseInt(payload.min_lifeguards ?? this.cachedSettings.min_lifeguards, 10));
    const minOps = Math.max(0, parseInt(payload.min_operational_staff ?? this.cachedSettings.min_operational_staff, 10));

    const openHour = Math.min(23, Math.max(0, parseInt(payload.opening_hour ?? this.cachedSettings.opening_hour, 10)));
    const closeHour = Math.min(24, Math.max(openHour + 1, parseInt(payload.closing_hour ?? this.cachedSettings.closing_hour, 10)));
    const poolName = (payload.pool_name || this.cachedSettings.pool_name || 'Main Swimming Pool').trim();
    const retrainInterval = Math.max(10, parseInt(payload.auto_retrain_interval ?? this.cachedSettings.auto_retrain_interval, 10));

    const res = await db.query(
      `INSERT INTO public.pool_orchestrator_settings
        (id, pool_name, low_demand_max, moderate_demand_max, high_demand_max,
         swimmer_to_lifeguard_ratio, min_lifeguards, min_operational_staff,
         opening_hour, closing_hour, auto_retrain_interval, updated_at)
       VALUES ('current', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (id) DO UPDATE SET
         pool_name = EXCLUDED.pool_name,
         low_demand_max = EXCLUDED.low_demand_max,
         moderate_demand_max = EXCLUDED.moderate_demand_max,
         high_demand_max = EXCLUDED.high_demand_max,
         swimmer_to_lifeguard_ratio = EXCLUDED.swimmer_to_lifeguard_ratio,
         min_lifeguards = EXCLUDED.min_lifeguards,
         min_operational_staff = EXCLUDED.min_operational_staff,
         opening_hour = EXCLUDED.opening_hour,
         closing_hour = EXCLUDED.closing_hour,
         auto_retrain_interval = EXCLUDED.auto_retrain_interval,
         updated_at = NOW()
       RETURNING *`,
      [
        poolName,
        low,
        moderate,
        high,
        ratio,
        minLifeguards,
        minOps,
        openHour,
        closeHour,
        retrainInterval,
      ]
    );

    const savedRow = res.rows[0];
    this.cachedSettings = {
      id: savedRow.id,
      pool_name: savedRow.pool_name,
      low_demand_max: parseInt(savedRow.low_demand_max, 10),
      moderate_demand_max: parseInt(savedRow.moderate_demand_max, 10),
      high_demand_max: parseInt(savedRow.high_demand_max, 10),
      swimmer_to_lifeguard_ratio: parseInt(savedRow.swimmer_to_lifeguard_ratio, 10),
      min_lifeguards: parseInt(savedRow.min_lifeguards, 10),
      min_operational_staff: parseInt(savedRow.min_operational_staff, 10),
      opening_hour: parseInt(savedRow.opening_hour, 10),
      closing_hour: parseInt(savedRow.closing_hour, 10),
      auto_retrain_interval: parseInt(savedRow.auto_retrain_interval, 10),
      updated_at: savedRow.updated_at,
    };

    this.lastFetchedAt = Date.now();
    this.lastAppliedHash = JSON.stringify(this.cachedSettings);

    // Propagate to operational rule services
    this._applyToServices(this.cachedSettings);

    // Refresh forecast & plan so newly saved limits take effect immediately
    defaultForecastService.generateForecast(true).catch((fErr) => {
      console.warn('[PoolOrchestratorSettings] Post-settings forecast update notice:', fErr.message);
    });

    console.log('[PoolOrchestratorSettings] Successfully updated manager operational settings:', this.cachedSettings);
    return this.cachedSettings;
  }

  /**
   * Synchronizes active thresholds into operational micro-services
   */
  _applyToServices(settings) {
    if (defaultFiltrationService && typeof defaultFiltrationService.updateThresholds === 'function') {
      defaultFiltrationService.updateThresholds({
        lowDemandMax: settings.low_demand_max,
        moderateDemandMax: settings.moderate_demand_max,
        highDemandMax: settings.high_demand_max,
        openingHour: settings.opening_hour,
        closingHour: settings.closing_hour,
      });
    }

    if (defaultStaffingService && typeof defaultStaffingService.updatePolicies === 'function') {
      defaultStaffingService.updatePolicies({
        ratio: settings.swimmer_to_lifeguard_ratio,
        minLifeguards: settings.min_lifeguards,
        minOpsStaff: settings.min_operational_staff,
        openingHour: settings.opening_hour,
        closingHour: settings.closing_hour,
      });
    }

    if (defaultAutoRetrainService && typeof defaultAutoRetrainService.setRetrainInterval === 'function') {
      defaultAutoRetrainService.setRetrainInterval(settings.auto_retrain_interval);
    }
  }
}

const defaultSettingsService = new PoolOrchestratorSettingsService();

module.exports = {
  PoolOrchestratorSettingsService,
  defaultSettingsService,
};
