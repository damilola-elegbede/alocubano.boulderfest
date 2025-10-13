/**
 * Time Utilities - Server-side time management for Mountain Time (America/Denver)
 *
 * Provides consistent time formatting and timezone handling for API responses.
 * All dates are displayed in Mountain Time with appropriate timezone abbreviations.
 */

/**
 * TimeUtils - Server-side time management service
 */
class TimeUtils {
  constructor() {
    this.timezone = 'America/Denver';
    this.locale = 'en-US';

    // Cache formatters for performance
    this.formatters = new Map();
  }

  /**
   * Get or create a cached Intl.DateTimeFormat instance
   * @private
   * @param {Intl.DateTimeFormatOptions} options - Formatting options
   * @returns {Intl.DateTimeFormat} Cached formatter instance
   */
  _getFormatter(options) {
    const key = JSON.stringify(options);
    if (!this.formatters.has(key)) {
      this.formatters.set(key, new Intl.DateTimeFormat(this.locale, {
        timeZone: this.timezone,
        ...options
      }));
    }
    return this.formatters.get(key);
  }

  /**
   * Parse date string or Date object safely
   * @private
   * @param {string|Date|null|undefined} dateInput - Date to parse
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  _parseDate(dateInput) {
    if (!dateInput) return null;

    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }

    const parsed = new Date(dateInput);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Format event time with flexible options for Mountain Time display
   * @param {string|Date} dateString - Date to format
   * @param {Object} options - Formatting options
   * @param {boolean} options.includeTime - Include time in output (default: true)
   * @param {boolean} options.includeTimezone - Include timezone abbreviation (default: true)
   * @param {boolean} options.longFormat - Use long format for date (default: false)
   * @param {boolean} options.shortTime - Use short time format without seconds (default: true)
   * @returns {string} Formatted date string or 'Invalid Date' if parsing fails
   */
  formatEventTime(dateString, options = {}) {
    const date = this._parseDate(dateString);
    if (!date) return 'Invalid Date';

    const {
      includeTime = true,
      includeTimezone = true,
      longFormat = false,
      shortTime = true
    } = options;

    const formatOptions = {};

    // Date formatting
    if (longFormat) {
      formatOptions.weekday = 'long';
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
    } else {
      formatOptions.year = 'numeric';
      formatOptions.month = 'short';
      formatOptions.day = 'numeric';
    }

    // Time formatting
    if (includeTime) {
      formatOptions.hour = 'numeric';
      formatOptions.minute = '2-digit';
      if (!shortTime) {
        formatOptions.second = '2-digit';
      }
      formatOptions.hour12 = true;
    }

    // Timezone formatting
    if (includeTimezone && includeTime) {
      formatOptions.timeZoneName = 'short';
    }

    const formatter = this._getFormatter(formatOptions);
    return formatter.format(date);
  }

  /**
   * Convert any date to Mountain Time with full datetime display
   * @param {string|Date} date - Date to convert
   * @returns {string} Full datetime string in Mountain Time with timezone
   */
  toMountainTime(date) {
    return this.formatEventTime(date, {
      includeTime: true,
      includeTimezone: true,
      longFormat: false,
      shortTime: true
    });
  }

  /**
   * Format date only (no time) in Mountain Time
   * @param {string|Date} dateString - Date to format
   * @param {boolean} longFormat - Use long format (default: false)
   * @returns {string} Formatted date string or 'Invalid Date' if parsing fails
   */
  formatDate(dateString, longFormat = false) {
    return this.formatEventTime(dateString, {
      includeTime: false,
      includeTimezone: false,
      longFormat,
      shortTime: true
    });
  }

  /**
   * Format date and time in Mountain Time with timezone
   * @param {string|Date} dateString - Date to format
   * @param {boolean} shortTime - Use short time format (default: true)
   * @returns {string} Formatted datetime string or 'Invalid Date' if parsing fails
   */
  formatDateTime(dateString, shortTime = true) {
    return this.formatEventTime(dateString, {
      includeTime: true,
      includeTimezone: true,
      longFormat: false,
      shortTime
    });
  }

