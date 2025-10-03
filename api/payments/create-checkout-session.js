/**
 * Create Checkout Session API Endpoint
 * Handles Stripe Checkout Session creation and preliminary order storage
 */

import Stripe from 'stripe';
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { validateTicketAvailability, reserveTickets, releaseReservation } from '../../lib/ticket-availability-service.js';
import { logger } from '../../lib/logger.js';

// Check if we're in test mode
const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';

// Mock Stripe service for test mode
const mockStripe = {
  checkout: {
    sessions: {
      create: async(params) => {
        console.log('🔄 Mock Stripe: Creating checkout session');
        return {
          id: 'cs_test_mock_session_' + Math.random().toString(36).substring(7),
          url: 'https://checkout.stripe.com/c/pay/mock_test_session',
          payment_intent: 'pi_test_mock_' + Math.random().toString(36).substring(7),
          amount_total: params.line_items?.reduce((sum, item) => sum + (item.price_data?.unit_amount || 0) * item.quantity, 0) || 0,
          currency: params.currency || 'usd',
          status: 'open',
          metadata: params.metadata || {},
          customer_details: params.customer_details || null
        };
      }
    }
  }
};

// Initialize Stripe with test mode handling
let stripe;
if (isTestMode && !process.env.STRIPE_SECRET_KEY) {
  // Use mock Stripe for integration tests
  console.log('💳 Using Mock Stripe service for integration tests');
  stripe = mockStripe;
} else if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ FATAL: STRIPE_SECRET_KEY secret not configured');
} else {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

export default async function handler(req, res) {
  console.log('=== Checkout Session Handler Started ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  // Set secure CORS headers
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Stripe initialization check is no longer needed since we fail immediately at module level

  try {
    const { cartItems, customerInfo, testMode = false } = req.body;

    // Detect test mode from various sources
    const isRequestTestMode = testMode ||
      req.headers['x-test-mode'] === 'true' ||
      req.headers['x-admin-test'] === 'true' ||
      cartItems?.some(item => item.isTestItem || item.name?.startsWith('TEST'));

    // Log incoming request in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Checkout session request:', {
        cartItems: cartItems,
        customerInfo: customerInfo,
        hasCartItems: !!cartItems,
        isArray: Array.isArray(cartItems),
        itemCount: cartItems?.length,
        testMode: isRequestTestMode
      });
    }

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart items required' });
    }

    // Customer info is optional - Stripe Checkout will collect it
    // Only validate email if provided
    if (customerInfo?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerInfo.email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
    }

    // Validate ticket availability BEFORE creating Stripe session
    // This prevents creating payment sessions for tickets that are sold out or unavailable
    // Note: This implements graceful degradation - if validation fails due to database issues,
    // the purchase is allowed to prevent blocking checkout. This is a deliberate trade-off.
    try {
      const availabilityResult = await validateTicketAvailability(cartItems);

      // Log warnings but allow purchase to continue
      if (availabilityResult.warnings && availabilityResult.warnings.length > 0) {
        console.warn('Ticket availability warnings:', availabilityResult.warnings);
      }

      // Block purchase only if there are critical validation errors
      if (!availabilityResult.valid && availabilityResult.errors && availabilityResult.errors.length > 0) {
        const firstError = availabilityResult.errors[0];

        // Return detailed error for the first validation failure
        return res.status(400).json({
          error: 'Ticket unavailable',
          message: firstError.reason,
          details: {
            ticketId: firstError.ticketId,
            ticketName: firstError.ticketName,
            requested: firstError.requested,
            available: firstError.available,
            allErrors: availabilityResult.errors.map(err => ({
              ticketName: err.ticketName,
              reason: err.reason,
              requested: err.requested,
              available: err.available
            }))
          }
        });
      }

      // Log successful validation (with graceful degradation flag if applicable)
      if (availabilityResult.gracefulDegradation) {
        console.log('Ticket availability validation bypassed (graceful degradation) - allowing purchase');
      } else {
        console.log('Ticket availability validated successfully');
      }

    } catch (validationError) {
      // CRITICAL: This catch block should never be reached because validateTicketAvailability()
      // has its own error handling with graceful degradation. But if it does happen,
      // log the error and allow purchase to continue.
      console.error('Unexpected error in ticket availability validation:', validationError);
      console.log('Allowing purchase to continue despite validation error (graceful degradation)');
    }

    // Generate order ID for tracking (needed before Stripe session creation)
    const orderIdPrefix = isRequestTestMode ? 'test_order' : 'order';
    const orderId = `${orderIdPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    console.log(`Creating ${isRequestTestMode ? 'TEST' : ''} checkout session for order:`, orderId);

    // CRITICAL: Reserve tickets atomically BEFORE creating Stripe session
    // This prevents race condition overselling by locking the quantities
    // Generate a temporary session ID for reservation (will be replaced with Stripe session ID)
    const tempSessionId = `temp_${orderId}`;

    try {
      const reservationResult = await reserveTickets(cartItems, tempSessionId);

      if (!reservationResult.success) {
        // Reservation failed - return error to user
        const firstError = reservationResult.errors[0];
        console.error('Ticket reservation failed:', reservationResult.errors);

        return res.status(400).json({
          error: 'Ticket unavailable',
          message: firstError.reason,
          details: {
            ticketId: firstError.ticketId,
            ticketName: firstError.ticketName,
            requested: firstError.requested,
            available: firstError.available,
            allErrors: reservationResult.errors.map(err => ({
              ticketName: err.ticketName,
              reason: err.reason,
              requested: err.requested,
              available: err.available
            }))
          }
        });
      }

      console.log(`Successfully reserved ${reservationResult.reservationIds.length} ticket(s) for session: ${tempSessionId}`);

    } catch (reservationError) {
      // CRITICAL: Reservation system failure - this should be rare
      // Log the error but allow purchase to continue (graceful degradation)
      console.error('Reservation system error (allowing purchase):', reservationError);
    }

    // Calculate total and create line items for Stripe
    let totalAmount = 0;
    const lineItems = [];
    let orderType = 'tickets'; // Default to tickets, will be set to 'donation' if only donations

    // Track what types of items we have
    const hasTickets = cartItems.some((item) => item.type === 'ticket');
    const hasDonations = cartItems.some((item) => item.type === 'donation');

    // Set order type based on cart contents
    if (hasDonations && !hasTickets) {
      orderType = 'donation';
    } else if (hasTickets) {
      orderType = 'tickets';
    }

    for (const item of cartItems) {
      // Validate item structure
      if (!item.name || !item.price || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: `Invalid item: ${item.name || 'Unknown'}`
        });
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      // Create Stripe line item
      const lineItem = {
        quantity: item.quantity
      };

      // Use stripe_price_id if available (preferred method)
      if (item.stripePriceId) {
        lineItem.price = item.stripePriceId;
        logger.log(`Using Stripe Price ID for ${item.name}: ${item.stripePriceId}`);
      } else {
        // Fall back to dynamic price_data if stripe_price_id not available
        lineItem.price_data = {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.description
          },
          // Donations are stored in dollars, tickets in cents
          unit_amount: item.type === 'donation'
            ? Math.round(item.price * 100)  // Convert dollars to cents
            : Math.round(item.price)         // Already in cents
        };

        // Add metadata for different item types
        if (item.type === 'ticket') {
          // Validate ticket type is present - NO DEFAULTS
          if (!item.ticketType) {
            return res.status(400).json({
              error: `Missing ticket type for ticket: ${item.name || 'Unknown'}. This is a critical error - please contact support.`
            });
          }

          // Validate event date is present
          if (!item.eventDate) {
            return res.status(400).json({
              error: `Missing event date for ticket: ${item.name || 'Unknown'}. This is a critical error - please contact support.`
            });
          }

          // Set event metadata for tickets - no defaults
          lineItem.price_data.product_data.metadata = {
            type: 'ticket',
            ticket_type: item.ticketType,  // No default - must be explicit
            event_date: item.eventDate,     // No default - must be explicit
            event_id: item.eventId || '',   // Pass event ID through if present
            venue: item.venue || ''          // Pass venue through if present
          };
        } else if (item.type === 'donation') {
          lineItem.price_data.product_data.metadata = {
            type: 'donation',
            donation_category: item.category || 'general'  // Donations can have a default category
          };
        }
      }

      lineItems.push(lineItem);
    }

    // Determine origin from request headers
    const origin =
      req.headers.origin ||
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}` ||
      'https://alocubano.boulderfest.com';

    // Create Stripe Checkout Session with automatic receipt configuration
    const session = await stripe.checkout.sessions.create({
      // Payment methods: 'card' includes Apple Pay & Google Pay automatically when enabled in Dashboard
      // 'link' enables Stripe's Link payment method for faster checkout
      payment_method_types: ['card', 'link'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}${isRequestTestMode ? '&test_mode=true' : ''}`,
      cancel_url: `${origin}/failure?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}${isRequestTestMode ? '&test_mode=true' : ''}`,

      // Customer configuration for automatic receipts
      // If we have an email, use it. Otherwise, let Stripe collect it
      customer_email: customerInfo?.email || undefined,

      // CRITICAL: Create customer object for automatic receipts
      customer_creation: 'always', // This ensures Stripe creates a customer and sends receipts

      // Payment intent configuration with automatic receipts
      payment_intent_data: {
        // Let Stripe handle receipt_email automatically from customer object
        description: `A Lo Cubano Boulder Fest - Order ${orderId}`,
        metadata: {
          orderId: orderId,
          orderType: orderType
        }
        // Note: Removed setup_future_usage as null values cause Stripe errors
        // One-time payments don't need this parameter
      },

      // Enable invoice creation as backup (for invoice-style receipts)
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: 'A Lo Cubano Boulder Fest Tickets',
          metadata: {
            orderId: orderId,
            orderType: orderType
          },
          rendering_options: {
            amount_tax_display: 'exclude_tax'
          }
        }
      },
      metadata: {
        orderId: orderId,
        orderType: orderType,
        customerName:
          customerInfo?.firstName && customerInfo?.lastName
            ? `${customerInfo.firstName} ${customerInfo.lastName}`
            : 'Pending',
        environment: process.env.NODE_ENV || 'development',
        testMode: isRequestTestMode.toString(),
        testTransaction: isRequestTestMode ? 'true' : 'false',
        tempSessionId: tempSessionId  // Store temp session ID for reservation update
      },
      // Collect billing address for tax compliance
      billing_address_collection: 'required',
      // Set session expiration (24 hours for production, 2 hours for test)
      expires_at: Math.floor(Date.now() / 1000) + (isRequestTestMode ? 2 * 60 * 60 : 24 * 60 * 60)
    });

    // Log session creation for debugging
    console.log(`${isRequestTestMode ? 'TEST ' : ''}Stripe checkout session created:`, {
      sessionId: session.id,
      orderId: orderId,
      totalAmount: totalAmount,
      customerEmail: customerInfo?.email || 'Will be collected by Stripe',
      customerCreation: 'always (automatic receipts enabled)',
      invoiceCreation: 'enabled (backup receipts)',
      testMode: isRequestTestMode
    });

    // Return checkout URL for redirect
    res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
      orderId: orderId,
      totalAmount: totalAmount,
      testMode: isRequestTestMode
    });
  } catch (error) {
    // CRITICAL: Release orphaned reservation if it was created
    // This prevents tickets from being locked for 15 minutes when Stripe session creation fails
    if (typeof tempSessionId !== 'undefined') {
      try {
        await releaseReservation(tempSessionId);
        console.log(`Released orphaned reservation for tempSessionId: ${tempSessionId}`);
      } catch (releaseError) {
        console.error('Failed to release orphaned reservation (non-critical):', releaseError);
      }
    }

    // Checkout session creation failed
    console.error('Checkout session error:', error);

    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message
      });
    } else if (error.type === 'StripeAPIError') {
      return res.status(500).json({
        error: 'Stripe API error',
        message: 'Payment service temporarily unavailable'
      });
    } else if (error.type === 'StripeConnectionError') {
      return res.status(500).json({
        error: 'Connection error',
        message: 'Unable to connect to payment service'
      });
    } else if (error.type === 'StripeAuthenticationError') {
      // Stripe authentication error
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Payment service configuration error'
      });
    } else {
      // Always log the error for debugging
      console.error('Unexpected error details:', {
        message: error.message,
        stack: error.stack,
        type: error.type,
        name: error.name
      });

      // Return more detailed error info for debugging
      return res.status(500).json({
        error: 'Checkout session creation failed',
        message: error.message || 'An unexpected error occurred',
        // Include error details for debugging (remove in production later)
        details: {
          errorType: error.name,
          errorMessage: error.message
        }
      });
    }
  }
}
