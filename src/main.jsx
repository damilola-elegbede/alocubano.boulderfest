import React from 'react';
import ReactDOM from 'react-dom/client';

// Dynamic root mounting
const rootElement = document.getElementById('react-root');
if (rootElement) {
    const ComponentName = rootElement.getAttribute('data-component');

    console.log(`⚛️ React mounting requested for: ${ComponentName}`);

    // Lazy load components based on data attribute
    const components = {
        // Core pages
        'AboutPage': () => import('./pages/AboutPage'),
        'CheckoutPage': () => import('./pages/CheckoutPage'),
        'HomePage': () => import('./pages/HomePage'),
        'ContactPage': () => import('./pages/ContactPage'),
        'DonationsPage': () => import('./pages/DonationsPage'),

        // Event pages - Boulder Fest 2025
        'BoulderFest2025Overview': () => import('./pages/events/boulder-fest-2025/OverviewPage'),
        'BoulderFest2025Artists': () => import('./pages/events/boulder-fest-2025/ArtistsPage'),
        'BoulderFest2025Schedule': () => import('./pages/events/boulder-fest-2025/SchedulePage'),
        'BoulderFest2025Gallery': () => import('./pages/events/boulder-fest-2025/GalleryPage'),

        // Event pages - Boulder Fest 2026
        'BoulderFest2026Overview': () => import('./pages/events/boulder-fest-2026/OverviewPage'),
        'BoulderFest2026Artists': () => import('./pages/events/boulder-fest-2026/ArtistsPage'),
        'BoulderFest2026Schedule': () => import('./pages/events/boulder-fest-2026/SchedulePage'),
        'BoulderFest2026Gallery': () => import('./pages/events/boulder-fest-2026/GalleryPage'),

        // Event pages - Weekender November 2025
        'Weekender202511Overview': () => import('./pages/events/weekender-2025-11/OverviewPage'),
        'Weekender202511Artists': () => import('./pages/events/weekender-2025-11/ArtistsPage'),
        'Weekender202511Schedule': () => import('./pages/events/weekender-2025-11/SchedulePage'),
        'Weekender202511Gallery': () => import('./pages/events/weekender-2025-11/GalleryPage'),

        // Admin pages
        'AdminLogin': () => import('./pages/admin/LoginPage'),
        'AdminDashboard': () => import('./pages/admin/DashboardPage'),
        'AdminRegistrations': () => import('./pages/admin/RegistrationsPage'),
        'AdminTickets': () => import('./pages/admin/TicketsPage'),
        'AdminDonations': () => import('./pages/admin/DonationsPage'),
        'AdminAnalytics': () => import('./pages/admin/AnalyticsPage'),
        'AdminAuditLogs': () => import('./pages/admin/AuditLogsPage'),
        'AdminMfaSettings': () => import('./pages/admin/MfaSettingsPage'),
        'AdminManualEntry': () => import('./pages/admin/ManualEntryPage'),
        'AdminApiEndpoints': () => import('./pages/admin/ApiEndpointsPage'),
        'AdminDatabaseDashboard': () => import('./pages/admin/DatabaseDashboardPage'),
        'AdminTest': () => import('./pages/admin/TestPage'),
        'AdminTicketDetail': () => import('./pages/admin/TicketDetailPage'),
        'AdminPortal': () => import('./pages/admin/AdminPortalPage'),
        'AdminCheckin': () => import('./pages/admin/CheckinPage'),
    };

    if (components[ComponentName]) {
        components[ComponentName]().then(({ default: Component }) => {
            ReactDOM.createRoot(rootElement).render(
                <React.StrictMode>
                    <Component />
                </React.StrictMode>
            );
            console.log(`✅ React mounted: ${ComponentName}`);
        }).catch(err => {
            console.error(`❌ Failed to load component: ${ComponentName}`, err);
        });
    } else {
        console.warn(`⚠️ Unknown component requested: ${ComponentName}`);
    }
} else {
    console.log('ℹ️ No react-root found on this page.');
}
