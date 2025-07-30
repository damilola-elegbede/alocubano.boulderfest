#!/usr/bin/env node

/**
 * Initialize Monitoring System
 * Setup script for comprehensive payment system monitoring
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

// Import monitoring system
import { initializeMonitoring, getRequiredEnvironmentVariables } from '../monitoring/index.js';

/**
 * Check if required environment variables are set
 */
async function checkEnvironmentVariables() {
  console.log('🔍 Checking environment variables...');
  
  const required = getRequiredEnvironmentVariables();
  const missing = [];
  
  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables:');
    missing.forEach(envVar => {
      console.warn(`   - ${envVar}`);
    });
    
    console.log('\n📝 Create a .env file with these variables or set them in your environment:');
    missing.forEach(envVar => {
      console.log(`${envVar}=your_value_here`);
    });
    
    return false;
  }
  
  console.log('✅ All required environment variables are set');
  return true;
}

/**
 * Create monitoring configuration file if it doesn't exist
 */
async function createConfigIfNeeded() {
  console.log('⚙️  Checking monitoring configuration...');
  
  const configPath = join(rootDir, 'monitoring', 'config', 'monitoring-config.js');
  const examplePath = join(rootDir, 'monitoring', 'config', 'monitoring-config.example.js');
  
  try {
    await fs.access(configPath);
    console.log('✅ Monitoring configuration file exists');
  } catch (error) {
    console.log('📋 Creating monitoring configuration from example...');
    
    try {
      const exampleContent = await fs.readFile(examplePath, 'utf8');
      await fs.writeFile(configPath, exampleContent);
      console.log('✅ Created monitoring-config.js from example');
      console.log('📝 Please review and customize the configuration file');
    } catch (err) {
      console.error('❌ Failed to create configuration file:', err.message);
      return false;
    }
  }
  
  return true;
}

/**
 * Test monitoring system initialization
 */
async function testMonitoringInitialization() {
  console.log('🧪 Testing monitoring system initialization...');
  
  try {
    // Import configuration
    const { finalConfig } = await import('../monitoring/config/monitoring-config.js');
    
    // Initialize monitoring with test configuration
    const testConfig = {
      ...finalConfig,
      // Disable external services for testing
      sentry: { ...finalConfig.sentry, enabled: false },
      analytics: { ...finalConfig.analytics, enabled: false },
      alerting: {
        ...finalConfig.alerting,
        email: { operations: ['test@localhost'] },
        slack: { enabled: false },
        sms: { enabled: false },
        pagerduty: { enabled: false }
      }
    };
    
    await initializeMonitoring(testConfig);
    console.log('✅ Monitoring system initialized successfully');
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize monitoring system:', error.message);
    return false;
  }
}

/**
 * Create sample environment file
 */
async function createSampleEnvironmentFile() {
  const envPath = join(rootDir, '.env.monitoring.example');
  
  const envContent = `# Monitoring System Environment Variables
# Copy to .env and customize for your environment

# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn-here@sentry.io/project-id

# Google Analytics Configuration  
GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# Alerting Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-integration-key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK

# Business Intelligence Configuration
DAILY_REVENUE_TARGET=50000
MONTHLY_REVENUE_TARGET=1500000

# Alert Recipients
ALERT_EMAIL_RECIPIENTS=ops@alocubanoboulderfest.com,marcela@alocubanoboulderfest.com
ONCALL_PHONE_1=+1234567890
SECURITY_PHONE_1=+1234567890

# Custom Integrations
CUSTOM_WEBHOOK_URL=https://your-custom-monitoring-webhook.com/alerts
CUSTOM_WEBHOOK_TOKEN=your-webhook-authentication-token

# Node Environment
NODE_ENV=development
`;

  try {
    await fs.writeFile(envPath, envContent);
    console.log('✅ Created sample environment file: .env.monitoring.example');
  } catch (error) {
    console.error('❌ Failed to create sample environment file:', error.message);
  }
}

/**
 * Display setup summary
 */
function displaySetupSummary() {
  console.log(`
🎉 Monitoring System Setup Complete!

📁 Files Created:
   - monitoring/ (all monitoring system files)
   - monitoring/config/monitoring-config.js
   - .env.monitoring.example

📋 Next Steps:
   1. Copy .env.monitoring.example to .env
   2. Fill in your actual API keys and configuration values
   3. Review monitoring/config/monitoring-config.js
   4. Test the system with: npm run test:monitoring
   5. Start your application with monitoring enabled

🔗 Integration:
   - Use the enhanced payment API: api/payment/create-checkout-session-with-monitoring.js
   - Add monitoring middleware to your Express app
   - Access the dashboard at /api/monitoring/dashboard

📚 Documentation:
   - Read monitoring/README.md for detailed usage instructions
   - Check monitoring/config/monitoring-config.example.js for all options

⚠️  Important:
   - Never commit real API keys to version control
   - Test alerting channels before going to production
   - Monitor the monitoring system itself for reliability

🆘 Support:
   - Technical issues: dev@alocubanoboulderfest.com
   - Business metrics: business@alocubanoboulderfest.com
   - Security alerts: security@alocubanoboulderfest.com
`);
}

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Initializing A Lo Cubano Payment System Monitoring\n');
  
  try {
    // Check environment variables
    const envOk = await checkEnvironmentVariables();
    
    // Create configuration file
    const configOk = await createConfigIfNeeded();
    
    if (!configOk) {
      console.error('❌ Failed to setup configuration');
      process.exit(1);
    }
    
    // Create sample environment file
    await createSampleEnvironmentFile();
    
    // Test initialization if environment is ready
    if (envOk) {
      const testOk = await testMonitoringInitialization();
      
      if (!testOk) {
        console.warn('⚠️  Monitoring system setup completed with warnings');
        console.warn('   Please check your configuration and try again');
      }
    }
    
    // Display setup summary
    displaySetupSummary();
    
    console.log('✅ Monitoring system setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the setup
main().catch(error => {
  console.error('❌ Unexpected error during setup:', error);
  process.exit(1);
});