/**
 * Team Member Photos Lightbox
 *
 * Adds lightbox functionality to team member photos on the about page.
 * Reuses the existing Lightbox component from the gallery.
 */

/* eslint-disable no-console */

(function() {
    'use strict';

    // Team member data with image paths and metadata
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
            id: 'analis',
            name: 'Analis Ledesma',
            title: 'Secretary',
            image: '/images/team/analis.jpeg'
        },
        {
            id: 'donal',
            name: 'Donal Solick',
            title: 'Board Member',
            image: '/images/team/donal.png'
        },
        {
            id: 'yolanda',
            name: 'Yolanda Meiler',
            title: 'Board Member',
            image: '/images/team/yolanda.jpeg'
        }
    ];

    let lightbox = null;

    /**
     * Initialize the lightbox for team member photos
     */
    function initTeamLightbox() {
        // Check if Lightbox component is available
        if (typeof Lightbox === 'undefined') {
            console.warn('Lightbox component not available on about page');
            return;
        }

        // Initialize lightbox with advanced mode for navigation between team members
        lightbox = new Lightbox({
            lightboxId: 'team-lightbox',
            showCaption: true,
            showCounter: false,
            advanced: true
        });

        // Get all team member photo elements
        const teamPhotos = document.querySelectorAll('.team-member-photo');

        if (teamPhotos.length === 0) {
            console.warn('No team member photos found');
            return;
        }

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

        console.log(`Team lightbox initialized with ${teamPhotos.length} photos`);
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

})();
