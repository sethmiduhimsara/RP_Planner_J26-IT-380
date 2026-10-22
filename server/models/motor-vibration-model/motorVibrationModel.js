const supabase = require('../../config/supabaseClient');

/**
 * Motor Vibration Supabase Data Access Model
 * Database: Supabase PostgreSQL
 * Table: motor_vibration_logs
 */
const MotorVibrationModel = {
  /**
   * Save an incoming telemetry record to Supabase
   */
  async insertTelemetry(data) {
    if (!supabase) return null;
    return await supabase.from('motor_vibration_logs').insert([
      {
        device_id: data.deviceId,
        vibration: data.vibration,
        smoothed_vibration: data.smoothedVibration,
        axis_x: data.axes?.x ?? 0.0,
        axis_y: data.axes?.y ?? 0.0,
        axis_z: data.axes?.z ?? 0.0,
        status: data.status,
        confidence: data.confidence,
        fault_counter: data.faultCounter,
        is_alarm: data.isAlarm,
        created_at: data.timestamp,
      },
    ]);
  },

  /**
   * Query the most recent telemetry logs from Supabase
   */
  async getRecentHistory(limit = 50) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('motor_vibration_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[MotorVibrationModel] Supabase query notice:', error.message);
      return [];
    }
    return data || [];
  },
};

module.exports = MotorVibrationModel;