  /**
   * Calculate registration deadline based on hours from now in Mountain Time
   * @param {number} hours - Hours from current time
   * @returns {string} Formatted deadline string in Mountain Time
   */
  getRegistrationDeadline(hours) {
    if (typeof hours !== 'number' || hours < 0) {
      return 'Invalid deadline';
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    return this.formatDateTime(deadline);
  }

  /**
   * Check if a date has passed (is in the past) relative to Mountain Time
   * @param {string|Date} dateString - Date to check
   * @returns {boolean} True if date has passed, false otherwise (includes invalid dates)
   */
  isExpired(dateString) {
    const date = this._parseDate(dateString);
    if (!date) return false;

    const now = new Date();
    return date.getTime() < now.getTime();
  }

  /**
   * Check if a date has expired in Mountain Time (alias for isExpired)
   * @param {string|Date} dateString - Date to check
   * @returns {boolean} True if date has passed, false otherwise (includes invalid dates)
   */
  isExpiredInMountainTime(dateString) {
    return this.isExpired(dateString);
  }

  /**
   * Add hours to current time and return formatted Mountain Time string
   * @param {number} hours - Number of hours to add (can be negative)
   * @param {Object} options - Formatting options (same as formatEventTime)
   * @returns {string} Formatted date string in Mountain Time or 'Invalid hours' if input invalid
   */
  addHoursInMountainTime(hours, options = {}) {
    if (typeof hours !== 'number' || isNaN(hours)) {
      return 'Invalid hours';
    }

    const now = new Date();
    const futureDate = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    return this.formatEventTime(futureDate, {
      includeTime: true,
      includeTimezone: true,
      longFormat: false,
      shortTime: true,
      ...options
    });
  }

  /**
   * Calculate if a date is in DST for America/Denver timezone
   * Uses deterministic DST rules (platform-independent):
   * - DST starts: 2nd Sunday in March at 2:00 AM
   * - DST ends: 1st Sunday in November at 2:00 AM
   * @private
   * @param {Date} date - Date to check
   * @returns {boolean} True if date is in DST period
   */
  _isDSTForMountainTime(date) {
    const year = date.getFullYear();

    // Find 2nd Sunday in March (DST start)
    const marchFirst = new Date(Date.UTC(year, 2, 1, 9, 0, 0)); // March 1 at 2AM MST (9AM UTC)
    const marchFirstDay = marchFirst.getUTCDay();
    const dstStart = new Date(Date.UTC(year, 2, 8 + (7 - marchFirstDay) % 7, 9, 0, 0)); // 2nd Sunday at 2AM MST

    // Find 1st Sunday in November (DST end)
    const novemberFirst = new Date(Date.UTC(year, 10, 1, 8, 0, 0)); // Nov 1 at 2AM MDT (8AM UTC)
    const novemberFirstDay = novemberFirst.getUTCDay();
    const dstEnd = new Date(Date.UTC(year, 10, 1 + (7 - novemberFirstDay) % 7, 8, 0, 0)); // 1st Sunday at 2AM MDT

    const dateUTC = date.getTime();
    return dateUTC >= dstStart.getTime() && dateUTC < dstEnd.getTime();
  }

  /**
   * Get Mountain Time information for a given date
   * Platform-independent implementation using deterministic DST rules
   * @param {string|Date|null|undefined} date - Date to analyze (defaults to current time)
   * @returns {Object} Object with various Mountain Time formats and info
   */
  getMountainTimeInfo(date = null) {
    const targetDate = this._parseDate(date) || new Date();

    // Use deterministic DST calculation (platform-independent)
    const isDST = this._isDSTForMountainTime(targetDate);

    // Derive timezone abbreviation from DST status (platform-independent)
    const abbreviation = isDST ? 'MDT' : 'MST';

    // Calculate offset hours based on DST status
    // MST = UTC-7, MDT = UTC-6
    const offsetHours = isDST ? -6 : -7;

    return {
      timezone: this.timezone,
      abbreviation,
      isDST,
      offsetHours,
      formatted: {
        dateTime: this.formatEventTime(targetDate, { includeTime: true, includeTimezone: true }),
        dateOnly: this.formatEventTime(targetDate, { includeTime: false, includeTimezone: false }),
        timeOnly: this._getFormatter({ hour: 'numeric', minute: '2-digit', hour12: true }).format(targetDate),
        longFormat: this.formatEventTime(targetDate, { longFormat: true, includeTime: true, includeTimezone: true }),
        iso: targetDate.toISOString()
      }
    };
  }

  /**
   * Get current time in Mountain Time
   * @param {boolean} includeTimezone - Include timezone abbreviation (default: true)
   * @returns {string} Current time formatted in Mountain Time
   */
  getCurrentTime(includeTimezone = true) {
    return this.formatDateTime(new Date(), true);
  }

  /**
   * Get timezone information for Mountain Time
   * Platform-independent implementation using deterministic DST rules
   * @returns {Object} Timezone information
   */
  getTimezoneInfo() {
    const now = new Date();

    // Use deterministic DST calculation (platform-independent)
    const isDST = this._isDSTForMountainTime(now);

    // Derive timezone abbreviation from DST status (platform-independent)
    const abbreviation = isDST ? 'MDT' : 'MST';

    // Calculate offset hours based on DST status
    // MST = UTC-7, MDT = UTC-6
    const offsetHours = isDST ? -6 : -7;

    return {
      timezone: this.timezone,
      abbreviation,
      isDST,
      offsetHours
    };
  }

  /**
   * Add Mountain Time fields to an object with timestamp fields
   * @param {Object} obj - Object containing timestamp fields
   * @param {Array<string>} timestampFields - Array of field names that contain timestamps
   * @returns {Object} Enhanced object with Mountain Time fields
   */
  addMountainTimeFields(obj, timestampFields = ['created_at', 'updated_at']) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const enhanced = { ...obj };
    const timezoneInfo = this.getTimezoneInfo();

    // Add timezone information
    enhanced.timezone = timezoneInfo.timezone;

    // Process each timestamp field
    timestampFields.forEach(field => {
      if (enhanced[field]) {
        const mtFieldName = `${field}_mt`;
        enhanced[mtFieldName] = this.toMountainTime(enhanced[field]);
      }
    });

    return enhanced;
  }

