/**
 * Frontend time formatting utilities for Pool Orchestrator.
 * Strictly enforces Asia/Colombo timezone and consistent 12-hour clock (e.g. 1:00 PM, 2:00 PM, 10:30 PM).
 */

export const POOL_TIMEZONE = 'Asia/Colombo';

/**
 * Formats a Date or ISO string into standard 12-hour time: e.g. "1:00 PM", "10:30 PM".
 * Never returns 24-hour time or inconsistent formats.
 */
export function format12HourTime(dateOrIso, timeZone = POOL_TIMEZONE) {
  if (!dateOrIso) return '--';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--';

    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '--';
  }
}

/**
 * Formats a Date or ISO string into date and 12-hour time: e.g. "Oct 14, 2026 · 10:30 PM".
 */
export function formatDateWithTime(dateOrIso, timeZone = POOL_TIMEZONE) {
  if (!dateOrIso) return '--';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--';

    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '--';
  }
}

/**
 * Formats slot label with cross-midnight / day rollover indicator:
 * e.g. "11:00 PM" (if today) or "Tomorrow, 1:00 AM" / "Thu, 1:00 AM".
 */
export function formatSlotLabel(targetIso, baseIso = new Date(), timeZone = POOL_TIMEZONE) {
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
 * Formats relative time: e.g. "Just now", "4 min ago", "2 hr ago".
 */
export function formatRelativeTime(dateOrIso) {
  if (!dateOrIso) return 'No data recorded';
  try {
    const targetTime = new Date(dateOrIso).getTime();
    if (isNaN(targetTime)) return 'No data recorded';

    const diffSec = Math.round((Date.now() - targetTime) / 1000);
    if (diffSec < 0) return 'Just now';
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
    return `${Math.floor(diffSec / 86400)} d ago`;
  } catch {
    return 'Recently';
  }
}

/**
 * Returns the current time string in Asia/Colombo: e.g. "Wednesday, Oct 14, 2026 · 10:45 PM".
 */
export function getCurrentColomboTimeString(timeZone = POOL_TIMEZONE) {
  try {
    const now = new Date();
    const datePart = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(now);

    const timePart = format12HourTime(now, timeZone);
    return `${datePart} · ${timePart}`;
  } catch {
    return '--';
  }
}
