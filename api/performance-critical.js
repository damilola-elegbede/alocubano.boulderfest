/**
 * Critical Performance Metrics API
 * Handles high-priority performance alerts and critical threshold breaches
 */

export default async function handler(req, res) {
  // Set CORS headers - environment-aware for security
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? [
        'https://alocubanoboulderfest.com',
        'https://www.alocubanoboulderfest.com',
        'https://alocubano-boulderfest.vercel.app'
      ]
      : ['*']; // Allow all origins in development/testing

  const origin = req.headers.origin;
  if (process.env.NODE_ENV === 'production') {
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { metrics, timestamp, severity, url } = req.body;

    // Input validation
    if (!metrics || !timestamp || !severity) {
      return res.status(400).json({
        error: 'Missing required fields: metrics, timestamp, severity'
      });
    }

    // Log critical metrics for monitoring
    console.log(`[CRITICAL PERFORMANCE ALERT] ${severity.toUpperCase()}:`, {
      timestamp: new Date(timestamp).toISOString(),
      url: url || 'unknown',
      metrics: JSON.stringify(metrics, null, 2)
    });

    // For critical memory issues, log detailed information
    if (metrics.memory && metrics.memory.utilization > 90) {
      console.warn('[MEMORY WARNING] High memory utilization detected:', {
        utilization: `${metrics.memory.utilization.toFixed(2)}%`,
        used: `${(metrics.memory.used / 1024 / 1024).toFixed(2)}MB`,
        total: `${(metrics.memory.total / 1024 / 1024).toFixed(2)}MB`,
        url: url
      });
    }

    // For FPS issues, log performance concerns
    if (metrics.fps && metrics.fps < 30) {
      console.warn('[PERFORMANCE WARNING] Low frame rate detected:', {
        fps: metrics.fps,
        url: url,
        timestamp: new Date(timestamp).toISOString()
      });
    }

    // In a production environment, you would:
    // 1. Send to monitoring service (DataDog, New Relic, etc.)
    // 2. Trigger alerts for operations team
    // 3. Store in database for trend analysis
    // 4. Potentially auto-scale resources

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Critical metrics received and logged',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[CRITICAL API ERROR]:', error);
    res.status(500).json({
      error: 'Internal server error',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
