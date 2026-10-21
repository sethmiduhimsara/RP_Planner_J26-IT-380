/**
 * Operational Resource Planning & Decision Support Service for Pool Orchestrator.
 * Synthesizes 6-hour ML occupancy forecasts, weather conditions, staffing rules,
 * filtration constraints, and routine maintenance schedules into an actionable manager plan.
 */

const { defaultStaffingService } = require('./poolOrchestratorStaffingService');
const { defaultFiltrationService } = require('./poolOrchestratorFiltrationService');
const { format12HourTime, formatSlotLabel, getColomboHour } = require('./poolOrchestratorTimeUtils');

class PoolOrchestratorResourcePlanService {
  /**
   * Generates a structured 6-hour operational resource plan and prioritized manager actions.
   * @param {Array} predictions Array of 6 prediction records from public.predictions
   * @param {object|null} latestReading Latest sensor reading from public.sensor_readings
   * @param {object|null} latestOccupancy Latest occupancy from public.occupancy_history
   * @param {object|null} filtrationStatus Latest relay event from public.filtration_events
   */
  generatePlan(predictions = [], latestReading = null, latestOccupancy = null, filtrationStatus = null) {
    const baseDate = new Date();

    // 1. Build the 6-hour slot-by-slot resource plan table
    const planRows = predictions.map((pred, index) => {
      const feat = pred.input_features || {};
      const targetTime = pred.target_time;
      const hour = typeof feat.hour === 'number' ? feat.hour : getColomboHour(targetTime);
      const swimmers = Math.round(Number(pred.predicted_swimmers) || 0);
      const weather = feat.weather || (feat.rain ? 'Rainy' : 'Sunny');
      const isRain = feat.rain === 1;

      // Staffing recommendation
      const staffing = defaultStaffingService.getStaffingRecommendation(hour, swimmers);

      // Filtration recommendation
      const filtration = defaultFiltrationService.getFiltrationRecommendation(hour, swimmers, filtrationStatus);

      // Scheduled operational & maintenance tasks for this slot
      const otherTasks = this._deriveSlotMaintenanceTasks(hour, swimmers, isRain, index);

      // Combined manager rationale
      const rationale = this._compileRationale(staffing, filtration, otherTasks, swimmers, isRain);

      const lowMax = defaultFiltrationService.lowDemandMax || 15;
      const modMax = defaultFiltrationService.moderateDemandMax || 30;
      const highMax = defaultFiltrationService.highDemandMax || 45;

      let derivedDemand = 'Low';
      if (swimmers > highMax) derivedDemand = 'Very High';
      else if (swimmers > modMax) derivedDemand = 'High';
      else if (swimmers >= lowMax) derivedDemand = 'Moderate';

      return {
        slotIndex: index + 1,
        targetTime,
        timeLabel: formatSlotLabel(targetTime, baseDate),
        time12Hour: format12HourTime(targetTime),
        hour,
        day: feat.day || '--',
        expectedSwimmers: swimmers,
        demandLevel: derivedDemand,
        weather,
        rain: isRain,
        staffing: {
          summary: staffing.summary,
          lifeguards: staffing.lifeguards,
          operationalStaff: staffing.operationalStaff,
          totalStaff: staffing.totalStaff,
          status: staffing.status,
          rationale: staffing.rationale,
        },
        filtration: {
          stage: filtration.stage,
          bulbs: filtration.bulbs,
          recommendation: filtration.recommendation,
          mode: filtration.mode,
          requiresApproval: filtration.requiresApproval,
          executionStatus: filtration.executionStatus,
          rationale: filtration.rationale,
        },
        maintenance: {
          taskName: otherTasks.taskName,
          category: otherTasks.category,
          status: otherTasks.status,
          requiresApproval: otherTasks.requiresApproval,
        },
        rationale,
      };
    });

    // 2. Derive Prioritized Manager Action List
    const managerActions = this._deriveManagerActions(planRows, latestReading, latestOccupancy, filtrationStatus);

    return {
      generatedAt: new Date().toISOString(),
      planRows,
      managerActions,
      summary: this._generateOverallSummary(planRows, latestOccupancy),
    };
  }

  _deriveSlotMaintenanceTasks(hour, swimmers, isRain, index) {
    // Routine water quality test scheduled every 3-4 hours during operations
    if (index === 0 && hour >= 6 && hour < 22) {
      return {
        taskName: 'Water Quality Log (pH / Free Chlorine / Turbidity)',
        category: 'Quality Testing',
        status: 'Due Soon',
        requiresApproval: false,
      };
    }

    if (swimmers > 20) {
      return {
        taskName: 'Pre-Surge Deck Clear & First-Aid Kit Check',
        category: 'Safety Preparation',
        status: 'Scheduled',
        requiresApproval: false,
      };
    }

    if (isRain) {
      return {
        taskName: 'Rain Sump & Overflow Drain Verification',
        category: 'Drainage Check',
        status: 'Weather Triggered',
        requiresApproval: false,
      };
    }

    if (hour === 22 || hour === 23) {
      return {
        taskName: 'Night Deck Washdown & Chemical Cover Secure',
        category: 'Sanitation',
        status: 'Scheduled',
        requiresApproval: false,
      };
    }

    if (hour === 6 || hour === 7) {
      return {
        taskName: 'Morning Skimmer Basket Clean & Visual Pool Inspection',
        category: 'Daily Opening',
        status: 'Scheduled',
        requiresApproval: false,
      };
    }

    return {
      taskName: 'Routine Perimeter & Water Clarity Patrol',
      category: 'General Monitoring',
      status: 'Normal',
      requiresApproval: false,
    };
  }

