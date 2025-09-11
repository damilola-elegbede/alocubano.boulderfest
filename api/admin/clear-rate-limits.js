/**
 * Clear rate limits endpoint - TEST ENVIRONMENTS ONLY
 * This endpoint allows clearing rate limit state between E2E tests
 * to prevent cascading failures from rate limiting persistence
 */

import { getRateLimitService } from '../../lib/rate-limit-service.js';

export default async function handler(req, res) {
  // Only allow in test environments
  if (process.env.E2E_TEST_MODE !== 'true' && 
      process.env.CI !== 'true' && 
      process.env.VERCEL_ENV !== 'preview' &&
      process.env.NODE_ENV !== 'test') {
    return res.status(403).json({ 
      error: 'This endpoint is only available in test environments' 
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