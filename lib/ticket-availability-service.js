/**
 * Ticket Availability Validation Service
 *
 * Validates ticket availability before checkout to prevent overselling.
 * Implements graceful degradation - if validation fails, purchases are allowed
 * to prevent blocking checkout when the database is down.
 *
 * Race Condition Protection:
 * - Uses atomic reservations with BEGIN IMMEDIATE TRANSACTION
 * - Reservations expire after 15 minutes
 * - Automatic cleanup of expired reservations
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

// Reservation expiration time in milliseconds (15 minutes)
const RESERVATION_EXPIRATION_MS = 15 * 60 * 1000;

/**
 * Validate ticket availability for cart items
 *
 * @param {Array} cartItems - Array of cart items with ticket information
 * @returns {Promise<Object>} Validation result with status and errors
 *
 * @example
 * const result = await validateTicketAvailability([
 *   { ticketType: 'weekender-2025-11-full', quantity: 2, name: 'Full Pass' }
 * ]);
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 */
export async function validateTicketAvailability(cartItems) {
  try {
    // Filter only ticket items (donations don't need availability validation)
    const ticketItems = cartItems.filter(item => item.type === 'ticket');

    if (ticketItems.length === 0) {
      // No tickets to validate (e.g., donation-only cart)
      return { valid: true, errors: [] };
    }

    const client = await getDatabaseClient();
    const errors = [];

    // Validate required fields first (no DB query needed)
    const validItems = [];
    for (const item of ticketItems) {
      if (!item.ticketType) {
        errors.push({
          ticketId: item.ticketType || 'unknown',
          ticketName: item.name || 'Unknown Ticket',
          reason: 'Missing ticket type identifier',
          requested: item.quantity,
          available: 0,
          severity: 'error'
        });
        continue;
      }

      if (!item.quantity || item.quantity <= 0) {
        errors.push({
          ticketId: item.ticketType,
          ticketName: item.name || 'Unknown Ticket',
          reason: 'Invalid quantity requested',
          requested: item.quantity,
          available: 0,
          severity: 'error'
        });
        continue;
      }

      validItems.push(item);
    }

    // If no valid items, return early
    if (validItems.length === 0) {
      const criticalErrors = errors.filter(e => e.severity === 'error');
      return {
        valid: criticalErrors.length === 0,
        errors: criticalErrors,
        warnings: []
      };
    }

    try {
      // BATCH QUERY: Fetch all ticket types in one query (eliminates N+1)
      const startTime = Date.now();
      const ticketTypeIds = [...new Set(validItems.map(item => item.ticketType))];
      const placeholders = ticketTypeIds.map(() => '?').join(',');

      const result = await client.execute({
        sql: `
          SELECT
            tt.id,
            tt.name,
            tt.status,
            tt.max_quantity,
            tt.sold_count,
            tt.price_cents,
            COALESCE(SUM(
              CASE
                WHEN tr.status = 'active' AND tr.expires_at > datetime('now')
                THEN tr.quantity
                ELSE 0
              END
            ), 0) as reserved_count
          FROM ticket_types tt
          LEFT JOIN ticket_reservations tr ON tr.ticket_type_id = tt.id
          WHERE tt.id IN (${placeholders})
          GROUP BY tt.id
        `,
        args: ticketTypeIds
      });

      const queryTime = Date.now() - startTime;
      logger.debug(`Batch availability query completed in ${queryTime}ms (${ticketTypeIds.length} ticket types)`);

      // Build a Map for O(1) lookup
      const ticketTypeMap = new Map();
      if (result.rows) {
        for (const row of result.rows) {
          ticketTypeMap.set(row.id, row);
        }
      }

      // Validate each item using the cached data
      for (const item of validItems) {
        const ticketType = ticketTypeMap.get(item.ticketType);

        // Check if ticket type exists
        if (!ticketType) {
          errors.push({
            ticketId: item.ticketType,
            ticketName: item.name || 'Unknown Ticket',
            reason: 'Ticket type not found',
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        const soldCount = Number(ticketType.sold_count) || 0;
        const reservedCount = Number(ticketType.reserved_count) || 0;
        const maxQuantity = Number(ticketType.max_quantity);
        // Calculate available accounting for both sold AND reserved tickets
        const available = maxQuantity ? Math.max(0, maxQuantity - soldCount - reservedCount) : Infinity;

        // Validate ticket status
        if (ticketType.status === 'sold-out') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: 'Ticket type is sold out',
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        if (ticketType.status === 'closed') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: 'Ticket sales have closed',
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        if (ticketType.status === 'coming-soon') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: 'Ticket not yet available for purchase',
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        if (ticketType.status !== 'available' && ticketType.status !== 'test') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: `Ticket status is ${ticketType.status}`,
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        // Validate availability (only if max_quantity is set)
        if (maxQuantity && item.quantity > available) {
          const availableText = available === 0
            ? 'sold out'
            : available === 1
              ? 'only 1 ticket remaining'
              : `only ${available} tickets remaining`;

          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: `Insufficient availability - ${availableText}`,
            requested: item.quantity,
            available: available,
            severity: 'error'
          });
          continue;
        }

        // Log successful validation for this item
        logger.debug(`Ticket availability validated: ${ticketType.name} (${item.quantity}/${available || 'unlimited'})`);
      }

    } catch (queryError) {
      // Log the error but don't block checkout - graceful degradation
      logger.error('Batch ticket availability query failed:', {
        ticketTypes: validItems.map(item => item.ticketType),
        error: queryError.message,
        stack: queryError.stack
      });

      // Add warnings for all items but allow purchase to continue
      for (const item of validItems) {
        errors.push({
          ticketId: item.ticketType,
          ticketName: item.name || 'Unknown Ticket',
          reason: 'Unable to verify availability - proceeding with purchase',
          requested: item.quantity,
          available: 'unknown',
          severity: 'warning'
        });
      }
    }

    // Separate errors and warnings
    const criticalErrors = errors.filter(e => e.severity === 'error');
    const warnings = errors.filter(e => e.severity === 'warning');

    // Only block if there are critical errors
    const isValid = criticalErrors.length === 0;

    if (!isValid) {
      logger.warn('Ticket availability validation failed:', {
        errors: criticalErrors,
        warnings: warnings
      });
    }

    return {
      valid: isValid,
      errors: criticalErrors,
      warnings: warnings
    };

  } catch (error) {
    // CRITICAL: Graceful degradation - if validation service fails,
    // allow the purchase to continue to prevent blocking checkout.
    // This is a deliberate trade-off: better to risk occasional overselling
    // than to break checkout when the database is temporarily unavailable.

    logger.error('Ticket availability validation service failed:', {
      error: error.message,
      stack: error.stack,
      cartItems: cartItems.map(item => ({
        ticketType: item.ticketType,
        quantity: item.quantity,
        name: item.name
      }))
    });

    // Return valid=true to allow purchase, but include warning
    return {
      valid: true,
      errors: [],
      warnings: [{
        ticketId: 'system',
        ticketName: 'System',
        reason: 'Availability validation service unavailable - purchase allowed',
        severity: 'warning'
      }],
      gracefulDegradation: true
    };
  }
}

/**
 * Get current availability for a specific ticket type
 *
 * @param {string} ticketTypeId - Ticket type identifier
 * @returns {Promise<Object>} Availability information
 */
export async function getTicketAvailability(ticketTypeId) {
  try {
    const client = await getDatabaseClient();

    const result = await client.execute({
      sql: `
        SELECT
          id,
          name,
          status,
          max_quantity,
          sold_count,
          price_cents,
          CASE
            WHEN max_quantity IS NULL THEN NULL
            ELSE max_quantity - sold_count
          END as available
        FROM ticket_types
        WHERE id = ?
      `,
      args: [ticketTypeId]
    });

    if (!result.rows || result.rows.length === 0) {
      return {
        found: false,
        available: 0,
        status: 'not-found'
      };
    }

    const ticketType = result.rows[0];
    const available = ticketType.max_quantity
      ? Math.max(0, Number(ticketType.max_quantity) - Number(ticketType.sold_count))
      : Infinity;

    return {
      found: true,
      id: ticketType.id,
      name: ticketType.name,
      status: ticketType.status,
      maxQuantity: ticketType.max_quantity,
      soldCount: Number(ticketType.sold_count) || 0,
      available: available,
      isUnlimited: !ticketType.max_quantity,
      priceCents: Number(ticketType.price_cents)
    };

  } catch (error) {
    logger.error('Failed to get ticket availability:', {
      ticketTypeId,
      error: error.message
    });

    throw new Error(`Unable to retrieve availability for ticket: ${ticketTypeId}`);
  }
}

/**
 * Check if a ticket type is currently available for purchase
 *
 * @param {string} ticketTypeId - Ticket type identifier
 * @param {number} quantity - Quantity requested
 * @returns {Promise<boolean>} True if available for purchase
 */
export async function isTicketAvailable(ticketTypeId, quantity = 1) {
  try {
    const availability = await getTicketAvailability(ticketTypeId);

    if (!availability.found) {
      return false;
    }

    if (availability.status !== 'available' && availability.status !== 'test') {
      return false;
    }

    if (!availability.isUnlimited && quantity > availability.available) {
      return false;
    }

    return true;

  } catch (error) {
    logger.error('Ticket availability check failed:', {
      ticketTypeId,
      quantity,
      error: error.message
    });

    // Graceful degradation - assume available if check fails
    return true;
  }
}

/**
 * Reserve tickets atomically to prevent race conditions
 *
 * This function uses BEGIN IMMEDIATE TRANSACTION to acquire write locks
 * and prevent concurrent checkout sessions from overselling tickets.
 *
 * @param {Array} cartItems - Array of cart items to reserve
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<Object>} Reservation result with reservation IDs
 *
 * @example
 * const result = await reserveTickets([
 *   { ticketType: 'weekender-2025-11-full', quantity: 2 }
 * ], 'cs_test_12345');
 *
 * if (!result.success) {
 *   console.error('Reservation failed:', result.errors);
 * }
 */
export async function reserveTickets(cartItems, sessionId) {
  const client = await getDatabaseClient();
  const reservationIds = [];
  const errors = [];

  // Filter only ticket items (donations don't need reservations)
  const ticketItems = cartItems.filter(item => item.type === 'ticket');

  if (ticketItems.length === 0) {
    return {
      success: true,
      reservationIds: [],
      errors: [],
      message: 'No tickets to reserve'
    };
  }

  try {
    // BEGIN IMMEDIATE TRANSACTION to acquire write lock immediately
    // This prevents other transactions from reading until we're done
    await client.execute('BEGIN IMMEDIATE TRANSACTION');

    logger.debug(`Starting atomic reservation for session: ${sessionId}`);

    try {
      // Calculate expiration time (15 minutes from now)
      const expiresAt = new Date(Date.now() + RESERVATION_EXPIRATION_MS).toISOString();

      // Validate required fields first (no DB query needed)
      const validItems = [];
      for (const item of ticketItems) {
        if (!item.ticketType || !item.quantity || item.quantity <= 0) {
          errors.push({
            ticketId: item.ticketType || 'unknown',
            ticketName: item.name || 'Unknown Ticket',
            reason: 'Invalid ticket type or quantity',
            severity: 'error'
          });
          continue;
        }
        validItems.push(item);
      }

      // If no valid items, rollback and return
      if (validItems.length === 0) {
        await client.execute('ROLLBACK');
        return {
          success: false,
          reservationIds: [],
          errors,
          message: 'No valid tickets to reserve'
        };
      }

      // Clean up any existing expired reservations for these ticket types first
      const ticketTypeIds = [...new Set(validItems.map(item => item.ticketType))];
      await client.execute({
        sql: `
          UPDATE ticket_reservations
          SET status = 'expired'
          WHERE ticket_type_id IN (${ticketTypeIds.map(() => '?').join(',')})
            AND status = 'active'
            AND expires_at <= datetime('now')
        `,
        args: ticketTypeIds
      });

      // BATCH QUERY: Fetch all ticket types in one query (eliminates N+1)
      const startTime = Date.now();
      const placeholders = ticketTypeIds.map(() => '?').join(',');

      const availabilityResult = await client.execute({
        sql: `
          SELECT
            tt.id,
            tt.name,
            tt.status,
            tt.max_quantity,
            tt.sold_count,
            tt.price_cents,
            COALESCE(SUM(
              CASE
                WHEN tr.status = 'active' AND tr.expires_at > datetime('now')
                THEN tr.quantity
                ELSE 0
              END
            ), 0) as reserved_count
          FROM ticket_types tt
          LEFT JOIN ticket_reservations tr ON tr.ticket_type_id = tt.id
          WHERE tt.id IN (${placeholders})
          GROUP BY tt.id
        `,
        args: ticketTypeIds
      });

      const queryTime = Date.now() - startTime;
      logger.debug(`Batch reservation query completed in ${queryTime}ms (${ticketTypeIds.length} ticket types)`);

      // Build a Map for O(1) lookup
      const ticketTypeMap = new Map();
      if (availabilityResult.rows) {
        for (const row of availabilityResult.rows) {
          ticketTypeMap.set(row.id, row);
        }
      }

      // Process each ticket item atomically using cached data
      for (const item of validItems) {
        const ticketType = ticketTypeMap.get(item.ticketType);

        if (!ticketType) {
          errors.push({
            ticketId: item.ticketType,
            ticketName: item.name || 'Unknown Ticket',
            reason: 'Ticket type not found',
            severity: 'error'
          });
          continue;
        }

        const soldCount = Number(ticketType.sold_count) || 0;
        const reservedCount = Number(ticketType.reserved_count) || 0;
        const maxQuantity = Number(ticketType.max_quantity);

        // Calculate true available quantity (accounting for sold + reserved)
        const available = maxQuantity
          ? Math.max(0, maxQuantity - soldCount - reservedCount)
          : Infinity;

        // Validate ticket status
        if (ticketType.status === 'sold-out') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: 'Ticket type is sold out',
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        if (ticketType.status !== 'available' && ticketType.status !== 'test') {
          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: `Ticket status is ${ticketType.status}`,
            requested: item.quantity,
            available: 0,
            severity: 'error'
          });
          continue;
        }

        // Validate availability
        if (maxQuantity && item.quantity > available) {
          const availableText = available === 0
            ? 'sold out'
            : available === 1
              ? 'only 1 ticket remaining'
              : `only ${available} tickets remaining`;

          errors.push({
            ticketId: ticketType.id,
            ticketName: ticketType.name,
            reason: `Insufficient availability - ${availableText}`,
            requested: item.quantity,
            available: available,
            severity: 'error'
          });
          continue;
        }

        // Create reservation atomically
        const reservationResult = await client.execute({
          sql: `
            INSERT INTO ticket_reservations (
              ticket_type_id, quantity, session_id,
              expires_at, status, metadata
            ) VALUES (?, ?, ?, ?, 'active', ?)
          `,
          args: [
            item.ticketType,
            item.quantity,
            sessionId,
            expiresAt,
            JSON.stringify({
              ticket_name: ticketType.name,
              price_cents: Number(ticketType.price_cents), // Convert BigInt to Number
              created_by: 'checkout_session'
            })
          ]
        });

        const reservationId = reservationResult.lastInsertRowid;
        reservationIds.push(Number(reservationId));

        logger.debug(`Reserved ${item.quantity}x ${ticketType.name} (reservation_id: ${reservationId})`);
      }

      // Check if there were any errors
      if (errors.length > 0) {
        // Rollback transaction if any reservations failed
        await client.execute('ROLLBACK');
        logger.warn('Reservation failed - rolled back transaction:', { errors });
        return {
          success: false,
          reservationIds: [],
          errors,
          message: 'Failed to reserve tickets'
        };
      }

      // Commit transaction - all reservations successful
      await client.execute('COMMIT');

      logger.info(`Successfully reserved tickets for session ${sessionId}:`, {
        reservationIds,
        ticketCount: ticketItems.reduce((sum, item) => sum + item.quantity, 0)
      });

      return {
        success: true,
        reservationIds,
        errors: [],
        expiresAt,
        message: 'Tickets reserved successfully'
      };

    } catch (innerError) {
      // Rollback on any error
      try {
        await client.execute('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback reservation transaction:', rollbackError);
      }
      throw innerError;
    }

  } catch (error) {
    logger.error('Reservation transaction failed:', {
      sessionId,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      reservationIds: [],
      errors: [{
        ticketId: 'system',
        ticketName: 'System',
        reason: `Reservation system error: ${error.message}`,
        severity: 'error'
      }],
      message: 'Reservation system unavailable'
    };
  }
}

