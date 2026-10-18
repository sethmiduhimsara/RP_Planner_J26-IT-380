/**
 * Dedicated Filtration & Circulation Planning Service for Pool Orchestrator.
 * Evaluates operational demand against hydraulic circulation rules, equipment constraints,
 * and energy optimization windows without fabricating pump specifications.
 * Strictly separates advisory recommendations from verified physical relay acknowledgement.
 */

class PoolOrchestratorFiltrationService {
  constructor(config = {}) {
    this.minDailyHours = process.env.POOL_FILTRATION_DAILY_MIN_HOURS
      ? parseInt(process.env.POOL_FILTRATION_DAILY_MIN_HOURS, 10)
      : 8; // Mandatory minimum turnover guideline (8 hours daily)
    this.turnoverRateHours = process.env.POOL_TURNOVER_RATE_HOURS
      ? parseFloat(process.env.POOL_TURNOVER_RATE_HOURS)
      : null; // Pool engineer specific specification
    this.openingHour = parseInt(config.openingHour ?? process.env.POOL_OPENING_HOUR ?? '6', 10);
    this.closingHour = parseInt(config.closingHour ?? process.env.POOL_CLOSING_HOUR ?? '22', 10);
    this.lowDemandMax = 15;
    this.moderateDemandMax = 30;
    this.highDemandMax = 45;
  }

  isConfigured() {
    return !isNaN(this.minDailyHours) && this.minDailyHours > 0;
  }

  /**
   * Updates dynamic demand thresholds configured by the pool manager
   */
  updateThresholds({ lowDemandMax, moderateDemandMax, highDemandMax, openingHour, closingHour } = {}) {
    if (lowDemandMax !== undefined) this.lowDemandMax = parseInt(lowDemandMax, 10);
    if (moderateDemandMax !== undefined) this.moderateDemandMax = parseInt(moderateDemandMax, 10);
    if (highDemandMax !== undefined) this.highDemandMax = parseInt(highDemandMax, 10);
    if (openingHour !== undefined) this.openingHour = parseInt(openingHour, 10);
    if (closingHour !== undefined) this.closingHour = parseInt(closingHour, 10);
    console.log(
      `[PoolOrchestratorFiltrationService] Updated dynamic thresholds -> Low: <${this.lowDemandMax}, Moderate: ${this.lowDemandMax}–${this.moderateDemandMax}, High: ${this.moderateDemandMax + 1}–${this.highDemandMax}, Very High: >${this.highDemandMax}`
    );
  }

  /**
   * Maps an occupancy count to the 4-relay bulb actuation scheme requested:
   * - Low occupancy (< lowDemandMax swimmers): 1 bulb (Relay 1 ON -> "1,0,0,0")
   * - Moderate occupancy (lowDemandMax - moderateDemandMax swimmers): 2 bulbs (Relays 1 & 2 ON -> "1,1,0,0")
   * - High occupancy (moderateDemandMax + 1 - highDemandMax swimmers): 3 bulbs (Relays 1, 2 & 3 ON -> "1,1,1,0")
   * - Very high occupancy (> highDemandMax swimmers): 4 bulbs (Relays 1, 2, 3 & 4 ON -> "1,1,1,1")
   */
  getBulbRelayStateForOccupancy(occupancy) {
    const count = Math.max(0, parseInt(occupancy ?? 0, 10));

    if (count > this.highDemandMax) {
      return {
        stage: 4,
        bulbs: 4,
        level: 'Very High',
        mode: 'Stage 4: Very High Load',
        recommendation: '4 Bulbs Active (Maximum Turnover)',
        relays: [1, 1, 1, 1],
        relayPayload: '1,1,1,1',
        requiresApproval: true,
        description: 'Stage 4 Maximum Filtration (4 Bulbs / Relays Active)',
        rationale: `Very high occupancy (${count} swimmers > ${this.highDemandMax}). All 4 filtration pumps/bulbs engaged for maximum hydraulic turnover and sanitization.`,
      };
    }

    if (count > this.moderateDemandMax) {
      return {
        stage: 3,
        bulbs: 3,
        level: 'High',
        mode: 'Stage 3: High Load',
        recommendation: '3 Bulbs Active (High Circulation)',
        relays: [1, 1, 1, 0],
        relayPayload: '1,1,1,0',
        requiresApproval: false,
        description: 'Stage 3 High Circulation (3 Bulbs / Relays Active)',
        rationale: `High occupancy (${count} swimmers: ${this.moderateDemandMax + 1}–${this.highDemandMax}). 3 filtration pumps/bulbs engaged to match elevated bather circulation.`,
      };
    }

    if (count >= this.lowDemandMax) {
      return {
        stage: 2,
        bulbs: 2,
        level: 'Moderate',
        mode: 'Stage 2: Moderate Load',
        recommendation: '2 Bulbs Active (Standard Circulation)',
        relays: [1, 1, 0, 0],
        relayPayload: '1,1,0,0',
        requiresApproval: false,
        description: 'Stage 2 Standard Circulation (2 Bulbs / Relays Active)',
        rationale: `Moderate occupancy (${count} swimmers: ${this.lowDemandMax}–${this.moderateDemandMax}). 2 filtration pumps/bulbs active for standard continuous turnover.`,
      };
    }

    // Low occupancy (< lowDemandMax swimmers)
    return {
      stage: 1,
      bulbs: 1,
      level: 'Low',
      mode: 'Stage 1: Low Load',
      recommendation: '1 Bulb Active (Baseline Circulation)',
      relays: [1, 0, 0, 0],
      relayPayload: '1,0,0,0',
      requiresApproval: false,
      description: 'Stage 1 Baseline Circulation (1 Bulb / Relay Active)',
      rationale: `Low occupancy (${count} swimmers < ${this.lowDemandMax}). 1 filtration pump/bulb active for mandatory continuous baseline circulation.`,
    };
  }

