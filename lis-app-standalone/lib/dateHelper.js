/**
 * ============================================================================
 * GEZYNE LIS - PHILIPPINE TIMEZONE NORMALIZATION HELPER (STANDALONE)
 * ============================================================================
 * 
 * Provides consistent date handling in Asia/Manila (UTC+8).
 * Prevents morning-shift clinical record disappearance caused by raw UTC
 * `.toISOString().slice(0, 10)` which falls on the previous calendar day
 * between 12:00 AM and 7:59 AM Manila time.
 */

const MANILA_TZ = 'Asia/Manila';

const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Returns YYYY-MM-DD string for a given date in Asia/Manila (UTC+8)
 * @param {Date|string|number} dateInput
 * @returns {string} YYYY-MM-DD or empty string
 */
function toManilaDateString(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  try {
    return manilaDateFormatter.format(d);
  } catch (_) {
    // Fallback if Intl fails
    const utc = d.getTime() + (8 * 60 * 60 * 1000);
    return new Date(utc).toISOString().slice(0, 10);
  }
}

/**
 * Returns today's YYYY-MM-DD in Asia/Manila
 * @returns {string} YYYY-MM-DD
 */
function getTodayManilaString() {
  return toManilaDateString(new Date());
}

/**
 * Check if two dates/timestamps fall on the same day in Asia/Manila
 * @param {Date|string|number} date1
 * @param {Date|string|number} date2
 * @returns {boolean}
 */
function isSameManilaDay(date1, date2) {
  const s1 = toManilaDateString(date1);
  const s2 = toManilaDateString(date2);
  return Boolean(s1 && s2 && s1 === s2);
}

module.exports = {
  toManilaDateString,
  getTodayManilaString,
  isSameManilaDay,
  MANILA_TZ
};

