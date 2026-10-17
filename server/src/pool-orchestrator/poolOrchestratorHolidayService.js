/**
 * Holiday resolution service for Pool Orchestrator.
 * Evaluates whether a target date/time in Asia/Colombo is an official holiday.
 * Configurable country via process.env.HOLIDAY_COUNTRY (defaults to 'LK' for Sri Lanka).
 */

let Holidays;
try {
  Holidays = require('date-holidays');
} catch (err) {
  Holidays = null;
  console.warn('[PoolOrchestratorHolidayService] date-holidays package not loaded, using fallback.');
}

const DEFAULT_COUNTRY = process.env.HOLIDAY_COUNTRY || 'LK';

class PoolOrchestratorHolidayService {
  constructor(countryCode = DEFAULT_COUNTRY) {
    this.countryCode = countryCode;
    this.hd = null;
    this.init();
  }

  init() {
    if (Holidays) {
      try {
        this.hd = new Holidays(this.countryCode);
        console.log(`[PoolOrchestratorHolidayService] Initialized calendar holidays for country: ${this.countryCode}`);
      } catch (err) {
        console.warn(`[PoolOrchestratorHolidayService] Could not initialize holidays for '${this.countryCode}': ${err.message}`);
        this.hd = null;
      }
    }
  }

  /**
   * Evaluates if a given date (Date object, timestamp, or YYYY-MM-DD string) is a holiday.
   * Target timezone: Asia/Colombo
   * @param {Date|string} dateOrTimestamp
   * @returns {{ isHoliday: boolean, holidayFeature: number, holidayName: string|null }}
   */
  checkHoliday(dateOrTimestamp) {
    if (!this.hd) {
      return {
        isHoliday: false,
        holidayFeature: 0,
        holidayName: null,
        note: 'Holiday provider not initialized; fallback 0 used',
      };
    }

    try {
      // Ensure date is evaluated in local pool calendar date
      const dateObj = new Date(dateOrTimestamp);
      const isHol = this.hd.isHoliday(dateObj);

      if (isHol && isHol.length > 0) {
        // date-holidays returns an array of matching holidays
        const primary = isHol[0];
        return {
          isHoliday: true,
          holidayFeature: 1,
          holidayName: primary.name || 'Public Holiday',
          type: primary.type,
        };
      } else if (isHol && typeof isHol === 'object' && isHol.name) {
        return {
          isHoliday: true,
          holidayFeature: 1,
          holidayName: isHol.name,
          type: isHol.type,
        };
      }

      return {
        isHoliday: false,
        holidayFeature: 0,
        holidayName: null,
      };
    } catch (err) {
      console.error('[PoolOrchestratorHolidayService] Error checking holiday:', err.message);
      return {
        isHoliday: false,
        holidayFeature: 0,
        holidayName: null,
        error: err.message,
      };
    }
  }
}

const defaultHolidayService = new PoolOrchestratorHolidayService();

module.exports = {
  PoolOrchestratorHolidayService,
  defaultHolidayService,
};
