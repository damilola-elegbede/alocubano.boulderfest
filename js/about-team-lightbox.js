/**
 * Team Member Photos Lightbox
 *
 * Adds lightbox functionality to team member photos on the about page.
 * Reuses the existing Lightbox component from the gallery.
 */

/* eslint-disable no-console */

(function() {
    'use strict';

    // Debug flag - check multiple sources for flexibility
    const DEBUG_ENABLED = (function() {
        if (typeof window === 'undefined') return false;
        if (window.__CONSOLE_LOG_DEBUG_ENABLED__) return true;
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') return true;
        if (localStorage.getItem('CONSOLE_LOG_DEBUG_ENABLED') === '1') return true;
        return false;
    })();
    const debugLog = (...args) => { if (DEBUG_ENABLED) console.log(...args); };
    const debugWarn = (...args) => { if (DEBUG_ENABLED) console.warn(...args); };

    // Team member data with image paths and metadata
    // IMPORTANT: Order must match DOM order in AboutPage.jsx
    const teamMembers = [
        {
            id: 'marcela',
            name: 'Marcela Lay',
            title: 'President & Founder',
            image: '/images/team/marcela.jpg'
        },
        {
            id: 'damilola',
            name: 'Damilola Elegbede',
            title: 'Vice President & Treasurer',
            image: '/images/team/damilola.jpeg'
        },
        {
            id: 'yolanda',
            name: 'Yolanda Meiler',
            title: 'Secretary',
            image: '/images/team/yolanda.jpeg'
        },
        {
            id: 'analis',
            name: 'Analis Ledesma',
            title: 'Board Member',
            image: '/images/team/analis.jpeg'
        },
        {
            id: 'donal',
            name: 'Donal Solick',
            title: 'Board Member',
            image: '/images/team/donal.png'
        }
    ];

    let lightbox = null;

    /**
     * Initialize the lightbox for team member photos
     */
    function initTeamLightbox() {
        // Check if Lightbox component is available
        if (typeof Lightbox === 'undefined') {
            debugWarn('Lightbox component not available on about page');
            return;
        }

        // Get all team member photo elements FIRST
        // This prevents creating a Lightbox instance before React has rendered
        const teamPhotos = document.querySelectorAll('.team-member-photo');

        if (teamPhotos.length === 0) {
            debugWarn('No team member photos found');
            return;
        }

        // Prevent re-initialization if lightbox already exists
        // This avoids the race condition where multiple instances are created
        if (lightbox) {
            return;
        }

        // Initialize lightbox with advanced mode for navigation between team members
        lightbox = new Lightbox({
            lightboxId: 'team-lightbox',
            showCaption: true,
            showCounter: false,
            advanced: true
        });

        // Add click event listeners to each photo
        teamPhotos.forEach((photo, index) => {
            // Add click event
            photo.addEventListener('click', () => {
                openTeamMemberLightbox(index);
            });

            // Add keyboard accessibility
            photo.setAttribute('tabindex', '0');
            photo.setAttribute('role', 'button');
            photo.setAttribute('aria-label', `View ${teamMembers[index].name} photo in lightbox`);

            // Handle Enter/Space key for accessibility
            photo.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTeamMemberLightbox(index);
                }
            });
        });

        debugLog(`Team lightbox initialized with ${teamPhotos.length} photos`);
    }

    /**
     * Open lightbox with team member photo
     * @param {number} index - Index of the team member to display
     */
    function openTeamMemberLightbox(index) {
        if (!lightbox) {
            console.error('Lightbox not initialized');
            return;
        }

        if (index < 0 || index >= teamMembers.length) {
            console.error('Invalid team member index:', index);
            return;
        }

        // Create items array for lightbox (all team members)
        const lightboxItems = teamMembers.map(m => ({
            viewUrl: m.image,         // Full resolution image URL
            thumbnailUrl: m.image,    // Use same image as thumbnail
            name: m.name,             // For image alt text
            title: m.name,
            subtitle: m.title
        }));

        // Open lightbox in advanced mode with navigation
        lightbox.openAdvanced(lightboxItems, index);
    }

    /**
     * Initialize when DOM is ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTeamLightbox);
    } else {
        // DOM already loaded
        initTeamLightbox();
    }

    // Expose function globally for React components to re-initialize after rendering
    window.initTeamLightbox = initTeamLightbox;

})();
