/**
 * Database Usage Examples
 * Demonstrates how to use the payment system database
 * 
 * Usage:
 * node examples/database-usage.js
 */

import { config } from 'dotenv';
import db from '../lib/db/index.js';

// Load environment variables
config();

/**
 * Example 1: Create a complete order with customer and items
 */
async function createCompleteOrder() {
  console.log('\n=== Creating Complete Order ===');
  
  try {
    const customerData = {
      email: 'example@test.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1-555-0123'
    };

    const orderData = {
      eventId: 'alocubano-2026',
      eventName: 'A Lo Cubano Boulder Fest 2026',
      eventDate: '2026-05-15',
      currency: 'USD',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Example)',
    };

    const items = [
      {
        ticketType: 'full_festival',
        quantity: 2,
        unitPriceCents: 15000, // $150.00
        totalPriceCents: 30000, // $300.00
        attendeeFirstName: 'John',
        attendeeLastName: 'Doe',
        attendeeEmail: 'john@test.com'
      },
      {
        ticketType: 'workshop_only',
        quantity: 1,
        unitPriceCents: 5000, // $50.00
        totalPriceCents: 5000, // $50.00
        attendeeFirstName: 'Jane',
        attendeeLastName: 'Doe',
        attendeeEmail: 'jane@test.com'
      }
    ];

    const order = await db.orders.create(orderData, customerData, items);
    console.log('✅ Order created:', {
      id: order.id,
      orderNumber: order.order_number,
      total: `$${order.total_cents / 100}`,
      itemCount: order.items.length
    });

    return order;

  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    throw error;
  }
}

/**
 * Example 2: Process a payment
 */
async function processPayment(orderId) {
  console.log('\n=== Processing Payment ===');
  
  try {
    const paymentData = {
      orderId: orderId,
      provider: 'stripe',
      providerPaymentId: 'pi_test_' + Math.random().toString(36).substring(7),
      amountCents: 35000, // Total with taxes and fees
      currency: 'USD',
      status: 'completed',
      providerData: {
        stripeChargeId: 'ch_test_' + Math.random().toString(36).substring(7),
        last4: '4242',
        brand: 'visa'
      }
    };

    const payment = await db.payments.create(paymentData);
    console.log('✅ Payment created:', {
      id: payment.id,
      provider: payment.provider,
      amount: `$${payment.amount_cents / 100}`,
      status: payment.status
    });

    // Update order status to completed
    await db.orders.updateStatus(orderId, 'completed', {
      paymentId: payment.id,
      completedAt: new Date()
    });

    console.log('✅ Order status updated to completed');
    return payment;

  } catch (error) {
    console.error('❌ Error processing payment:', error.message);
    throw error;
  }
}

/**
 * Example 3: Record webhook event (for idempotency)
 */
async function recordWebhookEvent(paymentId) {
  console.log('\n=== Recording Webhook Event ===');
  
  try {
    const webhookData = {
      provider: 'stripe',
      providerEventId: 'evt_test_' + Math.random().toString(36).substring(7),
      eventType: 'payment_intent.succeeded',
      payload: {
        id: paymentId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: 35000,
        currency: 'usd'
      }
    };

    const event = await db.webhooks.record(webhookData);
    console.log('✅ Webhook event recorded:', {
      id: event.id,
      eventType: event.event_type,
      provider: event.provider
    });

    // Try to record the same event again (should handle idempotency)
    const duplicateEvent = await db.webhooks.record(webhookData);
    console.log('✅ Duplicate event handled gracefully:', {
      id: duplicateEvent.id,
      sameId: event.id === duplicateEvent.id
    });

    return event;

  } catch (error) {
    console.error('❌ Error recording webhook:', error.message);
    throw error;
  }
}

/**
 * Example 4: Query order analytics
 */
