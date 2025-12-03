/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EventProvider, EventContext } from '../../../../src/contexts/EventContext.jsx';
import { useEvent } from '../../../../src/hooks/useEvent.js';

// Mock the event data imports
vi.mock('../../../../src/data/events/boulder-fest-2025.js', () => ({
    boulderFest2025: {
        eventType: 'boulder-fest',
        year: '2025',
        title: 'Boulder Fest 2025',
        subtitle: 'May 15-17, 2025',
        dates: { start: '2025-05-15', end: '2025-05-17' },
        pages: ['overview', 'artists', 'schedule', 'gallery'],
        heroImage: '/images/hero/boulder-fest-2025-hero.jpg',
        heroAlt: 'Boulder Fest 2025 hero',
        venue: { name: 'Avalon Ballroom', address: '123 Main St' },
        hasGallery: true,
        hasSchedule: true,
        isComingSoon: false,
        artists: [{ id: 'artist-1', name: 'Test Artist' }],
        djs: [{ id: 'dj-1', name: 'Test DJ' }],
        schedule: [{ day: 'Friday', items: [] }],
        socialLinks: { instagram: 'https://instagram.com/test' },
    },
}));

vi.mock('../../../../src/data/events/boulder-fest-2026.js', () => ({
    boulderFest2026: {
        eventType: 'boulder-fest',
        year: '2026',
        title: 'Boulder Fest 2026',
        subtitle: 'May 15-17, 2026',
        dates: { start: '2026-05-15', end: '2026-05-17' },
        pages: ['overview', 'artists', 'schedule', 'gallery'],
        heroImage: '/images/hero/boulder-fest-2026-hero.jpg',
        heroAlt: 'Boulder Fest 2026 hero',
        venue: { name: 'Avalon Ballroom', address: '123 Main St' },
        hasGallery: false,
        hasSchedule: false,
        isComingSoon: true,
        artists: [],
        djs: [],
        schedule: [],
        socialLinks: { instagram: 'https://instagram.com/test' },
    },
}));

vi.mock('../../../../src/data/events/weekender-2025-11.js', () => ({
    weekender202511: {
        eventType: 'weekender',
        year: '2025',
        title: 'November 2025 Weekender',
        subtitle: 'November 15, 2025',
        dates: { start: '2025-11-15', end: '2025-11-15' },
        pages: ['overview', 'artists', 'schedule', 'gallery'],
        heroImage: '/images/hero/weekender-2025-11-hero.jpg',
        heroAlt: 'Weekender hero',
        venue: { name: 'Avalon Ballroom', address: '123 Main St' },
        hasGallery: false,
        hasSchedule: true,
        isComingSoon: false,
        artists: [],
        djs: [],
        schedule: [],
        featuredArtist: { name: 'Steven Messina' },
        socialLinks: { instagram: 'https://instagram.com/test' },
    },
}));

// Test component that uses useEvent hook
function TestConsumer() {
    const event = useEvent();
    return (
        <div>
            <span data-testid="event-id">{event.eventId}</span>
            <span data-testid="event-type">{event.eventType}</span>
            <span data-testid="title">{event.title}</span>
            <span data-testid="year">{event.year}</span>
            <span data-testid="current-page">{event.currentPage}</span>
            <span data-testid="base-path">{event.basePath}</span>
            <span data-testid="status">{event.status}</span>
            <span data-testid="has-gallery">{event.hasGallery ? 'yes' : 'no'}</span>
            <span data-testid="is-coming-soon">{event.isComingSoon ? 'yes' : 'no'}</span>
            <span data-testid="artists-count">{event.artists?.length || 0}</span>
        </div>
    );
}

