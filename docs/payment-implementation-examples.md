# Payment Implementation Code Examples

## 1. Frontend Payment Integration

### Ticket Selection Enhancement
```javascript
// /js/modules/payment-handler.js
import { loadStripe } from '@stripe/stripe-js';

export class PaymentHandler {
  constructor() {
    this.stripe = null;
    this.elements = null;
    this.isProcessing = false;
    this.sessionTimeout = null;
  }

  async init() {
    // Initialize Stripe
    this.stripe = await loadStripe(window.STRIPE_PUBLISHABLE_KEY);
    
    // Set up session timeout warning
    this.setupSessionTimeout();
    
    // Listen for cart changes
    document.addEventListener('cartUpdated', this.handleCartUpdate.bind(this));
  }

  setupSessionTimeout() {
    // Warn user 5 minutes before session expires
    this.sessionTimeout = setTimeout(() => {
      this.showTimeoutWarning();
    }, 25 * 60 * 1000); // 25 minutes
  }

  async createCheckoutSession(items, customerInfo) {
    try {
      // Disable checkout button
      this.setProcessingState(true);
      
      // Validate customer info
      const validation = this.validateCustomerInfo(customerInfo);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      // Create checkout session
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': this.generateRequestId()
        },
        body: JSON.stringify({
          items: this.formatItems(items),
          customerInfo,
          returnUrl: window.location.origin
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const { sessionId, orderId } = await response.json();
      
      // Store order ID for success page
      sessionStorage.setItem('pendingOrderId', orderId);
      
      // Track checkout initiation
      this.trackEvent('begin_checkout', {
        value: this.calculateTotal(items),
        items: items.length
      });

      // Redirect to Stripe Checkout
      const { error } = await this.stripe.redirectToCheckout({ sessionId });
      
      if (error) {
        throw error;
      }

    } catch (error) {
      this.handleError(error);
    } finally {
      this.setProcessingState(false);
    }
  }

  validateCustomerInfo(info) {
    const errors = [];
    
    if (!info.email || !this.isValidEmail(info.email)) {
      errors.push('Valid email required');
    }
    
    if (!info.name || info.name.length < 2) {
      errors.push('Full name required');
    }
    
    if (info.phone && !this.isValidPhone(info.phone)) {
      errors.push('Invalid phone number format');
    }
    
    return {
      valid: errors.length === 0,
      message: errors.join(', ')
    };
  }

  formatItems(items) {
    return items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      metadata: {
        type: item.type,
        date: item.date
      }
    }));
  }

  handleError(error) {
    console.error('Payment error:', error);
    
    // User-friendly error messages
    const errorMap = {
      'insufficient_inventory': 'Some tickets are no longer available. Please review your selection.',
      'invalid_request': 'Please check your information and try again.',
      'rate_limit': 'Too many requests. Please wait a moment and try again.',
      'network_error': 'Connection error. Please check your internet and try again.'
    };

    const message = errorMap[error.code] || error.message || 'Payment failed. Please try again.';
    
    // Show error notification
    this.showNotification(message, 'error');
    
    // Track error
    this.trackEvent('payment_error', {
      error_code: error.code,
      error_message: error.message
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `payment-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  trackEvent(eventName, params) {
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, {
        event_category: 'payment',
        ...params
      });
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const paymentHandler = new PaymentHandler();
  paymentHandler.init();
  
  // Expose to global scope for ticket selection
  window.paymentHandler = paymentHandler;
});
```

### Success Page Handler
```javascript
// /js/pages/payment-success.js
class PaymentSuccessHandler {
  constructor() {
    this.orderId = null;
    this.sessionId = null;
  }

  async init() {
    // Get parameters from URL
    const params = new URLSearchParams(window.location.search);
    this.sessionId = params.get('session_id');
    
    if (!this.sessionId) {
      this.handleError('Invalid session');
      return;
    }

    // Verify payment and get order details
    await this.verifyPayment();
  }

