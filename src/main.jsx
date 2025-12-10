// =============================================================================
// Chunk Load Error Recovery
// =============================================================================
// Handles stale cache after deployments by auto-reloading when chunks fail to load.
// This prevents 404 errors when users have cached HTML referencing old chunk hashes.
//
// Flow:
// 1. Listen for script load errors in capture phase
// 2. If a chunk from /dist/assets/ fails (404), reload page once
// 3. sessionStorage flag prevents infinite reload loops
// =============================================================================

console.log('🔧 [ChunkRecovery] Installing chunk load error handler');

window.addEventListener('error', (event) => {
  // Check if it's a chunk load error (script loading failed from our assets)
  const isScriptError = event.target?.tagName === 'SCRIPT';
  const isOurChunk = event.target?.src?.includes('/dist/assets/');

  if (isScriptError && isOurChunk) {
    const chunkUrl = event.target.src;
    console.error('❌ [ChunkRecovery] Chunk load failed:', chunkUrl);
    console.log('📋 [ChunkRecovery] This usually means the HTML is cached with stale chunk references');

    // Only reload once to prevent infinite loops
    if (!sessionStorage.getItem('chunk-reload-attempted')) {
      console.log('🔄 [ChunkRecovery] Attempting page reload to get fresh HTML...');
      sessionStorage.setItem('chunk-reload-attempted', 'true');
      window.location.reload();
    } else {
      console.error('🚫 [ChunkRecovery] Reload already attempted. Please hard refresh (Cmd+Shift+R or Ctrl+Shift+R)');
    }
  }
}, true); // Use capture phase to catch script errors before they bubble

// Clear the reload flag when page loads successfully with all chunks
window.addEventListener('load', () => {
  if (sessionStorage.getItem('chunk-reload-attempted')) {
    console.log('✅ [ChunkRecovery] Page loaded successfully after reload, clearing flag');
    sessionStorage.removeItem('chunk-reload-attempted');
  }
});

console.log('✅ [ChunkRecovery] Error handler installed');

// =============================================================================
// React Application
// =============================================================================

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
        'MyTicketsPage': () => import('./pages/MyTicketsPage'),

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