async function queryAnalytics() {
  console.log('\n=== Querying Analytics ===');
  
  try {
    // Get revenue analytics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const revenue = await db.analytics.revenue(
      thirtyDaysAgo.toISOString(),
      new Date().toISOString(),
      'day'
    );

    console.log('✅ Revenue analytics:', {
      periods: revenue.length,
      totalRevenue: revenue.reduce((sum, period) => sum + parseInt(period.gross_revenue_cents || 0), 0) / 100
    });

    // Get order statistics
    const orderStats = await db.orders.stats({
      dateFrom: thirtyDaysAgo.toISOString()
    });

    console.log('✅ Order statistics:', {
      totalOrders: orderStats.totalOrders,
      completedOrders: orderStats.completedOrders,
      conversionRate: `${orderStats.conversionRate.toFixed(2)}%`,
      avgOrderValue: `$${orderStats.averageOrderValueCents / 100}`
    });

    // Get ticket statistics
    const ticketStats = await db.items.stats({
      dateFrom: thirtyDaysAgo.toISOString()
    });

    console.log('✅ Ticket statistics:', ticketStats.map(stat => ({
      ticketType: stat.ticketType,
      sold: stat.soldQuantity,
      revenue: `$${stat.revenueCents / 100}`
    })));

  } catch (error) {
    console.error('❌ Error querying analytics:', error.message);
    throw error;
  }
}

/**
 * Example 5: Search and retrieve orders
 */
async function searchOrders() {
  console.log('\n=== Searching Orders ===');
  
  try {
    // Search by customer email
    const customerOrders = await db.orders.getByCustomer('example@test.com', {
      limit: 10,
      status: 'completed'
    });

    console.log('✅ Customer orders found:', customerOrders.length);

    // Full-text search
    const searchResults = await db.orders.search({
      customerEmail: 'example'
    }, {
      limit: 5,
      sortBy: 'created_at',
      sortOrder: 'DESC'
    });

    console.log('✅ Search results:', {
      total: searchResults.pagination.total,
      returned: searchResults.orders.length
    });

    // Get order summary
    if (searchResults.orders.length > 0) {
      const orderSummary = await db.orders.summary(searchResults.orders[0].id);
      console.log('✅ Order summary:', {
        orderNumber: orderSummary.order_number,
        totalTickets: orderSummary.total_tickets,
        itemCount: orderSummary.item_count,
        paymentCount: orderSummary.payment_count
      });
    }

  } catch (error) {
    console.error('❌ Error searching orders:', error.message);
    throw error;
  }
}

/**
 * Example 6: Handle refunds
 */
async function processRefund(paymentId, amountCents) {
  console.log('\n=== Processing Refund ===');
  
  try {
    const refundData = {
      paymentId: paymentId,
      provider: 'stripe',
      providerRefundId: 're_test_' + Math.random().toString(36).substring(7),
      amountCents: amountCents,
      currency: 'USD',
      status: 'processed',
      reason: 'Customer requested refund',
      metadata: {
        refundType: 'full',
        processedBy: 'admin'
      }
    };

    const refund = await db.refunds.create(refundData);
    console.log('✅ Refund processed:', {
      id: refund.id,
      amount: `$${refund.amount_cents / 100}`,
      status: refund.status
    });

    return refund;

  } catch (error) {
    console.error('❌ Error processing refund:', error.message);
    throw error;
  }
}

/**
 * Example 7: Database health check
 */
async function checkDatabaseHealth() {
  console.log('\n=== Database Health Check ===');
  
  try {
    const health = await db.health();
    console.log('✅ Database health:', {
      status: health.status,
      connectivity: health.database.connectivity,
      recentOrders: health.database.recentOrders
    });

    // Get database statistics
    const stats = await db.getStats();
    if (stats) {
      console.log('✅ Database statistics:', {
        poolConnections: stats.pool.totalCount,
        idleConnections: stats.pool.idleCount,
        waitingConnections: stats.pool.waitingCount
      });
    }

  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Database Usage Examples Starting...');
  
  try {
    // Initialize database connection
    await db.init();
    
    // Run health check first
    await checkDatabaseHealth();
    
    // Create a complete order flow
    const order = await createCompleteOrder();
    const payment = await processPayment(order.id);
    await recordWebhookEvent(payment.id);
    
    // Query and analytics examples
    await queryAnalytics();
    await searchOrders();
    
    // Process a partial refund
    await processRefund(payment.id, 5000); // $50 refund
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Example execution failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up connections
    process.exit(0);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  createCompleteOrder,
  processPayment,
  recordWebhookEvent,
  queryAnalytics,
  searchOrders,
  processRefund,
  checkDatabaseHealth
};