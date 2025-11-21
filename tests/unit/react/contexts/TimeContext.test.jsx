/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TimeProvider } from '../../../../src/contexts/TimeContext.jsx';
import { useTimeManager } from '../../../../src/hooks/useTimeManager.js';

// Test component that uses the time context
function TestComponent() {
    const {
        formatDateTime,
        formatDate,
        getCurrentTime,
        isExpired,
        getTimezoneInfo
    } = useTimeManager();

    const testDate = '2026-05-15T19:00:00Z';
    const formattedDateTime = formatDateTime(testDate);
    const formattedDate = formatDate(testDate);
    const currentTime = getCurrentTime();
    const expired = isExpired(testDate);
    const tzInfo = getTimezoneInfo();

    return (
        <div>
            <div data-testid="formatted-datetime">{formattedDateTime}</div>
            <div data-testid="formatted-date">{formattedDate}</div>
            <div data-testid="current-time">{currentTime}</div>
            <div data-testid="is-expired">{expired ? 'true' : 'false'}</div>
            <div data-testid="timezone-abbr">{tzInfo.abbreviation}</div>
        </div>
    );
}

describe('TimeContext', () => {
    describe('Provider Rendering', () => {
        it('should render children without crashing', () => {
            render(
                <TimeProvider>
                    <div data-testid="child">Child Content</div>
                </TimeProvider>
            );

            expect(screen.getByTestId('child')).toBeInTheDocument();
            expect(screen.getByTestId('child')).toHaveTextContent('Child Content');
        });

        it('should provide time utilities to children', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            expect(screen.getByTestId('formatted-datetime')).toBeInTheDocument();
            expect(screen.getByTestId('formatted-date')).toBeInTheDocument();
        });
    });

    describe('Time Formatting', () => {
        it('should format datetime in Mountain Time', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            const formattedDateTime = screen.getByTestId('formatted-datetime').textContent;
            // Should contain "May 15, 2026" and timezone indicator
            expect(formattedDateTime).toContain('May 15, 2026');
            expect(formattedDateTime).toMatch(/MDT|MST/); // Mountain Time abbreviation
        });

        it('should format date only', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            const formattedDate = screen.getByTestId('formatted-date').textContent;
            // Should contain "May 15, 2026"
            expect(formattedDate).toContain('May 15, 2026');
        });

        it('should provide current time', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            const currentTime = screen.getByTestId('current-time').textContent;
            // Should be a formatted datetime string
            expect(currentTime).toBeTruthy();
            expect(currentTime.length).toBeGreaterThan(0);
        });
    });

    describe('Timezone Information', () => {
        it('should provide Mountain Time timezone info', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            const tzAbbr = screen.getByTestId('timezone-abbr').textContent;
            // Should be either MDT (daylight) or MST (standard)
            expect(['MDT', 'MST']).toContain(tzAbbr);
        });
    });

    describe('Date Utilities', () => {
        it('should check if date is expired', () => {
            render(
                <TimeProvider>
                    <TestComponent />
                </TimeProvider>
            );

            const isExpired = screen.getByTestId('is-expired').textContent;
            // Event is in 2026, should not be expired
            expect(isExpired).toBe('false');
        });
    });
});
