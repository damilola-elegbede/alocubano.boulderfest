/**
 * Encryption Key API - Derives session-specific encryption keys for client-side PII encryption
 *
 * This endpoint provides encryption keys for the checkout page to encrypt attendee
 * PII (names, emails) before storing in localStorage. Keys are derived from a
 * server-side secret combined with the cart session ID.
 *
 * Security:
 * - Keys are derived per-session (different session = different key)
 * - Server secret never exposed to client
 * - Keys are short-lived (1 hour expiration recommendation)
 *
 * @module api/checkout/encryption-key
 */

import crypto from 'crypto';

/**
 * Derives an encryption key from the server secret and session ID
 * Uses HMAC-SHA256 for key derivation (similar to HKDF pattern)
 *
 * @param {string} sessionId - Cart session identifier
 * @returns {string} Base64-encoded 32-byte key for AES-256
 */
function deriveEncryptionKey(sessionId) {
    const secret = process.env.ATTENDEE_ENCRYPTION_SECRET;

    if (!secret) {
        throw new Error('ATTENDEE_ENCRYPTION_SECRET not configured');
    }

    // Derive key using HMAC-SHA256 with session-specific context
    const key = crypto
        .createHmac('sha256', secret)
        .update(`attendee-encryption-v1-${sessionId}`)
        .digest('base64');

    return key;
}

/**
 * API Handler
 *
 * GET /api/checkout/encryption-key?sessionId=<cart-session-id>
 *
 * Returns:
 * - key: Base64-encoded encryption key for AES-256-GCM
 * - sessionId: The session ID used (generated if not provided)
 * - expiresIn: Recommended key lifetime in seconds
 */
export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            allowed: ['GET'],
        });
    }

    try {
        // Get or generate session ID
        const sessionId = req.query.sessionId || crypto.randomUUID();

        // Validate session ID format (prevent injection)
        if (!/^[\w-]{1,128}$/.test(sessionId)) {
            return res.status(400).json({
                error: 'Invalid session ID format',
            });
        }

        // Derive the encryption key
        const key = deriveEncryptionKey(sessionId);

        // Return key with metadata
        res.status(200).json({
            key,
            sessionId,
            expiresIn: 3600, // 1 hour recommended lifetime
            algorithm: 'AES-256-GCM',
        });
    } catch (error) {
        console.error('Encryption key derivation error:', error.message);

        // Don't expose internal errors
        if (error.message.includes('not configured')) {
            return res.status(500).json({
                error: 'Encryption service not configured',
            });
        }

        res.status(500).json({
            error: 'Failed to generate encryption key',
        });
    }
}
