/**
 * Dedicated Staffing Allocation Planning Service for Pool Orchestrator.
 * Converts predicted swimmer occupancy into structured, rule-based staffing recommendations.
 * Distinguishes lifeguards from operational staff, enforces configured minimum safety levels,
 * accounts for pool operating hours, and clearly documents operational rationale.
 */

class PoolOrchestratorStaffingService {
  constructor(config = {}) {
    this.openingHour = parseInt(config.openingHour ?? process.env.POOL_OPENING_HOUR ?? '6', 10);
    this.closingHour = parseInt(config.closingHour ?? process.env.POOL_CLOSING_HOUR ?? '22', 10);
    this.ratio = process.env.POOL_SWIMMER_TO_LIFEGUARD_RATIO
      ? parseInt(process.env.POOL_SWIMMER_TO_LIFEGUARD_RATIO, 10)
      : 20; // Default facility operational planning guideline (configurable)
    this.minLifeguards = process.env.POOL_MIN_LIFEGUARDS
      ? parseInt(process.env.POOL_MIN_LIFEGUARDS, 10)
      : 1;
    this.minOpsStaff = process.env.POOL_MIN_OPERATIONAL_STAFF
      ? parseInt(process.env.POOL_MIN_OPERATIONAL_STAFF, 10)
      : 1;
  }

  isConfigured() {
    return !isNaN(this.ratio) && this.ratio > 0 && !isNaN(this.minLifeguards);
  }

  /**
   * Updates dynamic staffing policies configured by the pool manager
   */
  updatePolicies({ ratio, minLifeguards, minOpsStaff, openingHour, closingHour } = {}) {
    if (ratio !== undefined) this.ratio = parseInt(ratio, 10);
    if (minLifeguards !== undefined) this.minLifeguards = parseInt(minLifeguards, 10);
    if (minOpsStaff !== undefined) this.minOpsStaff = parseInt(minOpsStaff, 10);
    if (openingHour !== undefined) this.openingHour = parseInt(openingHour, 10);
    if (closingHour !== undefined) this.closingHour = parseInt(closingHour, 10);
    console.log(
      `[PoolOrchestratorStaffingService] Updated dynamic policies -> Ratio: 1:${this.ratio}, MinGuards: ${this.minLifeguards}, MinOps: ${this.minOpsStaff}, Hours: ${this.openingHour}:00–${this.closingHour}:00`
    );
  }

  /**
   * Evaluates staffing requirements for a target hourly forecast slot.
   * @param {number} hour 0-23 in Asia/Colombo
   * @param {number} predictedSwimmers
   */
  getStaffingRecommendation(hour, predictedSwimmers = 0) {
    const isWithinHours = hour >= this.openingHour && hour < this.closingHour;
    const swimmers = Math.max(0, Math.round(predictedSwimmers));

    if (!isWithinHours) {
      return {
        isConfigured: true,
        isOpen: false,
        lifeguards: 0,
        operationalStaff: 1,
        totalStaff: 1,
        status: 'Closed Hours',
        summary: '0 Lifeguards · 1 Facility Watch',
        rationale: `Facility closed to public swimming (${this.closingHour % 12 || 12}:00 PM – ${this.openingHour % 12 || 12}:00 AM/PM). 1 night security/facility watch recommended.`,
      };
    }

    if (!this.isConfigured()) {
      return {
        isConfigured: false,
        isOpen: true,
        lifeguards: null,
        operationalStaff: null,
        totalStaff: null,
        status: 'Configuration required',
        summary: 'Configuration required',
        rationale: `Staffing policy not fully configured for this facility. Expected demand: ${swimmers} swimmers. Set POOL_SWIMMER_TO_LIFEGUARD_RATIO and POOL_MIN_LIFEGUARDS in server/.env.`,
      };
    }

    // Safety calculation: 1 lifeguard per configured ratio, never dropping below minimum safety floor
    const requiredByDemand = Math.ceil(swimmers / this.ratio);
    const lifeguards = Math.max(this.minLifeguards, requiredByDemand);

    // Operational staff: front desk, check-in, deck turnover
    const operationalStaff = swimmers > 30 ? Math.max(2, this.minOpsStaff + 1) : this.minOpsStaff;
    const totalStaff = lifeguards + operationalStaff;

    let demandNotice = '';
    if (requiredByDemand > this.minLifeguards) {
      demandNotice = ` Demand exceeds baseline minimum; ${requiredByDemand} lifeguards required for ${swimmers} swimmers.`;
    } else {
      demandNotice = ` Demand is within baseline minimum capacity (up to ${this.minLifeguards * this.ratio} swimmers). Minimum safety floor of ${this.minLifeguards} lifeguard(s) maintained.`;
    }

    return {
      isConfigured: true,
      isOpen: true,
      lifeguards,
      operationalStaff,
      totalStaff,
      status: 'Configured',
      summary: `${lifeguards} Lifeguard${lifeguards > 1 ? 's' : ''} · ${operationalStaff} Ops Staff`,
      rationale: `Calculated from ${swimmers} predicted swimmers with configured ratio (1 lifeguard per ${this.ratio} swimmers, min: ${this.minLifeguards}).${demandNotice}`,
    };
  }
}

const defaultStaffingService = new PoolOrchestratorStaffingService();

module.exports = {
  PoolOrchestratorStaffingService,
  defaultStaffingService,
};