  /**
   * Add registration deadline in Mountain Time
   * @param {Object} obj - Object to enhance
   * @param {number} hoursFromNow - Hours from current time for deadline
   * @returns {Object} Enhanced object with registration deadline
   */
  addRegistrationDeadline(obj, hoursFromNow = 24) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const enhanced = { ...obj };
    enhanced.registration_deadline_mt = this.getRegistrationDeadline(hoursFromNow);

    return enhanced;
  }

  /**
   * Enhance API response with Mountain Time information
   * @param {Object|Array} response - API response to enhance
   * @param {Array<string>} timestampFields - Fields that contain timestamps
   * @param {Object} options - Enhancement options
   * @param {boolean} options.includeDeadline - Include registration deadline
   * @param {number} options.deadlineHours - Hours for deadline calculation
   * @returns {Object|Array} Enhanced response
   */
  enhanceApiResponse(response, timestampFields = ['created_at', 'updated_at'], options = {}) {
    const { includeDeadline = false, deadlineHours = 24 } = options;

    if (Array.isArray(response)) {
      return response.map(item => {
        let enhanced = this.addMountainTimeFields(item, timestampFields);
        if (includeDeadline) {
          enhanced = this.addRegistrationDeadline(enhanced, deadlineHours);
        }
        return enhanced;
      });
    }

    if (response && typeof response === 'object') {
      let enhanced = this.addMountainTimeFields(response, timestampFields);
      if (includeDeadline) {
        enhanced = this.addRegistrationDeadline(enhanced, deadlineHours);
      }
      return enhanced;
    }

    return response;
  }

  /**
   * Clear formatter cache (useful for testing or memory management)
   */
  clearCache() {
    this.formatters.clear();
  }
}

