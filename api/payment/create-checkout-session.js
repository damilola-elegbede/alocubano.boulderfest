/**
 * Stripe Checkout Session Creation API
 * Creates secure checkout sessions with comprehensive validation
 */

import Stripe from 'stripe';
import { validateCheckoutData, sanitizeCustomerInfo, sanitizeItems, validateEnvironment } from '../../lib/payment/validation.js';
import { calculateTotal } from '../../lib/payment/calculator.js';
import { inventoryManager } from '../../lib/inventory/manager.js';
import { withRateLimit } from '../../lib/middleware/rateLimiter.js';
import { PAYMENT_CONFIG, ERROR_MESSAGES, ORDER_STATUSES } from '../../lib/payment/config.js';

// Initialize Stripe
let stripe;
try {
  validateEnvironment();
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
} catch (error) {
  console.error('Stripe initialization failed:', error);
}

/**
 * Create order record in database (placeholder)
 * In production, this would use your actual database
 */
async function createOrderRecord(orderData) {
  // Placeholder implementation - replace with actual database logic
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  const order = {
    id: orderId,
    orderNumber: orderId.substring(4, 12).toUpperCase(),
    ...orderData,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // TODO: Save to actual database
  console.log('Order created:', order.orderNumber);
  
  return order;
}

/**
 * Log security events
 */
function logSecurityEvent(type, details, req) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    ...details
  };
  
  console.log('SECURITY_EVENT:', JSON.stringify(event));
  
  // TODO: Send to monitoring service (Sentry, DataDog, etc.)
}

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  let orderId = null;
  let reservationId = null;

  try {
    // Validate Stripe initialization
    if (!stripe) {
      logSecurityEvent('STRIPE_INITIALIZATION_FAILED', {}, req);
      return res.status(500).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    }

    // Validate request data
    const validationResult = validateCheckoutData(req.body);
    if (!validationResult.valid) {
      logSecurityEvent('VALIDATION_FAILED', { error: validationResult.error }, req);
      return res.status(400).json({ error: validationResult.error });
    }

    // Sanitize input data
    const { items: rawItems, customerInfo: rawCustomerInfo } = req.body;
    const customerInfo = sanitizeCustomerInfo(rawCustomerInfo);
    const items = sanitizeItems(rawItems);

    // Check inventory availability
    const availability = await inventoryManager.checkAvailability(items);
    if (!availability.available) {
      logSecurityEvent('INSUFFICIENT_INVENTORY', { 
        unavailable: availability.unavailable,
        customerEmail: customerInfo.email
      }, req);
      
      return res.status(409).json({ 
        error: ERROR_MESSAGES.INSUFFICIENT_INVENTORY,
        details: availability.unavailable 
      });
    }

    // Reserve tickets temporarily
    try {
      const reservation = await inventoryManager.reserveTickets(items, customerInfo.email);
      reservationId = reservation.id;
    } catch (error) {
      logSecurityEvent('RESERVATION_FAILED', { 
        error: error.message,
        customerEmail: customerInfo.email
      }, req);
      
      return res.status(409).json({ 
        error: error.message || ERROR_MESSAGES.INSUFFICIENT_INVENTORY
      });
    }

    // Calculate server-side total with security validation
    let calculationResult;
    try {
      calculationResult = calculateTotal(items);
    } catch (error) {
      // Release reservation on calculation error
      await inventoryManager.releaseReservation(reservationId);
      
      logSecurityEvent('CALCULATION_FAILED', { 
        error: error.message,
        items,
        customerEmail: customerInfo.email
      }, req);
      
      return res.status(400).json({ error: error.message });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: PAYMENT_CONFIG.stripe.paymentMethods,
      customer_email: customerInfo.email,
      line_items: calculationResult.lineItems,
      mode: 'payment',
      success_url: `${process.env.VERCEL_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VERCEL_URL || 'http://localhost:3000'}/tickets?canceled=true`,
      expires_at: Math.floor(Date.now() / 1000) + PAYMENT_CONFIG.stripe.sessionExpiry,
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      shipping_address_collection: null,
      metadata: {
        reservationId: reservationId,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone || '',
        itemCount: items.length,
        environment: process.env.NODE_ENV || 'development'
      },
      payment_intent_data: {
        metadata: {
          orderType: 'festival_tickets',
          festivalYear: '2026',
          reservationId: reservationId,
          customerEmail: customerInfo.email
        },
        setup_future_usage: null, // We don't store payment methods
      },
      locale: 'en',
      phone_number_collection: {
        enabled: false // We collect this separately
      }
    });

    // Create pending order record
    const orderData = {
      customerEmail: customerInfo.email,
      customerName: customerInfo.name,
      customerPhone: customerInfo.phone,
      status: ORDER_STATUSES.PENDING,
      paymentSessionId: session.id,
      reservationId: reservationId,
      totalAmount: calculationResult.totalDollars,
      currency: PAYMENT_CONFIG.stripe.currency,
      items: items,
      metadata: {
        calculationBreakdown: calculationResult.breakdown,
        stripeSessionUrl: session.url,
        userAgent: req.headers['user-agent'],
        ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress
      }
    };

    const order = await createOrderRecord(orderData);
    orderId = order.id;

    // Log successful session creation
    console.log(`Checkout session created: ${session.id} for order: ${order.orderNumber}`);

    // Track performance
    const processingTime = Date.now() - startTime;
    if (processingTime > 3000) {
      console.warn(`Slow checkout session creation: ${processingTime}ms`);
    }

    // Respond with session details
    res.status(200).json({ 
      sessionId: session.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      expiresAt: session.expires_at,
      totalAmount: calculationResult.totalDollars,
      reservationId: reservationId
    });

  } catch (error) {
    // Clean up on error
    if (reservationId) {
      try {
        await inventoryManager.releaseReservation(reservationId);
      } catch (cleanupError) {
        console.error('Failed to release reservation on error:', cleanupError);
      }
    }

    console.error('Checkout session error:', error);

    // Log error with context
    logSecurityEvent('CHECKOUT_SESSION_ERROR', {
      error: error.message,
      type: error.type,
      code: error.code,
      orderId,
      reservationId,
      processingTime: Date.now() - startTime
    }, req);

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ 
        error: error.message,
        type: 'card_error'
      });
    }
    
    if (error.type === 'StripeRateLimitError') {
      return res.status(429).json({ 
        error: 'Service temporarily unavailable. Please try again.',
        type: 'rate_limit_error'
      });
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Invalid request. Please check your information and try again.',
        type: 'invalid_request'
      });
    }
    
    if (error.type === 'StripeAPIError') {
      return res.status(502).json({ 
        error: 'Payment service error. Please try again.',
        type: 'api_error'
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return res.status(502).json({ 
        error: 'Connection error. Please try again.',
        type: 'connection_error'
      });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(500).json({ 
        error: ERROR_MESSAGES.INTERNAL_ERROR,
        type: 'authentication_error'
      });
    }

    // Generic server error
    res.status(500).json({ 
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      type: 'server_error'
    });
  }
}

// Apply rate limiting middleware
export default withRateLimit(handler, 'payment');