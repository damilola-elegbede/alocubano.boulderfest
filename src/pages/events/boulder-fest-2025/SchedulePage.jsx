/**
 * Boulder Fest 2025 Schedule Page
 *
 * Displays the 3-day schedule for Boulder Fest 2025.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ScheduleDay from '../../../components/events/ScheduleDay.jsx';

function SchedulePageContent() {
    const { schedule, title } = useEvent();

    return (
        <EventLayout>
            {/* Schedule Header */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2025 Schedule</h1>
                    <p
                        className="font-serif"
                        style={{
                            fontSize: 'var(--font-size-lg)',
                            fontStyle: 'italic',
                            marginTop: 'var(--space-md)',
                            color: 'var(--color-gray-500)',
                        }}
                    >
                        Three days of Cuban dance, music, and culture
                    </p>
                </div>
            </section>

            {/* Schedule Days */}
            <section className="section-typographic">
                <div className="container">
                    {schedule.map((day, index) => (
                        <ScheduleDay key={index} day={day} />
                    ))}
                </div>
            </section>

            {/* Schedule page specific styles */}
            <style>{`
                .schedule-day {
                    margin-bottom: var(--space-xl);
                    border: 2px solid var(--color-gray-300);
                    padding: var(--space-lg);
                }
                .schedule-day h3 {
                    color: var(--color-red);
                    margin: 0 0 var(--space-md);
                    font-family: var(--font-display);
                    font-size: var(--font-size-xl);
                }
                .schedule-content .instructor {
                    font-style: italic;
                    color: var(--color-gray-500);
                    font-size: var(--font-size-sm);
                    margin-top: var(--space-xs);
                }
                .schedule-content .venue {
                    color: var(--color-gray-500);
                    font-size: var(--font-size-sm);
                    margin-top: var(--space-xs);
                }
                .schedule-social {
                    background: linear-gradient(135deg, var(--color-red) 0%, var(--color-orange) 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    font-weight: bold;
                }
            `}</style>
        </EventLayout>
    );
}

export default function BoulderFest2025SchedulePage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2025" currentPage="schedule">
                <SchedulePageContent />
            </EventProvider>
        </AppProviders>
    );
}
