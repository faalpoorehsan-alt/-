// Persian/Jalali date utilities and logic helpers

/**
 * Formats a Date object into a nice Persian date string (e.g. "پنجشنبه, ۱۹ تیر ۱۴۰۵")
 */
export function formatPersianDateFull(date: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      calendar: "persian",
      dateStyle: "full",
    }).format(date);
  } catch (e) {
    return date.toLocaleDateString("fa-IR");
  }
}

/**
 * Formats a Date object into a short Persian date string (e.g. "۱۴۰۵/۰۴/۱۹")
 */
export function formatPersianDateShort(date: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      calendar: "persian",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch (e) {
    return date.toLocaleDateString("fa-IR");
  }
}

/**
 * Formats a Date object into a nice Persian time string (e.g. "۱۴:۳۰")
 */
export function formatPersianTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch (e) {
    return date.toLocaleTimeString("fa-IR");
  }
}

/**
 * Formats a Date object into a nice Persian date and time string (e.g. "۱۴۰۵/۰۴/۱۹ ساعت ۱۴:۳۰")
 */
export function formatPersianDateTime(date: Date): string {
  const dateStr = formatPersianDateShort(date);
  const timeStr = formatPersianTime(date);
  return `${dateStr} ساعت ${timeStr}`;
}

/**
 * Determines which delivery date should be active on the dashboard.
 * If current time is past the cutoff (e.g., 8:00 PM / 20:00), we show tomorrow's orders.
 * Otherwise, we show today's orders.
 */
export function getActiveDeliveryDate(cutoffHour: number, cutoffMinute: number, customDate?: Date): Date {
  const now = customDate || new Date();
  const cutoffTime = new Date(now);
  cutoffTime.setHours(cutoffHour, cutoffMinute, 0, 0);

  const activeDate = new Date(now);
  if (now >= cutoffTime) {
    // Past cutoff, show tomorrow's deliveries
    activeDate.setDate(activeDate.getDate() + 1);
  }
  // Otherwise, keep showing today's deliveries
  return activeDate;
}

/**
 * Formats a date to YYYY-MM-DD for stable comparison
 */
export function getStableDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Gets the delivery date for an order received at a specific time.
 * If received today before the cutoff hour, the default target delivery is tomorrow (receivedDate + 1 day).
 * If received today after the cutoff hour, tomorrow's delivery list is already locked, so target delivery is the day after tomorrow (receivedDate + 2 days).
 */
export function getDeliveryDateForOrderReceivedAt(
  receivedDate: Date,
  cutoffHour: number = 20,
  cutoffMinute: number = 0
): Date {
  const target = new Date(receivedDate);
  const cutoffTime = new Date(receivedDate);
  cutoffTime.setHours(cutoffHour, cutoffMinute, 0, 0);

  if (receivedDate >= cutoffTime) {
    // Past cutoff time, target delivery is the day after tomorrow
    target.setDate(target.getDate() + 2);
  } else {
    // Before cutoff time, target delivery is tomorrow
    target.setDate(target.getDate() + 1);
  }
  return target;
}
