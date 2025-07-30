// Development environment configuration for payment features
export const config = {
  environment: 'development',
  
  // Payment provider configuration
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY_TEST,
    secretKey: process.env.STRIPE_SECRET_KEY_TEST,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_TEST,
    apiVersion: '2023-10-16',
    testMode: true,
    // Test card numbers for development
    testCards: {
      success: '4242424242424242',
      decline: '4000000000000002',
      authentication: '4000002500003155'
    }
  },
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID_SANDBOX,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET_SANDBOX,
    mode: 'sandbox',
    apiUrl: 'https://api-m.sandbox.paypal.com'
  },
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/alocubano_dev',
    ssl: false,
    poolSize: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },
  
  // Redis cache configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'alocubano:dev:',
    ttl: 3600 // 1 hour
  },
  
  // Security settings
  security: {
    rateLimiting: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      paymentEndpoints: {
        windowMs: 60 * 1000, // 1 minute
        max: 10 // Limit payment attempts
      }
    },
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:8000'],
      credentials: true
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000
    }
  },
  
  // Monitoring configuration
  monitoring: {
    enabled: true,
    logLevel: 'debug',
    datadogEnabled: false,
    sentryEnabled: false,
    consoleLogging: true
  },
  
  // Feature flags
  features: {
    stripePayments: true,
    paypalPayments: true,
    applePayEnabled: false,
    googlePayEnabled: false,
    savePaymentMethods: true,
    subscriptions: false,
    refunds: true,
    webhooks: true
  },
  
  // Email configuration
  email: {
    provider: 'console', // Just log emails in development
    from: 'dev@alocubano.boulderfest.com'
  },
  
  // API configuration
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
    retries: 0
  }
};

export default config;