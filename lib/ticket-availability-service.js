/**
 * Ticket Availability Validation Service
 *
 * Validates ticket availability before checkout to prevent overselling.
 * Implements graceful degradation - if validation fails, purchases are allowed
 * to prevent blocking checkout when the database is down.
 *
 * Race Condition Protection:
 * - Uses atomic Turso batch operations for reservations
 * - Batch operations provide implicit transaction guarantees (all-or-nothing)
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
            -- Migration 043: Exclude test_sold_count from production availability
            -- Only production tickets count against public availability
            (tt.sold_count - COALESCE(tt.test_sold_count, 0)) as production_sold_count,
            tt.test_sold_count,
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

        // Migration 043: Use production_sold_count (excludes test tickets)
        // This ensures test tickets don't affect public availability calculations
        const soldCount = Number(ticketType.production_sold_count) || 0;
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
          -- Migration 043: Exclude test_sold_count from availability calculation
          (sold_count - COALESCE(test_sold_count, 0)) as production_sold_count,
          test_sold_count,
          price_cents,
          CASE
            WHEN max_quantity IS NULL THEN NULL
            ELSE max_quantity - (sold_count - COALESCE(test_sold_count, 0))
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
      ? Math.max(0, Number(ticketType.max_quantity) - Number(ticketType.production_sold_count))
      : Infinity;

    return {
      found: true,
      id: ticketType.id,
      name: ticketType.name,
      status: ticketType.status,
      maxQuantity: ticketType.max_quantity,
      // Migration 043: Return production_sold_count (excludes test tickets)
      soldCount: Number(ticketType.production_sold_count) || 0,
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
 * This function uses Turso batch operations to atomically reserve tickets
 * and prevent concurrent checkout sessions from overselling tickets.
 * Batch operations provide implicit transaction guarantees - all operations
 * succeed or all are rolled back automatically.
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
  const errors = [];

  // Filter only ticket items (donations don't need reservations)
  const ticketItems = cartItems.filter(item => {
    return item.type === 'ticket';
  });

  if (ticketItems.length === 0) {
    return {
      success: true,
      reservationIds: [],
      errors: [],
      message: 'No tickets to reserve'
    };
  }

  try {
    logger.debug(`Starting atomic batch reservation for session: ${sessionId}`);

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

    // If no valid items, return early
    if (validItems.length === 0) {
      return {
        success: false,
        reservationIds: [],
        errors,
        message: 'No valid tickets to reserve'
      };
    }

    // Get unique ticket type IDs
    const ticketTypeIds = [...new Set(validItems.map(item => item.ticketType))];

    // STEP 1: Fetch availability (read operation BEFORE batch)
    const startTime = Date.now();
    const placeholders = ticketTypeIds.map(() => '?').join(',');

    const availabilityResult = await client.execute({
      sql: `
        SELECT
          tt.id,
          tt.name,
          tt.status,
          tt.max_quantity,
          -- Migration 043: Exclude test_sold_count from reservation availability
          (tt.sold_count - COALESCE(tt.test_sold_count, 0)) as production_sold_count,
          tt.test_sold_count,
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

    // STEP 2: Build batch operations array
    const batchOperations = [];

    // Operation 1: Cleanup expired reservations
    batchOperations.push({
      sql: `
        UPDATE ticket_reservations
        SET status = 'expired'
        WHERE ticket_type_id IN (${placeholders})
          AND status = 'active'
          AND expires_at <= datetime('now')
      `,
      args: ticketTypeIds
    });

    // Operations 2+: Validate and add reservation INSERTs
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

      // Migration 043: Use production_sold_count for reservation validation
      const soldCount = Number(ticketType.production_sold_count) || 0;
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

      // Add reservation operation to batch with capacity re-check for concurrency protection
      // This prevents overselling when multiple sessions validate simultaneously
      // Migration 043: Use production_sold_count (sold_count - test_sold_count) for capacity check
      // Handle NULL max_quantity (unlimited tickets)
      batchOperations.push({
        sql: `
          INSERT INTO ticket_reservations (
            ticket_type_id, quantity, session_id,
            expires_at, status, metadata
          )
          SELECT ?, ?, ?, ?, 'active', ?
          WHERE (
            SELECT CASE
              WHEN tt.max_quantity IS NULL THEN 1
              ELSE (
                tt.max_quantity - (tt.sold_count - COALESCE(tt.test_sold_count, 0)) -
                COALESCE((
                  SELECT SUM(quantity)
                  FROM ticket_reservations
                  WHERE ticket_type_id = ?
                    AND status = 'active'
                    AND expires_at > datetime('now')
                ), 0) >= ?
              )
            END
            FROM ticket_types tt
            WHERE tt.id = ?
          ) = 1
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
          }),
          item.ticketType, // For subquery WHERE ticket_type_id
          item.quantity,   // For capacity check >= ?
          item.ticketType  // For ticket_types WHERE id
        ]
      });

      logger.debug(`Queued reservation: ${item.quantity}x ${ticketType.name}`);
    }

    // Check if there were any validation errors
    if (errors.length > 0) {
      logger.warn('Reservation validation failed:', { errors });
      return {
        success: false,
        reservationIds: [],
        errors,
        message: 'Failed to reserve tickets'
      };
    }

    // STEP 3: Execute all operations atomically using Turso batch
    // Batch operations provide implicit transaction: all succeed or all rollback
    logger.debug(`Executing batch with ${batchOperations.length} operations`);
    const results = await client.batch(batchOperations);

    // Extract reservation IDs from batch results
    // First result is UPDATE (no ID), rest are INSERTs with lastInsertRowid
    // CRITICAL: Check rowsAffected to detect failed capacity checks
    const reservationIds = [];
    const failedReservations = [];

    // Track which validItems were actually added to batchOperations
    // (some may have been filtered out during validation)
    let batchInsertIndex = 0;
    for (let i = 1; i < results.length; i++) {
      const result = results[i];
      const item = validItems[batchInsertIndex];

      logger.debug(`Batch result ${i}: rowsAffected=${result.rowsAffected}, lastInsertRowid=${result.lastInsertRowid}, item=${item?.ticketType}`);

      // Check if INSERT actually inserted a row
      // SQLite: lastInsertRowid is 0 if no row inserted, rowsAffected is 0
      // Turso: May behave differently - check both conditions
      const hasLastInsertRowid = result.lastInsertRowid && Number(result.lastInsertRowid) > 0;
      const hasRowsAffected = result.rowsAffected && Number(result.rowsAffected) > 0;

      if (hasLastInsertRowid || hasRowsAffected) {
        const reservationId = hasLastInsertRowid ? Number(result.lastInsertRowid) : Number(result.rowsAffected);
        reservationIds.push(reservationId);
        logger.debug(`Reservation INSERT succeeded for ${item?.ticketType}: ID=${reservationId}`);
      } else {
        // Capacity check failed - this reservation was rejected
        failedReservations.push({
          ticketId: item?.ticketType || 'unknown',
          ticketName: item?.name || 'Unknown Ticket',
          reason: 'Insufficient capacity - sold out during checkout',
          requested: item?.quantity || 0,
          severity: 'error'
        });
        logger.warn(`Reservation failed for ${item?.ticketType}: No rows inserted (rowsAffected=0, lastInsertRowid=0)`);
      }
      batchInsertIndex++;
    }

    // If any reservations failed, return error
    if (failedReservations.length > 0) {
      logger.warn('Some reservations failed due to insufficient capacity:', { failedReservations });
      
      // Rollback any partial reservations that succeeded before the failure
      if (reservationIds.length > 0) {
        const placeholders = reservationIds.map(() => '?').join(',');
        try {
          await client.execute({
            sql: `DELETE FROM ticket_reservations WHERE id IN (${placeholders})`,
            args: reservationIds
          });
          logger.warn(`Rolled back ${reservationIds.length} partial reservations after capacity failure`);
        } catch (cleanupError) {
          logger.error('Failed to roll back partial reservations:', { 
            cleanupError: cleanupError.message, 
            reservationIds 
          });
        }
      }
      
      return {
        success: false,
        reservationIds: [],
        errors: failedReservations,
        message: 'Insufficient ticket availability'
      };
    }

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

  } catch (error) {
    logger.error('Reservation batch operation failed:', {
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