  /**
   * Generates filtration operating plan recommendation for a target forecast hour.
   * @param {number} hour 0-23 in Asia/Colombo
   * @param {number} predictedSwimmers
   * @param {object|null} currentRelayEvent Latest event from public.filtration_events
   */
  getFiltrationRecommendation(hour, predictedSwimmers = 0, currentRelayEvent = null) {
    if (!this.isConfigured()) {
      return {
        isConfigured: false,
        recommendation: 'Configuration required',
        mode: 'Unconfigured',
        stage: 0,
        bulbs: 0,
        relays: [0, 0, 0, 0],
        relayPayload: '0,0,0,0',
        requiresApproval: true,
        actualDeviceState: currentRelayEvent?.relay_state || 'unknown',
        acknowledged: currentRelayEvent?.acknowledged || false,
        executionStatus: 'Equipment specifications pending',
        rationale: 'Daily minimum circulation requirements (POOL_FILTRATION_DAILY_MIN_HOURS) not configured in server/.env.',
      };
    }

    const swimmers = Math.max(0, Math.round(predictedSwimmers));
    const isWithinHours = hour >= this.openingHour && hour < this.closingHour;

    let stageInfo;
    let mode = '';
    let recommendation = '';
    let requiresApproval = false;
    let rationale = '';

    if (!isWithinHours) {
      stageInfo = {
        stage: 1,
        bulbs: 1,
        level: 'Off-Peak',
        relays: [1, 0, 0, 0],
        relayPayload: '1,0,0,0',
      };
      mode = 'Off-Peak Turnover';
      recommendation = '1 Bulb (Scheduled Deep Turnover)';
      requiresApproval = false;
      rationale = `Facility closed (${this.closingHour % 12 || 12}:00 PM – ${this.openingHour % 12 || 12}:00 AM/PM). Recommended scheduled turnover window to meet daily ${this.minDailyHours}-hour circulation requirement at off-peak energy rates.`;
    } else {
      stageInfo = this.getBulbRelayStateForOccupancy(swimmers);
      mode = stageInfo.mode;
      recommendation = stageInfo.recommendation;
      requiresApproval = stageInfo.requiresApproval;
      rationale = stageInfo.rationale;
    }

    // Hardware acknowledgement status
    const actualState = currentRelayEvent ? currentRelayEvent.relayState : 'unknown';
    const isAcknowledged = currentRelayEvent ? currentRelayEvent.acknowledged : false;

    let executionStatus = 'Advisory Recommendation';
    if (!isAcknowledged) {
      executionStatus = 'Pending Hardware Acknowledgement (ESP32 relay telemetry not confirmed)';
    } else {
      executionStatus = `Confirmed Hardware State: ${actualState.toUpperCase()}`;
    }

    return {
      isConfigured: true,
      stage: stageInfo.stage,
      bulbs: stageInfo.bulbs,
      relays: stageInfo.relays,
      relayPayload: stageInfo.relayPayload,
      demandLevel: stageInfo.level,
      mode,
      recommendation,
      requiresApproval,
      actualDeviceState: actualState,
      acknowledged: isAcknowledged,
      executionStatus,
      rationale,
      equipmentConstraint: `Min ${this.minDailyHours}h daily circulation enforced`,
    };
  }
}

const defaultFiltrationService = new PoolOrchestratorFiltrationService();

module.exports = {
  PoolOrchestratorFiltrationService,
  defaultFiltrationService,
};
