/**
 * Order Number Generation Service
 * Generates user-friendly order numbers in the format ALO-YYYY-NNNN
 * Uses database sequences to ensure uniqueness and sequential generation
 *
 * Format: ALO-2026-0001, ALO-2026-0002, etc.
 * - ALO = fixed prefix for A Lo Cubano Boulder Fest
 * - YYYY = 4-digit year
 * - NNNN = 4-digit zero-padded sequence (resets each year)
 */

import { getDatabaseClient } from './database.js';

export class OrderNumberGenerator {
  constructor() {
    this.prefix = 'ALO';
    this.sequenceTableName = 'order_sequences';
  }

  /**
   * Generate a unique order number with database sequence tracking
   * @returns {Promise<string>} Order number in format ALO-YYYY-NNNN
   */
  async generateOrderNumber() {
    const year = new Date().getFullYear();
    const sequenceKey = `${this.prefix}-${year}`;

    try {
      const db = await getDatabaseClient();

      // Use database transaction to ensure thread-safe sequential generation
      const result = await this.getNextSequenceNumber(db, sequenceKey, year);

      // Format with zero-padding (4 digits)
      const formattedNumber = String(result).padStart(4, '0');
      const orderNumber = `${this.prefix}-${year}-${formattedNumber}`;

      console.log(`Generated order number: ${orderNumber}`);
      return orderNumber;
    } catch (error) {
      console.error('Failed to generate order number:', error);
      throw new Error(`Order number generation failed: ${error.message}`);
    }
  }

  /**
   * Get next sequence number using atomic database operations
   * Handles year rollover and ensures thread-safe sequential generation
   * @param {Object} db - Database client
   * @param {string} sequenceKey - Sequence key (ALO-YYYY)
   * @param {number} year - Current year
   * @returns {Promise<number>} Next sequence number
   */
  async getNextSequenceNumber(db, sequenceKey, year) {
    // Try to increment existing sequence atomically
    const updateResult = await db.execute({
      sql: `UPDATE ${this.sequenceTableName}
            SET last_number = last_number + 1
            WHERE sequence_key = ?
            RETURNING last_number`,
      args: [sequenceKey]
    });

    if (updateResult.rows && updateResult.rows.length > 0) {
      const lastNumber = updateResult.rows[0].last_number || updateResult.rows[0][0];
      return Number(lastNumber) || 1; // Fallback to 1 if NaN
    }

    // If no existing sequence, create one starting at 1
    try {
      await db.execute({
        sql: `INSERT INTO ${this.sequenceTableName} (sequence_key, last_number)
              VALUES (?, ?)`,
        args: [sequenceKey, 1]
      });
      return 1;
    } catch (insertError) {
      // Handle race condition - another process may have inserted
      if (insertError.message.includes('UNIQUE constraint failed') ||
          insertError.message.includes('already exists')) {

        // Retry the update operation
        const retryResult = await db.execute({
          sql: `UPDATE ${this.sequenceTableName}
                SET last_number = last_number + 1
                WHERE sequence_key = ?
                RETURNING last_number`,
          args: [sequenceKey]
        });

        if (retryResult.rows && retryResult.rows.length > 0) {
          const lastNumber = retryResult.rows[0].last_number || retryResult.rows[0][0];
          return Number(lastNumber) || 1; // Fallback to 1 if NaN
        }
      }

      throw insertError;
    }
  }

  /**
   * Validate order number format
   * @param {string} orderNumber - Order number to validate
   * @returns {boolean} True if valid format
   */
  isValidFormat(orderNumber) {
    const pattern = /^ALO-\d{4}-\d{4}$/;
    return pattern.test(orderNumber);
  }

  /**
   * Parse order number to extract components
   * @param {string} orderNumber - Order number to parse
   * @returns {Object|null} Parsed components or null if invalid
   */
  parseOrderNumber(orderNumber) {
    const match = orderNumber.match(/^ALO-(\d{4})-(\d{4})$/);
    if (!match) return null;

    return {
      prefix: 'ALO',
      year: parseInt(match[1]),
      sequence: parseInt(match[2])
    };
  }

  /**
   * Get the current sequence number for a given year
   * @param {number} year - The year
   * @returns {Promise<number>} Current sequence number (0 if no orders yet)
   */
  async getCurrentSequence(year) {
    const db = await getDatabaseClient();
    const sequenceKey = `${this.prefix}-${year}`;

    const result = await db.execute({
      sql: `SELECT last_number FROM ${this.sequenceTableName} WHERE sequence_key = ?`,
      args: [sequenceKey]
    });

    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].last_number || result.rows[0][0];
      return Number(lastNumber) || 0; // Fallback to 0 if NaN for getCurrentSequence
    }

    // No orders yet for this year
    return 0;
  }

  /**
   * Initialize sequence for a specific year (for setup/migration purposes)
   * @param {number} year - The year to initialize
   * @param {number} startNumber - Starting sequence number (default: 0)
   * @returns {Promise<void>}
   */
  async initializeSequence(year, startNumber = 0) {
    const db = await getDatabaseClient();
    const sequenceKey = `${this.prefix}-${year}`;

    await db.execute({
      sql: `INSERT OR IGNORE INTO ${this.sequenceTableName} (sequence_key, last_number)
            VALUES (?, ?)`,
      args: [sequenceKey, startNumber]
    });

    console.log(`Initialized sequence for ${sequenceKey} starting at ${startNumber}`);
  }
}

// Export singleton instance
let generatorInstance;

/**
 * Get singleton instance of OrderNumberGenerator
 * @returns {OrderNumberGenerator} Order number generator instance
 */
export function getOrderNumberGenerator() {
  if (!generatorInstance) {
    generatorInstance = new OrderNumberGenerator();
  }
  return generatorInstance;
}

/**
 * Helper function to generate a single unique order number
 * @returns {Promise<string>} Unique order number in format ALO-YYYY-NNNN
 */
export async function generateOrderNumber() {
  const generator = getOrderNumberGenerator();
  return await generator.generateOrderNumber();
}

/**
 * Helper function to validate order number format
 * @param {string} orderNumber - Order number to validate
 * @returns {boolean} True if valid format
 */
export function validateOrderNumber(orderNumber) {
  const generator = getOrderNumberGenerator();
  return generator.isValidFormat(orderNumber);
}

/**
 * Helper function to parse order number
 * @param {string} orderNumber - Order number to parse
 * @returns {Object|null} Parsed components or null if invalid
 */
export function parseOrderNumber(orderNumber) {
  const generator = getOrderNumberGenerator();
  return generator.parseOrderNumber(orderNumber);
}