  async verifyPayment() {
    try {
      const response = await fetch('/api/payment/verify-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      if (!response.ok) {
        throw new Error('Verification failed');
      }

      const orderData = await response.json();
      this.displaySuccess(orderData);
      
      // Track successful conversion
      this.trackPurchase(orderData);
      
      // Clear cart
      this.clearCart();
      
    } catch (error) {
      this.handleError('Unable to verify payment');
    }
  }

  displaySuccess(orderData) {
    const { orderId, customerEmail, items, total } = orderData;
    
    // Update page content
    document.getElementById('order-number').textContent = orderId;
    document.getElementById('customer-email').textContent = customerEmail;
    document.getElementById('order-total').textContent = `$${total.toFixed(2)}`;
    
    // Display order items
    const itemsList = document.getElementById('order-items');
    itemsList.innerHTML = items.map(item => `
      <div class="order-item">
        <h4>${item.name}</h4>
        <p>${item.quantity} × $${item.price} = $${item.subtotal}</p>
      </div>
    `).join('');
    
    // Show download button for tickets
    this.setupTicketDownload(orderId);
  }

  setupTicketDownload(orderId) {
    const downloadBtn = document.getElementById('download-tickets');
    
    downloadBtn.addEventListener('click', async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}/tickets`, {
          headers: {
            'Authorization': `Bearer ${this.sessionId}`
          }
        });
        
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tickets-${orderId}.pdf`;
        a.click();
        
      } catch (error) {
        this.showNotification('Unable to download tickets. Please check your email.');
      }
    });
  }

  trackPurchase(orderData) {
    // Enhanced ecommerce tracking
    gtag('event', 'purchase', {
      transaction_id: orderData.orderId,
      value: orderData.total,
      currency: 'USD',
      items: orderData.items.map(item => ({
        item_id: item.id,
        item_name: item.name,
        item_category: 'tickets',
        price: item.price,
        quantity: item.quantity
      }))
    });
    
    // Facebook Pixel
    if (typeof fbq !== 'undefined') {
      fbq('track', 'Purchase', {
        value: orderData.total,
        currency: 'USD',
        content_ids: orderData.items.map(i => i.id),
        content_type: 'product'
      });
    }
  }

  clearCart() {
    localStorage.removeItem('ticketCart');
    sessionStorage.removeItem('pendingOrderId');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const handler = new PaymentSuccessHandler();
  handler.init();
});
```

## 2. Backend API Implementation

### Stripe Checkout Session API
```javascript
// /api/payment/create-checkout-session.js
import Stripe from 'stripe';
import { sql } from '@vercel/postgres';
import { nanoid } from 'nanoid';
import { rateLimit } from '@/lib/rate-limit';
import { validateRequest } from '@/lib/validation';
import { checkInventory, reserveItems } from '@/lib/inventory';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 unique tokens per interval
});

