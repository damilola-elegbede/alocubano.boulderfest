/**
 * TimeContext - React bridge to legacy time-manager.js
 *
 * Provides React components with access to Mountain Time formatting utilities.
 * Does NOT reimplement time logic - simply exposes the singleton timeManager.
 *
 * Legacy System: js/time-manager.js
 * - Singleton providing Mountain Time (America/Denver) formatting
 * - Wraps Intl.DateTimeFormat with timezone configuration
 * - All dates stored as UTC, displayed as Mountain Time
 * - No events (stateless utility functions)
 *
 * Usage:
 *   import { TimeProvider } from './contexts/TimeContext';
 *   import { useTimeManager } from './hooks/useTimeManager';
 *
 *   <TimeProvider>
 *     <App />
 *   </TimeProvider>
 */

import React, { createContext } from 'react';
import timeManager from '../../js/time-manager.js';

export const TimeContext = createContext(null);

export function TimeProvider({ children }) {
    // Simply expose the timeManager singleton
    // No state needed - all methods are stateless formatters
    const value = {
        timeManager,
        // Convenience: expose methods directly
        formatEventTime: timeManager.formatEventTime.bind(timeManager),
        toMountainTime: timeManager.toMountainTime.bind(timeManager),
        formatDate: timeManager.formatDate.bind(timeManager),
        formatDateTime: timeManager.formatDateTime.bind(timeManager),
        formatDuration: timeManager.formatDuration.bind(timeManager),
        getCurrentTime: timeManager.getCurrentTime.bind(timeManager),
        getTimezoneInfo: timeManager.getTimezoneInfo.bind(timeManager),
        isExpired: timeManager.isExpired.bind(timeManager),
        getRegistrationDeadline: timeManager.getRegistrationDeadline.bind(timeManager),
        getCountdownTargetDate: timeManager.getCountdownTargetDate.bind(timeManager)
    };

    return (
        <TimeContext.Provider value={value}>
            {children}
        </TimeContext.Provider>
    );
}
