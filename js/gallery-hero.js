// Gallery Hero Module - Simple static hero image loader
(function() {
    'use strict';

    // DOM state ready

    // Page-specific hero image mapping
    const HERO_IMAGES = {
        home: '/images/hero/home.jpg',
        about: '/images/hero/about.jpg',
        artists: '/images/hero/boulder-fest-2026-hero.jpg',
        schedule: '/images/hero/boulder-fest-2025-hero.jpg',
        gallery: '/images/hero/weekender-2026-09-hero.jpg',
        tickets: '/images/hero/tickets.jpg',
        donations: '/images/hero/donations.jpg',
        contact: '/images/hero/contact.jpg',
        default: '/images/hero/hero-default.jpg'
    };

    // Get current page ID from URL
    function getCurrentPageId() {
        const path = window.location.pathname;
        let pageId = 'home';

        // Check for main pages first (direct routes)
        if (path === '/home' || path === '/') {
            return 'home';
        }
        if (path === '/about') {
            return 'about';
        }
        if (path === '/donations') {
            return 'donations';
        }
        if (path === '/tickets') {
            return 'tickets';
        }
        if (path === '/contact') {
            return 'contact';
        }

        // Check for new direct event-specific paths
        if (
            path === '/2026-artists' ||
      path === '/2026-schedule' ||
      path === '/2026-gallery'
        ) {
            return 'boulder-fest-2026';
        }
        if (
            path === '/2025-artists' ||
      path === '/2025-schedule' ||
      path === '/2025-gallery'
        ) {
            return 'boulder-fest-2025';
        }
        if (
            path === '/2026-sept-artists' ||
      path === '/2026-sept-schedule' ||
      path === '/2026-sept-gallery'
        ) {
            return 'weekender-2026-09';
        }

        // Check for legacy event-specific pages (for backward compatibility)
        if (path.includes('boulder-fest-2026')) {
            return 'boulder-fest-2026';
        } else if (path.includes('boulder-fest-2025')) {
            return 'boulder-fest-2025';
        } else if (path.includes('weekender-2026-09')) {
            return 'weekender-2026-09';
        } else if (path.includes('artists')) {
            pageId = 'artists';
        } else if (path.includes('schedule')) {
            pageId = 'schedule';
        } else if (path.includes('gallery')) {
            pageId = 'gallery';
        }

        return pageId;
    }

    // Get hero image for current page
    function getHeroImagePath(pageId) {
    // Event-specific hero images
        if (pageId === 'boulder-fest-2026') {
            return '/images/hero/boulder-fest-2026-hero.jpg';
        }
        if (pageId === 'boulder-fest-2025') {
            return '/images/hero/boulder-fest-2025-hero.jpg';
        }
        if (pageId === 'weekender-2026-09') {
            return '/images/hero/weekender-2026-09-hero.jpg';
        }

        return HERO_IMAGES[pageId] || HERO_IMAGES['default'];
    }

    // Initialize hero image
    function initializeHero() {
    // Hero initialization

        const heroElement = document.getElementById('hero-splash-image');
        if (!heroElement) {
            return;
        }

        const pageId = getCurrentPageId();
        const heroImagePath = getHeroImagePath(pageId);

        // Set the hero image source
        heroElement.src = heroImagePath;
        heroElement.alt = getHeroAltText(pageId);

        // Add loading state management
        heroElement.addEventListener('load', function() {
            // Remove loading class and add loaded class to parent container
            const container = this.closest('.gallery-hero-splash');
            if (container) {
                container.classList.remove('loading');
                container.classList.add('loaded');
            }
        });

        // Error handling
        heroElement.addEventListener('error', function() {
            // Fallback to default hero image if not already using it
            if (!this.src.includes('hero-default.jpg')) {
                this.src = HERO_IMAGES['default'];
                this.alt = 'A Lo Cubano Boulder Fest';
            } else {
            }
        });
    }

    // Get appropriate alt text for hero image
    function getHeroAltText(pageId) {
    // Event-specific alt texts
        if (pageId === 'boulder-fest-2026') {
            const path = window.location.pathname;
            if (path.includes('artists')) {
                return 'Boulder Fest 2026 Artists - Featured Cuban salsa instructors and performers';
            }
            if (path.includes('schedule')) {
                return 'Boulder Fest 2026 Schedule - Workshop sessions and social dancing';
            }
            if (path.includes('gallery')) {
                return 'Boulder Fest 2026 Gallery - Photo memories from the festival';
            }
            return 'Boulder Fest 2026 - Cuban salsa festival in Boulder, Colorado';
        }

        if (pageId === 'boulder-fest-2025') {
            const path = window.location.pathname;
            if (path.includes('artists')) {
                return 'Boulder Fest 2025 Artists - Featured Cuban salsa instructors and performers';
            }
            if (path.includes('schedule')) {
                return 'Boulder Fest 2025 Schedule - Workshop sessions and social dancing';
            }
            if (path.includes('gallery')) {
                return 'Boulder Fest 2025 Gallery - Photo memories from the festival';
            }
            return 'Boulder Fest 2025 - Cuban salsa festival in Boulder, Colorado';
        }

        if (pageId === 'weekender-2026-09') {
            const path = window.location.pathname;
            if (path.includes('artists')) {
                return 'September 2026 Weekender Artists - Intimate Cuban salsa intensive instructors';
            }
            if (path.includes('schedule')) {
                return 'September 2026 Weekender Schedule - Intensive workshop sessions';
            }
            if (path.includes('gallery')) {
                return 'September 2026 Weekender Gallery - Intimate weekend memories';
            }
            return 'September 2026 Weekender - Intimate Cuban salsa weekend intensive';
        }

        const altTexts = {
            home: 'A Lo Cubano Boulder Fest - Cuban salsa festival in Boulder, Colorado',
            about: 'About A Lo Cubano Boulder Fest - Behind the scenes moments',
            artists: 'Featured Artists - Cuban salsa instructors and performers',
            schedule: 'Festival Schedule - Workshop sessions and social dancing',
            gallery: 'Photo Gallery - Memorable moments from past festivals',
            tickets: 'Festival Tickets - Join us for Cuban salsa in Boulder',
            donations: 'Support the Festival - Help grow our Cuban salsa community',
            contact: 'Contact Us - Connect with the A Lo Cubano team',
            default: 'A Lo Cubano Boulder Fest - Authentic Cuban salsa experience'
        };

        return altTexts[pageId] || altTexts['default'];
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHero);
    } else {
        initializeHero();
    }
})();