/**
 * Mark reservation as fulfilled when payment completes
 *
 * @param {string} sessionId - Stripe checkout session ID
 * @param {number} transactionId - Internal transaction ID
 * @returns {Promise<boolean>} True if fulfilled successfully
 */
export async function fulfillReservation(sessionId, transactionId) {
  try {
    const client = await getDatabaseClient();

    const result = await client.execute({
      sql: `
        UPDATE ticket_reservations
        SET status = 'fulfilled',
            fulfilled_at = datetime('now'),
            transaction_id = ?
        WHERE session_id = ?
          AND status = 'active'
      `,
      args: [transactionId, sessionId]
    });

    const updatedCount = result.rowsAffected || 0;

    if (updatedCount > 0) {
      logger.info(`Fulfilled ${updatedCount} reservations for session: ${sessionId}`);
      return true;
    } else {
      logger.warn(`No active reservations found for session: ${sessionId}`);
      return false;
    }

  } catch (error) {
    logger.error('Failed to fulfill reservation:', {
      sessionId,
      transactionId,
      error: error.message
    });
    // Non-critical error - tickets are already created
    return false;
  }
}

/**
 * Release reservation (for cancelled/expired sessions)
 *
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<boolean>} True if released successfully
 */
export async function releaseReservation(sessionId) {
  try {
    const client = await getDatabaseClient();

    const result = await client.execute({
      sql: `
        UPDATE ticket_reservations
        SET status = 'released'
        WHERE session_id = ?
          AND status = 'active'
      `,
      args: [sessionId]
    });

    const updatedCount = result.rowsAffected || 0;

    if (updatedCount > 0) {
      logger.info(`Released ${updatedCount} reservations for session: ${sessionId}`);
      return true;
    }

    return false;

  } catch (error) {
    logger.error('Failed to release reservation:', {
      sessionId,
      error: error.message
    });
    return false;
  }
}

/**
 * Clean up expired reservations (maintenance task)
 *
 * @returns {Promise<number>} Number of reservations cleaned up
 */
export async function cleanupExpiredReservations() {
  try {
    const client = await getDatabaseClient();

    const result = await client.execute({
      sql: `
        UPDATE ticket_reservations
        SET status = 'expired'
        WHERE status = 'active'
          AND expires_at <= datetime('now')
      `
    });

    const cleanedCount = result.rowsAffected || 0;

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired reservations`);
    }

    return cleanedCount;

  } catch (error) {
    logger.error('Failed to cleanup expired reservations:', {
      error: error.message
    });
    return 0;
  }
}