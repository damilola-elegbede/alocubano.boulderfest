/**
 * Performance Final Report API endpoint
 * Handles final performance metrics reporting when page is unloading
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are supported'
    });
    return;
  }

  try {
    let metrics = req.body;

    // Handle sendBeacon string bodies - parse JSON if needed
    if (typeof metrics === 'string') {
      try {
        metrics = JSON.parse(metrics);
      } catch (parseError) {
        console.error('[Performance Final] Failed to parse JSON body:', parseError);
        res.status(400).json({
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        });
        return;
      }
    }

    // Handle text/plain content type from sendBeacon
    if (req.headers['content-type'] === 'text/plain' && typeof metrics === 'object') {
      // Body is already parsed correctly, continue
    }

    // Log final metrics (in production, you'd store these)
    console.log('[Performance Final] Received final metrics:', {
      timestamp: new Date().toISOString(),
      sessionId: metrics.sessionId,
      totalEvents: metrics.events?.length || 0,
      coreWebVitals: {
        lcp: metrics.metrics?.lcp?.value,
        fid: metrics.metrics?.fid?.value,
        cls: metrics.metrics?.cls?.value
      },
      galleryMetrics: {
        totalImagesLoaded: metrics.metrics?.totalImagesLoaded,
        cacheHitRatio: metrics.metrics?.cacheHitRatio
      }
    });

    res.status(200).json({
      success: true,
      message: 'Final metrics recorded successfully'
    });
  } catch (error) {
    console.error('[Performance Final] Error processing metrics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process final metrics'
    });
  }
}