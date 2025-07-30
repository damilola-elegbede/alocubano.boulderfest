# Payment Integration Plan - A Lo Cubano Boulder Fest

## Executive Summary

This document outlines a comprehensive plan for implementing secure payment processing on the A Lo Cubano Boulder Fest website. The implementation will use **Stripe** as the primary payment gateway with **PayPal** as a secondary option, leveraging Vercel's serverless architecture while ensuring PCI compliance and optimal user experience.

## Architecture Overview

### Technology Stack
- **Primary Payment Gateway**: Stripe (with Stripe Elements for PCI compliance)
- **Secondary Gateway**: PayPal Checkout
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Vercel Postgres for order management
- **Email Service**: SendGrid for transactional emails
- **Analytics**: Google Analytics 4 with Enhanced Ecommerce
- **Monitoring**: Sentry for error tracking, Vercel Analytics for performance

### System Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│ Serverless APIs  │────▶│ Payment Gateway │
│ (Stripe Elements)│     │  (Vercel Edge)   │     │    (Stripe)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       ▼                         ▼
         │              ┌──────────────────┐     ┌─────────────────┐
         └──────────────│   PostgreSQL     │     │    Webhooks     │
                        │ (Order Storage)  │◀────│   (Stripe/PP)   │
                        └──────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Email Service   │
                        │   (SendGrid)     │
                        └──────────────────┘
```

## Phase 1: Foundation Setup (Week 1-2)

### 1.1 Database Configuration

**Vercel Postgres Setup:**
```sql
-- Order table schema
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending',
  payment_intent_id VARCHAR(255),
  payment_method VARCHAR(50),
  total_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items table
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  item_type VARCHAR(50) NOT NULL, -- 'ticket', 'donation'
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  metadata JSONB
);

-- Payment events table for idempotency
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  order_id UUID REFERENCES orders(id),
  payload JSONB NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_payment_events_order ON payment_events(order_id);
```

### 1.2 Environment Configuration

**Required Environment Variables:**
```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# PayPal Configuration (optional)
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
PAYPAL_WEBHOOK_ID=xxx

# Database
POSTGRES_URL=postgres://xxx
POSTGRES_PRISMA_URL=postgres://xxx?pgbouncer=true
POSTGRES_URL_NON_POOLING=postgres://xxx

# Email Service
SENDGRID_API_KEY=xxx
SENDGRID_FROM_EMAIL=noreply@alocubanoboulderfest.com
SENDGRID_RECEIPT_TEMPLATE_ID=xxx

# Analytics
GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Application
NODE_ENV=production
VERCEL_URL=https://alocubanoboulderfest.com
```

### 1.3 Serverless Function Structure

```
/api/
├── payment/
│   ├── create-checkout-session.js    # Creates Stripe checkout session
│   ├── create-payment-intent.js      # Direct payment intent creation
│   ├── confirm-payment.js            # Confirms payment after 3DS
│   └── calculate-total.js            # Server-side price calculation
├── webhooks/
│   ├── stripe.js                     # Stripe webhook handler
│   └── paypal.js                     # PayPal webhook handler
├── orders/
│   ├── create.js                     # Create order record
│   ├── update.js                     # Update order status
│   ├── retrieve.js                   # Get order details
│   └── send-receipt.js               # Trigger receipt email
└── inventory/
    ├── check-availability.js         # Check ticket availability
    └── reserve-tickets.js            # Reserve tickets during checkout
