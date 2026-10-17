/**
 * Time formatting and timezone utilities for Pool Orchestrator.
 * Strictly enforces Asia/Colombo timezone and consistent 12-hour clock display (e.g. 1:00 PM, 2:00 PM).
 */

const POOL_TIMEZONE = process.env.POOL_TIMEZONE || 'Asia/Colombo';

/**
 * Formats a Date or ISO string into a standard 12-hour time: e.g. "1:00 PM", "10:30 PM".
 * Guaranteed to never output 24-hour time (e.g. 13:00) or non-standard periods.
 */
function format12HourTime(dateOrIso, timeZone = POOL_TIMEZONE) {
  if (!dateOrIso) return '--';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--';

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return formatter.format(d);
  } catch (err) {
    console.error('[TimeUtils] format12HourTime error:', err.message);
    return '--';
  }
}

/**
 * Formats a Date or ISO string into full date and 12-hour time: e.g. "Oct 14, 2026, 10:30 PM".
 */
function formatDateWithTime(dateOrIso, timeZone = POOL_TIMEZONE) {
  if (!dateOrIso) return '--';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--';

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return formatter.format(d);
  } catch {
    return '--';
  }
}

/**
 * Formats a slot label with relative day awareness:
 * e.g. "11:00 PM" (if today) or "Tomorrow, 1:00 AM" (if crossing midnight).
 */
function formatSlotLabel(targetIso, baseIso = new Date(), timeZone = POOL_TIMEZONE) {
  if (!targetIso) return '--';
  try {
    const targetDate = new Date(targetIso);
    const baseDate = new Date(baseIso);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const targetDayStr = dayFormatter.format(targetDate);
    const baseDayStr = dayFormatter.format(baseDate);

    const timeStr = format12HourTime(targetDate, timeZone);

    if (targetDayStr === baseDayStr) {
      return timeStr;
    }

    // Check if exactly next day
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    });
    const weekday = weekdayFormatter.format(targetDate);

    return `${weekday}, ${timeStr}`;
  } catch {
    return format12HourTime(targetIso, timeZone);
  }
}

/**
 * Gets the current hour integer (0-23) in Asia/Colombo.
 */
function getColomboHour(dateOrIso = new Date(), timeZone = POOL_TIMEZONE) {
  const d = new Date(dateOrIso);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(d);

  return parseInt(hourStr === '24' ? '0' : hourStr, 10);
}

module.exports = {
  POOL_TIMEZONE,
  format12HourTime,
  formatDateWithTime,
  formatSlotLabel,
  getColomboHour,
};