describe('EventContext', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Set date to before Boulder Fest 2025 to test 'upcoming' status
        vi.setSystemTime(new Date('2025-01-01'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('EventProvider', () => {
        it('provides event data for boulder-fest-2025', () => {
            render(
                <EventProvider eventId="boulder-fest-2025" currentPage="artists">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('event-id')).toHaveTextContent('boulder-fest-2025');
            expect(screen.getByTestId('event-type')).toHaveTextContent('boulder-fest');
            expect(screen.getByTestId('title')).toHaveTextContent('Boulder Fest 2025');
            expect(screen.getByTestId('year')).toHaveTextContent('2025');
            expect(screen.getByTestId('current-page')).toHaveTextContent('artists');
            expect(screen.getByTestId('has-gallery')).toHaveTextContent('yes');
        });

        it('provides event data for boulder-fest-2026', () => {
            render(
                <EventProvider eventId="boulder-fest-2026" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('event-id')).toHaveTextContent('boulder-fest-2026');
            expect(screen.getByTestId('title')).toHaveTextContent('Boulder Fest 2026');
            expect(screen.getByTestId('is-coming-soon')).toHaveTextContent('yes');
            expect(screen.getByTestId('has-gallery')).toHaveTextContent('no');
        });

        it('provides event data for weekender-2025-11', () => {
            render(
                <EventProvider eventId="weekender-2025-11" currentPage="schedule">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('event-id')).toHaveTextContent('weekender-2025-11');
            expect(screen.getByTestId('event-type')).toHaveTextContent('weekender');
            expect(screen.getByTestId('title')).toHaveTextContent('November 2025 Weekender');
            expect(screen.getByTestId('current-page')).toHaveTextContent('schedule');
        });

        it('computes correct base path for each event', () => {
            const { rerender } = render(
                <EventProvider eventId="boulder-fest-2025" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );
            expect(screen.getByTestId('base-path')).toHaveTextContent('/boulder-fest-2025');

            rerender(
                <EventProvider eventId="boulder-fest-2026" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );
            expect(screen.getByTestId('base-path')).toHaveTextContent('/boulder-fest-2026');

            rerender(
                <EventProvider eventId="weekender-2025-11" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );
            expect(screen.getByTestId('base-path')).toHaveTextContent('/weekender-2025-11');
        });

        it('handles unknown eventId gracefully', () => {
            // Suppress console.warn for this test
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            render(
                <EventProvider eventId="unknown-event" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('event-id')).toHaveTextContent('unknown-event');
            expect(screen.getByTestId('event-type')).toHaveTextContent('unknown');
            expect(screen.getByTestId('title')).toHaveTextContent('Unknown Event');
            expect(screen.getByTestId('is-coming-soon')).toHaveTextContent('yes');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unknown eventId')
            );

            warnSpy.mockRestore();
        });

        it('defaults currentPage to overview when not provided', () => {
            render(
                <EventProvider eventId="boulder-fest-2025">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('current-page')).toHaveTextContent('overview');
        });
    });

    describe('Event Status Computation', () => {
        it('computes "upcoming" status for future events', () => {
            vi.setSystemTime(new Date('2025-05-01')); // Before event

            render(
                <EventProvider eventId="boulder-fest-2025" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('status')).toHaveTextContent('upcoming');
        });

        it('computes "current" status during event dates', () => {
            vi.setSystemTime(new Date('2025-05-16T12:00:00')); // During event

            render(
                <EventProvider eventId="boulder-fest-2025" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('status')).toHaveTextContent('current');
        });

        it('computes "past" status for completed events', () => {
            vi.setSystemTime(new Date('2025-05-20')); // After event

            render(
                <EventProvider eventId="boulder-fest-2025" currentPage="overview">
                    <TestConsumer />
                </EventProvider>
            );

            expect(screen.getByTestId('status')).toHaveTextContent('past');
        });
    });
});

describe('useEvent Hook', () => {
    it('throws error when used outside EventProvider', () => {
        // Suppress error output for this test
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => {
            render(<TestConsumer />);
        }).toThrow('useEvent must be used within an EventProvider');

        errorSpy.mockRestore();
    });

    it('returns complete event context value', () => {
        const { container } = render(
            <EventProvider eventId="boulder-fest-2025" currentPage="gallery">
                <TestConsumer />
            </EventProvider>
        );

        // Verify all expected fields are present
        expect(screen.getByTestId('event-id')).toBeInTheDocument();
        expect(screen.getByTestId('event-type')).toBeInTheDocument();
        expect(screen.getByTestId('title')).toBeInTheDocument();
        expect(screen.getByTestId('year')).toBeInTheDocument();
        expect(screen.getByTestId('current-page')).toBeInTheDocument();
        expect(screen.getByTestId('base-path')).toBeInTheDocument();
        expect(screen.getByTestId('status')).toBeInTheDocument();
        expect(screen.getByTestId('has-gallery')).toBeInTheDocument();
        expect(screen.getByTestId('is-coming-soon')).toBeInTheDocument();
        expect(screen.getByTestId('artists-count')).toBeInTheDocument();
    });

    it('provides access to artists array', () => {
        render(
            <EventProvider eventId="boulder-fest-2025" currentPage="artists">
                <TestConsumer />
            </EventProvider>
        );

        expect(screen.getByTestId('artists-count')).toHaveTextContent('1');
    });
});
