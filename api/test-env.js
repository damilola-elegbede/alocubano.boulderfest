export default function handler(req, res) {
  res.status(200).json({
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasAdminSecret: !!process.env.ADMIN_SECRET,
    hasTestAdminPassword: !!process.env.TEST_ADMIN_PASSWORD,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    // Don't expose actual values, just check if they exist
    adminPasswordLength: process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.length : 0,
    adminSecretLength: process.env.ADMIN_SECRET ? process.env.ADMIN_SECRET.length : 0,
    testAdminPasswordLength: process.env.TEST_ADMIN_PASSWORD ? process.env.TEST_ADMIN_PASSWORD.length : 0,
  });
}