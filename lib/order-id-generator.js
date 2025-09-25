/**
 * Order ID Generation Service
 * Generates unique order IDs in the format ALCBF-YYYY-XXXXX or TEST-YYYY-XXXXX
 * Uses database sequences to ensure uniqueness and ascending order
 *
 * Production: ALCBF-2024-00001 (starts at 1)
 * Test Mode: TEST-2024-90001 (starts at 90000 to avoid overlap)
 */

import { getDatabaseClient } from './database.js';

export class OrderIdGenerator {
  constructor() {
    this.productionPrefix = 'ALCBF';
    this.testPrefix = 'TEST';
    this.testStartNumber = 90000; // Test sequences start at 90000
    this.productionStartNumber = 1; // Production sequences start at 1
  }

  /**
   * Generate a unique order ID with database sequence tracking
   * @param {boolean} isTest - Whether this is a test order
   * @returns {Promise<string>} Order ID in format PREFIX-YYYY-XXXXX
   */
  async generateOrderId(isTest = false) {
    const year = new Date().getFullYear();
    const prefix = isTest ? this.testPrefix : this.productionPrefix;
    const sequenceKey = `${prefix}-${year}`;
    const startNumber = isTest ? this.testStartNumber : this.productionStartNumber;

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

      // Use a transaction to ensure atomic increment
      const result = await db.batch([
        {
          sql: `INSERT INTO order_sequences (sequence_key, last_number)
                VALUES (?, ?)
                ON CONFLICT(sequence_key)
                DO UPDATE SET last_number = last_number + 1
                RETURNING last_number`,
          args: [sequenceKey, startNumber]
        }
      ], 'write');

      // Get the new sequence number
      let nextNumber;
      if (result && result[0] && result[0].rows && result[0].rows.length > 0) {
        nextNumber = Number(result[0].rows[0].last_number);
      } else {
        // Fallback: query the current value
        const queryResult = await db.execute({
          sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
          args: [sequenceKey]
        });

        if (queryResult.rows.length > 0) {
          nextNumber = Number(queryResult.rows[0].last_number);
        } else {
          // First order for this year/type
          nextNumber = startNumber;
          await db.execute({
            sql: 'INSERT INTO order_sequences (sequence_key, last_number) VALUES (?, ?)',
            args: [sequenceKey, nextNumber]
          });
        }
      }

      // Format with zero-padding (5 digits)
      const formattedNumber = String(nextNumber).padStart(5, '0');
      const orderId = `${prefix}-${year}-${formattedNumber}`;

      console.log(`Generated order ID: ${orderId} (${isTest ? 'TEST' : 'PRODUCTION'})`);
      return orderId;
    } catch (error) {
      console.warn('Order sequences table not available, using fallback:', error.message);

      // Fallback to timestamp-based ID if sequence generation fails
      // This ensures the system works even before migration runs
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const uniqueComponent = `${timestamp}${random}`.slice(-5);
      const fallbackId = `${prefix}-${year}-${uniqueComponent}`;

      console.log(`Using fallback order ID: ${fallbackId} (migration pending)`);
      return fallbackId;
    }
  }

  /**
   * Validate order ID format
   * @param {string} orderId - Order ID to validate
   * @returns {boolean} True if valid format
   */
  isValidFormat(orderId) {
    const pattern = /^(ALCBF|TEST)-\d{4}-\d{5}$/;
    return pattern.test(orderId);
  }

  /**
   * Parse order ID to extract components
   * @param {string} orderId - Order ID to parse
   * @returns {Object|null} Parsed components or null if invalid
   */
  parseOrderId(orderId) {
    const match = orderId.match(/^(ALCBF|TEST)-(\d{4})-(\d{5})$/);
    if (!match) return null;

    return {
      prefix: match[1],
      year: parseInt(match[2]),
      sequence: parseInt(match[3]),
      isTest: match[1] === 'TEST'
    };
  }

  /**
   * Get the current sequence number for a given year and type
   * @param {number} year - The year
   * @param {boolean} isTest - Whether to get test or production sequence
   * @returns {Promise<number>} Current sequence number
   */
  async getCurrentSequence(year, isTest = false) {
    const db = await getDatabaseClient();
    const prefix = isTest ? this.testPrefix : this.productionPrefix;
    const sequenceKey = `${prefix}-${year}`;

    const result = await db.execute({
      sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
      args: [sequenceKey]
    });

    if (result.rows.length > 0) {
      return Number(result.rows[0].last_number);
    }

    // No orders yet for this year/type
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
 * @param {boolean} isTest - Whether this is a test order
 * @returns {Promise<string>} Unique order ID
 */
export async function generateOrderId(isTest = false) {
  const generator = getOrderIdGenerator();
  return await generator.generateOrderId(isTest);
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