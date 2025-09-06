/**
 * Environment Debug Endpoint
 * Validates all required environment variables in preview deployment
 * Used for E2E test debugging and configuration validation
 */

export default async function handler(req, res) {
  // Only allow in development, test, or preview environments
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                             process.env.CI === 'true' || 
                             process.env.E2E_TEST_MODE === 'true' ||
                             process.env.VERCEL_ENV === 'preview';
  
  if (!isDevelopment && !isTestEnvironment) {
    return res.status(403).json({ error: 'Environment debug not available in production' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Critical environment variables for E2E testing
    const requiredVars = {
      // Authentication
      ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
      TEST_ADMIN_PASSWORD: !!process.env.TEST_ADMIN_PASSWORD,
      ADMIN_SECRET: !!process.env.ADMIN_SECRET,
      
      // Database
      TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
      
      // Email
      BREVO_API_KEY: !!process.env.BREVO_API_KEY,
      BREVO_NEWSLETTER_LIST_ID: !!process.env.BREVO_NEWSLETTER_LIST_ID,
      
      // Payments (optional)
      STRIPE_PUBLISHABLE_KEY: !!process.env.STRIPE_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      
      // Google Drive Service Account (optional - Vercel secrets are exposed as env vars)
      GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_DRIVE_GALLERY_FOLDER_ID: !!process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
    };

    // Environment detection
    const environmentDetection = {
      NODE_ENV: process.env.NODE_ENV,
      CI: process.env.CI,
      E2E_TEST_MODE: process.env.E2E_TEST_MODE,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      isE2ETest: process.env.E2E_TEST_MODE === 'true' || 
                 process.env.CI === 'true' ||
                 process.env.VERCEL_ENV === 'preview'
    };

    // User agent detection for Playwright
    const userAgent = req.headers['user-agent'] || 'unknown';
    const isPlaywright = userAgent.includes('Playwright');

    // Missing variables
    const missingVars = Object.entries(requiredVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    const criticalMissing = missingVars.filter(key => 
      ['ADMIN_SECRET', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'].includes(key)
    );

    // API availability checks
    const apiAvailability = {
      admin_auth: requiredVars.ADMIN_SECRET && (requiredVars.ADMIN_PASSWORD || requiredVars.TEST_ADMIN_PASSWORD),
      database: requiredVars.TURSO_DATABASE_URL && requiredVars.TURSO_AUTH_TOKEN,
      email: requiredVars.BREVO_API_KEY,
      payments: requiredVars.STRIPE_SECRET_KEY,
      google_drive: requiredVars.GOOGLE_SERVICE_ACCOUNT_EMAIL && requiredVars.GOOGLE_PRIVATE_KEY && requiredVars.GOOGLE_DRIVE_GALLERY_FOLDER_ID
    };

    const response = {
      timestamp: new Date().toISOString(),
      environment: environmentDetection,
      userAgent: {
        raw: userAgent.substring(0, 100) + '...',
        isPlaywright,
        isE2ETest: isPlaywright || environmentDetection.isE2ETest
      },
      variables: {
        configured: Object.keys(requiredVars).length - missingVars.length,
        total: Object.keys(requiredVars).length,
        missing: missingVars,
        criticalMissing,
        details: requiredVars
      },
      apiAvailability,
      status: {
        ready: criticalMissing.length === 0,
        issues: criticalMissing.length > 0 ? ['Critical environment variables missing'] : [],
        recommendations: []
      }
    };

    // Add recommendations
    if (missingVars.includes('TEST_ADMIN_PASSWORD') && environmentDetection.isE2ETest) {
      response.status.recommendations.push('Set TEST_ADMIN_PASSWORD for E2E testing');
    }
    
    if (!apiAvailability.google_drive) {
      response.status.recommendations.push('Set Google Drive Service Account credentials for gallery functionality');
    }
    
    if (!apiAvailability.payments) {
      response.status.recommendations.push('Set Stripe keys for payment functionality');
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Environment debug error:', error);
    res.status(500).json({ 
      error: 'Environment debug failed', 
      message: error.message 
    });
  }
}