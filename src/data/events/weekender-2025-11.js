/**
 * Weekender November 2025 Event Data
 *
 * Static data for the November 2025 Weekender event sub-site.
 * This is a smaller, single-day workshop event featuring a special guest.
 */

export const weekender202511 = {
    // Identity
    eventType: 'weekender',
    year: '2025',

    // Display
    title: 'November 2025 Weekender',
    subtitle: 'November 15, 2025',

    // Dates (single day)
    dates: {
        start: '2025-11-15',
        end: '2025-11-15',
    },

    // Navigation
    pages: ['overview', 'artists', 'schedule', 'gallery'],

    // Hero
    heroImage: '/images/hero/weekender-2025-11-hero.jpg',
    heroAlt: 'A Lo Cubano Weekender November 2025 featuring Steven Messina',

    // Venue
    venue: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80301',
    },

    // Feature flags
    hasGallery: false,
    hasSchedule: true,
    isComingSoon: false,

    // Featured artist (unique to weekenders)
    featuredArtist: {
        id: 'steven-messina',
        name: 'Steven Messina',
        image: '/images/artists/steven-messina.jpg',
        title: 'World-Renowned Cuban Dance Instructor',
        bio: `Steven Messina is an internationally acclaimed Cuban dance instructor, performer, and choreographer.
              With over 20 years of experience, he has taught at festivals and congresses worldwide,
              sharing his deep knowledge of Son Cubano, Casino, and Rueda de Casino.`,
        styles: ['Son Cubano', 'Casino', 'Rueda de Casino'],
        specialties: [
            'Authentic Cuban styling',
            'Musical interpretation',
            'Partner connection techniques',
            'Traditional Cuban dance history',
        ],
    },

    // Artists (may include featured artist and others)
    artists: [
        {
            id: 'steven-messina',
            name: 'Steven Messina',
            number: '01',
            styles: ['Son Cubano', 'Casino', 'Rueda de Casino'],
            quote: 'World-renowned Cuban dance instructor',
            description: [
                'International instructor and performer',
                'Over 20 years of experience',
                'Taught at festivals worldwide',
                'Authentic Cuban technique master',
            ],
            tags: [
                { text: 'FEATURED ARTIST', color: 'blue' },
                { text: 'INTERNATIONAL STAR', color: 'red' },
            ],
            isFeatured: true,
        },
    ],

    // DJs
    djs: [
        {
            id: 'dj-byron',
            name: 'DJ Byron',
            description: 'The authentic sound master',
        },
    ],

    // Schedule (single day)
    schedule: [
        {
            day: 'Saturday',
            date: 'November 15, 2025',
            items: [
                {
                    time: '1:00 PM - 2:30 PM',
                    title: 'Son Cubano Fundamentals',
                    instructor: 'Steven Messina',
                    description: 'Traditional Cuban partner dance basics and styling',
                    venue: 'Avalon Ballroom',
                    level: 'All Levels',
                },
                {
                    time: '2:45 PM - 4:15 PM',
                    title: 'Casino Styling & Technique',
                    instructor: 'Steven Messina',
                    description: 'Intermediate Casino patterns with authentic Cuban flair',
                    venue: 'Avalon Ballroom',
                    level: 'Intermediate',
                },
                {
                    time: '4:30 PM - 6:00 PM',
                    title: 'Rueda de Casino',
                    instructor: 'Steven Messina',
                    description: 'Group wheel dancing with calls and formations',
                    venue: 'Avalon Ballroom',
                    level: 'All Levels',
                },
                {
                    time: '7:00 PM - 11:00 PM',
                    title: 'Social Dance Party',
                    description: 'Evening social with DJ Byron',
                    isSocial: true,
                    venue: 'Avalon Ballroom',
                },
            ],
        },
    ],

    // Gallery - not available yet (upcoming event)
    galleryConfig: {
        year: '2025',
        categories: [],
    },

    // Social/Links
    socialLinks: {
        instagram: 'https://www.instagram.com/alocubano.boulderfest/',
        whatsapp: 'https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH',
    },

    // External links (e.g., pasito.fun)
    externalLinks: {
        tickets: 'https://pasito.fun/events/weekender-2025-11',
    },

    // Overview page content
    overview: {
        tagline: 'A Special Weekender Event',
        cta: {
            text: 'GET TICKETS NOW',
            href: '/tickets',
        },
        highlights: [
            {
                title: 'Featured Artist',
                description: 'Learn from Steven Messina',
            },
            {
                title: '3 Workshops',
                description: 'Son, Casino, and Rueda',
            },
            {
                title: 'Evening Social',
                description: 'Dance the night away',
            },
        ],
        whenAndWhere: {
            date: 'Saturday, November 15, 2025',
            time: '1:00 PM - 11:00 PM',
            venue: 'Avalon Ballroom',
            address: '6185 Arapahoe Rd, Boulder, CO 80301',
        },
    },
};
