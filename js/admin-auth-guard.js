/**
 * Admin Authentication Guard
 * Prevents flash of unauthorized content on admin pages
 *
 * This module provides a secure pre-render auth check that:
 * 1. Immediately hides page content
 * 2. Checks for auth token existence (sync)
 * 3. Verifies token validity with server (async)
 * 4. Shows content only after successful auth
 */

(function() {
  'use strict';

  // CRITICAL: Run immediately before DOM parsing
  // This must execute as early as possible to prevent flash

  // Only hide content if we're on an admin page (not login page)
  const isLoginPage = window.location.pathname.includes('/admin/login');
  if (!isLoginPage) {
    // Hide content immediately
    document.documentElement.style.visibility = 'hidden';
    document.documentElement.style.opacity = '0';
    document.documentElement.style.transition = 'opacity 0.2s ease-in-out';
  }

  // Note: We rely on cookies for authentication (set by /api/admin/login)
  // Don't redirect here - let verifyAndShow() check the session via API
  // The API will verify the session using the admin_session cookie

  // Add auth-checking class to body when ready
  if (document.body) {
    document.body.classList.add('auth-checking');
  } else {
    // If body doesn't exist yet, wait for it
    document.addEventListener('DOMContentLoaded', function() {
      if (!document.body.classList.contains('auth-checking')) {
        document.body.classList.add('auth-checking');
      }
    });
  }

  // Export auth verification function for use after DOM loads
  window.AdminAuthGuard = {
    async verifyAndShow() {
      try {
        // Don't verify on login page
        if (window.location.pathname.includes('/admin/login')) {
          this.showContent();
          return true;
        }

        // Verify session with server (uses admin_session cookie)
        const response = await fetch('/api/admin/verify-session', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) {
          // If it's a 500 error, might be a server issue, try dashboard endpoint instead
          if (response.status === 500) {
            console.warn('verify-session returned 500, trying dashboard endpoint');
            const dashboardResponse = await fetch('/api/admin/dashboard', {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Cache-Control': 'no-cache'
              }
            });

            if (dashboardResponse.ok) {
              // Dashboard worked, so auth is valid
              this.showContent();
              return true;
            }
          }
          throw new Error(`Auth verification failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.valid) {
          throw new Error('Session invalid');
        }

        // Authentication successful - show content
        this.showContent();
        return true;

      } catch (error) {
        console.error('Auth verification failed:', error);

        // Don't redirect from login page
        if (window.location.pathname.includes('/admin/login')) {
          this.showContent();
          return true;
        }

        // Clear invalid token
        localStorage.removeItem('adminToken');
        sessionStorage.clear();
        // CRITICAL: Preserve query string and hash for deep links
        // Example: /dashboard.html?filter=pending#analytics -> fully preserved
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        window.location.replace(`/admin/login?returnUrl=${returnUrl}`);
        return false;
      }
    },

    showContent() {
      // Remove auth-checking class
      document.body.classList.remove('auth-checking');

      // Hide loading overlay if it exists
      const loadingOverlay = document.getElementById('auth-loading');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }

      // Show the content with fade-in
      document.documentElement.style.visibility = 'visible';
      document.documentElement.style.opacity = '1';

      // Set authenticated status
      document.body.setAttribute('data-auth-status', 'authenticated');
    },

    hideContent() {
      document.body.classList.add('auth-checking');
      document.documentElement.style.visibility = 'hidden';
      document.documentElement.style.opacity = '0';
    }
  };
})();
