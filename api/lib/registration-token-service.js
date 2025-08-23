import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabaseClient } from './database.js';

export class RegistrationTokenService {
  constructor() {
    this.secret = null;
    this.tokenExpiry = 72 * 60 * 60; // 72 hours in seconds
    this._initPromise = null;
  }

  async ensureInitialized() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const secret = process.env.REGISTRATION_SECRET;
      if (!secret || secret.length < 32) {
        throw new Error('REGISTRATION_SECRET must be set (>=32 chars) for token signing');
      }
      this.secret = secret;
    })().catch((err) => {
      // allow retry on next call
      this._initPromise = null;
      throw err;
    });
    return this._initPromise;
  }

  async createToken(transactionId) {
    await this.ensureInitialized();
    const tokenId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + (this.tokenExpiry * 1000);
    
    // Create JWT with minimal payload
    const token = jwt.sign({
      tid: tokenId,
      txn: transactionId,
      type: 'registration',
      iat: Math.floor(now / 1000),
      exp: Math.floor(expiresAt / 1000)
    }, this.secret, { algorithm: 'HS256' });
    
    // Store server-side state for tracking
    const db = await getDatabaseClient();
    await db.execute({
      sql: `UPDATE transactions 
            SET registration_token = ?, 
                registration_token_expires = ?,
                registration_initiated_at = ?
            WHERE id = ?`,
      args: [token, new Date(expiresAt).toISOString(), new Date().toISOString(), transactionId]
    });
    
    await this.logTokenUsage(tokenId, null, 'created');
    return token;
  }

  async validateAndConsumeToken(token, ipAddress) {
    await this.ensureInitialized();
    const startTime = Date.now();
    
    try {
      // Verify JWT signature and expiration
      const decoded = jwt.verify(token, this.secret);
      
      // Check server-side state
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT * FROM transactions 
              WHERE registration_token = ? 
              AND datetime(registration_token_expires) > datetime('now')`,
        args: [token]
      });
      
      if (result.rows.length === 0) {
        throw new Error('Token invalid or expired');
      }
      
      const transaction = result.rows[0];
      
      // Check if already used (all tickets registered)
      if (transaction.all_tickets_registered) {
        throw new Error('Registration already completed');
      }
      
      // Atomically consume the token to enforce single-use
      await db.execute({
        sql: `UPDATE transactions
              SET registration_token = NULL,
                  registration_token_expires = NULL
              WHERE id = ?
                AND registration_token = ?`,
        args: [transaction.id, token]
      });
      
      // Log token usage
      const validationTime = Date.now() - startTime;
      await this.logTokenUsage(decoded.tid, ipAddress, 'validated');
      
      // Check performance target
      if (validationTime > 100) {
        console.warn(`Token validation exceeded 100ms: ${validationTime}ms`);
      }
      
      return {
        transactionId: transaction.id,
        customerId: transaction.customer_email,
        expiresAt: transaction.registration_token_expires
      };
    } catch (error) {
      await this.logTokenUsage(null, ipAddress, 'failed', error.message);
      throw error;
    }
  }

  async revokeToken(transactionId) {
    await this.ensureInitialized();
    const db = await getDatabaseClient();
    await db.execute({
      sql: `UPDATE transactions 
            SET registration_token = NULL,
                registration_token_expires = NULL
            WHERE id = ?`,
      args: [transactionId]
    });
  }

  async logTokenUsage(tokenId, ipAddress, action, errorMessage = null) {
    // Implement audit logging per REQ-SEC-005
    console.log(JSON.stringify({
      event: 'registration_token_usage',
      tokenId: tokenId?.substring(0, 8),
      ip: ipAddress,
      action,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }));
  }
}

// Export singleton instance
export const registrationTokenService = new RegistrationTokenService();