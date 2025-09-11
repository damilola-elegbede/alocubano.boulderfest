// Simple health check endpoint to test if functions are working
export default async function handler(req, res) {
  try {
    const envCheck = {
      hasAdminSecret: !!process.env.ADMIN_SECRET,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      hasTestAdminPassword: !!process.env.TEST_ADMIN_PASSWORD,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      timestamp: new Date().toISOString()
    };
    
    res.status(200).json({
      status: 'ok',
      message: 'Admin health check passed',
      environment: envCheck
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
}