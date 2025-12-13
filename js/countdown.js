/**
 * Countdown Timer Implementation for Mountain Time Events
 *
 * Provides consistent countdown functionality across all pages with:
 * - Mountain Time timezone handling
 * - User timezone awareness
 * - Consistent formatting
 * - Automatic timezone display
 *
 * @module CountdownTimer
 */

import timeManager from './time-manager.js';

/**
 * Creates and manages a countdown timer to a specific Mountain Time event
 * @class CountdownTimer
 */
class CountdownTimer {
  constructor(targetDate, options = {}) {
    this.targetDate = this._parseTargetDate(targetDate);
    this.options = {
      showTimezone: true,
      autoStart: true,
      updateInterval: 1000,
      onUpdate: null,
      onComplete: null,
      ...options
    };

    this.intervalId = null;
    this.isRunning = false;

    if (this.options.autoStart) {
      this.start();
    }
  }

  /**
   * Parse and validate target date, ensuring Mountain Time interpretation
   * @private
   * @param {string|Date} targetDate - Target date for countdown
   * @returns {Date} Parsed date object
   * @throws {Error} If date is invalid
   */
  _parseTargetDate(targetDate) {
    let date;

    if (typeof targetDate === 'string') {
      // If string doesn't include timezone, assume Mountain Time
      if (!targetDate.includes('T') || (!targetDate.includes('-') && !targetDate.includes('+'))) {
        // Add Mountain Time offset for proper interpretation
        // Use -07:00 for DST (Mar-Nov) or -06:00 for Standard Time (Nov-Mar)
        const now = new Date();
        const isDST = this._isDaylightSavingTime(now);
        const offset = isDST ? '-07:00' : '-06:00';

        if (targetDate.includes('T')) {
          date = new Date(targetDate + offset);
        } else {
          date = new Date(targetDate + 'T00:00:00' + offset);
        }
      } else {
        date = new Date(targetDate);
      }
    } else if (targetDate instanceof Date) {
      date = targetDate;
    } else {
      throw new Error('Invalid target date format');
    }

    if (isNaN(date.getTime())) {
      throw new Error('Invalid target date');
    }

    return date;
  }

  /**
   * Check if a date is in Daylight Saving Time for Mountain Time
   * @private
   * @param {Date} date - Date to check
   * @returns {boolean} True if date is in DST
   */
  _isDaylightSavingTime(date) {
    // DST in US: Second Sunday in March to First Sunday in November
    const year = date.getFullYear();

    // Second Sunday in March
    const march = new Date(year, 2, 1);
    const dstStart = new Date(year, 2, (14 - march.getDay()) % 7 + 8);

    // First Sunday in November
    const november = new Date(year, 10, 1);
    const dstEnd = new Date(year, 10, (7 - november.getDay()) % 7 + 1);

    return date >= dstStart && date < dstEnd;
  }

  /**
   * Calculate time remaining until target date
   * @returns {Object} Object with days, hours, minutes, seconds, and total milliseconds
   */
  getTimeRemaining() {
    const now = new Date();
    const difference = this.targetDate.getTime() - now.getTime();

    if (difference <= 0) {
      return {
        total: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        expired: true
      };
    }

    return {
      total: difference,
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((difference % (1000 * 60)) / 1000),
      expired: false
    };
  }

  /**
   * Format countdown values with padding
   * @param {Object} timeRemaining - Time remaining object from getTimeRemaining()
   * @returns {Object} Formatted countdown values
   */
  formatCountdown(timeRemaining) {
    return {
      days: String(timeRemaining.days).padStart(3, '0'),
      hours: String(timeRemaining.hours).padStart(2, '0'),
      minutes: String(timeRemaining.minutes).padStart(2, '0'),
      seconds: String(timeRemaining.seconds).padStart(2, '0'),
      expired: timeRemaining.expired
    };
  }

