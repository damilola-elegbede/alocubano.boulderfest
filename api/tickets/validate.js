import ticketService from '../lib/ticket-service.js';
import tokenService from '../lib/token-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { qrData, checkInLocation, checkInBy } = req.body;

    if (!qrData) {
      return res.status(400).json({ 
        error: 'QR code data is required' 
      });
    }

    // Validate QR data format (base64 encoded string)
    if (typeof qrData !== 'string' || qrData.length < 10 || qrData.length > 2000) {
      return res.status(400).json({ 
        error: 'Invalid QR code format' 
      });
    }

    // Check if string is valid base64
    try {
      const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
      if (!decoded.includes('.') || decoded.split('.').length !== 2) {
        throw new Error('Invalid QR structure');
      }
    } catch (decodeError) {
      return res.status(400).json({ 
        error: 'Malformed QR code data' 
      });
    }

    // Rate limiting - prevent brute force attacks
    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || 'unknown';
    const rateLimitKey = `qr_validation_${clientIp.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    // Simple rate limiting (in production, use Redis or similar)
    if (!global.rateLimitCache) global.rateLimitCache = new Map();
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxAttempts = 10; // 10 attempts per minute per IP
    
    const attempts = global.rateLimitCache.get(rateLimitKey) || [];
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return res.status(429).json({ 
        error: 'Too many validation attempts. Please try again later.' 
      });
    }
    
    recentAttempts.push(now);
    global.rateLimitCache.set(rateLimitKey, recentAttempts);
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - windowMs;
      for (const [key, times] of global.rateLimitCache.entries()) {
        const validTimes = times.filter(time => time > cutoff);
        if (validTimes.length === 0) {
          global.rateLimitCache.delete(key);
        } else {
          global.rateLimitCache.set(key, validTimes);
        }
      }
    }

    // Validate and check in
    const result = await ticketService.validateAndCheckIn(
      qrData, 
      checkInLocation || 'Main Entry',
      checkInBy || 'Scanner'
    );

    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        error: result.error,
        checkedInAt: result.checkedInAt // For already used tickets
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ticket successfully validated and checked in',
      attendee: result.attendee,
      ticketType: result.ticketType,
      ticketId: result.ticket.ticket_id,
      checkedInAt: result.ticket.checked_in_at
    });

  } catch (error) {
    console.error('Ticket validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}