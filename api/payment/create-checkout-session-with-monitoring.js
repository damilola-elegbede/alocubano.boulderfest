/**
 * Enhanced Stripe Checkout Session Creation with Comprehensive Monitoring
 * Demonstrates integration of all monitoring systems with existing payment API
 */

import Stripe from 'stripe';
import { validateCheckoutData, sanitizeCustomerInfo, sanitizeItems, validateEnvironment } from '../../lib/payment/validation.js';
import { calculateTotal } from '../../lib/payment/calculator.js';
import { inventoryManager } from '../../lib/inventory/manager.js';
import { withRateLimit } from '../../lib/middleware/rateLimiter.js';
import { PAYMENT_CONFIG, ERROR_MESSAGES, ORDER_STATUSES } from '../../lib/payment/config.js';

// Import monitoring system
import { 
  trackPaymentError, 
  trackPaymentSuccess, 
  trackPerformanceMetric,
  trackSecurityEvent 
} from '../../monitoring/sentry-config.js';

import { 
  trackBeginCheckout, 
  trackAddPaymentInfo,
  trackPurchase,
  trackPaymentFailed 
} from '../../monitoring/analytics-integration.js';

import { 
  withPaymentPerformanceMonitoring,
  withInventoryPerformanceMonitoring 
} from '../../monitoring/performance-monitor.js';

import { businessIntelligence } from '../../monitoring/business-intelligence.js';
import { alerts } from '../../monitoring/alerting-system.js';

// Initialize Stripe
let stripe;
try {
  validateEnvironment();
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
} catch (error) {
  console.error('Stripe initialization failed:', error);
  
  // Track initialization failure
  trackPaymentError(error, {
    errorType: 'stripe_initialization_failed',
    component: 'payment-api',
    critical: true
  });

  // Send critical alert
  alerts.securityIncident('stripe_initialization_failed', 
    'Stripe failed to initialize - payment system unavailable', {
      error: error.message,
      environment: process.env.NODE_ENV
    });
}

/**
 * Enhanced order creation with monitoring
 */
