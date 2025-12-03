/**
 * Boulder Fest 2026 Event Data
 *
 * Static data for the Boulder Fest 2026 event sub-site.
 * This is an upcoming event with "coming soon" placeholders.
 */

export const boulderFest2026 = {
    // Identity
    eventType: 'boulder-fest',
    year: '2026',

    // Display
    title: 'Boulder Fest 2026',
    subtitle: 'May 15-17, 2026',

    // Dates
    dates: {
        start: '2026-05-15',
        end: '2026-05-17',
    },

    // Navigation
    pages: ['overview', 'artists', 'schedule', 'gallery'],

    // Hero
    heroImage: '/images/hero/boulder-fest-2026-hero.jpg',
    heroAlt: 'A Lo Cubano Boulder Fest 2026 - Coming Soon',

    // Venue
    venue: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80301',
    },

    // Feature flags - mostly coming soon
    hasGallery: false,
    hasSchedule: false,
    isComingSoon: true,

    // Artists - to be announced
    artists: [],

    // DJs - to be announced
    djs: [],

    // Schedule - to be announced
    schedule: [],

    // Gallery - not available yet
    galleryConfig: {
        year: '2026',
        categories: [],
    },

    // Social/Links
    socialLinks: {
        instagram: 'https://www.instagram.com/alocubano.boulderfest/',
        whatsapp: 'https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH',
    },

    // Overview page content
    overview: {
        tagline: 'What to Expect',
        highlights: [
            {
                title: 'World-Class Instructors',
                description: 'Learn from authentic Cuban dance masters',
            },
            {
                title: '3 Days of Cuban Culture',
                description: 'Workshops, socials, and unforgettable experiences',
            },
            {
                title: 'Vibrant Community',
                description: 'Connect with dancers from across the country',
            },
        ],
        navigationCards: [
            {
                title: 'Artists',
                description: 'Meet our instructors',
                href: '/boulder-fest-2026/artists',
                status: 'coming-soon',
            },
            {
                title: 'Schedule',
                description: 'View the full program',
                href: '/boulder-fest-2026/schedule',
                status: 'coming-soon',
            },
            {
                title: 'Gallery',
                description: 'Photos from past events',
                href: '/boulder-fest-2026/gallery',
                status: 'coming-soon',
            },
            {
                title: 'Tickets',
                description: 'Reserve your spot',
                href: '/tickets',
                status: 'available',
            },
        ],
    },

    // Coming soon messaging
    comingSoon: {
        artists: {
            title: 'Artists Coming Soon',
            message: 'Our 2026 lineup is being finalized. Sign up for our newsletter to be the first to know!',
        },
        schedule: {
            title: 'Schedule Coming Soon',
            message: 'The 2026 workshop schedule will be announced soon. Stay tuned!',
        },
        gallery: {
            title: 'Gallery Coming Soon',
            message: 'Photos from Boulder Fest 2026 will be available after the event.',
        },
    },

    // Newsletter signup config
    newsletter: {
        enabled: true,
        title: 'Stay Updated',
        message: 'Be the first to know when artists and schedule are announced.',
    },
};