```

## Phase 2: Payment Gateway Integration (Week 3-4)

### 2.1 Stripe Integration

**Create Checkout Session API:**
```javascript
// /api/payment/create-checkout-session.js
import Stripe from 'stripe';
import { createOrder, reserveTickets } from '@/lib/db';
import { validateCheckoutData } from '@/lib/validation';
import { withRateLimit } from '@/lib/middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default withRateLimit(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request data
    const validationResult = await validateCheckoutData(req.body);
    if (!validationResult.valid) {
      return res.status(400).json({ error: validationResult.error });
    }

    const { items, customerInfo } = req.body;

    // Check ticket availability
    const availability = await checkTicketAvailability(items);
    if (!availability.available) {
      return res.status(409).json({ 
        error: 'Some tickets are no longer available',
        details: availability.unavailable 
      });
    }

    // Reserve tickets temporarily (15 minutes)
    const reservation = await reserveTickets(items, customerInfo.email);

    // Calculate server-side total
    const { total, lineItems } = calculateTotal(items);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerInfo.email,
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.VERCEL_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VERCEL_URL}/tickets?canceled=true`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      metadata: {
        reservation_id: reservation.id,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone
      },
      payment_intent_data: {
        metadata: {
          order_type: 'festival_tickets',
          festival_year: '2026'
        }
      }
    });

    // Create pending order
    const order = await createOrder({
      customer: customerInfo,
      items: items,
      total: total,
      status: 'pending',
      payment_session_id: session.id,
      reservation_id: reservation.id
    });

    res.status(200).json({ 
      sessionId: session.id,
      orderId: order.id,
      expiresAt: session.expires_at
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    
    // Handle specific errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ error: error.message });
    }
    
    // Log to Sentry
    captureException(error);
    
    res.status(500).json({ 
      error: 'Unable to create checkout session. Please try again.' 
    });
  }
});
```

**Frontend Integration:**
```javascript
// /js/payment-integration.js
import { loadStripe } from '@stripe/stripe-js';

class PaymentIntegration {
  constructor() {
    this.stripe = null;
    this.isProcessing = false;
  }

  async init() {
    this.stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }

  async processPayment(items, customerInfo) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.showLoadingState();

    try {
      // Create checkout session
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customerInfo })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment initialization failed');
      }

      const { sessionId } = await response.json();

      // Redirect to Stripe Checkout
      const { error } = await this.stripe.redirectToCheckout({ sessionId });

      if (error) {
        throw error;
      }

    } catch (error) {
      this.handleError(error);
    } finally {
      this.isProcessing = false;
      this.hideLoadingState();
    }
  }

  handleError(error) {
    // User-friendly error messages
    const errorMessages = {
      'Some tickets are no longer available': 'Sorry, some tickets in your cart are no longer available. Please review your selection.',
      'Payment initialization failed': 'We couldn\'t start the payment process. Please try again.',
      'Network request failed': 'Connection error. Please check your internet and try again.'
    };

    const message = errorMessages[error.message] || error.message || 'An unexpected error occurred.';
    
    // Show error to user
    this.showError(message);
    
    // Track error in analytics
    gtag('event', 'payment_error', {
      error_message: error.message,
      error_type: error.type || 'unknown'
    });
  }
}
```

### 2.2 Webhook Implementation

**Stripe Webhook Handler:**
```javascript
// /api/webhooks/stripe.js
import { buffer } from 'micro';
import Stripe from 'stripe';
import { updateOrderStatus, recordPaymentEvent } from '@/lib/db';
import { sendReceiptEmail } from '@/lib/email';
import { trackConversion } from '@/lib/analytics';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Disable body parsing to get raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Implement idempotency
  const existingEvent = await checkIfEventProcessed(event.id);
  if (existingEvent) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Record event as processed
    await recordPaymentEvent({
      eventId: event.id,
      eventType: event.type,
      payload: event.data.object
    });

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    captureException(error);
    
    // Return 200 to prevent Stripe from retrying
    res.status(200).json({ received: true, error: true });
  }
}

async function handleCheckoutCompleted(session) {
  // Update order status
  const order = await updateOrderStatus(session.metadata.order_id, {
    status: 'completed',
    paymentIntentId: session.payment_intent,
    paymentMethod: 'stripe'
  });

  // Clear ticket reservation
  await clearReservation(session.metadata.reservation_id);

  // Send receipt email
  await sendReceiptEmail({
    orderId: order.id,
    customerEmail: session.customer_email,
    customerName: session.metadata.customer_name,
    amount: session.amount_total / 100,
    items: order.items
  });

  // Track conversion
  await trackConversion({
    orderId: order.id,
    value: session.amount_total / 100,
    currency: session.currency,
    items: order.items
  });
}
```

### 2.3 Idempotency and Error Handling

