/**
 * TimeManager - Centralized time management service for Mountain Time (America/Denver)
 *
 * Provides consistent time formatting and timezone handling across the application.
 * All dates are displayed in Mountain Time with appropriate timezone abbreviations.
 *
 * @class TimeManager
 */
class TimeManager {
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
   * Get current time in Mountain Time
   * @param {boolean} includeTimezone - Include timezone abbreviation (default: true)
   * @returns {string} Current time formatted in Mountain Time
   */
  getCurrentTime(includeTimezone = true) {
    return this.formatDateTime(new Date(), true);
  }

  /**
   * Get timezone information for Mountain Time
   * @returns {Object} Timezone information
   */
  getTimezoneInfo() {
    const now = new Date();
    const formatter = this._getFormatter({ timeZoneName: 'short' });
    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || 'MT';

    // Determine if currently in DST
    const january = new Date(now.getFullYear(), 0, 1);
    const july = new Date(now.getFullYear(), 6, 1);
    const stdOffset = Math.max(january.getTimezoneOffset(), july.getTimezoneOffset());
    const isDST = now.getTimezoneOffset() < stdOffset;

    return {
      timezone: this.timezone,
      abbreviation: timeZoneName,
      isDST,
      offsetHours: -now.getTimezoneOffset() / 60
    };
  }

  /**
   * Format duration between two dates
   * @param {string|Date} startDate - Start date
   * @param {string|Date} endDate - End date
   * @returns {string} Human-readable duration or 'Invalid duration' if parsing fails
   */
  formatDuration(startDate, endDate) {
    const start = this._parseDate(startDate);
    const end = this._parseDate(endDate);

    if (!start || !end) return 'Invalid duration';

    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return 'Invalid duration';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours === 0) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    }

    if (diffMinutes === 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    }

    return `${diffHours} hour${diffHours !== 1 ? 's' : ''}, ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }

  /**
   * Get countdown target date for Mountain Time events
   * Ensures proper timezone handling for countdown timers
   * @param {string} dateString - ISO date string (should include timezone)
   * @returns {Date} Date object properly configured for Mountain Time
   */
  getCountdownTargetDate(dateString) {
    const date = this._parseDate(dateString);
    if (!date) {
      throw new Error('Invalid countdown target date');
    }

    // Log for debugging
    if (typeof window !== 'undefined' && window.console) {
      const timezoneInfo = this.getTimezoneInfo();
      console.log('Countdown target date configured:', {
        input: dateString,
        parsed: date.toISOString(),
        mountainTime: this.formatDateTime(date),
        timezone: timezoneInfo
      });
    }

    return date;
  }

  /**
   * Clear formatter cache (useful for testing or memory management)
   */
  clearCache() {
    this.formatters.clear();
  }
}

// Export singleton instance
const timeManager = new TimeManager();

export default timeManager;

// Named exports for convenience
export const {
  formatEventTime,
  toMountainTime,
  formatDate,
  formatDateTime,
  getRegistrationDeadline,
  isExpired,
  getCurrentTime,
  getTimezoneInfo,
  formatDuration,
  getCountdownTargetDate
} = timeManager;