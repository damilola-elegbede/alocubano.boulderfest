// Production environment configuration for payment features
export const config = {
  environment: 'production',
  
  // Payment provider configuration
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: '2023-10-16',
    testMode: false
  },
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mode: 'live',
    apiUrl: 'https://api-m.paypal.com'
  },
  
  // Database configuration with read replicas
  database: {
    primary: {
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_CA_CERT
      },
      poolSize: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
      statement_timeout: 30000,
      query_timeout: 30000
    },
    readReplicas: [
      {
        url: process.env.DATABASE_READ_REPLICA_1_URL,
        ssl: {
          rejectUnauthorized: true,
          ca: process.env.DATABASE_CA_CERT
        },
        poolSize: 15
      },
      {
        url: process.env.DATABASE_READ_REPLICA_2_URL,
        ssl: {
          rejectUnauthorized: true,
          ca: process.env.DATABASE_CA_CERT
        },
        poolSize: 15
      }
    ]
  },
  
  // Redis cluster configuration
  redis: {
    cluster: true,
    nodes: [
      process.env.REDIS_NODE_1_URL,
      process.env.REDIS_NODE_2_URL,
      process.env.REDIS_NODE_3_URL
    ],
    keyPrefix: 'alocubano:prod:',
    ttl: 7200, // 2 hours
    tls: {
      rejectUnauthorized: true
    },
    retryStrategy: (times) => Math.min(times * 50, 2000)
  },
  
  // Security settings
  security: {
    rateLimiting: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30, // Limit each IP to 30 requests per windowMs
      paymentEndpoints: {
        windowMs: 60 * 1000, // 1 minute
        max: 3, // Limit payment attempts
        skipSuccessfulRequests: true
      },
      // DDoS protection
      burst: {
        windowMs: 1000, // 1 second
        max: 10 // Max 10 requests per second
      }
    },
    cors: {
      origin: [
        'https://alocubano.boulderfest.com',
        'https://www.alocubano.boulderfest.com'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 120000,
      keyRotation: true,
      keyRotationInterval: 90 // days
    },
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.stripe.com', 'https://www.paypal.com', 'https://www.google-analytics.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com', 'https://api.paypal.com', 'https://www.google-analytics.com'],
        frameSrc: ['https://js.stripe.com', 'https://www.paypal.com'],
        reportUri: '/api/csp-report'
      },
      reportOnly: false
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },
  
  // Monitoring configuration
  monitoring: {
    enabled: true,
    logLevel: 'error',
    datadogEnabled: true,
    datadogApiKey: process.env.DATADOG_API_KEY,
    datadogAppKey: process.env.DATADOG_APP_KEY,
    sentryEnabled: true,
    sentryDsn: process.env.SENTRY_DSN,
    sentryTracesSampleRate: 0.1,
    consoleLogging: false,
    // Custom metrics
    metrics: {
      paymentSuccess: true,
      paymentLatency: true,
      conversionRate: true,
      fraudDetection: true
    },
    // Alerting thresholds
    alerts: {
      errorRate: 1, // %
      responseTime: 200, // ms
      paymentSuccessRate: 95, // %
      dbConnectionPool: 80 // %
    }
  },
  
  // Feature flags from LaunchDarkly
  features: {
    provider: 'launchdarkly',
    sdkKey: process.env.LAUNCHDARKLY_SDK_KEY,
    defaults: {
      stripePayments: true,
      paypalPayments: true,
      applePayEnabled: true,
      googlePayEnabled: true,
      savePaymentMethods: true,
      subscriptions: true,
      refunds: true,
      webhooks: true,
      fraudDetection: true,
      threeDSecure: true
    }
  },
  
  // Email configuration
  email: {
    provider: 'sendgrid',
    apiKey: process.env.SENDGRID_API_KEY,
    from: 'tickets@alocubano.boulderfest.com',
    replyTo: 'support@alocubano.boulderfest.com',
    templates: {
      paymentConfirmation: 'd-payment-confirmation-prod',
      paymentFailed: 'd-payment-failed-prod',
      refundProcessed: 'd-refund-processed-prod',
      subscriptionCreated: 'd-subscription-created-prod',
      subscriptionCancelled: 'd-subscription-cancelled-prod'
    },
    // Email rate limiting
    rateLimit: {
      perUser: {
        windowMs: 3600000, // 1 hour
        max: 10
      }
    }
  },
  
  // API configuration
  api: {
    baseUrl: 'https://alocubano.boulderfest.com',
    timeout: 10000,
    retries: 3,
    retryDelay: 1000,
    circuitBreaker: {
      threshold: 5,
      timeout: 60000,
      resetTimeout: 30000
    }
  },
  
  // Backup configuration
  backup: {
    enabled: true,
    schedule: '0 */4 * * *', // Every 4 hours
    retention: 30, // days
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
    destinations: ['s3', 'glacier']
  },
  
  // Disaster recovery
  disasterRecovery: {
    rpo: 3600, // Recovery Point Objective: 1 hour
    rto: 1800, // Recovery Time Objective: 30 minutes
    autoFailover: true,
    healthCheckInterval: 30 // seconds
  },
  
  // Compliance
  compliance: {
    pciDss: true,
    gdpr: true,
    ccpa: true,
    dataRetention: {
      transactions: 2555, // 7 years
      customerData: 1095, // 3 years
      logs: 90 // days
    }
  }
};

export default config;