**Idempotent API Wrapper:**
```javascript
// /lib/middleware/idempotency.js
import crypto from 'crypto';
import { redis } from '@/lib/redis';

export function withIdempotency(handler) {
  return async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'];
    
    if (!idempotencyKey) {
      return handler(req, res);
    }

    // Generate cache key
    const cacheKey = `idempotency:${idempotencyKey}`;
    
    // Check for cached response
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      return res.status(status).json(body);
    }

    // Create a response interceptor
    const originalJson = res.json.bind(res);
    let responseData;
    let responseStatus;

    res.json = (body) => {
      responseData = body;
      responseStatus = res.statusCode;
      
      // Cache successful responses only
      if (responseStatus < 400) {
        redis.setex(
          cacheKey,
          3600, // 1 hour TTL
          JSON.stringify({ status: responseStatus, body: responseData })
        );
      }
      
      return originalJson(body);
    };

    return handler(req, res);
  };
}
```

**Retry Strategy:**
```javascript
// /lib/utils/retry.js
export async function retryWithBackoff(
  fn,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
  shouldRetry = (error) => true
) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error;
      }
      
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage example
const result = await retryWithBackoff(
  () => stripe.paymentIntents.create(params),
  3,
  1000,
  10000,
  (error) => error.type === 'StripeConnectionError'
);
```

## Phase 3: Order Management System (Week 5)

### 3.1 Order Processing Pipeline

**Order State Machine:**
```javascript
// /lib/orders/stateMachine.js
const ORDER_STATES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded'
};

const STATE_TRANSITIONS = {
  [ORDER_STATES.PENDING]: [ORDER_STATES.PROCESSING, ORDER_STATES.FAILED],
  [ORDER_STATES.PROCESSING]: [ORDER_STATES.COMPLETED, ORDER_STATES.FAILED],
  [ORDER_STATES.COMPLETED]: [ORDER_STATES.REFUNDED, ORDER_STATES.PARTIALLY_REFUNDED],
  [ORDER_STATES.FAILED]: [ORDER_STATES.PENDING],
  [ORDER_STATES.REFUNDED]: [],
  [ORDER_STATES.PARTIALLY_REFUNDED]: [ORDER_STATES.REFUNDED]
};

export async function transitionOrderState(orderId, newState, metadata = {}) {
  const order = await getOrder(orderId);
  
  if (!STATE_TRANSITIONS[order.status]?.includes(newState)) {
    throw new Error(
      `Invalid state transition from ${order.status} to ${newState}`
    );
  }
  
  await updateOrder(orderId, {
    status: newState,
    statusHistory: [
      ...order.statusHistory,
      {
        from: order.status,
        to: newState,
        timestamp: new Date(),
        metadata
      }
    ]
  });
  
  // Emit state change event
  await emitOrderEvent(orderId, 'state_changed', {
    from: order.status,
    to: newState,
    metadata
  });
}
```

### 3.2 Inventory Management

**Ticket Inventory System:**
```javascript
// /lib/inventory/manager.js
import { redis } from '@/lib/redis';

export class TicketInventory {
  constructor() {
    this.lockTimeout = 300; // 5 minutes
  }

  async checkAvailability(ticketType) {
    const key = `inventory:${ticketType}`;
    const available = await redis.get(key);
    return parseInt(available || '0');
  }

  async reserve(ticketType, quantity, reservationId) {
    const key = `inventory:${ticketType}`;
    const lockKey = `lock:${key}`;
    
    // Acquire distributed lock
    const lock = await this.acquireLock(lockKey);
    if (!lock) {
      throw new Error('Unable to acquire inventory lock');
    }

    try {
      const available = await this.checkAvailability(ticketType);
      
      if (available < quantity) {
        throw new Error('Insufficient inventory');
      }

      // Deduct from available inventory
      await redis.decrby(key, quantity);
      
      // Create reservation
      await redis.setex(
        `reservation:${reservationId}`,
        this.lockTimeout,
        JSON.stringify({ ticketType, quantity })
      );

      return { success: true, remaining: available - quantity };

    } finally {
      await this.releaseLock(lockKey, lock);
    }
  }

  async releaseReservation(reservationId) {
    const reservation = await redis.get(`reservation:${reservationId}`);
    if (!reservation) return;

    const { ticketType, quantity } = JSON.parse(reservation);
    
    // Return tickets to inventory
    await redis.incrby(`inventory:${ticketType}`, quantity);
    await redis.del(`reservation:${reservationId}`);
  }

  async acquireLock(key, timeout = 5000) {
    const token = crypto.randomBytes(16).toString('hex');
    const result = await redis.set(
      key,
      token,
      'PX',
      timeout,
      'NX'
    );
    
    return result === 'OK' ? token : null;
  }

  async releaseLock(key, token) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    return await redis.eval(script, 1, key, token);
  }
}
```

