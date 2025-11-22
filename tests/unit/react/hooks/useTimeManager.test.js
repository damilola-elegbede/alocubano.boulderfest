/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { TimeProvider } from '../../../../src/contexts/TimeContext.jsx';
import { useTimeManager } from '../../../../src/hooks/useTimeManager.js';

describe('useTimeManager', () => {
    describe('Hook Behavior', () => {
        it('should return time manager methods', () => {
            const { result } = renderHook(() => useTimeManager(), {
                wrapper: TimeProvider
            });

            expect(result.current).toHaveProperty('timeManager');
            expect(result.current).toHaveProperty('formatEventTime');
            expect(result.current).toHaveProperty('toMountainTime');
            expect(result.current).toHaveProperty('formatDate');
            expect(result.current).toHaveProperty('formatDateTime');
            expect(result.current).toHaveProperty('formatDuration');
            expect(result.current).toHaveProperty('getCurrentTime');
            expect(result.current).toHaveProperty('getTimezoneInfo');
            expect(result.current).toHaveProperty('isExpired');
            expect(result.current).toHaveProperty('getRegistrationDeadline');
            expect(result.current).toHaveProperty('getCountdownTargetDate');
        });

        it('should return functions for all methods', () => {
            const { result } = renderHook(() => useTimeManager(), {
                wrapper: TimeProvider
            });

            expect(typeof result.current.formatEventTime).toBe('function');
            expect(typeof result.current.toMountainTime).toBe('function');
            expect(typeof result.current.formatDate).toBe('function');
            expect(typeof result.current.formatDateTime).toBe('function');
            expect(typeof result.current.formatDuration).toBe('function');
            expect(typeof result.current.getCurrentTime).toBe('function');
            expect(typeof result.current.getTimezoneInfo).toBe('function');
            expect(typeof result.current.isExpired).toBe('function');
            expect(typeof result.current.getRegistrationDeadline).toBe('function');
            expect(typeof result.current.getCountdownTargetDate).toBe('function');
        });

        it('should format dates in Mountain Time', () => {
            const { result } = renderHook(() => useTimeManager(), {
                wrapper: TimeProvider
            });

            const testDate = '2026-05-15T19:00:00Z';
            const formatted = result.current.formatDateTime(testDate);

            expect(formatted).toBeTruthy();
            expect(formatted).toContain('May 15, 2026');
            expect(formatted).toMatch(/MDT|MST/);
        });

        it('should provide timezone information', () => {
            const { result } = renderHook(() => useTimeManager(), {
                wrapper: TimeProvider
            });

            const tzInfo = result.current.getTimezoneInfo();

            expect(tzInfo).toHaveProperty('timezone');
            expect(tzInfo).toHaveProperty('abbreviation');
            expect(tzInfo).toHaveProperty('isDST');
            expect(tzInfo).toHaveProperty('offsetHours');
            expect(['MDT', 'MST']).toContain(tzInfo.abbreviation);
        });

        it('should check if date is expired', () => {
            const { result } = renderHook(() => useTimeManager(), {
                wrapper: TimeProvider
            });

            const futureDate = '2026-05-15T19:00:00Z';
            const pastDate = '2020-01-01T00:00:00Z';

            expect(result.current.isExpired(futureDate)).toBe(false);
            expect(result.current.isExpired(pastDate)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should throw error when used outside TimeProvider', () => {
            // Suppress console.error for this test
            const originalError = console.error;
            console.error = () => {};

            expect(() => {
                renderHook(() => useTimeManager());
            }).toThrow('useTimeManager must be used within a TimeProvider');

            console.error = originalError;
        });
    });
});
