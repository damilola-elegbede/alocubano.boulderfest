/**
 * Clear rate limits endpoint - TEST ENVIRONMENTS ONLY
 * This endpoint allows clearing rate limit state between E2E tests
 * to prevent cascading failures from rate limiting persistence
 */

import { getRateLimitService } from '../../lib/rate-limit-service.js';
import { 
  isFeatureEnabled, 
  isIpWhitelisted, 
  getEnvironmentType,
  getSecurityHeaders 
} from '../../lib/utils/environment-detector.js';

export default async function handler(req, res) {
  // Apply security headers
  const securityHeaders = getSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // SECURITY: Check if clear-rate-limits feature is enabled
  if (!isFeatureEnabled('clear-rate-limits')) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                    req.connection?.remoteAddress;
    
    // Log security violation
    console.error('[SECURITY] Attempted access to clear-rate-limits in non-test environment', {
      environmentType: getEnvironmentType(),
      clientIp,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(403).json({ 
      error: 'Forbidden' 
    });
  }
  
  // Additional IP whitelist check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                  req.connection?.remoteAddress;
  
  if (!isIpWhitelisted(clientIp)) {
    console.error('[SECURITY] Blocked clear-rate-limits from non-whitelisted IP', {
      clientIp,
      environmentType: getEnvironmentType()
    });
    
    return res.status(403).json({ 
      error: 'Forbidden' 
    });
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rateLimitService = getRateLimitService();
    const cleared = rateLimitService.clearAll();
    
    if (cleared) {
      return res.status(200).json({ 
        success: true,
        message: 'Rate limits cleared successfully' 
      });
    } else {
      return res.status(403).json({ 
        error: 'Rate limit clearing not allowed in this environment' 
      });
    }
  } catch (error) {
    console.error('Error clearing rate limits:', error);
    return res.status(500).json({ 
      error: 'Failed to clear rate limits',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}