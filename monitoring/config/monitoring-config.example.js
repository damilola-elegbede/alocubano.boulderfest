/**
 * Monitoring System Configuration Example
 * Copy to monitoring-config.js and customize for your environment
 */

export const monitoringConfig = {
  // Sentry Configuration
  sentry: {
    enabled: true,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    sampleRate: process.env.NODE_ENV === 'production' ? 0.8 : 1.0,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0
  },

  // Google Analytics Configuration
  analytics: {
    enabled: true,
    measurementId: process.env.GA4_MEASUREMENT_ID,
    enhancedEcommerce: true,
    privacyCompliant: true,
    customDimensions: {
      festival_year: '2026',
      ticket_type: 'custom_dimension_2',
      customer_type: 'custom_dimension_3',
      payment_method: 'custom_dimension_4',
      referral_source: 'custom_dimension_5'
    }
  },

  // Performance Monitoring Configuration
  performance: {
    enabled: true,
    thresholds: {
      api_response_time: 2000,      // 2 seconds
      db_query_time: 1000,          // 1 second
      payment_processing: 5000,     // 5 seconds
      email_delivery: 3000,         // 3 seconds
      inventory_check: 500          // 500ms
    },
    alertCooldown: {
      critical: 300000,   // 5 minutes
      high: 600000,       // 10 minutes
      medium: 1800000,    // 30 minutes
      low: 3600000,       // 1 hour
      info: 7200000       // 2 hours
    }
  },

  // Business Intelligence Configuration
  businessIntelligence: {
    enabled: true,
    revenueTarget: {
      daily: parseFloat(process.env.DAILY_REVENUE_TARGET) || 50000,
      monthly: parseFloat(process.env.MONTHLY_REVENUE_TARGET) || 1500000
    },
    inventoryThresholds: {
      full_weekend_pass: 50,
      saturday_only: 25,
      sunday_only: 25,
      workshop_addon: 10,
      vip_pass: 15
    },
    conversionTargets: {
      overall: 2.5,        // 2.5% conversion rate target
      checkout: 85,        // 85% checkout completion target
      payment: 95          // 95% payment success rate target
    }
  },

  // Alerting System Configuration
  alerting: {
    enabled: true,
    
    // Email Configuration
    email: {
      operations: [
        'ops@alocubanoboulderfest.com',
        'marcela@alocubanoboulderfest.com'
      ],
      development: [
        'dev@alocubanoboulderfest.com'
      ],
      business: [
        'business@alocubanoboulderfest.com',
        'marcela@alocubanoboulderfest.com'
      ],
      security: [
        'security@alocubanoboulderfest.com',
        'ops@alocubanoboulderfest.com'
      ],
      executives: [
        'marcela@alocubanoboulderfest.com'
      ]
    },

    // Slack Configuration
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      alertsChannel: '#payment-alerts',
      businessChannel: '#business-metrics',
      securityChannel: '#security-alerts',
      devChannel: '#dev-alerts'
    },

    // SMS Configuration (using Twilio or similar)
    sms: {
      oncallNumbers: [
        process.env.ONCALL_PHONE_1,
        process.env.ONCALL_PHONE_2
      ].filter(Boolean),
      securityNumbers: [
        process.env.SECURITY_PHONE_1
      ].filter(Boolean)
    },

    // PagerDuty Configuration
    pagerduty: {
      integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
      enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY
    },

    // Discord Configuration
    discord: {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      channelName: 'payment-alerts',
      enabled: !!process.env.DISCORD_WEBHOOK_URL
    },

    // Webhook Integrations
    webhooks: [
      {
        name: 'custom_monitoring',
        url: process.env.CUSTOM_WEBHOOK_URL,
        headers: {
          'Authorization': `Bearer ${process.env.CUSTOM_WEBHOOK_TOKEN}`
        },
        enabled: !!process.env.CUSTOM_WEBHOOK_URL
      }
    ].filter(webhook => webhook.enabled),

    // Alert Rules Configuration
    rules: {
      // Payment failure thresholds
      paymentFailures: {
        enabled: true,
        threshold: 5,           // Alert after 5 failures
        timeWindow: 600000,     // Within 10 minutes
        severity: 'high'
      },

      // High error rate thresholds
      errorRate: {
        enabled: true,
        threshold: 10,          // 10% error rate
        timeWindow: 300000,     // Within 5 minutes
        severity: 'high'
      },

      // Performance degradation
      performance: {
        enabled: true,
        responseTimeThreshold: 3000,  // 3 seconds
        severity: 'medium'
      },

      // Revenue anomalies
      revenue: {
        enabled: true,
        dropThreshold: 20,      // 20% drop from expected
        severity: 'medium'
      },

      // Inventory alerts
      inventory: {
        enabled: true,
        criticalThreshold: 5,   // 5 tickets remaining
        warningThreshold: 25,   // 25 tickets remaining
        severity: 'medium'
      }
    }
  },

  // Dashboard Configuration
  dashboard: {
    enabled: true,
    updateInterval: 30000,    // 30 seconds
    dataRetention: {
      realTime: 86400000,     // 24 hours
      hourly: 2592000000,     // 30 days
      daily: 31536000000      // 1 year
    },
    features: {
      realTimeEvents: true,
      executiveSummary: true,
      performanceMetrics: true,
      businessMetrics: true,
      alertsPanel: true,
      customWidgets: true
    }
  },

  // Integration Settings
  integrations: {
    // Stripe webhook configuration
    stripe: {
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      trackPaymentIntents: true,
      trackCustomers: true,
      trackProducts: true
    },

    // Email service integration
    email: {
      provider: 'sendgrid', // or 'ses', 'mailgun'
      apiKey: process.env.SENDGRID_API_KEY,
      trackDelivery: true,
      trackOpens: true,
      trackClicks: true
    },

    // Database monitoring
    database: {
      connectionString: process.env.DATABASE_URL,
      slowQueryThreshold: 1000,  // 1 second
      connectionPoolMonitoring: true
    }
  },

  // Environment-specific overrides
  environments: {
    development: {
      sentry: {
        sampleRate: 1.0,
        tracesSampleRate: 1.0
      },
      alerting: {
        email: {
          operations: ['dev@localhost']
        }
      },
      dashboard: {
        updateInterval: 5000  // 5 seconds for development
      }
    },

    staging: {
      sentry: {
        sampleRate: 1.0,
        tracesSampleRate: 0.5
      },
      alerting: {
        email: {
          operations: ['staging-alerts@alocubanoboulderfest.com']
        }
      }
    },

    production: {
      sentry: {
        sampleRate: 0.8,
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.05
      },
      performance: {
        thresholds: {
          api_response_time: 1500,  // Stricter in production
          payment_processing: 3000
        }
      }
    }
  }
};

// Environment-specific configuration
const environment = process.env.NODE_ENV || 'development';
const envConfig = monitoringConfig.environments[environment] || {};

// Merge environment-specific config
export const finalConfig = {
  ...monitoringConfig,
  ...envConfig,
  // Deep merge for nested objects
  sentry: { ...monitoringConfig.sentry, ...envConfig.sentry },
  alerting: { 
    ...monitoringConfig.alerting, 
    ...envConfig.alerting,
    email: { ...monitoringConfig.alerting.email, ...envConfig.alerting?.email }
  },
  performance: { 
    ...monitoringConfig.performance, 
    ...envConfig.performance,
    thresholds: { 
      ...monitoringConfig.performance.thresholds, 
      ...envConfig.performance?.thresholds 
    }
  },
  dashboard: { ...monitoringConfig.dashboard, ...envConfig.dashboard }
};

export default finalConfig;