// Export singleton instance
const timeUtils = new TimeUtils();

export default timeUtils;

// Named exports for convenience - properly bound to instance
export const formatEventTime = timeUtils.formatEventTime.bind(timeUtils);
export const toMountainTime = timeUtils.toMountainTime.bind(timeUtils);
export const formatDate = timeUtils.formatDate.bind(timeUtils);
export const formatDateTime = timeUtils.formatDateTime.bind(timeUtils);
export const formatMountainDateTime = timeUtils.formatDateTime.bind(timeUtils);
export const getRegistrationDeadline = timeUtils.getRegistrationDeadline.bind(timeUtils);
export const isExpired = timeUtils.isExpired.bind(timeUtils);
export const isExpiredInMountainTime = timeUtils.isExpiredInMountainTime.bind(timeUtils);
export const addHoursInMountainTime = timeUtils.addHoursInMountainTime.bind(timeUtils);
export const getMountainTimeInfo = timeUtils.getMountainTimeInfo.bind(timeUtils);
export const getCurrentTime = timeUtils.getCurrentTime.bind(timeUtils);
export const getCurrentMountainTime = timeUtils.getCurrentTime.bind(timeUtils);
export const getTimezoneInfo = timeUtils.getTimezoneInfo.bind(timeUtils);
export const addMountainTimeFields = timeUtils.addMountainTimeFields.bind(timeUtils);
export const addRegistrationDeadline = timeUtils.addRegistrationDeadline.bind(timeUtils);
export const enhanceApiResponse = timeUtils.enhanceApiResponse.bind(timeUtils);

// Alias formatEventTime as formatMountainTime for API clarity
export const formatMountainTime = timeUtils.formatEventTime.bind(timeUtils);

/*
=== USAGE EXAMPLES FOR API ENDPOINTS ===

// Example 1: Basic usage in API response
import { formatMountainTime, getMountainTimeInfo, isExpiredInMountainTime } from '../lib/time-utils.js';

export default async function handler(req, res) {
  const now = new Date();
  const eventDate = new Date('2026-05-15T19:00:00Z');

  res.json({
    current_time_mt: formatMountainTime(now),
    event_date_mt: formatMountainTime(eventDate),
    is_event_past: isExpiredInMountainTime(eventDate),
    timezone_info: getMountainTimeInfo()
  });
}

// Example 2: Enhanced API response with Mountain Time fields
import timeUtils from '../lib/time-utils.js';

export default async function handler(req, res) {
  const tickets = await getTicketsFromDatabase();

  // Automatically add Mountain Time fields to all timestamp fields
  const enhancedTickets = timeUtils.enhanceApiResponse(tickets,
    ['created_at', 'updated_at', 'event_date'],
    { includeDeadline: true, deadlineHours: 24 }
  );

  res.json({ tickets: enhancedTickets });
}

// Example 3: Registration deadline calculation
import { addHoursInMountainTime, getRegistrationDeadline } from '../lib/time-utils.js';

export default async function handler(req, res) {
  const registrationDeadline = getRegistrationDeadline(48); // 48 hours from now
  const customDeadline = addHoursInMountainTime(72, { longFormat: true });

  res.json({
    deadline_mt: registrationDeadline,
    custom_deadline_mt: customDeadline
  });
}

// Example 4: Comprehensive ticket response
import timeUtils, { formatMountainTime, isExpiredInMountainTime } from '../lib/time-utils.js';

export default async function handler(req, res) {
  const ticket = await getTicketById(req.query.id);

  res.json({
    ...ticket,
    // Add Mountain Time formatted fields
    created_at_mt: formatMountainTime(ticket.created_at),
    event_date_mt: formatMountainTime(ticket.event_date, { longFormat: true }),

    // Add expiry check
    is_expired: isExpiredInMountainTime(ticket.event_date),

    // Add comprehensive time info
    time_info: timeUtils.getMountainTimeInfo(ticket.event_date),

    // Add registration deadline
    registration_deadline_mt: timeUtils.getRegistrationDeadline(24)
  });
}
*/