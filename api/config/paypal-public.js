/**
 * PayPal Public Configuration Endpoint
 * Returns the PayPal client ID and environment configuration
 * This allows the frontend to access the configuration without hardcoding it
 */

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the client ID from environment with strict validation
  const clientId = process.env.PAYPAL_CLIENT_ID;

  if (!clientId) {
    console.error('❌ WARNING: PAYPAL_CLIENT_ID not configured');
    return res.status(500).json({
      error: '❌ WARNING: PAYPAL_CLIENT_ID not configured',
      message: 'PayPal system configuration error - missing client ID'
    });
  }

  // Determine environment based on PAYPAL_MODE to match backend configuration
  const paypalMode = process.env.PAYPAL_MODE || 'sandbox';
  const environment = paypalMode === 'production' ? 'live' : 'sandbox';

  // Return the configuration
  // Note: Client IDs are safe to be public (they're designed for frontend use)
  return res.status(200).json({
    clientId: clientId,
    environment: environment,
    currency: 'USD',
    intent: 'capture',
    // Additional SDK parameters
    components: ['buttons', 'marks', 'funding-eligibility'],
    enableFunding: ['venmo', 'paylater'],
    disableFunding: ['credit', 'card'] // Focus on PayPal-specific funding sources
  });
}