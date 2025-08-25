import { getDatabaseClient } from '../lib/database.js';
import { getBrevoClient } from '../lib/brevo-client.js';

const VERSION = '1.0.0';
const SERVICE_NAME = 'registration-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const checks = {
    database: { status: 'unknown', responseTime: null },
    email: { status: 'unknown', responseTime: null },
    overall: 'healthy'
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    const db = await getDatabaseClient();
    const result = await db.execute('SELECT 1 as health_check');
    
    if (result.rows && result.rows.length > 0) {
      checks.database.status = 'healthy';
      checks.database.responseTime = Date.now() - dbStart;
    } else {
      checks.database.status = 'degraded';
      checks.overall = 'degraded';
    }
  } catch (error) {
    console.error('Database health check failed:', error);
    checks.database.status = 'unhealthy';
    checks.database.error = error.message;
    checks.overall = 'unhealthy';
  }

  // Check email service (Brevo)
  try {
    const emailStart = Date.now();
    const brevo = await getBrevoClient();
    
    // Check if Brevo client is initialized
    if (brevo && brevo.sendTransactionalEmail) {
      checks.email.status = 'healthy';
      checks.email.responseTime = Date.now() - emailStart;
    } else {
      checks.email.status = 'degraded';
      checks.overall = checks.overall === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } catch (error) {
    console.error('Email service health check failed:', error);
    checks.email.status = 'unhealthy';
    checks.email.error = error.message;
    checks.overall = checks.overall === 'healthy' ? 'degraded' : 'unhealthy';
  }

  const totalTime = Date.now() - startTime;

  // Return appropriate status code based on health
  const statusCode = checks.overall === 'healthy' ? 200 : 
                     checks.overall === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    service: SERVICE_NAME,
    version: VERSION,
    status: checks.overall,
    timestamp: new Date().toISOString(),
    responseTime: totalTime,
    checks: {
      database: {
        status: checks.database.status,
        responseTime: checks.database.responseTime,
        ...(checks.database.error && { error: checks.database.error })
      },
      email: {
        status: checks.email.status,
        responseTime: checks.email.responseTime,
        ...(checks.email.error && { error: checks.email.error })
      }
    },
    environment: process.env.NODE_ENV || 'development'
  });
}