  /**
   * Update countdown display elements
   * @param {Object} elements - DOM elements to update
   * @param {HTMLElement} elements.days - Days display element
   * @param {HTMLElement} elements.hours - Hours display element
   * @param {HTMLElement} elements.minutes - Minutes display element
   * @param {HTMLElement} elements.seconds - Seconds display element
   * @param {HTMLElement} [elements.timezone] - Timezone display element
   */
  updateDisplay(elements) {
    const timeRemaining = this.getTimeRemaining();
    const formatted = this.formatCountdown(timeRemaining);

    if (elements.days) {
      elements.days.textContent = formatted.days;
    }
    if (elements.hours) {
      elements.hours.textContent = formatted.hours;
    }
    if (elements.minutes) {
      elements.minutes.textContent = formatted.minutes;
    }
    if (elements.seconds) {
      elements.seconds.textContent = formatted.seconds;
    }

    // Update timezone display if requested and element exists
    if (this.options.showTimezone && elements.timezone) {
      const timezoneInfo = timeManager.getTimezoneInfo();
      elements.timezone.textContent = `(Mountain Time - ${timezoneInfo.abbreviation})`;
    }

    // Call custom update callback
    if (this.options.onUpdate) {
      this.options.onUpdate(timeRemaining, formatted);
    }

    // Handle countdown completion
    if (timeRemaining.expired) {
      this.stop();
      if (this.options.onComplete) {
        this.options.onComplete();
      }
    }
  }

  /**
   * Start the countdown timer
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      // For manual updates, user needs to call updateDisplay separately
      if (this.options.onUpdate || this.options.onComplete) {
        const timeRemaining = this.getTimeRemaining();
        const formatted = this.formatCountdown(timeRemaining);

        if (this.options.onUpdate) {
          this.options.onUpdate(timeRemaining, formatted);
        }

        if (timeRemaining.expired) {
          this.stop();
          if (this.options.onComplete) {
            this.options.onComplete();
          }
        }
      }
    }, this.options.updateInterval);
  }

  /**
   * Stop the countdown timer
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Get target date formatted in Mountain Time
   * @returns {string} Formatted target date
   */
  getFormattedTargetDate() {
    return timeManager.formatDateTime(this.targetDate);
  }

  /**
   * Create timezone display text
   * @returns {string} Timezone display text
   */
  getTimezoneDisplay() {
    const timezoneInfo = timeManager.getTimezoneInfo();
    return `Mountain Time (${timezoneInfo.abbreviation})`;
  }
}

/**
 * Utility function to create a simple countdown timer with DOM element updates
 * @param {string|Date} targetDate - Target date for countdown
 * @param {Object} elementIds - Object with element IDs for countdown display
 * @param {string} elementIds.days - ID of days element
 * @param {string} elementIds.hours - ID of hours element
 * @param {string} elementIds.minutes - ID of minutes element
 * @param {string} elementIds.seconds - ID of seconds element
 * @param {string} [elementIds.timezone] - ID of timezone element
 * @param {Object} [options] - Additional options
 * @returns {CountdownTimer} Countdown timer instance
 */
export function createCountdown(targetDate, elementIds, options = {}) {
  const elements = {
    days: document.getElementById(elementIds.days),
    hours: document.getElementById(elementIds.hours),
    minutes: document.getElementById(elementIds.minutes),
    seconds: document.getElementById(elementIds.seconds),
    timezone: elementIds.timezone ? document.getElementById(elementIds.timezone) : null
  };

  const timer = new CountdownTimer(targetDate, {
    ...options,
    onUpdate: (timeRemaining, formatted) => {
      timer.updateDisplay(elements);
      if (options.onUpdate) {
        options.onUpdate(timeRemaining, formatted);
      }
    }
  });

  // Initial display update
  timer.updateDisplay(elements);

  return timer;
}

/**
 * Utility function to create countdown for Boulder Fest 2026
 * @param {Object} elementIds - Element IDs for countdown display
 * @param {Object} [options] - Additional options
 * @returns {CountdownTimer} Countdown timer instance
 */
export function createBoulderFest2026Countdown(elementIds, options = {}) {
  // May 15, 2026 at midnight Mountain Time (event start)
  // May is during DST, so use -06:00 (MDT offset, which is UTC-6 due to DST)
  // Note: Mountain Standard Time is UTC-7, Mountain Daylight Time is UTC-6
  return createCountdown('2026-05-15T00:00:00-06:00', elementIds, options);
}

/**
 * Utility function to create countdown for Weekender November 2025
 * @param {Object} elementIds - Element IDs for countdown display
 * @param {Object} [options] - Additional options
 * @returns {CountdownTimer} Countdown timer instance
 */
export function createWeekender2025Countdown(elementIds, options = {}) {
  // November 15, 2025 at 7:00 PM Mountain Time (example event start)
  // November is during Standard Time, so use -07:00 (MST offset)
  return createCountdown('2025-11-15T19:00:00-07:00', elementIds, options);
}

export default CountdownTimer;