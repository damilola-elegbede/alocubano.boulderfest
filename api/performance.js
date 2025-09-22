/**
import { setSecureCorsHeaders } from '../lib/cors-config.js';
 * Performance Analytics API
 * Handles general performance metrics and analytics data
 */

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
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
    const data = req.body;

    // Input validation
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body - expected JSON object'
      });
    }

    // Extract key metrics
    const {
      timestamp,
      url,
      sessionId,
      coreWebVitals,
      customMetrics,
      resourceTiming,
      memory,
      network,
      userAgent
    } = data;

    // Log performance data for analysis
    console.log('[PERFORMANCE ANALYTICS]:', {
      timestamp: timestamp ? new Date(timestamp).toISOString() : 'unknown',
      url: url || 'unknown',
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'unknown',
      coreWebVitals: coreWebVitals
        ? {
          lcp: coreWebVitals.lcp
            ? `${coreWebVitals.lcp.toFixed(0)}ms`
            : 'N/A',
          fid: coreWebVitals.fid
            ? `${coreWebVitals.fid.toFixed(0)}ms`
            : 'N/A',
          cls: coreWebVitals.cls ? coreWebVitals.cls.toFixed(3) : 'N/A'
        }
        : 'N/A',
      customMetrics: customMetrics
        ? Object.keys(customMetrics).length + ' metrics'
        : 'N/A',
      memory: memory
        ? `${(memory.used / 1024 / 1024).toFixed(1)}MB used`
        : 'N/A'
    });

    // Process Core Web Vitals if present
    if (coreWebVitals) {
      const insights = [];

      if (coreWebVitals.lcp > 2500) {
        insights.push('LCP needs improvement (>2.5s)');
      }
      if (coreWebVitals.fid > 100) {
        insights.push('FID needs improvement (>100ms)');
      }
      if (coreWebVitals.cls > 0.1) {
        insights.push('CLS needs improvement (>0.1)');
      }

      if (insights.length > 0) {
        console.log('[PERFORMANCE INSIGHTS]:', insights);
      }
    }

    // Process custom metrics if present
    if (customMetrics && typeof customMetrics === 'object') {
      const interestingMetrics = [];

      Object.entries(customMetrics).forEach(([key, value]) => {
        if (key.includes('virtual_scroll') && value > 16) {
          interestingMetrics.push(
            `${key}: ${value.toFixed(1)}ms (slow scroll)`
          );
        }
        if (key.includes('api_call') && value > 1000) {
          interestingMetrics.push(`${key}: ${value.toFixed(0)}ms (slow API)`);
        }
        if (key.includes('image_load') && value > 3000) {
          interestingMetrics.push(`${key}: ${value.toFixed(0)}ms (slow image)`);
        }
      });

      if (interestingMetrics.length > 0) {
        console.log('[CUSTOM METRICS INSIGHTS]:', interestingMetrics);
      }
    }

    // In a production environment, you would:
    // 1. Store metrics in a time-series database
    // 2. Aggregate data for dashboards
    // 3. Run analysis for performance trends
    // 4. Generate automated insights and recommendations
    // 5. Trigger alerts for degrading performance

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Performance metrics received and processed',
      timestamp: Date.now(),
      insights: generatePerformanceInsights(data)
    });
  } catch (error) {
    console.error('[PERFORMANCE API ERROR]:', error);
    res.status(500).json({
      error: 'Internal server error',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Generate basic performance insights from metrics data
 */
function generatePerformanceInsights(data) {
  const insights = [];

  try {
    // Core Web Vitals insights
    if (data.coreWebVitals) {
      const { lcp, fid, cls } = data.coreWebVitals;

      if (lcp && lcp < 1200) {
        insights.push({
          type: 'positive',
          message: 'Excellent Largest Contentful Paint'
        });
      } else if (lcp && lcp > 2500) {
        insights.push({
          type: 'warning',
          message: 'LCP optimization needed - consider image optimization'
        });
      }

      if (fid && fid < 50) {
        insights.push({
          type: 'positive',
          message: 'Excellent First Input Delay'
        });
      } else if (fid && fid > 100) {
        insights.push({
          type: 'warning',
          message: 'FID optimization needed - reduce JavaScript execution time'
        });
      }

      if (cls && cls < 0.05) {
        insights.push({
          type: 'positive',
          message: 'Excellent Cumulative Layout Shift'
        });
      } else if (cls && cls > 0.1) {
        insights.push({
          type: 'warning',
          message: 'CLS optimization needed - avoid layout shifts'
        });
      }
    }

    // Memory insights
    if (data.memory && data.memory.utilization) {
      if (data.memory.utilization < 50) {
        insights.push({ type: 'positive', message: 'Healthy memory usage' });
      } else if (data.memory.utilization > 80) {
        insights.push({
          type: 'warning',
          message: 'High memory usage - consider optimizing'
        });
      }
    }

    // Network insights
    if (data.network && data.network.cacheHitRate) {
      const hitRate = parseFloat(data.network.cacheHitRate);
      if (hitRate > 85) {
        insights.push({
          type: 'positive',
          message: 'Excellent cache performance'
        });
      } else if (hitRate < 60) {
        insights.push({
          type: 'warning',
          message: 'Cache optimization opportunity'
        });
      }
    }
  } catch (error) {
    console.warn('[INSIGHTS ERROR]:', error.message);
  }

  return insights;
}
