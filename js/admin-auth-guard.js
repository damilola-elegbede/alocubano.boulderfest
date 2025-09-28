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

  // Hide content immediately
  document.documentElement.style.visibility = 'hidden';
  document.documentElement.style.opacity = '0';
  document.documentElement.style.transition = 'opacity 0.2s ease-in-out';

  // Quick sync check for token existence
  const hasToken = localStorage.getItem('adminToken');

  // If no token at all, redirect immediately without waiting
  if (!hasToken) {
    window.location.replace('/admin/login');
    return;
  }

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
        // Verify token with server
        const response = await fetch('/api/admin/verify-session', {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(3000)
        });

        if (!response.ok) {
          throw new Error('Auth verification failed');
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
        // Clear invalid token
        localStorage.removeItem('adminToken');
        sessionStorage.clear();
        // Redirect to login
        window.location.replace('/admin/login');
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