// Staging environment configuration for payment features
export const config = {
  environment: 'staging',
  
  // Payment provider configuration
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY_TEST,
    secretKey: process.env.STRIPE_SECRET_KEY_TEST,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_TEST,
    apiVersion: '2023-10-16',
    testMode: true
  },
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID_SANDBOX,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET_SANDBOX,
    mode: 'sandbox',
    apiUrl: 'https://api-m.sandbox.paypal.com'
  },
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    poolSize: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    query_timeout: 30000
  },
  
  // Redis cache configuration
  redis: {
    url: process.env.REDIS_URL,
    keyPrefix: 'alocubano:staging:',
    ttl: 3600, // 1 hour
    tls: {
      rejectUnauthorized: false
    }
  },
  
  // Security settings
  security: {
    rateLimiting: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // Limit each IP to 50 requests per windowMs
      paymentEndpoints: {
        windowMs: 60 * 1000, // 1 minute
        max: 5 // Limit payment attempts
      }
    },
    cors: {
      origin: [
        'https://staging-alocubano.vercel.app',
        'https://*.vercel.app'
      ],
      credentials: true
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000
    },
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.stripe.com', 'https://www.paypal.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com', 'https://api.paypal.com'],
        frameSrc: ['https://js.stripe.com', 'https://www.paypal.com']
      }
    }
  },
  
  // Monitoring configuration
  monitoring: {
    enabled: true,
    logLevel: 'info',
    datadogEnabled: true,
    datadogApiKey: process.env.DATADOG_API_KEY,
    sentryEnabled: true,
    sentryDsn: process.env.SENTRY_DSN,
    consoleLogging: true
  },
  
  // Feature flags
  features: {
    stripePayments: true,
    paypalPayments: true,
    applePayEnabled: true,
    googlePayEnabled: true,
    savePaymentMethods: true,
    subscriptions: false,
    refunds: true,
    webhooks: true
  },
  
  // Email configuration
  email: {
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY,
    from: 'staging@alocubano.boulderfest.com',
    templates: {
      paymentConfirmation: 'd-staging-payment-confirmation',
      paymentFailed: 'd-staging-payment-failed',
      refundProcessed: 'd-staging-refund-processed'
    }
  },
  
  // API configuration
  api: {
    baseUrl: 'https://staging-alocubano.vercel.app',
    timeout: 20000,
    retries: 2,
    retryDelay: 1000
  },
  
  // Backup configuration
  backup: {
    enabled: true,
    schedule: '0 */6 * * *', // Every 6 hours
    retention: 7 // days
  }
};

export default config;