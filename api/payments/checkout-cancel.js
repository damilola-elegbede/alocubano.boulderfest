/**
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
 * Checkout Cancel API Endpoint
 * Handles cancelled Stripe Checkout returns
 */

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id, order_id } = req.query;

    console.log('Checkout cancelled:', {
      sessionId: session_id,
      orderId: order_id,
      timestamp: new Date().toISOString()
    });

    // Return cancellation response with instructions
    res.status(200).json({
      cancelled: true,
      message: 'Checkout was cancelled. Your cart items have been preserved.',
      instructions: {
        preserveCart: true, // Don't clear the cart
        redirectUrl: '/tickets', // Redirect back to tickets page
        redirectDelay: 20000, // 20 seconds
        nextSteps: [
          'Your cart items are still saved',
          'You can complete your purchase anytime',
          'Contact us if you experienced any issues'
        ]
      },
      supportInfo: {
        email: 'alocubanoboulderfest@gmail.com',
        instagram: '@alocubano.boulderfest',
        message: 'Need help? Contact us for assistance with your purchase.'
      }
    });
  } catch (error) {
    console.error('Error handling checkout cancellation:', error);

    // Even if there's an error, we want to handle the cancellation gracefully
    res.status(200).json({
      cancelled: true,
      message: 'Checkout was cancelled. You can try again anytime.',
      instructions: {
        preserveCart: true,
        redirectUrl: '/tickets',
        redirectDelay: 3000,
        nextSteps: [
          'Return to the tickets page to try again',
          'Contact us if you continue to experience issues'
        ]
      },
      supportInfo: {
        email: 'alocubanoboulderfest@gmail.com',
        instagram: '@alocubano.boulderfest'
      }
    });
  }
}
