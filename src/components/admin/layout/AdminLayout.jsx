/**
 * AdminLayout Component
 *
 * Main layout wrapper for all admin pages.
 * Provides consistent header, navigation, and content structure.
 */

import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../../hooks/admin/useAdminAuth.js';
import { AUTH_STATES } from '../../../contexts/admin/AdminAuthContext.jsx';
import AdminHeader from './AdminHeader.jsx';
import AdminNavigation from './AdminNavigation.jsx';
import AdminMobileNav from './AdminMobileNav.jsx';

/**
 * AdminLayout - Wraps admin page content with header and navigation
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Page content
 * @param {string} props.title - Page title for header
 * @param {string} [props.subtitle] - Optional subtitle
 * @param {string} props.currentPage - Current page identifier for nav highlighting
 * @param {React.ReactNode} [props.headerActions] - Optional header action buttons
 */
export default function AdminLayout({
    children,
    title,
    subtitle,
    currentPage,
    headerActions,
}) {
    const { status, isAuthenticated, isLoading } = useAdminAuth();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Handle visibility after auth check
    useEffect(() => {
        if (status === AUTH_STATES.AUTHENTICATED) {
            // Small delay to allow CSS transition
            requestAnimationFrame(() => {
                setIsVisible(true);
            });
        } else if (status === AUTH_STATES.UNAUTHENTICATED) {
            // Redirect to login
            const returnUrl = encodeURIComponent(
                window.location.pathname + window.location.search + window.location.hash
            );
            window.location.replace(`/admin/login?returnUrl=${returnUrl}`);
        }
    }, [status]);

    // Handle escape key to close mobile nav
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && mobileNavOpen) {
                setMobileNavOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [mobileNavOpen]);

    // Show loading state
    if (isLoading) {
        return (
            <div className="auth-loading">
                <div className="auth-loading-content">
                    <div className="auth-spinner" />
                    <h2>Verifying Authentication...</h2>
                </div>
            </div>
        );
    }

    // Don't render anything while redirecting
    if (!isAuthenticated) {
        return null;
    }

    return (
        <div
            className="admin-container"
            style={{
                visibility: isVisible ? 'visible' : 'hidden',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.2s ease-in',
            }}
        >
            {/* Mobile Menu Toggle */}
            <AdminMobileNav
                isOpen={mobileNavOpen}
                onToggle={() => setMobileNavOpen(!mobileNavOpen)}
                currentPage={currentPage}
            />

            {/* Skip Links for Accessibility */}
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>

            {/* Header */}
            <AdminHeader
                title={title}
                subtitle={subtitle}
                actions={headerActions}
            />

            {/* Navigation */}
            <AdminNavigation currentPage={currentPage} />

            {/* Main Content */}
            <main id="main-content">{children}</main>
        </div>
    );
}