export default async function handler(req, res) {
  // Apply rate limiting
  try {
    await limiter.check(res, 10, 'CACHE_TOKEN'); // 10 requests per minute
  } catch {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request
    const validation = await validateRequest(req.body, {
      items: 'required|array',
      customerInfo: 'required|object',
      'customerInfo.email': 'required|email',
      'customerInfo.name': 'required|string|min:2',
      'customerInfo.phone': 'string'
    });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { items, customerInfo, returnUrl } = req.body;

    // Check inventory availability
    const availability = await checkInventory(items);
    if (!availability.available) {
      return res.status(409).json({
        error: 'insufficient_inventory',
        message: 'Some tickets are no longer available',
        unavailable: availability.unavailable
      });
    }

    // Calculate server-side total
    const lineItems = await calculateLineItems(items);
    const total = lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create reservation (15 minutes)
    const reservationId = nanoid();
    await reserveItems(items, reservationId, 15 * 60);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerInfo.email,
      client_reference_id: reservationId,
      line_items: lineItems.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.description,
            metadata: {
              item_id: item.id,
              item_type: item.type
            }
          },
          unit_amount: Math.round(item.price * 100), // Convert to cents
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: `${returnUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}/tickets?canceled=true`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      metadata: {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone || '',
        reservation_id: reservationId,
        order_type: 'ticket_purchase'
      },
      payment_intent_data: {
        description: 'A Lo Cubano Boulder Fest 2026 Tickets',
        metadata: {
          festival_year: '2026',
          purchase_date: new Date().toISOString()
        }
      }
    });

    // Create pending order in database
    const orderId = nanoid(10);
    await sql`
      INSERT INTO orders (
        id, order_number, customer_email, customer_name, customer_phone,
        status, total_amount, metadata, payment_session_id
      ) VALUES (
        ${orderId}, ${orderId}, ${customerInfo.email}, ${customerInfo.name}, 
        ${customerInfo.phone || null}, 'pending', ${total}, 
        ${JSON.stringify({ reservationId, sessionId: session.id })}, 
        ${session.id}
      )
    `;

    // Insert order items
    for (const item of lineItems) {
      await sql`
        INSERT INTO order_items (
          order_id, item_type, item_name, quantity, unit_price, subtotal
        ) VALUES (
          ${orderId}, ${item.type}, ${item.name}, ${item.quantity}, 
          ${item.price}, ${item.price * item.quantity}
        )
      `;
    }

    // Return session details
    res.status(200).json({
      sessionId: session.id,
      orderId: orderId,
      expiresAt: session.expires_at
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    
    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ 
        error: 'card_error',
        message: error.message 
      });
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Invalid payment request' 
      });
    }
    
    // Generic error
    res.status(500).json({ 
      error: 'payment_failed',
      message: 'Unable to process payment. Please try again.' 
    });
  }
}

async function calculateLineItems(items) {
  // Fetch current prices from database to prevent price manipulation
  const itemIds = items.map(item => item.id);
  const dbItems = await sql`
    SELECT id, name, price, description, type 
    FROM ticket_types 
    WHERE id = ANY(${itemIds})
  `;

  return items.map(item => {
    const dbItem = dbItems.rows.find(db => db.id === item.id);
    if (!dbItem) {
      throw new Error(`Invalid item: ${item.id}`);
    }
    
    return {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description,
      type: dbItem.type,
      price: dbItem.price,
      quantity: item.quantity
    };
  });
}
```

### Webhook Handler with Idempotency
```javascript
// /api/webhooks/stripe.js
import { buffer } from 'micro';
import Stripe from 'stripe';
import { sql } from '@vercel/postgres';
import { sendReceiptEmail } from '@/lib/email/sendgrid';
import { releaseReservation } from '@/lib/inventory';
import { trackConversion } from '@/lib/analytics';
import * as Sentry from '@sentry/node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

