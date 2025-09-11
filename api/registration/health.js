import { getDatabaseClient } from '../../lib/database.js';
import { getBrevoClient } from '../../lib/brevo-client.js';

const VERSION = '1.0.0';
const SERVICE_NAME = 'registration-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader("Allow", "GET, OPTIONS");    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simplified health check response matching test expectations
  try {
    const db = await getDatabaseClient();
    await db.execute('SELECT 1 as health_check');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'registration-api',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'registration-api',
      version: '1.0.0',
      error: error.message
    });
  }
}