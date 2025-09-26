import googleWalletService from "../../../lib/google-wallet-service.js";
import { getCorsConfig, isOriginAllowed } from "../../../lib/cors-config.js";

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

  try {
    if (req.method === 'GET') {
      // Generate Google Wallet pass
      const passData = await googleWalletService.generatePass(ticketId);

      return res.status(200).json({
        success: true,
        saveUrl: passData.saveUrl,
        objectId: passData.objectId
      });
    } else if (req.method === 'DELETE') {
      // Revoke Google Wallet pass
      const { reason } = req.body || {};

      await googleWalletService.revokePass(
        ticketId,
        reason || 'User requested'
      );

      return res.status(200).json({
        success: true,
        message: 'Google Wallet pass revoked'
      });
    } else {
      res.setHeader('Allow', ['GET', 'DELETE', 'OPTIONS']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Google Wallet API error:', error);

    if (error.message === 'Ticket not found') {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (error.message.includes('not configured')) {
      return res.status(503).json({
        error: 'Google Wallet is not configured',
        message: 'Please contact support for assistance'
      });
    }

    return res.status(500).json({
      error: 'Failed to process Google Wallet pass',
      message:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
