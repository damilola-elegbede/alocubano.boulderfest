/**
 * Database Module Index
 * Central export point for all database utilities
 * Optimized for Vercel serverless environment
 */

// Core database utilities
export { 
  getPool, 
  closePool, 
  getDatabaseConfig, 
  testConnection 
} from './config.js';

export {
  default as dbClient,
  query,
  queryOne,
  queryMany,
  transaction,
  isHealthy,
  getStats,
  DatabaseError,
  ConnectionError,
  QueryError
} from './client.js';

// Model exports
export {
  OrdersModel,
  ORDER_STATUS,
  createOrder,
  getOrder,
  getOrderByNumber,
  updateOrderStatus,
  getCustomerOrders,
  searchOrders,
  getOrderStats,
  deleteOrder
} from './models/orders.js';

export {
  OrderItemsModel,
  TICKET_TYPES,
  createOrderItems,
  getOrderItems,
  getOrderItem,
  updateAttendeeInfo,
  getTicketStatistics,
  getAttendeeList,
  searchOrderItems,
  bulkUpdateAttendeeInfo,
  getRevenueBreakdown,
  deleteOrderItem
} from './models/order-items.js';

export {
  PaymentsModel,
  WebhookEventsModel,
  PAYMENT_STATUS,
  PAYMENT_PROVIDER,
  REFUND_STATUS,
  createPayment,
  getPayment,
  getPaymentByProviderPaymentId,
  getPaymentsByOrder,
  updatePaymentStatus,
  searchPayments,
  getPaymentStats,
  createRefund,
  updateRefundStatus,
  getRefundsByPayment,
  recordWebhookEvent,
  getExistingWebhookEvent,
  getRecentWebhookEvents
} from './models/payments.js';

// Query helper exports
export {
  OrderQueries,
  PaymentQueries,
  AnalyticsQueries,
  PerformanceQueries,
  HealthQueries,
  getOrderSummary,
  getDailyOrderStats,
  getTopCustomers,
  getPaymentProcessingStats,
  getRevenueAnalytics,
  getDatabaseHealth
} from './queries.js';

// Migration runner (for build/deployment scripts)
export { default as MigrationRunner } from '../scripts/run-migrations.js';

/**
 * Initialize database connection
 * Call this once at application startup
 */
export async function initializeDatabase() {
  try {
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
      throw new Error(`Database connection failed: ${connectionTest.error}`);
    }
    
    console.log('✅ Database connection established successfully');
    return connectionTest;
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Health check function for API endpoints
 */
export async function healthCheck() {
  try {
    const health = await getDatabaseHealth();
    return {
      status: health.status,
      database: health.checks,
      timestamp: health.timestamp
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Convenience function for common database operations
 */
export const db = {
  // Connection management
  init: initializeDatabase,
  health: healthCheck,
  
  // Orders
  orders: {
    create: createOrder,
    get: getOrder,
    getByNumber: getOrderByNumber,
    updateStatus: updateOrderStatus,
    getByCustomer: getCustomerOrders,
    search: searchOrders,
    stats: getOrderStats,
    delete: deleteOrder,
    summary: getOrderSummary,
  },
  
  // Order Items
  items: {
    create: createOrderItems,
    get: getOrderItems,
    getById: getOrderItem,
    updateAttendee: updateAttendeeInfo,
    bulkUpdateAttendee: bulkUpdateAttendeeInfo,
    search: searchOrderItems,
    stats: getTicketStatistics,
    attendees: getAttendeeList,
    revenue: getRevenueBreakdown,
    delete: deleteOrderItem,
  },
  
  // Payments
  payments: {
    create: createPayment,
    get: getPayment,
    getByProvider: getPaymentByProviderPaymentId,
    getByOrder: getPaymentsByOrder,
    updateStatus: updatePaymentStatus,
    search: searchPayments,
    stats: getPaymentStats,
  },
  
  // Refunds
  refunds: {
    create: createRefund,
    updateStatus: updateRefundStatus,
    getByPayment: getRefundsByPayment,
  },
  
  // Webhooks
  webhooks: {
    record: recordWebhookEvent,
    getExisting: getExistingWebhookEvent,
    getRecent: getRecentWebhookEvents,
  },
  
  // Analytics
  analytics: {
    revenue: getRevenueAnalytics,
    dailyStats: getDailyOrderStats,
    topCustomers: getTopCustomers,
    paymentStats: getPaymentProcessingStats,
  },
  
  // Raw queries
  query,
  queryOne,
  queryMany,
  transaction,
};

// Default export
export default db;