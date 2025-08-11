/**
 * Apple Wallet Pass Template Configuration
 * Customize the appearance and content of your festival tickets
 */

export const passTemplate = {
  // ==========================================
  // VISUAL STYLE
  // ==========================================
  colors: {
    // Main pass colors (use RGB format)
    backgroundColor: "rgb(139, 69, 19)", // Warm brown (Cuban coffee)
    foregroundColor: "rgb(255, 255, 255)", // White text
    labelColor: "rgb(255, 223, 186)", // Cream labels

    // Alternative color schemes:
    // Tropical:
    // backgroundColor: 'rgb(0, 150, 136)',  // Teal
    // foregroundColor: 'rgb(255, 255, 255)', // White
    // labelColor: 'rgb(178, 255, 250)',      // Light cyan

    // Sunset:
    // backgroundColor: 'rgb(255, 87, 34)',   // Deep orange
    // foregroundColor: 'rgb(255, 255, 255)', // White
    // labelColor: 'rgb(255, 224, 178)',      // Peach
  },

  // ==========================================
  // PASS STRUCTURE (eventTicket format)
  // ==========================================

  // Logo area (top of pass)
  branding: {
    logoText: "A Lo Cubano", // Text next to logo
    // logo.png - 160x50px recommended
    // logo@2x.png - 320x100px for retina
  },

  // Strip image (optional banner image)
  // strip.png - 375x123px
  // strip@2x.png - 750x246px for retina

  // PRIMARY FIELDS (Large text, most prominent)
  // Usually 1 field, max 2
  primaryFields: [
    {
      key: "event",
      label: "EVENT",
      value: "A Lo Cubano Boulder Fest 2026",
      // Optional styling
      textAlignment: "PKTextAlignmentLeft", // Left, Center, Right
    },
  ],

  // SECONDARY FIELDS (Medium prominence)
  // Usually 2-4 fields in a row
  secondaryFields: [
    {
      key: "ticket-type",
      label: "TICKET TYPE",
      value: "Full Festival Pass", // Dynamic based on ticket
    },
    {
      key: "name",
      label: "ATTENDEE",
      value: "John Doe", // Dynamic from ticket data
    },
  ],

  // AUXILIARY FIELDS (Smaller, less prominent)
  // Usually 2-4 fields in a row
  auxiliaryFields: [
    {
      key: "date",
      label: "DATES",
      value: process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026",
      dateStyle: "PKDateStyleMedium", // For date formatting
    },
    {
      key: "location",
      label: "VENUE",
      value: process.env.VENUE_NAME || "Avalon Ballroom",
    },
  ],

  // BACK FIELDS (Additional info on pass back)
  backFields: [
    {
      key: "terms",
      label: "TERMS & CONDITIONS",
      value: "This ticket is non-transferable. Valid ID required.",
    },
    {
      key: "website",
      label: "WEBSITE",
      value: "https://www.alocubanoboulderfest.org",
      attributedValue:
        '<a href="https://www.alocubanoboulderfest.org">Visit Website</a>',
    },
    {
      key: "support",
      label: "SUPPORT",
      value: "alocubanoboulderfest@gmail.com",
    },
    {
      key: "instagram",
      label: "INSTAGRAM",
      value: "@alocubano.boulderfest",
    },
  ],

  // ==========================================
  // BARCODE/QR CODE
  // ==========================================
  barcode: {
    format: "PKBarcodeFormatQR", // QR code
    message: "TICKET_ID_HERE", // Dynamic ticket ID
    messageEncoding: "iso-8859-1",
    altText: "Ticket ID", // Text below barcode
  },

  // ==========================================
  // SPECIAL FEATURES
  // ==========================================
  features: {
    // Relevance (when/where to show on lock screen)
    relevantDate: process.env.EVENT_START_DATE || "2026-05-15T10:00:00-07:00", // Festival start

    // Location-based relevance (shows when near venue)
    locations: [
      {
        latitude: parseFloat(process.env.VENUE_LATITUDE || "40.014984"), // Venue location
        longitude: parseFloat(process.env.VENUE_LONGITUDE || "-105.219544"),
        altitude: 1624,
        relevantText: "Welcome to A Lo Cubano Boulder Fest!",
        maxDistance: 500, // meters
      },
    ],

    // Updates
    webServiceURL: "https://www.alocubanoboulderfest.org/api/wallet/update",
    authenticationToken: "unique_token_per_pass",
  },

  // ==========================================
  // PASS TYPES & VARIATIONS
  // ==========================================
  ticketTypes: {
    "full-pass": {
      name: "Full Festival Pass",
      backgroundColor: "rgb(139, 69, 19)", // Brown
      benefits: "3 Days • All Workshops • All Socials",
    },
    friday: {
      name: "Friday Pass",
      backgroundColor: "rgb(76, 175, 80)", // Green
      benefits: "Friday Workshops • Welcome Social",
    },
    saturday: {
      name: "Saturday Pass",
      backgroundColor: "rgb(33, 150, 243)", // Blue
      benefits: "Saturday Workshops • Evening Social",
    },
    sunday: {
      name: "Sunday Pass",
      backgroundColor: "rgb(255, 152, 0)", // Orange
      benefits: "Sunday Workshops • Closing Party",
    },
    "social-only": {
      name: "Social Dancing Only",
      backgroundColor: "rgb(156, 39, 176)", // Purple
      benefits: "All Evening Socials • No Workshops",
    },
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get configuration for specific ticket type
 */
export function getTicketTypeConfig(ticketType) {
  const type = ticketType?.toLowerCase().replace(/\s+/g, "-") || "full-pass";
  return (
    passTemplate.ticketTypes[type] || passTemplate.ticketTypes["full-pass"]
  );
}

/**
 * Format date for display
 */
export function formatEventDates() {
  return process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026";
}

/**
 * Get venue information
 */
export function getVenueInfo() {
  return {
    name: process.env.VENUE_NAME || "Avalon Ballroom",
    address:
      process.env.VENUE_ADDRESS || "6185 Arapahoe Road, Boulder, CO 80303",
    latitude: parseFloat(process.env.VENUE_LATITUDE || "40.014984"),
    longitude: parseFloat(process.env.VENUE_LONGITUDE || "-105.219544"),
  };
}

/**
 * Get event dates configuration
 */
export function getEventDates() {
  return {
    startDate: process.env.EVENT_START_DATE || "2026-05-15T10:00:00-06:00",
    endDate: process.env.EVENT_END_DATE || "2026-05-17T23:00:00-06:00",
    displayText: process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026",
  };
}

/**
 * Get appropriate greeting based on time
 */
export function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning! ¡Buenos días!";
  if (hour < 18) return "Good afternoon! ¡Buenas tardes!";
  return "Good evening! ¡Buenas noches!";
}
