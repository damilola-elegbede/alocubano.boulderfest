import appleWalletService from "../../lib/apple-wallet-service.js";
import { getCorsConfig, isOriginAllowed } from "../../lib/cors-config.js";

export default async function handler(req, res) {
  // Handle CORS
  const corsConfig = getCorsConfig(); const origin = req.headers.origin; if (origin && isOriginAllowed(origin, corsConfig)) { res.setHeader("Access-Control-Allow-Origin", origin); } res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { ticketId } = req.query;

  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID is required' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Generate the .pkpass file
    const passBuffer = await appleWalletService.generatePass(ticketId);

    // Set appropriate headers for .pkpass file download
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket-${ticketId}.pkpass"`
    );
    res.setHeader('Content-Length', passBuffer.length);

    // Send the pass file
    return res.status(200).send(passBuffer);
  } catch (error) {
    console.error('Apple Wallet API error:', error);

    if (error.message === 'Ticket not found') {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (error.message.includes('not configured')) {
      return res.status(503).json({
        error: 'Apple Wallet is not configured',
        message: 'Please contact support for assistance'
      });
    }

    return res.status(500).json({
      error: 'Failed to generate Apple Wallet pass',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