const createOrderRecord = withPaymentPerformanceMonitoring('create_order_record', async (orderData) => {
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  const order = {
    id: orderId,
    orderNumber: orderId.substring(4, 12).toUpperCase(),
    ...orderData,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Track business metric
  businessIntelligence.trackCustomerBehavior(orderData.customerEmail, 'order_created', {
    orderId: order.id,
    amount: orderData.totalAmount,
    items: orderData.items
  });

  console.log('Order created:', order.orderNumber);
  return order;
});

/**
 * Enhanced security event logging
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
  
  // Track in Sentry
  trackSecurityEvent(type, {
    ...details,
    ip: event.ip,
    userAgent: event.userAgent
  });

  // Send security alert for critical events
  if (['VALIDATION_FAILED', 'STRIPE_INITIALIZATION_FAILED', 'SUSPICIOUS_ACTIVITY'].includes(type)) {
    alerts.securityIncident(type.toLowerCase(), `Security event: ${type}`, {
      ...details,
      ip: event.ip,
      timestamp: event.timestamp
    });
  }
}

/**
 * Enhanced inventory check with monitoring
 */
const checkInventoryWithMonitoring = withInventoryPerformanceMonitoring(async (items) => {
  const availability = await inventoryManager.checkAvailability(items);
  
  // Track inventory levels for each item
  items.forEach(item => {
    // This would integrate with actual inventory tracking
    const currentLevel = 100; // Mock - replace with actual inventory level
    const reservedLevel = 20;  // Mock - replace with actual reserved level
    
    businessIntelligence.trackInventoryLevel(item.id, currentLevel, reservedLevel);
  });

  return availability;
});

/**
 * Enhanced main handler function with comprehensive monitoring
 */
async function handler(req, res) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let orderId = null;
  let reservationId = null;
  let sessionData = null;

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Request-ID', requestId);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Track checkout start for analytics
    const rawItems = req.body.items || [];
    const totalAmount = req.body.totalAmount || 0;
    
    if (rawItems.length > 0) {
      trackBeginCheckout(rawItems, totalAmount);
      
      // Track conversion step
      businessIntelligence.trackConversionStep('begin_checkout', requestId, {
        itemCount: rawItems.length,
        totalAmount,
        userAgent: req.headers['user-agent']
      });
    }

    // Validate Stripe initialization
    if (!stripe) {
      logSecurityEvent('STRIPE_INITIALIZATION_FAILED', { requestId }, req);
      return res.status(500).json({ 
        error: ERROR_MESSAGES.INTERNAL_ERROR,
        requestId 
      });
    }

    // Validate request data
    const validationResult = validateCheckoutData(req.body);
    if (!validationResult.valid) {
      logSecurityEvent('VALIDATION_FAILED', { 
        error: validationResult.error,
        requestId 
      }, req);
      
      // Track validation failure
      trackPaymentError(new Error(validationResult.error), {
        errorType: 'validation_error',
        endpoint: '/api/payment/create-checkout-session',
        requestId
      });
      
      return res.status(400).json({ 
        error: validationResult.error,
        requestId 
      });
    }

    // Sanitize input data
    const { customerInfo: rawCustomerInfo } = req.body;
    const customerInfo = sanitizeCustomerInfo(rawCustomerInfo);
    const items = sanitizeItems(rawItems);

    // Check inventory availability with monitoring
    const availability = await checkInventoryWithMonitoring(items);
    if (!availability.available) {
      logSecurityEvent('INSUFFICIENT_INVENTORY', { 
        unavailable: availability.unavailable,
        customerEmail: customerInfo.email,
        requestId
      }, req);
      
      // Track inventory shortage
      trackPaymentError(new Error('Insufficient inventory'), {
        errorType: 'inventory_error',
        items: availability.unavailable,
        requestId
      });

      // Send low inventory alert
      availability.unavailable.forEach(item => {
        alerts.lowInventory(item.id, item.available, item.requested);
      });
      
      return res.status(409).json({ 
        error: ERROR_MESSAGES.INSUFFICIENT_INVENTORY,
        details: availability.unavailable,
        requestId
      });
    }

    // Reserve tickets temporarily with monitoring
    try {
      const reservation = await inventoryManager.reserveTickets(items, customerInfo.email);
      reservationId = reservation.id;
      
      // Track successful reservation
      businessIntelligence.trackCustomerBehavior(customerInfo.email, 'tickets_reserved', {
        reservationId,
        items: items.map(item => ({ id: item.id, quantity: item.quantity }))
      });
      
    } catch (error) {
      logSecurityEvent('RESERVATION_FAILED', { 
        error: error.message,
        customerEmail: customerInfo.email,
        requestId
      }, req);
      
      trackPaymentError(error, {
        errorType: 'inventory_error',
        operation: 'reserve_tickets',
        requestId
      });
      
      return res.status(409).json({ 
        error: error.message || ERROR_MESSAGES.INSUFFICIENT_INVENTORY,
        requestId
      });
    }

    // Calculate server-side total with monitoring
    let calculationResult;
    try {
      calculationResult = calculateTotal(items);
      
      // Track pricing calculation success
      trackPerformanceMetric('pricing_calculation', Date.now() - startTime, {
        itemCount: items.length,
        totalAmount: calculationResult.totalDollars
      });
      
    } catch (error) {
      // Release reservation on calculation error
      await inventoryManager.releaseReservation(reservationId);
      
      logSecurityEvent('CALCULATION_FAILED', { 
        error: error.message,
        items,
        customerEmail: customerInfo.email,
        requestId
      }, req);
      
      trackPaymentError(error, {
        errorType: 'calculation_error',
        items,
        requestId
      });
      
      return res.status(400).json({ 
        error: error.message,
        requestId 
      });
    }

    // Track payment info addition for analytics
    trackAddPaymentInfo(items, calculationResult.totalDollars, 'stripe');

    // Create Stripe checkout session with monitoring
    const sessionStartTime = Date.now();
    
    sessionData = {
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
        environment: process.env.NODE_ENV || 'development',
        requestId
      },
      payment_intent_data: {
        metadata: {
          orderType: 'festival_tickets',
          festivalYear: '2026',
          reservationId: reservationId,
          customerEmail: customerInfo.email,
          requestId
        },
        setup_future_usage: null,
      },
      locale: 'en',
      phone_number_collection: {
        enabled: false
      }
    };

    const session = await stripe.checkout.sessions.create(sessionData);
    
    // Track Stripe session creation performance
    const sessionCreationTime = Date.now() - sessionStartTime;
    trackPerformanceMetric('stripe_session_creation', sessionCreationTime, {
      sessionId: session.id,
      amount: calculationResult.totalDollars
    });

    // Create pending order record with monitoring
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
        ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        requestId
      }
    };

    const order = await createOrderRecord(orderData);
    orderId = order.id;

    // Track conversion step
    businessIntelligence.trackConversionStep('payment_session_created', requestId, {
      sessionId: session.id,
      orderId: order.id,
      amount: calculationResult.totalDollars
    });

    // Log successful session creation
    console.log(`Checkout session created: ${session.id} for order: ${order.orderNumber}`);

    // Track overall performance
    const totalProcessingTime = Date.now() - startTime;
    trackPerformanceMetric('checkout_session_total', totalProcessingTime, {
      sessionId: session.id,
      orderId: order.id,
      threshold: 3000
    });

    // Performance warning for slow requests
    if (totalProcessingTime > 3000) {
      console.warn(`Slow checkout session creation: ${totalProcessingTime}ms`);
      
      alerts.performanceDegradation(
        'checkout_session_creation',
        totalProcessingTime,
        3000
      );
    }

    // Track successful payment session creation
    trackPaymentSuccess({
      orderId: order.id,
      sessionId: session.id,
      amount: calculationResult.totalDollars,
      paymentMethod: 'stripe',
      processingTime: totalProcessingTime
    });

    // Respond with session details
    res.status(200).json({ 
      sessionId: session.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      expiresAt: session.expires_at,
      totalAmount: calculationResult.totalDollars,
      reservationId: reservationId,
      requestId
    });

  } catch (error) {
    // Clean up on error
    if (reservationId) {
      try {
        await inventoryManager.releaseReservation(reservationId);
      } catch (cleanupError) {
        console.error('Failed to release reservation on error:', cleanupError);
        
        trackPaymentError(cleanupError, {
          errorType: 'cleanup_failed',
          originalError: error.message,
          reservationId,
          requestId
        });
      }
    }

    const processingTime = Date.now() - startTime;
    console.error('Checkout session error:', error);

    // Enhanced error logging with monitoring
    const errorContext = {
      error: error.message,
      type: error.type,
      code: error.code,
      orderId,
      reservationId,
      processingTime,
      requestId,
      sessionData: sessionData ? 'present' : 'missing'
    };

    logSecurityEvent('CHECKOUT_SESSION_ERROR', errorContext, req);

    // Track error in monitoring systems
    trackPaymentError(error, {
      endpoint: '/api/payment/create-checkout-session',
      processingTime,
      errorType: 'payment_failed',
      ...errorContext
    });

    // Track failed checkout for analytics
    if (req.body.items && req.body.totalAmount) {
      trackPaymentFailed({
        amount: req.body.totalAmount,
        errorType: error.type || 'unknown',
        errorCode: error.code,
        paymentMethod: 'stripe'
      });
    }

    // Send payment failure alert
    alerts.paymentFailed(error, {
      orderId,
      amount: req.body.totalAmount,
      paymentMethod: 'stripe',
      processingTime,
      requestId
    });

    // Handle specific Stripe errors with enhanced monitoring
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ 
        error: error.message,
        type: 'card_error',
        requestId
      });
    }
    
    if (error.type === 'StripeRateLimitError') {
      // Track rate limiting
      alerts.performanceDegradation('stripe_rate_limit', 1, 0);
      
      return res.status(429).json({ 
        error: 'Service temporarily unavailable. Please try again.',
        type: 'rate_limit_error',
        requestId
      });
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Invalid request. Please check your information and try again.',
        type: 'invalid_request',
        requestId
      });
    }
    
    if (error.type === 'StripeAPIError') {
      return res.status(502).json({ 
        error: 'Payment service error. Please try again.',
        type: 'api_error',
        requestId
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return res.status(502).json({ 
        error: 'Connection error. Please try again.',
        type: 'connection_error',
        requestId
      });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      // Critical security issue
      alerts.securityIncident('stripe_auth_error', 
        'Stripe authentication failed - check API keys', {
          error: error.message,
          requestId
        });
      
      return res.status(500).json({ 
        error: ERROR_MESSAGES.INTERNAL_ERROR,
        type: 'authentication_error',
        requestId
      });
    }

    // Generic server error
    res.status(500).json({ 
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      type: 'server_error',
      requestId
    });
  }
}

// Apply rate limiting middleware with monitoring
export default withRateLimit(handler, 'payment');