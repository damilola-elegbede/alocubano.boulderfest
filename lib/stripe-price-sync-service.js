/**
 * Stripe Price Synchronization Service
 * Ensures ticket_types.stripe_price_id is populated with Stripe Price objects
 * Handles idempotent price creation and synchronization with Stripe
 */

import Stripe from 'stripe';
import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

class StripePriceSyncService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.stripe = null;
  }

  /**
   * Ensure Stripe client is initialized
   */
  async ensureInitialized() {
    if (this.initialized && this.stripe) {
      return this.stripe;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform Stripe initialization
   */
  async _performInitialization() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    logger.log('💳 Stripe Price Sync Service: Initialized');
    return this.stripe;
  }

  /**
   * Sync all ticket types with Stripe
   * @param {Array} ticketTypes - Optional array of ticket types to sync. If not provided, fetches all from DB
   * @returns {Object} Sync results with created, updated, skipped counts
   */
  async syncPricesWithStripe(ticketTypes = null) {
    await this.ensureInitialized();
    const db = await getDatabaseClient();

    logger.log('🔄 Starting Stripe price synchronization...');

    // Fetch ticket types from database if not provided
    if (!ticketTypes) {
      const result = await db.execute({
        sql: `SELECT id, event_id, name, description, price_cents, currency, status, stripe_price_id
              FROM ticket_types
              WHERE status != 'test'`,
        args: []
      });
      ticketTypes = result.rows;
    }

    const syncResults = {
      created: [],
      updated: [],
      skipped: [],
      errors: []
    };

    // Get event information for metadata
    const eventsResult = await db.execute({
      sql: `SELECT id, name, slug FROM events WHERE status != 'test'`,
      args: []
    });
    const eventsMap = {};
    for (const event of eventsResult.rows) {
      eventsMap[event.id] = event;
    }

    // Process each ticket type
    for (const ticketType of ticketTypes) {
      try {
        const result = await this._syncTicketTypePrice(ticketType, eventsMap);

        if (result.action === 'created') {
          syncResults.created.push(result);
        } else if (result.action === 'updated') {
          syncResults.updated.push(result);
        } else if (result.action === 'skipped') {
          syncResults.skipped.push(result);
        }
      } catch (error) {
        logger.error(`Failed to sync ticket type ${ticketType.id}:`, error);
        syncResults.errors.push({
          ticketTypeId: ticketType.id,
          ticketTypeName: ticketType.name,
          error: error.message
        });
      }
    }

    logger.log('✅ Stripe price synchronization complete:', {
      created: syncResults.created.length,
      updated: syncResults.updated.length,
      skipped: syncResults.skipped.length,
      errors: syncResults.errors.length
    });

    return syncResults;
  }

  /**
   * Sync a single ticket type with Stripe
   * @param {Object} ticketType - Ticket type object
   * @param {Object} eventsMap - Map of event IDs to event data
   * @returns {Object} Sync result for this ticket type
   */
  async _syncTicketTypePrice(ticketType, eventsMap) {
    const db = await getDatabaseClient();

    // Skip if price is null or 0 (coming-soon tickets)
    if (!ticketType.price_cents || ticketType.price_cents === 0) {
      logger.log(`⏭️  Skipping ${ticketType.name} - price is null or zero`);
      return {
        action: 'skipped',
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        reason: 'Price is null or zero (coming-soon ticket)'
      };
    }

    // Skip if stripe_price_id already exists and is valid
    if (ticketType.stripe_price_id) {
      try {
        // Verify the price still exists in Stripe
        const existingPrice = await this.stripe.prices.retrieve(ticketType.stripe_price_id);

        if (existingPrice && existingPrice.active) {
          logger.log(`✓ ${ticketType.name} - Already has valid Stripe price: ${ticketType.stripe_price_id}`);
          return {
            action: 'skipped',
            ticketTypeId: ticketType.id,
            ticketTypeName: ticketType.name,
            stripePriceId: ticketType.stripe_price_id,
            reason: 'Already has valid Stripe price'
          };
        }
      } catch (error) {
        // Price doesn't exist in Stripe - will create new one
        logger.warn(`Price ${ticketType.stripe_price_id} not found in Stripe, creating new price`);
      }
    }

    // Get event info for metadata
    const event = eventsMap[ticketType.event_id];
    if (!event) {
      throw new Error(`Event ${ticketType.event_id} not found for ticket type ${ticketType.id}`);
    }

    // Create lookup key for idempotency
    const lookupKey = `${event.slug}_${ticketType.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Check if price already exists with this lookup_key
    try {
      const existingPrices = await this.stripe.prices.list({
        lookup_keys: [lookupKey],
        limit: 1
      });

      if (existingPrices.data && existingPrices.data.length > 0) {
        const existingPrice = existingPrices.data[0];

        // Update database with found price_id
        await db.execute({
          sql: `UPDATE ticket_types SET stripe_price_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [existingPrice.id, ticketType.id]
        });

        logger.log(`✓ ${ticketType.name} - Found existing Stripe price by lookup key: ${existingPrice.id}`);

        return {
          action: 'updated',
          ticketTypeId: ticketType.id,
          ticketTypeName: ticketType.name,
          stripePriceId: existingPrice.id,
          reason: 'Found existing price by lookup_key'
        };
      }
    } catch (error) {
      // Lookup key not found - proceed to create new price
      logger.log(`No existing price found for lookup key: ${lookupKey}`);
    }

    // Create new Stripe Price object
    logger.log(`Creating new Stripe price for ${ticketType.name}...`);

    // First, create or get the product
    const productName = `${event.name} - ${ticketType.name}`;
    const productLookupKey = `product_${lookupKey}`;

    let product;
    try {
      // Try to find existing product by metadata
      const existingProducts = await this.stripe.products.search({
        query: `metadata['lookup_key']:'${productLookupKey}'`,
        limit: 1
      });

      if (existingProducts.data && existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        logger.log(`✓ Found existing product: ${product.id}`);
      }
    } catch (error) {
      logger.log('No existing product found, will create new one');
    }

    // Create product if not found
    if (!product) {
      product = await this.stripe.products.create({
        name: productName,
        description: ticketType.description || `Ticket for ${event.name}`,
        metadata: {
          ticket_type_id: ticketType.id,
          event_id: String(ticketType.event_id),
          event_slug: event.slug,
          lookup_key: productLookupKey
        }
      });
      logger.log(`✓ Created product: ${product.id}`);
    }

    // Create the price
    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: ticketType.price_cents,
      currency: (ticketType.currency || 'USD').toLowerCase(),
      lookup_key: lookupKey,
      metadata: {
        ticket_type_id: ticketType.id,
        event_id: String(ticketType.event_id),
        event_name: event.name,
        event_slug: event.slug
      }
    });

    logger.log(`✓ Created Stripe price: ${price.id} for ${ticketType.name}`);

    // Update database with new stripe_price_id
    await db.execute({
      sql: `UPDATE ticket_types SET stripe_price_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [price.id, ticketType.id]
    });

    return {
      action: 'created',
      ticketTypeId: ticketType.id,
      ticketTypeName: ticketType.name,
      stripePriceId: price.id,
      stripeProductId: product.id,
      amount: ticketType.price_cents,
      currency: ticketType.currency || 'USD'
    };
  }

  /**
   * Sync a single ticket type by ID
   * @param {string} ticketTypeId - Ticket type ID to sync
   * @returns {Object} Sync result
   */
  async syncTicketType(ticketTypeId) {
    const db = await getDatabaseClient();

    // Fetch ticket type
    const ticketResult = await db.execute({
      sql: `SELECT id, event_id, name, description, price_cents, currency, status, stripe_price_id
            FROM ticket_types WHERE id = ?`,
      args: [ticketTypeId]
    });

    if (!ticketResult.rows || ticketResult.rows.length === 0) {
      throw new Error(`Ticket type ${ticketTypeId} not found`);
    }

    // Get event information
    const eventResult = await db.execute({
      sql: `SELECT id, name, slug FROM events WHERE id = ?`,
      args: [ticketResult.rows[0].event_id]
    });

    if (!eventResult.rows || eventResult.rows.length === 0) {
      throw new Error(`Event ${ticketResult.rows[0].event_id} not found`);
    }

    const eventsMap = {
      [eventResult.rows[0].id]: eventResult.rows[0]
    };

    return await this._syncTicketTypePrice(ticketResult.rows[0], eventsMap);
  }

  /**
   * Get sync status for all ticket types
   * @returns {Object} Status of ticket types and their Stripe prices
   */
  async getSyncStatus() {
    const db = await getDatabaseClient();

    const result = await db.execute({
      sql: `SELECT
              id, name, price_cents, stripe_price_id, status
            FROM ticket_types
            WHERE status != 'test'
            ORDER BY event_id, display_order`,
      args: []
    });

    const status = {
      total: result.rows.length,
      synced: 0,
      needsSync: 0,
      comingSoon: 0,
      ticketTypes: []
    };

    for (const ticket of result.rows) {
      const ticketStatus = {
        id: ticket.id,
        name: ticket.name,
        price_cents: ticket.price_cents,
        stripe_price_id: ticket.stripe_price_id,
        needsSync: false,
        reason: ''
      };

      if (!ticket.price_cents || ticket.price_cents === 0) {
        ticketStatus.reason = 'Coming soon - no price set';
        status.comingSoon++;
      } else if (!ticket.stripe_price_id) {
        ticketStatus.needsSync = true;
        ticketStatus.reason = 'Missing stripe_price_id';
        status.needsSync++;
      } else {
        ticketStatus.reason = 'Synced';
        status.synced++;
      }

      status.ticketTypes.push(ticketStatus);
    }

    return status;
  }
}

// Export singleton instance
export const stripePriceSyncService = new StripePriceSyncService();