/**
 * Order ID Generation Service
 * Generates unique order IDs in the format ALCBF-YYYY-XXXXX
 * Uses database sequences to ensure uniqueness and ascending order
 *
 * Format: ALCBF-2024-00001 (starts at 1, increments sequentially)
 *
 * NOTE: This is a FALLBACK generator. Normal order numbers use ALO-YYYY-NNNN
 * format from order-number-generator.js. This should rarely be called.
 */

import { getDatabaseClient } from './database.js';

export class OrderIdGenerator {
  constructor() {
    this.prefix = 'ALCBF';
    this.startNumber = 1;
  }

  /**
   * Generate a unique order ID with database sequence tracking
   * @returns {Promise<string>} Order ID in format ALCBF-YYYY-XXXXX
   */
  async generateOrderId() {
    const year = new Date().getFullYear();
    const sequenceKey = `${this.prefix}-${year}`;
    const startNumber = this.startNumber;

    try {
      const db = await getDatabaseClient();

      // First, check if the table exists
      try {
        // Try to query the table to see if it exists
        const tableCheck = await db.execute({
          sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='order_sequences'",
          args: []
        });

        if (tableCheck.rows.length === 0) {
          // Table doesn't exist yet, use fallback
          throw new Error('order_sequences table does not exist yet');
        }
      } catch (tableCheckError) {
        // Table doesn't exist, use fallback
        throw new Error('order_sequences table check failed: ' + tableCheckError.message);
      }

      // First, try to increment existing sequence
      let result;
      try {
        result = await db.execute({
          sql: `UPDATE order_sequences
                SET last_number = last_number + 1
                WHERE sequence_key = ?
                RETURNING last_number`,
          args: [sequenceKey]
        });
      } catch (updateError) {
        console.log('Update failed, trying insert:', updateError.message);
        // If update fails, try to insert
        result = await db.execute({
          sql: `INSERT INTO order_sequences (sequence_key, last_number)
                VALUES (?, ?)`,
          args: [sequenceKey, startNumber]
        });
        // Return the start number for first insert
        result = { rows: [{ last_number: startNumber }] };
      }

      // Get the new sequence number
      let nextNumber;
      if (result && result.rows && result.rows.length > 0) {
        nextNumber = Number(result.rows[0].last_number);
      } else {
        // If no rows returned from update, query the current value
        const queryResult = await db.execute({
          sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
          args: [sequenceKey]
        });

        if (queryResult.rows.length > 0) {
          nextNumber = Number(queryResult.rows[0].last_number);
        } else {
          // Should not happen if insert succeeded, but handle it
          nextNumber = startNumber;
        }
      }

      // Format with zero-padding (5 digits)
      const formattedNumber = String(nextNumber).padStart(5, '0');
      const orderId = `${this.prefix}-${year}-${formattedNumber}`;

      console.log(`Generated fallback order ID: ${orderId}`);
      return orderId;
    } catch (error) {
      console.warn('Order sequences table not available, using fallback:', error.message);

      // Fallback to timestamp-based ID if sequence generation fails
      // This ensures the system works even before migration runs
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const uniqueComponent = `${timestamp}${random}`.slice(-5);
      const fallbackId = `${this.prefix}-${year}-${uniqueComponent}`;

      console.log(`Using timestamp-based fallback order ID: ${fallbackId} (migration pending)`);
      return fallbackId;
    }
  }

  /**
   * Validate order ID format
   * @param {string} orderId - Order ID to validate
   * @returns {boolean} True if valid format
   */
  isValidFormat(orderId) {
    const pattern = /^ALCBF-\d{4}-\d{5}$/;
    return pattern.test(orderId);
  }

  /**
   * Parse order ID to extract components
   * @param {string} orderId - Order ID to parse
   * @returns {Object|null} Parsed components or null if invalid
   */
  parseOrderId(orderId) {
    const match = orderId.match(/^ALCBF-(\d{4})-(\d{5})$/);
    if (!match) return null;

    return {
      prefix: 'ALCBF',
      year: parseInt(match[1]),
      sequence: parseInt(match[2])
    };
  }

  /**
   * Get the current sequence number for a given year
   * @param {number} year - The year
   * @returns {Promise<number>} Current sequence number
   */
  async getCurrentSequence(year) {
    const db = await getDatabaseClient();
    const sequenceKey = `${this.prefix}-${year}`;

    const result = await db.execute({
      sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
      args: [sequenceKey]
    });

    if (result.rows.length > 0) {
      return Number(result.rows[0].last_number);
    }

    // No orders yet for this year
    return 0;
  }
}

// Export singleton instance
let generatorInstance;

/**
 * Get singleton instance of OrderIdGenerator
 * @returns {OrderIdGenerator} Order ID generator instance
 */
export function getOrderIdGenerator() {
  if (!generatorInstance) {
    generatorInstance = new OrderIdGenerator();
  }
  return generatorInstance;
}

/**
 * Helper function to generate a single unique order ID
 * @returns {Promise<string>} Unique order ID
 */
export async function generateOrderId() {
  const generator = getOrderIdGenerator();
  return await generator.generateOrderId();
}

/**
 * Helper function to validate order ID format
 * @param {string} orderId - Order ID to validate
 * @returns {boolean} True if valid format
 */
export function validateOrderIdFormat(orderId) {
  const generator = getOrderIdGenerator();
  return generator.isValidFormat(orderId);
}