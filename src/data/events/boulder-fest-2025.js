/**
 * Boulder Fest 2025 Event Data
 *
 * Static data for the Boulder Fest 2025 event sub-site.
 * Extracted from pages/events/boulder-fest-2025/*.html
 */

export const boulderFest2025 = {
    // Identity
    eventType: 'boulder-fest',
    year: '2025',

    // Display
    title: 'Boulder Fest 2025',
    subtitle: 'May 15-17, 2025',

    // Dates
    dates: {
        start: '2025-05-15',
        end: '2025-05-17',
    },

    // Navigation
    pages: ['overview', 'artists', 'schedule', 'gallery'],

    // Hero
    heroImage: '/images/hero/boulder-fest-2025-hero.jpg',
    heroAlt: 'Workshop sessions and dance classes in action at A Lo Cubano Boulder Fest 2025',

    // Venue
    venue: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80301',
    },

    // Feature flags
    hasGallery: true,
    hasSchedule: true,
    isComingSoon: false,

    // Artists
    artists: [
        {
            id: 'laroye',
            name: 'Laroye',
            number: '01',
            styles: ['Orishas', 'Rumba', 'Ladies Styling'],
            quote: 'Master of Afro-Cuban traditions',
            description: [
                'Deep roots in Cuban culture',
                'Teaching Orishas dance',
                'Rumba fundamentals',
                'Empowering ladies\' movement',
            ],
            tags: [
                { text: 'CULTURAL AMBASSADOR', color: 'blue' },
                { text: 'TRADITION KEEPER', color: 'red' },
            ],
        },
        {
            id: 'malena-adriel',
            name: 'Malena & Adriel',
            number: '02',
            styles: ['Timba Suelta', 'Casino Intermediate'],
            quote: 'Dynamic duo of Cuban dance',
            description: [
                'Partner perfection',
                'Masters of Timba Suelta',
                'Casino intermediate specialists',
                'Energy and precision combined',
            ],
            tags: [
                { text: 'INTERNATIONAL INSTRUCTORS', color: 'blue' },
                { text: 'FESTIVAL FAVORITES', color: 'red' },
            ],
        },
        {
            id: 'emarlos-courtney',
            name: 'Emarlos & Courtney',
            number: '03',
            styles: ['Son Cubano', 'Casino Intermediate'],
            quote: 'Bridging traditional and modern',
            description: [
                'Son Cubano specialists',
                'Casino intermediate focus',
                'Teaching with passion',
                'Connection through movement',
            ],
            tags: [
                { text: 'DANCE EDUCATORS', color: 'blue' },
                { text: 'COMMUNITY BUILDERS', color: 'red' },
            ],
        },
        {
            id: 'giselle-soto',
            name: 'Giselle Soto',
            number: '04',
            styles: ['Cubaton', 'Ladies Styling'],
            quote: 'Queen of Cuban urban movement',
            description: [
                'Cubaton specialist',
                'Ladies styling expert',
                'Modern Cuban movement',
                'Confidence through dance',
            ],
            tags: [
                { text: 'URBAN DANCE INNOVATOR', color: 'blue' },
                { text: 'EMPOWERMENT COACH', color: 'red' },
            ],
        },
        {
            id: 'nathan-hook',
            name: 'Nathan Hook',
            number: '05',
            styles: ['Rueda Intermediate/Advanced'],
            quote: 'Master of the wheel',
            description: [
                'Rueda de Casino expert',
                'Intermediate to advanced levels',
                'Complex formations',
                'Group dynamics specialist',
            ],
            tags: [
                { text: 'RUEDA CHAMPION', color: 'blue' },
                { text: 'TECHNICAL MASTER', color: 'red' },
            ],
        },
    ],

    // DJs
    djs: [
        {
            id: 'dj-byron',
            name: 'DJ Byron',
            description: 'The authentic sound master',
        },
        {
            id: 'dj-tito',
            name: 'DJ Tito',
            description: 'The energy conductor',
        },
        {
            id: 'dj-diva',
            name: 'DJ Diva',
            description: 'The crowd igniter',
        },
    ],

    // Schedule (3 days)
    schedule: [
        {
            day: 'Friday',
            date: 'May 15, 2025',
            items: [
                {
                    time: '6:00 PM - 7:00 PM',
                    title: 'Registration & Welcome',
                    description: 'Check-in and welcome reception',
                    venue: 'Avalon Ballroom',
                },
                {
                    time: '7:00 PM - 8:30 PM',
                    title: 'Opening Workshop',
                    instructor: 'Laroye',
                    description: 'Orishas Introduction',
                    venue: 'Main Hall',
                },
                {
                    time: '9:00 PM - 2:00 AM',
                    title: 'Opening Night Social',
                    description: 'Social dancing with all DJs',
                    isSocial: true,
                    venue: 'Main Hall',
                },
            ],
        },
        {
            day: 'Saturday',
            date: 'May 16, 2025',
            items: [
                {
                    time: '10:00 AM - 11:30 AM',
                    title: 'Timba Suelta',
                    instructor: 'Malena & Adriel',
                    description: 'Partner work and Timba styling',
                    venue: 'Room A',
                },
                {
                    time: '10:00 AM - 11:30 AM',
                    title: 'Son Cubano',
                    instructor: 'Emarlos & Courtney',
                    description: 'Traditional Cuban partner dance',
                    venue: 'Room B',
                },
                {
                    time: '12:00 PM - 1:30 PM',
                    title: 'Cubaton',
                    instructor: 'Giselle Soto',
                    description: 'Urban Cuban movement',
                    venue: 'Room A',
                },
                {
                    time: '12:00 PM - 1:30 PM',
                    title: 'Rueda Intermediate',
                    instructor: 'Nathan Hook',
                    description: 'Rueda de Casino patterns',
                    venue: 'Room B',
                },
                {
                    time: '2:00 PM - 3:30 PM',
                    title: 'Rumba',
                    instructor: 'Laroye',
                    description: 'Afro-Cuban rumba traditions',
                    venue: 'Main Hall',
                },
                {
                    time: '4:00 PM - 5:30 PM',
                    title: 'Ladies Styling',
                    instructor: 'Laroye & Giselle Soto',
                    description: 'Movement and expression',
                    venue: 'Room A',
                },
                {
                    time: '4:00 PM - 5:30 PM',
                    title: 'Casino Intermediate',
                    instructor: 'Malena & Adriel',
                    description: 'Intermediate partner patterns',
                    venue: 'Room B',
                },
                {
                    time: '9:00 PM - 3:00 AM',
                    title: 'Saturday Night Gala',
                    description: 'Main social event with performances',
                    isSocial: true,
                    venue: 'Main Hall',
                },
            ],
        },
        {
            day: 'Sunday',
            date: 'May 17, 2025',
            items: [
                {
                    time: '11:00 AM - 12:30 PM',
                    title: 'Rueda Advanced',
                    instructor: 'Nathan Hook',
                    description: 'Advanced formations and calls',
                    venue: 'Main Hall',
                },
                {
                    time: '11:00 AM - 12:30 PM',
                    title: 'Casino Intermediate',
                    instructor: 'Emarlos & Courtney',
                    description: 'Continuing partner work',
                    venue: 'Room A',
                },
                {
                    time: '1:00 PM - 2:30 PM',
                    title: 'Orishas',
                    instructor: 'Laroye',
                    description: 'Afro-Cuban dance traditions',
                    venue: 'Main Hall',
                },
                {
                    time: '3:00 PM - 4:30 PM',
                    title: 'Closing Workshop',
                    instructor: 'All Instructors',
                    description: 'Collaborative session',
                    venue: 'Main Hall',
                },
                {
                    time: '5:00 PM - 9:00 PM',
                    title: 'Farewell Social',
                    description: 'Closing celebration',
                    isSocial: true,
                    venue: 'Main Hall',
                },
            ],
        },
    ],

    // Gallery data fetched from API
    galleryConfig: {
        year: '2025',
        categories: ['workshops', 'socials'],
    },

    // Social/Links
    socialLinks: {
        instagram: 'https://www.instagram.com/alocubano.boulderfest/',
        whatsapp: 'https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH',
    },

    // Overview page content
    overview: {
        tagline: 'What Happened',
        highlights: [
            {
                title: '150+ Attendees',
                description: 'Dancers from across the country',
            },
            {
                title: '3 Days of Dancing',
                description: 'Workshops, socials, and performances',
            },
            {
                title: '10+ Workshops',
                description: 'Learn from authentic Cuban masters',
            },
        ],
    },
};