  _compileRationale(staffing, filtration, maintenance, swimmers, isRain) {
    const parts = [];
    if (staffing.isOpen) {
      parts.push(`Staff: ${staffing.summary}.`);
    } else {
      parts.push('Facility closed for public swimming.');
    }

    parts.push(`Filtration: ${filtration.recommendation}.`);

    if (isRain) {
      parts.push('Precipitation forecast; monitor outdoor deck safety.');
    }

    return parts.join(' ');
  }

  _deriveManagerActions(planRows, latestReading, latestOccupancy, filtrationStatus) {
    const actions = [];
    let actionId = 1;

    // 1. Stale sensor telemetry check
    if (latestReading && latestReading.recorded_at) {
      const readingAgeMinutes = Math.round((Date.now() - new Date(latestReading.recorded_at).getTime()) / 60000);
      if (readingAgeMinutes > 45) {
        actions.push({
          id: actionId++,
          title: 'Investigate Stale Sensor Telemetry',
          description: `Last ESP32 sensor transmission was received ${readingAgeMinutes} minutes ago. Confirm gateway power and network connection.`,
          priority: 'High',
          category: 'Hardware & Sensor',
          timeframe: 'Immediate',
          source: 'public.sensor_readings',
          status: 'Action Required',
        });
      }
    } else {
      actions.push({
        id: actionId++,
        title: 'Connect ESP32 Sensor Hardware',
        description: 'No sensor observation recorded. Ingest telemetry via POST /api/pool-orchestrator/readings.',
        priority: 'High',
        category: 'Hardware & Sensor',
        timeframe: 'Setup Required',
        source: 'Telemetry Ingestion',
        status: 'Action Required',
      });
    }

    // 2. Peak demand staffing action
    if (planRows.length > 0) {
      const peakRow = planRows.reduce((max, r) => (r.expectedSwimmers > max.expectedSwimmers ? r : max), planRows[0]);
      if (peakRow.expectedSwimmers > 20) {
        actions.push({
          id: actionId++,
          title: `Roster Review for Peak Demand at ${peakRow.time12Hour}`,
          description: `Forecast projects peak load of ~${peakRow.expectedSwimmers} swimmers (${peakRow.demandLevel} demand). Verify ${peakRow.staffing.summary} are stationed prior to the session.`,
          priority: 'High',
          category: 'Staff Allocation',
          timeframe: `Before ${peakRow.time12Hour}`,
          source: 'Occupancy Forecast',
          status: 'Recommended',
        });
      }
    }

    // 3. Manager approval for high-rate filtration
    const highFiltrationSlot = planRows.find((r) => r.filtration.requiresApproval);
    if (highFiltrationSlot) {
      actions.push({
        id: actionId++,
        title: `Approve High-Rate Filtration for ${highFiltrationSlot.time12Hour}`,
        description: `Bather load triggers high-rate circulation recommendation (${highFiltrationSlot.expectedSwimmers} swimmers). Manager authorization required before relay activation.`,
        priority: 'Medium',
        category: 'Filtration Control',
        timeframe: highFiltrationSlot.time12Hour,
        source: 'Filtration Policy Rules',
        status: 'Awaiting Manager Approval',
      });
    }

    // 4. Routine Water Quality Inspection
    actions.push({
      id: actionId++,
      title: 'Conduct Scheduled Water Quality Test',
      description: 'Log standard 2-hour chemical check (target pH 7.2–7.6, free chlorine 1.5–3.0 ppm, water clarity) into operational log.',
      priority: 'Medium',
      category: 'Water Quality',
      timeframe: 'Within 2 hours',
      source: 'Operational Standards',
      status: 'Due Soon',
    });

    // 5. Weather / Rain monitoring if rainy
    const rainySlot = planRows.find((r) => r.rain);
    if (rainySlot) {
      actions.push({
        id: actionId++,
        title: `Weather Advisory: Rain Forecast at ${rainySlot.time12Hour}`,
        description: `Open-Meteo predicts rain (${rainySlot.weather}). Inspect outdoor drainage, ensure slip-resistant mats are deployed, and anticipate outdoor pool bather drop.`,
        priority: 'Low',
        category: 'Safety & Environment',
        timeframe: rainySlot.time12Hour,
        source: 'Open-Meteo API',
        status: 'Recommended',
      });
    }

    return actions;
  }

  _generateOverallSummary(planRows, latestOccupancy) {
    if (!planRows || planRows.length === 0) {
      return 'Forecast plan awaiting prediction generation.';
    }

    const peakRow = planRows.reduce((max, r) => (r.expectedSwimmers > max.expectedSwimmers ? r : max), planRows[0]);
    const maxSwimmers = peakRow.expectedSwimmers;
    const currentCount = latestOccupancy ? latestOccupancy.occupancy_count : null;

    let deltaText = '';
    if (currentCount !== null) {
      const diff = maxSwimmers - currentCount;
      if (diff > 0) deltaText = ` (+${diff} swimmers expected above current ${currentCount})`;
      else if (diff < 0) deltaText = ` (${Math.abs(diff)} fewer swimmers than current ${currentCount})`;
    }

    return `Peak swimmer load expected around ${peakRow.time12Hour} with ~${maxSwimmers} swimmers${deltaText}. Recommended staffing: ${peakRow.staffing.summary}.`;
  }
}

const defaultResourcePlanService = new PoolOrchestratorResourcePlanService();

module.exports = {
  PoolOrchestratorResourcePlanService,
  defaultResourcePlanService,
};
