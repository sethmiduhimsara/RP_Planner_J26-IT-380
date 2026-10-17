/**
 * Weather integration service for Pool Orchestrator using Open-Meteo API.
 * Provides future hourly weather forecasts, precipitation, and WMO weather code mapping.
 * Implements strict coordinate validation and response caching.
 */

const axios = require('axios');

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

class PoolOrchestratorWeatherService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  getCoordinates() {
    const lat = process.env.POOL_LATITUDE;
    const lon = process.env.POOL_LONGITUDE;
    const tz = process.env.POOL_TIMEZONE || 'Asia/Colombo';

    if (lat === undefined || lon === undefined || lat === '' || lon === '') {
      return null;
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      return null;
    }

    return {
      latitude: parsedLat,
      longitude: parsedLon,
      timezone: tz,
    };
  }

  isConfigured() {
    return this.getCoordinates() !== null;
  }

  /**
   * Maps WMO weather code and precipitation values to the ML model's expected categories:
   * 'Sunny', 'Cloudy', 'Rainy'
   * and binary rain flag (0 or 1).
   */
  mapWeatherCondition(weatherCode, rainMm = 0, precipitationMm = 0) {
    const rainVal = Number(rainMm) || 0;
    const precipVal = Number(precipitationMm) || 0;
    const code = Number(weatherCode);

    // Rainy WMO codes: drizzle (51-57), rain (61-67), snow (71-77), showers (80-86), thunderstorm (95-99)
    const rainyCodes = [
      51, 53, 55, 56, 57,
      61, 63, 65, 66, 67,
      71, 73, 75, 77,
      80, 81, 82, 85, 86,
      95, 96, 99
    ];

    const cloudyCodes = [2, 3, 45, 48]; // Partly cloudy, overcast, fog

    const indicatesRain = rainVal > 0.1 || precipVal > 0.1 || rainyCodes.includes(code);

    if (indicatesRain) {
      return {
        rain: 1,
        weather: 'Rainy',
        description: this.getWmoDescription(code, true),
      };
    }

    if (cloudyCodes.includes(code)) {
      return {
        rain: 0,
        weather: 'Cloudy',
        description: this.getWmoDescription(code, false),
      };
    }

    // Default clear/mainly clear: Sunny
    return {
      rain: 0,
      weather: 'Sunny',
      description: this.getWmoDescription(code, false),
    };
  }

  getWmoDescription(code, hasRain) {
    switch (code) {
      case 0: return 'Clear sky';
      case 1: return 'Mainly clear';
      case 2: return 'Partly cloudy';
      case 3: return 'Overcast';
      case 45: return 'Fog';
      case 48: return 'Depositing rime fog';
      case 51: return 'Light drizzle';
      case 53: return 'Moderate drizzle';
      case 55: return 'Dense drizzle';
      case 61: return 'Slight rain';
      case 63: return 'Moderate rain';
      case 65: return 'Heavy rain';
      case 80: return 'Rain showers';
      case 81: return 'Moderate rain showers';
      case 82: return 'Violent rain showers';
      case 95: return 'Thunderstorm';
      default: return hasRain ? 'Rainy conditions' : 'Clear / Fair';
    }
  }

  /**
   * Fetches raw hourly forecast from Open-Meteo with caching
   */
  async fetchOpenMeteoForecast() {
    const coords = this.getCoordinates();
    if (!coords) {
      throw new Error(
        'Pool coordinates are not configured. Please set POOL_LATITUDE and POOL_LONGITUDE in server/.env.'
      );
    }

    const now = Date.now();
    if (this.cache && (now - this.cacheTimestamp < CACHE_TTL_MS)) {
      return this.cache;
    }

    const url = 'https://api.open-meteo.com/v1/forecast';
    const params = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      hourly: 'weather_code,precipitation,rain,temperature_2m',
      timezone: coords.timezone,
      forecast_days: 2,
    };

    try {
      const response = await axios.get(url, {
        params,
        timeout: 7000,
        headers: {
          'User-Agent': 'PoolOrchestrator/1.0 (University Research Project)',
        },
      });

      if (!response.data || !response.data.hourly) {
        throw new Error('Malformed forecast response received from Open-Meteo API.');
      }

      this.cache = response.data;
      this.cacheTimestamp = now;
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 429) {
        throw new Error('Open-Meteo API rate limit reached. Please try again shortly.');
      }
      throw new Error(`Failed to fetch Open-Meteo weather data: ${err.message}`);
    }
  }

  /**
   * Extracts forecast condition for a specific target hour in the pool's local timezone.
   * @param {string} targetIsoPrefix e.g. "2026-10-14T23:00"
   */
  async getWeatherForSlot(targetIsoPrefix) {
    const rawData = await this.fetchOpenMeteoForecast();
    const hourly = rawData.hourly;

    const times = hourly.time || [];
    let matchIdx = times.findIndex((t) => t.startsWith(targetIsoPrefix));

    if (matchIdx === -1) {
      // Find closest hourly time
      const targetTimeMs = new Date(targetIsoPrefix).getTime();
      let minDiff = Infinity;
      times.forEach((t, idx) => {
        const diff = Math.abs(new Date(t).getTime() - targetTimeMs);
        if (diff < minDiff) {
          minDiff = diff;
          matchIdx = idx;
        }
      });
    }

    if (matchIdx === -1 || matchIdx >= times.length) {
      throw new Error(`No weather forecast available for time slot ${targetIsoPrefix}`);
    }

    const weatherCode = hourly.weather_code[matchIdx];
    const rain = hourly.rain ? hourly.rain[matchIdx] : 0;
    const precip = hourly.precipitation ? hourly.precipitation[matchIdx] : 0;
    const temp = hourly.temperature_2m ? hourly.temperature_2m[matchIdx] : null;

    const mapped = this.mapWeatherCondition(weatherCode, rain, precip);

    return {
      slotTime: times[matchIdx],
      weatherCode,
      rain: mapped.rain,
      weather: mapped.weather,
      description: mapped.description,
      temperatureC: temp,
      precipitationMm: precip,
    };
  }
}

const defaultWeatherService = new PoolOrchestratorWeatherService();

module.exports = {
  PoolOrchestratorWeatherService,
  defaultWeatherService,
};
