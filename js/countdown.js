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
      // Check if string has explicit timezone (Z or +/-HH:MM at end)
      const hasExplicitTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(targetDate);

      if (hasExplicitTimezone) {
        date = new Date(targetDate);
      } else {
        // No explicit timezone - assume Mountain Time
        // Parse the date parts to determine DST for the TARGET date, not current date
        const [datePart, timePart = '00:00:00'] = targetDate.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour = 0] = timePart.split(':').map(Number);

        // Check DST for the target date, not today
        const isDST = this._isDaylightSavingTime({ year, month, day, hour });
        // Mountain Daylight Time (MDT) is UTC-6, Mountain Standard Time (MST) is UTC-7
        const offset = isDST ? '-06:00' : '-07:00';

        const normalized = targetDate.includes('T') ? targetDate : `${targetDate}T00:00:00`;
        date = new Date(`${normalized}${offset}`);
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
   * @param {Object|Date} dateOrParts - Date object or {year, month, day, hour} parts
   * @returns {boolean} True if date is in DST
   */
  _isDaylightSavingTime(dateOrParts) {
    // US DST: Second Sunday in March @ 02:00 to First Sunday in November @ 02:00 (local)
    let year, month, day, hour;

    if (dateOrParts instanceof Date) {
      year = dateOrParts.getFullYear();
      month = dateOrParts.getMonth() + 1; // Convert to 1-based
      day = dateOrParts.getDate();
      hour = dateOrParts.getHours();
    } else {
      ({ year, month, day, hour = 0 } = dateOrParts);
    }

    // Calculate second Sunday in March
    const march1Dow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const dstStartDay = ((7 - march1Dow) % 7) + 8; // Second Sunday in March

    // Calculate first Sunday in November
    const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    const dstEndDay = ((7 - nov1Dow) % 7) + 1; // First Sunday in November

    // Check if date is in DST period
    if (month < 3 || month > 11) return false;
    if (month > 3 && month < 11) return true;
    if (month === 3) return day > dstStartDay || (day === dstStartDay && hour >= 2);
    // month === 11
    return day < dstEndDay || (day === dstEndDay && hour < 2);
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
   * @param {Object} [timeRemaining] - Pre-calculated time remaining (avoids recalculation)
   * @param {Object} [formatted] - Pre-formatted countdown values (avoids recalculation)
   */
  updateDisplay(elements, timeRemaining = null, formatted = null) {
    // Use provided values or calculate fresh
    const time = timeRemaining || this.getTimeRemaining();
    const fmt = formatted || this.formatCountdown(time);

    if (elements.days) {
      elements.days.textContent = fmt.days;
    }
    if (elements.hours) {
      elements.hours.textContent = fmt.hours;
    }
    if (elements.minutes) {
      elements.minutes.textContent = fmt.minutes;
    }
    if (elements.seconds) {
      elements.seconds.textContent = fmt.seconds;
    }

    // Update timezone display if requested and element exists
    if (this.options.showTimezone && elements.timezone) {
      const timezoneInfo = timeManager.getTimezoneInfo();
      elements.timezone.textContent = `(Mountain Time - ${timezoneInfo.abbreviation})`;
    }

    // Note: Callbacks (onUpdate/onComplete) are triggered by start() interval,
    // NOT here, to prevent infinite recursion when onUpdate calls updateDisplay.
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
      // Pass pre-calculated values to avoid infinite recursion
      timer.updateDisplay(elements, timeRemaining, formatted);
      if (options.onUpdate) {
        options.onUpdate(timeRemaining, formatted);
      }
    },
    onComplete: () => {
      // Final display update on completion
      timer.updateDisplay(elements);
      if (options.onComplete) {
        options.onComplete();
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
 * @deprecated This event has passed (Nov 15, 2025). Use createBoulderFest2026Countdown instead.
 * @param {Object} elementIds - Element IDs for countdown display
 * @param {Object} [options] - Additional options
 * @returns {CountdownTimer} Countdown timer instance (will show "expired")
 */
export function createWeekender2025Countdown(elementIds, options = {}) {
  // Note: This event has passed. Left for historical reference.
  // November 15, 2025 at 7:00 PM Mountain Time
  // November is during Standard Time, so use -07:00 (MST offset)
  console.warn('createWeekender2025Countdown: This event has passed. Use createBoulderFest2026Countdown instead.');
  return createCountdown('2025-11-15T19:00:00-07:00', elementIds, options);
}

export default CountdownTimer;