/**
 * Boulder Fest 2026 Schedule Page
 *
 * Coming soon page for Boulder Fest 2026 schedule.
 */

import React from 'react';
import { AppProviders } from '../../../providers/AppProviders.jsx';
import { EventProvider } from '../../../contexts/EventContext.jsx';
import { useEvent } from '../../../hooks/useEvent.js';
import EventLayout from '../../../components/events/EventLayout.jsx';
import ComingSoon from '../../../components/events/ComingSoon.jsx';

function SchedulePageContent() {
    const { comingSoon, newsletter } = useEvent();

    return (
        <EventLayout>
            {/* Page Title */}
            <section className="section-typographic">
                <div className="container">
                    <h1 className="text-mask">2026 Schedule</h1>
                </div>
            </section>

            {/* Coming Soon Message */}
            <ComingSoon
                title={comingSoon?.schedule?.title || 'Schedule Coming Soon'}
                message={comingSoon?.schedule?.message || 'The 2026 workshop schedule will be announced soon. Stay tuned!'}
                showNewsletter={newsletter?.enabled ?? true}
            />
        </EventLayout>
    );
}

export default function BoulderFest2026SchedulePage() {
    return (
        <AppProviders>
            <EventProvider eventId="boulder-fest-2026" currentPage="schedule">
                <SchedulePageContent />
            </EventProvider>
        </AppProviders>
    );
}