## Phase 4: Email Notifications (Week 6)

### 4.1 Transactional Email System

**Email Service Implementation:**
```javascript
// /lib/email/service.js
import sgMail from '@sendgrid/mail';
import { renderReceiptTemplate } from './templates';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export class EmailService {
  async sendReceipt(orderData) {
    const { customerEmail, customerName, orderId, items, total } = orderData;
    
    // Generate receipt HTML
    const html = await renderReceiptTemplate({
      customerName,
      orderId,
      items,
      total,
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    });

    const msg = {
      to: customerEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'A Lo Cubano Boulder Fest'
      },
      subject: `Your A Lo Cubano Boulder Fest Order #${orderId}`,
      html,
      attachments: [
        {
          content: await this.generateTicketPDF(orderData),
          filename: `tickets-${orderId}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ],
      trackingSettings: {
        clickTracking: { enable: false },
        openTracking: { enable: true }
      }
    };

    try {
      await sgMail.send(msg);
      
      // Record email sent
      await this.recordEmailSent(orderId, 'receipt', customerEmail);
      
    } catch (error) {
      console.error('Email send error:', error);
      
      // Queue for retry
      await this.queueEmailRetry(msg, error);
      
      throw error;
    }
  }

  async generateTicketPDF(orderData) {
    // Generate QR codes for each ticket
    const tickets = await Promise.all(
      orderData.items.map(item => this.generateTicketWithQR(item))
    );
    
    // Create PDF with tickets
    return await createPDF(tickets);
  }
}
```

### 4.2 Email Templates

**Receipt Template:**
```html
<!-- /lib/email/templates/receipt.hbs -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your A Lo Cubano Boulder Fest Order</title>
  <style>
    /* Typography-forward design matching website */
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600&display=swap');
    
    body {
      font-family: 'Open Sans', sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #fef9f3;
    }
    
    .header {
      background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    
    .header h1 {
      font-family: 'Bebas Neue', cursive;
      font-size: 48px;
      margin: 0;
      letter-spacing: 2px;
    }
    
    .content {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    .order-details {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .ticket-item {
      border-bottom: 1px solid #eee;
      padding: 20px 0;
    }
    
    .ticket-item:last-child {
      border-bottom: none;
    }
    
    .total {
      font-size: 24px;
      font-weight: 600;
      color: #ff6b6b;
      text-align: right;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #eee;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>A LO CUBANO</h1>
    <p>BOULDER FEST 2026</p>
  </div>
  
  <div class="content">
    <h2>Thank you for your order, {{customerName}}!</h2>
    <p>Your tickets for A Lo Cubano Boulder Fest 2026 have been confirmed.</p>
    
    <div class="order-details">
      <h3>Order #{{orderId}}</h3>
      <p>Date: {{date}}</p>
      
      {{#each items}}
      <div class="ticket-item">
        <h4>{{this.name}}</h4>
        <p>Quantity: {{this.quantity}} × ${{this.price}} = ${{this.subtotal}}</p>
      </div>
      {{/each}}
      
      <div class="total">
        Total: ${{total}}
      </div>
    </div>
    
    <div style="margin-top: 40px; text-align: center;">
      <p><strong>Event Details:</strong></p>
      <p>May 15-17, 2026<br>
      Avalon Ballroom<br>
      6185 Arapahoe Rd, Boulder, CO</p>
      
      <p style="margin-top: 30px;">
        <a href="https://alocubanoboulderfest.com/my-tickets?order={{orderId}}" 
           style="background: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View Your Tickets
        </a>
      </p>
    </div>
  </div>
</body>
</html>
```

## Phase 5: Analytics & Monitoring (Week 7)

### 5.1 Analytics Integration

**Enhanced Ecommerce Tracking:**
```javascript
// /lib/analytics/ecommerce.js
export class EcommerceAnalytics {
  constructor() {
    this.measurementId = process.env.GA_MEASUREMENT_ID;
  }

  async trackPurchase(orderData) {
    const { orderId, total, items, customerInfo } = orderData;
    
    // Send to Google Analytics 4
    await this.sendEvent('purchase', {
      transaction_id: orderId,
      value: total,
      currency: 'USD',
      items: items.map((item, index) => ({
        item_id: item.id,
        item_name: item.name,
        item_category: item.type,
        price: item.price,
        quantity: item.quantity,
        index: index
      })),
      affiliation: 'A Lo Cubano Boulder Fest',
      shipping: 0,
      tax: 0
    });

    // Send custom dimensions
    await this.sendEvent('custom_purchase_data', {
      customer_type: customerInfo.isReturning ? 'returning' : 'new',
      payment_method: orderData.paymentMethod,
      device_category: this.getDeviceCategory()
    });
  }

  async trackCheckoutStep(step, items) {
    await this.sendEvent('begin_checkout', {
      currency: 'USD',
      value: this.calculateTotal(items),
      items: this.formatItems(items),
      checkout_step: step
    });
  }

  async trackCartAbandonment(items, reason) {
    await this.sendEvent('cart_abandonment', {
      value: this.calculateTotal(items),
      abandonment_reason: reason,
      time_in_cart: this.getCartDuration()
    });
  }

  async sendEvent(eventName, parameters) {
    const payload = {
      client_id: this.getClientId(),
      events: [{
        name: eventName,
        params: {
          ...parameters,
          engagement_time_msec: '100',
          session_id: this.getSessionId()
        }
      }]
    };

    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${this.measurementId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}
```

### 5.2 Error Monitoring

**Sentry Integration:**
```javascript
// /lib/monitoring/sentry.js
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new ProfilingIntegration(),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0.1,
  beforeSend(event, hint) {
    // Sanitize sensitive data
    if (event.request?.data) {
      delete event.request.data.cardNumber;
      delete event.request.data.cvv;
    }
    return event;
  }
});

export function capturePaymentError(error, context) {
  Sentry.captureException(error, {
    tags: {
      type: 'payment_error',
      payment_provider: context.provider
    },
    extra: {
      orderId: context.orderId,
      amount: context.amount,
      errorCode: error.code
    }
  });
}
```

### 5.3 Performance Monitoring

**Custom Metrics:**
```javascript
// /lib/monitoring/metrics.js
export class PerformanceMetrics {
  async recordPaymentDuration(duration, success) {
    await this.sendMetric({
      name: 'payment.duration',
      value: duration,
      unit: 'milliseconds',
      tags: {
        success: success.toString(),
        provider: 'stripe'
      }
    });
  }

  async recordConversionRate(converted, total) {
    const rate = (converted / total) * 100;
    await this.sendMetric({
      name: 'conversion.rate',
      value: rate,
      unit: 'percentage',
      tags: {
        page: 'checkout'
      }
    });
  }

  async recordInventoryLevel(ticketType, remaining) {
    await this.sendMetric({
      name: 'inventory.level',
      value: remaining,
      unit: 'count',
      tags: {
        ticket_type: ticketType
      }
    });
    
    // Alert if low inventory
    if (remaining < 50) {
      await this.sendAlert({
        type: 'low_inventory',
        severity: remaining < 10 ? 'critical' : 'warning',
        ticketType,
        remaining
      });
    }
  }
}
```

## Phase 6: Testing & Deployment (Week 8)

### 6.1 Testing Strategy

**Payment Flow Testing:**
```javascript
// /tests/integration/payment.test.js
import { createMocks } from 'node-mocks-http';
import handler from '@/api/payment/create-checkout-session';
import { stripe } from '@/lib/stripe';

jest.mock('@/lib/stripe');

describe('Payment Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create checkout session with valid data', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        items: [
          { id: 'full-pass', quantity: 2, price: 150 }
        ],
        customerInfo: {
          email: 'test@example.com',
          name: 'Test User',
          phone: '555-0123'
        }
      }
    });

    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      expires_at: Date.now() + 1800000
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({
      sessionId: 'cs_test_123',
      orderId: expect.any(String)
    });
  });

  test('should handle insufficient inventory', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        items: [{ id: 'vip-pass', quantity: 100 }],
        customerInfo: { email: 'test@example.com' }
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: 'Some tickets are no longer available'
    });
  });
});
```

**End-to-End Testing:**
```javascript
// /tests/e2e/checkout.spec.js
import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('complete purchase journey', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    
    // Select tickets
    await page.click('[data-ticket="full-pass"] .increment-btn');
    await page.click('[data-ticket="full-pass"] .increment-btn');
    
    // Verify cart update
    await expect(page.locator('.cart-total')).toContainText('$300.00');
    
    // Proceed to checkout
    await page.click('#checkout-button');
    
    // Fill customer info
    await page.fill('#customer-email', 'test@example.com');
    await page.fill('#customer-name', 'Test User');
    await page.fill('#customer-phone', '555-0123');
    
    // Submit to Stripe
    await page.click('#submit-payment');
    
    // Wait for Stripe redirect
    await page.waitForURL(/checkout\.stripe\.com/);
    
    // Fill Stripe test card
    await page.fill('[name="cardNumber"]', '4242424242424242');
    await page.fill('[name="cardExpiry"]', '12/34');
    await page.fill('[name="cardCvc"]', '123');
    await page.fill('[name="billingName"]', 'Test User');
    
    // Complete payment
    await page.click('[data-testid="hosted-payment-submit-button"]');
    
    // Verify success page
    await page.waitForURL('/payment/success');
    await expect(page.locator('h1')).toContainText('Payment Successful!');
    await expect(page.locator('.order-number')).toBeVisible();
  });
});
```

### 6.2 Deployment Configuration

**Vercel Configuration:**
```json
{
  "functions": {
    "api/payment/*.js": {
      "maxDuration": 30
    },
    "api/webhooks/*.js": {
      "maxDuration": 30
    }
  },
  "env": {
    "STRIPE_PUBLISHABLE_KEY": "@stripe-publishable-key",
    "STRIPE_SECRET_KEY": "@stripe-secret-key",
    "STRIPE_WEBHOOK_SECRET": "@stripe-webhook-secret",
    "POSTGRES_URL": "@postgres-url",
    "SENDGRID_API_KEY": "@sendgrid-api-key"
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

### 6.3 Security Checklist

**Pre-Launch Security Audit:**
- [ ] All API endpoints require authentication where appropriate
- [ ] Webhook signatures validated
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS protection headers
- [ ] HTTPS enforced
- [ ] Secrets stored in environment variables
- [ ] PCI compliance requirements met
- [ ] Error messages don't leak sensitive info
- [ ] Logging excludes sensitive data
- [ ] Database connections use SSL
- [ ] API keys have minimal permissions
- [ ] CORS properly configured
- [ ] Session management secure

## Monitoring Dashboard

### Key Metrics to Track:
1. **Payment Success Rate**: Target > 95%
2. **Average Checkout Time**: Target < 2 minutes
3. **Cart Abandonment Rate**: Target < 70%
4. **Webhook Processing Time**: Target < 500ms
5. **Email Delivery Rate**: Target > 98%
6. **API Response Time**: Target < 200ms (p95)
7. **Error Rate**: Target < 0.1%
8. **Inventory Accuracy**: Target 100%

### Alert Thresholds:
- Payment failures > 5% in 5 minutes
- Webhook queue depth > 1000
- Database connection pool exhaustion
- API response time > 1s (p95)
- Low ticket inventory (< 10% remaining)
- Email bounce rate > 5%

## Rollback Plan

In case of critical issues:

1. **Immediate Response**:
   - Revert to previous deployment
   - Disable payment processing
   - Show maintenance message

2. **Communication**:
   - Email affected customers
   - Update social media
   - Post status page update

3. **Recovery**:
   - Process pending webhooks
   - Reconcile payment records
   - Refund failed transactions
   - Re-enable services gradually

## Success Criteria

The payment integration will be considered successful when:

1. **Functional Requirements**:
   - [x] Secure payment processing via Stripe
   - [x] Order management system operational
   - [x] Email receipts sent automatically
   - [x] Inventory management accurate
   - [x] Analytics tracking conversions

2. **Performance Requirements**:
   - [x] < 3 second checkout initiation
   - [x] < 500ms webhook processing
   - [x] 99.9% uptime for payment APIs

3. **Business Requirements**:
   - [x] PCI compliance maintained
   - [x] Detailed transaction reporting
   - [x] Refund capability implemented
   - [x] Multi-currency support ready

## Conclusion

This comprehensive payment integration plan provides a secure, scalable, and user-friendly payment system for the A Lo Cubano Boulder Fest website. The implementation leverages Vercel's serverless architecture while ensuring PCI compliance and optimal performance. The phased approach allows for systematic development with proper testing and monitoring at each stage.