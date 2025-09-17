// Test database initialization
import { getDatabaseClient } from '../../lib/database.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';

async function handler(req, res) {
  console.log('[DB-Test] Handler started');
  
  try {
    console.log('[DB-Test] Attempting to get database client...');
    const db = await getDatabaseClient();
    console.log('[DB-Test] Database client obtained successfully');
    
    // Try a simple query
    console.log('[DB-Test] Running test query...');
    const result = await db.execute('SELECT 1 as test');
    console.log('[DB-Test] Query successful:', result.rows);
    
    res.status(200).json({
      status: 'ok',
      message: 'Database connection successful',
      testResult: result.rows[0],
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
        hasTursoAuth: !!process.env.TURSO_AUTH_TOKEN
      }
    });
  } catch (error) {
    console.error('[DB-Test] Error:', error.message);
    console.error('[DB-Test] Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}

export default withAdminAudit(handler, {
  logBody: false,
  logMetadata: true,
  skipMethods: [] // Track database test access for diagnostics
});