const relevantEvents = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only process relevant events
  if (!relevantEvents.has(event.type)) {
    return res.status(200).json({ received: true, ignored: true });
  }

  // Implement idempotency check
  const { rows: existingEvents } = await sql`
    SELECT id FROM payment_events 
    WHERE event_id = ${event.id}
  `;

  if (existingEvents.length > 0) {
    console.log(`Duplicate webhook event: ${event.id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    // Record event processing
    await sql`
      INSERT INTO payment_events (event_id, event_type, payload)
      VALUES (${event.id}, ${event.type}, ${JSON.stringify(event.data)})
    `;

    // Process event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;
    }

    res.status(200).json({ received: true, processed: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    Sentry.captureException(error, {
      tags: { webhook_event: event.type },
      extra: { event_id: event.id }
    });
    
    // Return 200 to acknowledge receipt (prevent retries for processing errors)
    res.status(200).json({ received: true, error: true });
  }
}

async function handleCheckoutCompleted(session) {
  const { metadata } = session;
  
  // Start transaction
  const client = await sql.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update order status
    const orderResult = await client.query(`
      UPDATE orders 
      SET 
        status = 'completed',
        payment_intent_id = $1,
        payment_method = 'stripe',
        updated_at = NOW()
      WHERE payment_session_id = $2
      RETURNING *
    `, [session.payment_intent, session.id]);
    
    if (orderResult.rows.length === 0) {
      throw new Error(`Order not found for session: ${session.id}`);
    }
    
    const order = orderResult.rows[0];
    
    // Get order items
    const itemsResult = await client.query(`
      SELECT * FROM order_items WHERE order_id = $1
    `, [order.id]);
    
    // Clear reservation
    if (metadata.reservation_id) {
      await releaseReservation(metadata.reservation_id);
    }
    
    await client.query('COMMIT');
    
    // Send receipt email (outside transaction)
    await sendReceiptEmail({
      orderNumber: order.order_number,
      customerEmail: order.customer_email,
      customerName: order.customer_name,
      total: order.total_amount,
      items: itemsResult.rows
    });
    
    // Track conversion
    await trackConversion({
      orderId: order.id,
      value: order.total_amount,
      items: itemsResult.rows
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function handleCheckoutExpired(session) {
  const { metadata } = session;
  
  // Release reservation
  if (metadata.reservation_id) {
    await releaseReservation(metadata.reservation_id);
  }
  
  // Update order status
  await sql`
    UPDATE orders 
    SET status = 'expired', updated_at = NOW()
    WHERE payment_session_id = ${session.id}
  `;
}

async function handleRefund(charge) {
  // Find order by payment intent
  const { rows } = await sql`
    SELECT * FROM orders 
    WHERE payment_intent_id = ${charge.payment_intent}
  `;
  
  if (rows.length === 0) {
    console.warn(`Order not found for payment intent: ${charge.payment_intent}`);
    return;
  }
  
  const order = rows[0];
  const refundAmount = charge.amount_refunded / 100; // Convert from cents
  
  // Update order status
  const newStatus = charge.amount === charge.amount_refunded 
    ? 'refunded' 
    : 'partially_refunded';
    
  await sql`
    UPDATE orders 
    SET 
      status = ${newStatus},
      metadata = jsonb_set(
        COALESCE(metadata, '{}'),
        '{refund}',
        ${JSON.stringify({ amount: refundAmount, date: new Date() })}
      ),
      updated_at = NOW()
    WHERE id = ${order.id}
  `;
  
  // Send refund notification
  await sendRefundEmail({
    orderNumber: order.order_number,
    customerEmail: order.customer_email,
    refundAmount,
    isPartial: newStatus === 'partially_refunded'
  });
}
```

## 3. Database and Inventory Management

### Inventory Manager with Distributed Locking
```javascript
// /lib/inventory/manager.js
import { Redis } from '@upstash/redis';
import { sql } from '@vercel/postgres';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export class InventoryManager {
  constructor() {
    this.lockTimeout = 5000; // 5 seconds
    this.reservationTimeout = 900; // 15 minutes
  }

  async checkAvailability(items) {
    const availability = { available: true, unavailable: [] };
    
    for (const item of items) {
      const available = await this.getAvailableQuantity(item.id);
      
      if (available < item.quantity) {
        availability.available = false;
        availability.unavailable.push({
          id: item.id,
          requested: item.quantity,
          available
        });
      }
    }
    
    return availability;
  }

  async getAvailableQuantity(itemId) {
    // Get total inventory from database
    const { rows } = await sql`
      SELECT total_quantity FROM ticket_types WHERE id = ${itemId}
    `;
    
    if (rows.length === 0) return 0;
    
    const totalQuantity = rows[0].total_quantity;
    
    // Get sold quantity
    const soldResult = await sql`
      SELECT COALESCE(SUM(oi.quantity), 0) as sold
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.item_type = ${itemId}
      AND o.status IN ('completed', 'processing')
    `;
    
    const sold = soldResult.rows[0].sold;
    
    // Get reserved quantity from Redis
    const reserved = await this.getReservedQuantity(itemId);
    
    return Math.max(0, totalQuantity - sold - reserved);
  }

  async getReservedQuantity(itemId) {
    const pattern = `reservation:*:${itemId}`;
    const keys = await redis.keys(pattern);
    
    let total = 0;
    for (const key of keys) {
      const quantity = await redis.get(key);
      if (quantity) total += parseInt(quantity);
    }
    
    return total;
  }

  async reserveItems(items, reservationId, duration = 900) {
    const lockKey = 'inventory:lock';
    const lockToken = await this.acquireLock(lockKey);
    
    if (!lockToken) {
      throw new Error('Unable to acquire inventory lock');
    }
    
    try {
      // Check availability again within lock
      const availability = await this.checkAvailability(items);
      if (!availability.available) {
        throw new Error('Insufficient inventory');
      }
      
      // Create reservations
      const pipeline = redis.pipeline();
      
      for (const item of items) {
        const key = `reservation:${reservationId}:${item.id}`;
        pipeline.setex(key, duration, item.quantity);
      }
      
      // Store reservation metadata
      pipeline.setex(
        `reservation:meta:${reservationId}`,
        duration,
        JSON.stringify({
          items,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + duration * 1000).toISOString()
        })
      );
      
      await pipeline.exec();
      
      return { success: true, reservationId, expiresIn: duration };
      
    } finally {
      await this.releaseLock(lockKey, lockToken);
    }
  }

  async releaseReservation(reservationId) {
    const metaKey = `reservation:meta:${reservationId}`;
    const metadata = await redis.get(metaKey);
    
    if (!metadata) return false;
    
    const { items } = JSON.parse(metadata);
    const pipeline = redis.pipeline();
    
    // Delete all reservation keys
    for (const item of items) {
      pipeline.del(`reservation:${reservationId}:${item.id}`);
    }
    pipeline.del(metaKey);
    
    await pipeline.exec();
    
    return true;
  }

  async acquireLock(key) {
    const token = Math.random().toString(36).substring(7);
    const result = await redis.set(key, token, {
      nx: true,
      px: this.lockTimeout
    });
    
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
    
    return await redis.eval(script, [key], [token]);
  }
}

// Export singleton instance
export const inventoryManager = new InventoryManager();
```

## 4. Email Service Implementation

### SendGrid Email Service
```javascript
// /lib/email/sendgrid-service.js
import sgMail from '@sendgrid/mail';
import { generateTicketPDF } from './pdf-generator';
import { renderTemplate } from './template-renderer';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export class EmailService {
  constructor() {
    this.fromEmail = {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: 'A Lo Cubano Boulder Fest'
    };
  }

  async sendOrderConfirmation(orderData) {
    const { orderNumber, customerEmail, customerName, items, total } = orderData;
    
    try {
      // Generate email content
      const html = await renderTemplate('order-confirmation', {
        customerName,
        orderNumber,
        items,
        total,
        eventDates: 'May 15-17, 2026',
        venue: 'Avalon Ballroom, Boulder'
      });
      
      // Generate ticket PDF
      const ticketPDF = await generateTicketPDF({
        orderNumber,
        customerName,
        items
      });
      
      // Prepare email
      const msg = {
        to: customerEmail,
        from: this.fromEmail,
        subject: `Order Confirmed - A Lo Cubano Boulder Fest #${orderNumber}`,
        html,
        attachments: [
          {
            content: ticketPDF.toString('base64'),
            filename: `tickets-${orderNumber}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          }
        ],
        mailSettings: {
          sandboxMode: {
            enable: process.env.NODE_ENV === 'development'
          }
        },
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: true },
          subscriptionTracking: { enable: false }
        }
      };
      
      // Send email
      const [response] = await sgMail.send(msg);
      
      // Log success
      await this.logEmailSent({
        orderId: orderNumber,
        type: 'order_confirmation',
        recipient: customerEmail,
        messageId: response.headers['x-message-id']
      });
      
      return { success: true, messageId: response.headers['x-message-id'] };
      
    } catch (error) {
      console.error('Email send error:', error);
      
      // Queue for retry
      await this.queueEmailRetry({
        type: 'order_confirmation',
        data: orderData,
        error: error.message,
        attempts: 1
      });
      
      throw new Error('Failed to send confirmation email');
    }
  }

  async sendPaymentFailedNotification(data) {
    const { customerEmail, customerName, reason, orderNumber } = data;
    
    const html = await renderTemplate('payment-failed', {
      customerName,
      orderNumber,
      reason,
      retryLink: `${process.env.VERCEL_URL}/tickets?retry=${orderNumber}`
    });
    
    await sgMail.send({
      to: customerEmail,
      from: this.fromEmail,
      subject: 'Payment Failed - A Lo Cubano Boulder Fest',
      html
    });
  }

  async sendReminderEmail(data) {
    const { customerEmail, customerName, eventDate, items } = data;
    
    const html = await renderTemplate('event-reminder', {
      customerName,
      eventDate,
      items,
      venueInfo: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80303',
        parking: 'Free parking available'
      }
    });
    
    await sgMail.send({
      to: customerEmail,
      from: this.fromEmail,
      subject: 'See You Soon at A Lo Cubano Boulder Fest!',
      html,
      sendAt: Math.floor(new Date(eventDate).getTime() / 1000) - (3 * 24 * 60 * 60) // 3 days before
    });
  }

  async logEmailSent(data) {
    await sql`
      INSERT INTO email_logs (
        order_id, email_type, recipient, message_id, sent_at
      ) VALUES (
        ${data.orderId}, ${data.type}, ${data.recipient}, 
        ${data.messageId}, NOW()
      )
    `;
  }

  async queueEmailRetry(data) {
    await sql`
      INSERT INTO email_queue (
        type, data, status, attempts, next_retry
      ) VALUES (
        ${data.type}, ${JSON.stringify(data.data)}, 'pending', 
        ${data.attempts}, NOW() + INTERVAL '5 minutes'
      )
    `;
  }
}

// Export singleton
export const emailService = new EmailService();
```

## 5. Analytics and Monitoring

### Analytics Service
```javascript
// /lib/analytics/service.js
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const analyticsDataClient = new BetaAnalyticsDataClient();

export class AnalyticsService {
  constructor() {
    this.propertyId = process.env.GA_PROPERTY_ID;
  }

  async trackPurchaseEvent(data) {
    const { orderId, value, currency, items, userId } = data;
    
    // Send to GA4 Measurement Protocol
    const payload = {
      client_id: userId || this.generateClientId(),
      user_id: userId,
      events: [{
        name: 'purchase',
        params: {
          transaction_id: orderId,
          value: value,
          currency: currency,
          items: items.map((item, index) => ({
            item_id: item.id,
            item_name: item.name,
            item_category: 'tickets',
            item_variant: item.type,
            price: item.price,
            quantity: item.quantity,
            index: index
          }))
        }
      }]
    };
    
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${process.env.GA_MEASUREMENT_ID}&api_secret=${process.env.GA_API_SECRET}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  async getConversionMetrics(startDate, endDate) {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'eventValue' }
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: {
            matchType: 'EXACT',
            value: 'purchase'
          }
        }
      }
    });
    
    return this.formatAnalyticsResponse(response);
  }

  async getRealtimeActiveUsers() {
    const [response] = await analyticsDataClient.runRealtimeReport({
      property: `properties/${this.propertyId}`,
      dimensions: [{ name: 'unifiedScreenName' }],
      metrics: [{ name: 'activeUsers' }]
    });
    
    return response.rows?.reduce((total, row) => {
      return total + parseInt(row.metricValues[0].value);
    }, 0) || 0;
  }

  formatAnalyticsResponse(response) {
    return {
      rows: response.rows?.map(row => ({
        dimensions: row.dimensionValues.map(d => d.value),
        metrics: row.metricValues.map(m => m.value)
      })) || [],
      totals: response.totals
    };
  }

  generateClientId() {
    return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
  }
}
```

### Performance Monitoring
```javascript
// /lib/monitoring/performance.js
import { performance } from 'perf_hooks';

export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  startTimer(label) {
    this.metrics.set(label, performance.now());
  }

  endTimer(label) {
    const start = this.metrics.get(label);
    if (!start) return null;
    
    const duration = performance.now() - start;
    this.metrics.delete(label);
    
    // Send to monitoring service
    this.recordMetric(label, duration);
    
    return duration;
  }

  async recordMetric(name, value, unit = 'ms') {
    // Send to Vercel Analytics
    if (typeof window !== 'undefined' && window.vercel) {
      window.vercel.analytics.track(name, { value, unit });
    }
    
    // Also send to custom endpoint for aggregation
    await fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        value,
        unit,
        timestamp: new Date().toISOString()
      })
    }).catch(console.error);
  }

  async recordPaymentMetrics(data) {
    const metrics = [
      { name: 'payment.success_rate', value: data.successRate, unit: 'percentage' },
      { name: 'payment.processing_time', value: data.processingTime, unit: 'ms' },
      { name: 'payment.amount', value: data.amount, unit: 'usd' }
    ];
    
    await Promise.all(
      metrics.map(m => this.recordMetric(m.name, m.value, m.unit))
    );
  }
}

export const performanceMonitor = new PerformanceMonitor();
```

## 6. Testing Suite

### Integration Tests
```javascript
// /tests/integration/payment-flow.test.js
import { createMocks } from 'node-mocks-http';
import { stripe } from '@/lib/stripe';
import createCheckoutSession from '@/api/payment/create-checkout-session';
import stripeWebhook from '@/api/webhooks/stripe';

// Mock Stripe
jest.mock('@/lib/stripe');

describe('Payment Flow Integration', () => {
  let mockCheckoutSession;
  
  beforeEach(() => {
    mockCheckoutSession = {
      id: 'cs_test_123',
      payment_intent: 'pi_test_123',
      customer_email: 'test@example.com',
      expires_at: Date.now() + 1800000,
      metadata: {
        reservation_id: 'res_123',
        customer_name: 'Test User'
      }
    };
  });

  test('complete payment flow from checkout to confirmation', async () => {
    // Step 1: Create checkout session
    stripe.checkout.sessions.create.mockResolvedValue(mockCheckoutSession);
    
    const { req: checkoutReq, res: checkoutRes } = createMocks({
      method: 'POST',
      body: {
        items: [{ id: 'full-pass', quantity: 2 }],
        customerInfo: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }
    });
    
    await createCheckoutSession(checkoutReq, checkoutRes);
    
    expect(checkoutRes._getStatusCode()).toBe(200);
    const { sessionId, orderId } = JSON.parse(checkoutRes._getData());
    expect(sessionId).toBe('cs_test_123');
    expect(orderId).toBeDefined();
    
    // Step 2: Process webhook
    const webhookEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: mockCheckoutSession
      }
    };
    
    stripe.webhooks.constructEvent.mockReturnValue(webhookEvent);
    
    const { req: webhookReq, res: webhookRes } = createMocks({
      method: 'POST',
      headers: {
        'stripe-signature': 'test_signature'
      }
    });
    
    await stripeWebhook(webhookReq, webhookRes);
    
    expect(webhookRes._getStatusCode()).toBe(200);
    expect(JSON.parse(webhookRes._getData())).toMatchObject({
      received: true,
      processed: true
    });
  });
});
```

This comprehensive implementation provides production-ready code examples for all major components of the payment integration system.