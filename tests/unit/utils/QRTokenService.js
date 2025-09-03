/**
 * QRTokenService - Pure business logic for QR code and JWT token operations
 * Extracted from API handlers for unit testing
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Token expiration constants (in milliseconds)
export const TOKEN_EXPIRY = {
  ACCESS: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
  ACTION: 30 * 60 * 1000, // 30 minutes
  QR_CODE: 24 * 60 * 60 * 1000 // 24 hours
};

// Token actions
export const TOKEN_ACTIONS = {
  TRANSFER: 'transfer',
  CANCEL: 'cancel',
  REFUND: 'refund',
  VIEW: 'view'
};

/**
 * Generate cryptographically secure random ID
 */
export function generateSecureId(prefix = '', length = 8) {
  const randomBytes = crypto.randomBytes(length);
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes.toString('hex').toUpperCase();
  
  return prefix 
    ? `${prefix}-${timestamp}-${random.substring(0, length)}`
    : `${timestamp}-${random.substring(0, length)}`;
}

/**
 * Generate secure ticket ID
 */
export function generateTicketId(prefix = 'TKT') {
  return generateSecureId(prefix, 6);
}

/**
 * Hash token for secure storage
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }
  
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate JWT token for registration
 */
export function generateRegistrationToken(payload, secret, expiresIn = '7d') {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }
  
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Secret must be at least 32 characters');
  }
  
  if (!payload.transactionId) {
    throw new Error('Transaction ID is required in payload');
  }
  
  const tokenPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(tokenPayload, secret, { 
    algorithm: 'HS256',
    expiresIn
  });
}

/**
 * Verify JWT token
 */
export function verifyJWTToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }
  
  if (!secret || typeof secret !== 'string') {
    return { valid: false, error: 'Secret is required' };
  }
  
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    
    if (!decoded.transactionId) {
      return { valid: false, error: 'Invalid token format - missing transaction ID' };
    }
    
    return { valid: true, payload: decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token has expired' };
    }
    
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Generate access token for multi-use operations
 */
export function generateAccessToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACCESS);
  
  return {
    token,
    hash: hashToken(token),
    expiresAt
  };
}

/**
 * Generate action token for single-use operations
 */
export function generateActionToken(actionType) {
  if (!Object.values(TOKEN_ACTIONS).includes(actionType)) {
    throw new Error(`Invalid action type: ${actionType}`);
  }
  
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.ACTION);
  
  return {
    token,
    hash: hashToken(token),
    actionType,
    expiresAt
  };
}

/**
 * Generate QR code validation token
 */
export function generateValidationToken(ticketId, eventId, attendeeEmail, secret) {
  if (!ticketId || !eventId || !attendeeEmail || !secret) {
    throw new Error('All parameters are required: ticketId, eventId, attendeeEmail, secret');
  }
  
  if (secret.length < 32) {
    throw new Error('Validation secret must be at least 32 characters');
  }
  
  const payload = {
    ticket_id: ticketId,
    event_id: eventId,
    email: attendeeEmail,
    issued_at: Date.now()
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
  
  const qrData = Buffer.from(`${payloadString}.${signature}`).toString('base64');
  
  return {
    payload: payloadString,
    signature,
    qrData
  };
}

/**
 * Validate QR code token
 */
export function validateQRCode(qrData, secret, expectedTicketId = null, maxAge = TOKEN_EXPIRY.QR_CODE) {
  if (!qrData || typeof qrData !== 'string') {
    return { valid: false, error: 'QR data is required' };
  }
  
  if (!secret || typeof secret !== 'string') {
    return { valid: false, error: 'Validation secret is required' };
  }
  
  try {
    const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
    const lastDotIndex = decoded.lastIndexOf('.');
    
    if (lastDotIndex === -1) {
      return { valid: false, error: 'Malformed QR code' };
    }
    
    const payloadString = decoded.substring(0, lastDotIndex);
    const signature = decoded.substring(lastDotIndex + 1);
    
    if (!payloadString || !signature) {
      return { valid: false, error: 'Malformed QR code' };
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid QR code signature' };
    }
    
    const payload = JSON.parse(payloadString);
    
    // Validate required fields
    if (!payload.ticket_id || !payload.event_id || !payload.email || !payload.issued_at) {
      return { valid: false, error: 'Invalid QR code payload' };
    }
    
    // Check ticket ID match if provided
    if (expectedTicketId && payload.ticket_id !== expectedTicketId) {
      return { valid: false, error: 'Ticket ID mismatch' };
    }
    
    // Check age
    const age = Date.now() - payload.issued_at;
    if (age >= maxAge) {
      return { valid: false, error: 'QR code expired' };
    }
    
    return {
      valid: true,
      ticketId: payload.ticket_id,
      eventId: payload.event_id,
      email: payload.email,
      issuedAt: new Date(payload.issued_at),
      age
    };
  } catch (error) {
    return { valid: false, error: 'Failed to validate QR code' };
  }
}

/**
 * Validate action token
 */
export function validateActionToken(token, expectedAction, targetId, storedHash, expiresAt, usedAt = null) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }
  
  if (!expectedAction || !Object.values(TOKEN_ACTIONS).includes(expectedAction)) {
    return { valid: false, error: 'Invalid action type' };
  }
  
  if (!targetId) {
    return { valid: false, error: 'Target ID is required' };
  }
  
  if (!storedHash) {
    return { valid: false, error: 'Stored hash is required' };
  }
  
  // Check if already used
  if (usedAt) {
    return { valid: false, error: 'Token has already been used' };
  }
  
  // Check expiration
  const now = new Date();
  const expires = new Date(expiresAt);
  if (now > expires) {
    return { valid: false, error: 'Token has expired' };
  }
  
  // Verify hash
  const tokenHash = hashToken(token);
  if (tokenHash !== storedHash) {
    return { valid: false, error: 'Invalid token' };
  }
  
  return { valid: true };
}

/**
 * Check if token is expired
 */
export function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return false; // No expiration set
  }
  
  const now = new Date();
  const expires = new Date(expiresAt);
  
  return now > expires;
}

/**
 * Calculate token expiry time
 */
export function calculateTokenExpiry(type) {
  const now = Date.now();
  
  switch (type) {
    case 'access':
      return new Date(now + TOKEN_EXPIRY.ACCESS);
    case 'action':
      return new Date(now + TOKEN_EXPIRY.ACTION);
    case 'qr':
      return new Date(now + TOKEN_EXPIRY.QR_CODE);
    default:
      throw new Error(`Unknown token type: ${type}`);
  }
}

/**
 * Generate unsubscribe token
 */
export function generateUnsubscribeToken(email, secret) {
  if (!email || !secret) {
    throw new Error('Email and secret are required');
  }
  
  const timestamp = Date.now();
  const data = `${email}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
  
  return `${Buffer.from(data).toString('base64')}.${signature}`;
}

/**
 * Validate unsubscribe token
 */
export function validateUnsubscribeToken(email, token, secret, maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
  if (!email || !token || !secret) {
    return { valid: false, error: 'Email, token, and secret are required' };
  }
  
  try {
    const [encodedData, signature] = token.split('.');
    if (!encodedData || !signature) {
      return { valid: false, error: 'Malformed token' };
    }
    
    const data = Buffer.from(encodedData, 'base64').toString('utf-8');
    const [tokenEmail, timestamp] = data.split(':');
    
    // Verify email matches
    if (tokenEmail !== email) {
      return { valid: false, error: 'Email mismatch' };
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid token signature' };
    }
    
    // Check age
    const age = Date.now() - parseInt(timestamp);
    if (age >= maxAge) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Failed to validate token' };
  }
}