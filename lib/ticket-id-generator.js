/**
 * Ticket ID Generation Service
 * Generates unique ticket IDs in the format TKT-XXXXXXXXX
 * Uses cryptographically secure random generation with database uniqueness validation
 * 
 * Requirements: REQ-FUNC-002, REQ-DB-004
 */

import crypto from 'crypto';
import { getDatabaseClient } from './database.js';

export class TicketIdGenerator {
  constructor() {
    this.prefix = 'TKT';
    this.idLength = 9;
    this.charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  }
  
  /**
   * Generate a random ticket ID (not guaranteed to be unique)
   * @returns {string} Ticket ID in format TKT-XXXXXXXXX
   */
  generateId() {
    const randomBytes = crypto.randomBytes(Math.ceil(this.idLength * 3/4));
    let id = '';
    
    for (let i = 0; i < this.idLength; i++) {
      const byte = randomBytes[i % randomBytes.length];
      id += this.charset[byte % this.charset.length];
    }
    
    return `${this.prefix}-${id}`;
  }
  
  /**
   * Generate a unique ticket ID with database validation
   * @param {number} maxAttempts - Maximum attempts to generate unique ID
   * @returns {Promise<string>} Unique ticket ID
   */
  async generateUniqueId(maxAttempts = 10) {
    const db = await getDatabaseClient();
    
    for (let i = 0; i < maxAttempts; i++) {
      const id = this.generateId();
      
      // Check uniqueness
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM tickets WHERE ticket_id = ?',
        args: [id]
      });
      
      if (result.rows[0].count === 0) {
        return id;
      }
      
      console.log(`Ticket ID collision detected: ${id}, retrying...`);
    }
    
    throw new Error('Failed to generate unique ticket ID after maximum attempts');
  }
  
  /**
   * Generate multiple unique ticket IDs efficiently
   * @param {number} count - Number of IDs to generate
   * @returns {Promise<string[]>} Array of unique ticket IDs
   */
  async generateBatch(count) {
    const ids = new Set();
    const db = await getDatabaseClient();
    
    // Generate more than needed to account for potential collisions
    const generateCount = Math.ceil(count * 1.2);
    
    for (let i = 0; i < generateCount && ids.size < count; i++) {
      ids.add(this.generateId());
    }
    
    // Check uniqueness in batch
    const idArray = Array.from(ids);
    
    if (idArray.length === 0) {
      return [];
    }
    
    const placeholders = idArray.map(() => '?').join(',');
    
    const result = await db.execute({
      sql: `SELECT ticket_id FROM tickets WHERE ticket_id IN (${placeholders})`,
      args: idArray
    });
    
    // Remove any that already exist
    const existing = new Set(result.rows.map(r => r.ticket_id));
    const unique = idArray.filter(id => !existing.has(id));
    
    // Generate more if needed
    while (unique.length < count) {
      const newId = await this.generateUniqueId();
      unique.push(newId);
    }
    
    return unique.slice(0, count);
  }
  
  /**
   * Validate ticket ID format
   * @param {string} ticketId - Ticket ID to validate
   * @returns {boolean} True if valid format
   */
  isValidFormat(ticketId) {
    const pattern = new RegExp(`^${this.prefix}-[${this.charset}]{${this.idLength}}$`);
    return pattern.test(ticketId);
  }
}

// Export singleton instance
let generatorInstance;

/**
 * Get singleton instance of TicketIdGenerator
 * @returns {TicketIdGenerator} Ticket ID generator instance
 */
export function getTicketIdGenerator() {
  if (!generatorInstance) {
    generatorInstance = new TicketIdGenerator();
  }
  return generatorInstance;
}

/**
 * Helper function for webhook to generate a single unique ticket ID
 * @returns {Promise<string>} Unique ticket ID
 */
export async function generateTicketId() {
  const generator = getTicketIdGenerator();
  return await generator.generateUniqueId();
}

/**
 * Helper function to validate ticket ID format
 * @param {string} ticketId - Ticket ID to validate
 * @returns {boolean} True if valid format
 */
export function validateTicketIdFormat(ticketId) {
  const generator = getTicketIdGenerator();
  return generator.isValidFormat(ticketId);
}