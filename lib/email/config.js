/**
 * Email Service Configuration
 * Centralized configuration for all email-related settings
 */

const config = {
  // SendGrid Configuration
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@alocubanoboulderfest.com',
    fromName: process.env.SENDGRID_FROM_NAME || 'A Lo Cubano Boulder Fest',
    replyTo: process.env.FESTIVAL_EMAIL || 'alocubanoboulderfest@gmail.com',
    
    // SendGrid API settings
    timeout: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 1000, // 1 second base delay
    
    // Rate limiting
    rateLimit: {
      maxEmailsPerSecond: 10,
      maxEmailsPerMinute: 100,
      maxEmailsPerHour: 1000
    }
  },

  // Email Templates Configuration
  templates: {
    directory: './templates',
    partialsDirectory: './templates/partials',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'es'],
    
    // Template-specific settings
    receipt: {
      subject: '🎵 Payment Confirmation - A Lo Cubano Boulder Fest',
      priority: 'high'
    },
    
    paymentFailure: {
      subject: 'Payment Issue - A Lo Cubano Boulder Fest',
      priority: 'high',
      retryable: true
    },
    
    refundConfirmation: {
      subject: 'Refund Confirmation - A Lo Cubano Boulder Fest',
      priority: 'normal'
    },
    
    welcome: {
      subject: '¡Bienvenidos! Welcome to A Lo Cubano Boulder Fest',
      priority: 'normal'
    },
    
    reminder: {
      subject: '🕺 Don\'t miss A Lo Cubano Boulder Fest!',
      priority: 'low'
    }
  },

  // PDF Generation Configuration
  pdf: {
    // Ticket settings
    ticket: {
      size: 'A4',
      margin: 40,
      quality: 'high',
      
      // QR Code settings
      qr: {
        size: 140,
        margin: 2,
        errorCorrectionLevel: 'M',
        version: '1.0'
      },
      
      // Security settings
      security: {
        watermark: true,
        securityHash: true,
        timestampGeneration: true
      }
    },
    
    // Font settings
    fonts: {
      regular: 'Helvetica',
      bold: 'Helvetica-Bold',
      title: 'Helvetica-Bold' // Would be Bebas Neue if custom fonts were loaded
    },
    
    // Color scheme
    colors: {
      primary: '#d32f2f',
      secondary: '#c62828',
      accent: '#ff6b35',
      dark: '#2c2c2c',
      light: '#f8f9fa',
      white: '#ffffff',
      text: '#333333',
      muted: '#666666'
    }
  },

  // Festival Information
  festival: {
    name: 'A Lo Cubano Boulder Fest',
    subtitle: 'Boulder Fest 2026',
    dates: 'May 15-17, 2026',
    year: 2026,
    
    // Venue details
    venue: {
      name: 'Avalon Ballroom',
      address: '6185 Arapahoe Rd, Boulder, CO 80303',
      city: 'Boulder',
      state: 'Colorado',
      zipCode: '80303'
    },
    
    // Contact information
    contact: {
      email: 'alocubanoboulderfest@gmail.com',
      website: 'www.alocubanoboulderfest.com',
      instagram: '@alocubano.boulderfest',
      instagramUrl: 'https://www.instagram.com/alocubano.boulderfest/'
    },
    
    // Event details
    event: {
      type: 'Cuban Salsa Festival',
      ageRestriction: '18+',
      checkInTime: '1 hour before first workshop',
      dresscode: 'Casual to festive',
      parking: 'Available on-site'
    }
  },

  // Email Content Settings
  content: {
    // Spanish phrases used throughout emails
    spanish: {
      greeting: '¡Gracias por tu compra!',
      farewell: '¡Nos vemos en la pista!',
      welcome: '¡Bienvenidos!',
      seeYouSoon: '¡Esperamos verte pronto!',
      withLove: 'Con cariño',
      thanks: 'Gracias'
    },
    
    // Common email signatures
    signatures: {
      team: 'The A Lo Cubano Boulder Fest Team',
      founder: 'Marcela Lay, Festival Director',
      support: 'Customer Support Team'
    },
    
    // Legal disclaimers
    legal: {
      nonTransferable: 'This ticket is non-transferable and non-refundable',
      ageRestriction: 'Valid ID required for entry (18+ event)',
      photography: 'Photography and videography may occur during the festival',
      scheduleChange: 'Festival schedule subject to change - check website for updates'
    }
  },

  // Error Handling Configuration
  errorHandling: {
    maxRetries: 3,
    retryDelayMs: 1000,
    exponentialBackoff: true,
    
    // Fallback options
    fallbackTemplates: {
      receipt: 'receipt-simple',
      paymentFailure: 'failure-simple',
      refundConfirmation: 'refund-simple'
    },
    
    // Error logging
    logErrors: true,
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
  },

  // Performance Settings
  performance: {
    // Template caching
    cacheTemplates: true,
    cacheTimeout: 3600000, // 1 hour in milliseconds
    
    // Batch processing
    batchSize: 100,
    batchDelay: 1000, // 1 second between batches
    
    // Concurrent processing
    maxConcurrentEmails: 10,
    
    // Memory management
    maxTemplateSize: 1048576, // 1MB
    maxAttachmentSize: 10485760 // 10MB
  },

  // Development Settings
  development: {
    // Test mode settings
    testMode: process.env.NODE_ENV !== 'production',
    testEmail: process.env.TEST_EMAIL || 'test@example.com',
    
    // Debugging
    enableDebugLogs: process.env.NODE_ENV !== 'production',
    saveEmailsToFile: process.env.SAVE_EMAILS_TO_FILE === 'true',
    emailSaveDirectory: './tmp/emails/',
    
    // Mock services
    mockSendGrid: process.env.MOCK_SENDGRID === 'true',
    mockPDFGeneration: process.env.MOCK_PDF === 'true'
  },

  // Security Settings
  security: {
    // Ticket security
    ticketSecret: process.env.TICKET_SECRET || 'change-me-in-production',
    qrCodeExpiration: '2026-05-18T23:59:59Z',
    
    // Email security
    validateEmailAddresses: true,
    sanitizeHtml: true,
    
    // Rate limiting
    enableRateLimiting: true,
    maxEmailsPerIp: 100,
    rateLimitWindow: 3600000 // 1 hour
  }
};

/**
 * Validate configuration on load
 */
function validateConfig() {
  const errors = [];
  
  // Check required environment variables
  if (!config.sendgrid.apiKey && process.env.NODE_ENV === 'production') {
    errors.push('SENDGRID_API_KEY is required in production');
  }
  
  if (!config.sendgrid.fromEmail) {
    errors.push('SENDGRID_FROM_EMAIL must be configured');
  }
  
  if (!config.security.ticketSecret || config.security.ticketSecret === 'change-me-in-production') {
    errors.push('TICKET_SECRET must be set to a secure value in production');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(config.sendgrid.fromEmail)) {
    errors.push('SENDGRID_FROM_EMAIL must be a valid email address');
  }
  
  if (errors.length > 0) {
    console.error('❌ Email service configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid email service configuration');
    }
  }
}

// Validate configuration
validateConfig();

module.exports = config;