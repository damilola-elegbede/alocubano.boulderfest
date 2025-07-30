/**
 * Business Intelligence and Analytics System
 * Real-time payment dashboard and business metrics tracking
 */

import EventEmitter from 'events';

/**
 * Business Intelligence Data Collector
 */
export class BusinessIntelligence extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      revenue: new Map(),
      orders: new Map(),
      customers: new Map(),
      conversion: new Map(),
      inventory: new Map()
    };
    this.realTimeData = {
      totalRevenue: 0,
      orderCount: 0,
      activeUsers: 0,
      conversionRate: 0,
      averageOrderValue: 0
    };
  }

  /**
   * Track revenue metrics
   */
  trackRevenue(orderData) {
    const timestamp = Date.now();
    const dateKey = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const hourKey = new Date(timestamp).toISOString().substring(0, 13); // YYYY-MM-DDTHH

    // Daily revenue
    if (!this.metrics.revenue.has(dateKey)) {
      this.metrics.revenue.set(dateKey, {
        date: dateKey,
        totalRevenue: 0,
        orderCount: 0,
        uniqueCustomers: new Set(),
        paymentMethods: new Map(),
        ticketTypes: new Map(),
        refunds: 0
      });
    }

    const dailyMetrics = this.metrics.revenue.get(dateKey);
    dailyMetrics.totalRevenue += orderData.amount;
    dailyMetrics.orderCount += 1;
    dailyMetrics.uniqueCustomers.add(orderData.customerEmail);

    // Payment method breakdown
    const paymentMethod = orderData.paymentMethod || 'unknown';
    dailyMetrics.paymentMethods.set(
      paymentMethod, 
      (dailyMetrics.paymentMethods.get(paymentMethod) || 0) + orderData.amount
    );

    // Ticket type breakdown
    orderData.items?.forEach(item => {
      const ticketType = item.type || 'unknown';
      const currentValue = dailyMetrics.ticketTypes.get(ticketType) || { count: 0, revenue: 0 };
      dailyMetrics.ticketTypes.set(ticketType, {
        count: currentValue.count + (item.quantity || 1),
        revenue: currentValue.revenue + (item.price * (item.quantity || 1))
      });
    });

    // Hourly tracking for real-time dashboard
    if (!this.metrics.revenue.has(hourKey)) {
      this.metrics.revenue.set(hourKey, {
        hour: hourKey,
        revenue: 0,
        orders: 0
      });
    }

    const hourlyMetrics = this.metrics.revenue.get(hourKey);
    hourlyMetrics.revenue += orderData.amount;
    hourlyMetrics.orders += 1;

    // Update real-time totals
    this.realTimeData.totalRevenue += orderData.amount;
    this.realTimeData.orderCount += 1;
    this.calculateAverageOrderValue();

    this.emit('revenue_update', {
      type: 'order_completed',
      amount: orderData.amount,
      orderData,
      dailyTotal: dailyMetrics.totalRevenue,
      hourlyTotal: hourlyMetrics.revenue
    });
  }

  /**
   * Track conversion funnel metrics
   */
  trackConversionStep(step, sessionId, data = {}) {
    const timestamp = Date.now();
    const dateKey = new Date(timestamp).toISOString().split('T')[0];

    if (!this.metrics.conversion.has(dateKey)) {
      this.metrics.conversion.set(dateKey, {
        date: dateKey,
        sessions: new Map(),
        stepCounts: new Map(),
        conversionRates: new Map()
      });
    }

    const dailyConversion = this.metrics.conversion.get(dateKey);

    // Track session progress
    if (!dailyConversion.sessions.has(sessionId)) {
      dailyConversion.sessions.set(sessionId, {
        steps: [],
        startTime: timestamp,
        completed: false
      });
    }

    const session = dailyConversion.sessions.get(sessionId);
    session.steps.push({
      step,
      timestamp,
      data
    });

    if (step === 'purchase_completed') {
      session.completed = true;
      session.completionTime = timestamp;
      session.duration = timestamp - session.startTime;
    }

    // Update step counts
    dailyConversion.stepCounts.set(
      step,
      (dailyConversion.stepCounts.get(step) || 0) + 1
    );

    // Calculate conversion rates
    this.calculateConversionRates(dailyConversion);

    this.emit('conversion_update', {
      step,
      sessionId,
      data,
      dailyStats: this.getConversionStats(dateKey)
    });
  }

  /**
   * Track customer behavior and segmentation
   */
  trackCustomerBehavior(customerEmail, action, data = {}) {
    if (!this.metrics.customers.has(customerEmail)) {
      this.metrics.customers.set(customerEmail, {
        email: customerEmail,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        actions: [],
        totalSpent: 0,
        orderCount: 0,
        averageOrderValue: 0,
        ticketTypes: new Set(),
        paymentMethods: new Set(),
        segment: 'new'
      });
    }

    const customer = this.metrics.customers.get(customerEmail);
    customer.lastSeen = Date.now();
    customer.actions.push({
      action,
      timestamp: Date.now(),
      data
    });

    // Update customer segment
    this.updateCustomerSegment(customer);

    this.emit('customer_update', {
      customerEmail,
      action,
      data,
      customerProfile: customer
    });
  }

  /**
   * Track inventory levels and alerts
   */
  trackInventoryLevel(itemId, currentLevel, reservedLevel = 0) {
    const timestamp = Date.now();
    
    if (!this.metrics.inventory.has(itemId)) {
      this.metrics.inventory.set(itemId, {
        itemId,
        history: [],
        alerts: []
      });
    }

    const inventory = this.metrics.inventory.get(itemId);
    const availableLevel = currentLevel - reservedLevel;
    
    inventory.history.push({
      timestamp,
      total: currentLevel,
      reserved: reservedLevel,
      available: availableLevel
    });

    // Keep only last 1000 entries
    if (inventory.history.length > 1000) {
      inventory.history.shift();
    }

    // Check for low inventory alerts
    const lowStockThreshold = this.getLowStockThreshold(itemId);
    if (availableLevel <= lowStockThreshold) {
      const lastAlert = inventory.alerts[inventory.alerts.length - 1];
      const alertCooldown = 600000; // 10 minutes

      if (!lastAlert || timestamp - lastAlert.timestamp > alertCooldown) {
        const alert = {
          type: 'low_stock',
          timestamp,
          level: availableLevel,
          threshold: lowStockThreshold
        };

        inventory.alerts.push(alert);
        
        this.emit('inventory_alert', {
          itemId,
          alert,
          currentLevel: availableLevel
        });
      }
    }
  }

  /**
   * Generate real-time dashboard data
   */
  generateDashboardData() {
    const now = Date.now();
    const today = new Date(now).toISOString().split('T')[0];
    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];

    const todayRevenue = this.metrics.revenue.get(today);
    const yesterdayRevenue = this.metrics.revenue.get(yesterday);

    return {
      timestamp: now,
      revenue: {
        today: todayRevenue?.totalRevenue || 0,
        yesterday: yesterdayRevenue?.totalRevenue || 0,
        growth: this.calculateGrowthRate(
          todayRevenue?.totalRevenue || 0,
          yesterdayRevenue?.totalRevenue || 0
        ),
        hourly: this.getHourlyRevenue(today)
      },
      orders: {
        today: todayRevenue?.orderCount || 0,
        yesterday: yesterdayRevenue?.orderCount || 0,
        growth: this.calculateGrowthRate(
          todayRevenue?.orderCount || 0,
          yesterdayRevenue?.orderCount || 0
        )
      },
      customers: {
        new: this.getNewCustomersToday(),
        returning: this.getReturningCustomersToday(),
        total: this.metrics.customers.size
      },
      conversion: {
        rate: this.realTimeData.conversionRate,
        funnel: this.getConversionFunnel(today)
      },
      inventory: {
        lowStock: this.getLowStockItems(),
        alerts: this.getRecentInventoryAlerts()
      },
      performance: {
        averageOrderValue: this.realTimeData.averageOrderValue,
        topSellingItems: this.getTopSellingItems(today),
        paymentMethodBreakdown: this.getPaymentMethodBreakdown(today)
      }
    };
  }

  /**
   * Generate business reports
   */
  generateReport(type, dateRange) {
    switch (type) {
      case 'daily':
        return this.generateDailyReport(dateRange);
      case 'weekly':
        return this.generateWeeklyReport(dateRange);
      case 'monthly':
        return this.generateMonthlyReport(dateRange);
      case 'customer_segment':
        return this.generateCustomerSegmentReport();
      case 'product_performance':
        return this.generateProductPerformanceReport(dateRange);
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  /**
   * Calculate key performance indicators
   */
  calculateKPIs(dateRange) {
    const { startDate, endDate } = dateRange;
    const revenue = this.getRevenueInRange(startDate, endDate);
    const orders = this.getOrdersInRange(startDate, endDate);
    const customers = this.getCustomersInRange(startDate, endDate);

    return {
      totalRevenue: revenue.total,
      totalOrders: orders.count,
      averageOrderValue: revenue.total / orders.count || 0,
      customerAcquisitionCost: this.calculateCAC(customers),
      customerLifetimeValue: this.calculateCLV(customers),
      conversionRate: this.getConversionRate(startDate, endDate),
      refundRate: this.getRefundRate(startDate, endDate),
      revenuePerCustomer: revenue.total / customers.unique || 0
    };
  }

  // Helper methods
  calculateAverageOrderValue() {
    this.realTimeData.averageOrderValue = 
      this.realTimeData.orderCount > 0 
        ? this.realTimeData.totalRevenue / this.realTimeData.orderCount 
        : 0;
  }

  calculateConversionRates(dailyConversion) {
    const steps = ['view_tickets', 'add_to_cart', 'begin_checkout', 'purchase_completed'];
    
    for (let i = 1; i < steps.length; i++) {
      const currentStep = steps[i];
      const previousStep = steps[i - 1];
      
      const currentCount = dailyConversion.stepCounts.get(currentStep) || 0;
      const previousCount = dailyConversion.stepCounts.get(previousStep) || 0;
      
      const rate = previousCount > 0 ? (currentCount / previousCount) * 100 : 0;
      dailyConversion.conversionRates.set(currentStep, rate);
    }

    // Overall conversion rate
    const totalSessions = dailyConversion.stepCounts.get('view_tickets') || 0;
    const completedPurchases = dailyConversion.stepCounts.get('purchase_completed') || 0;
    
    this.realTimeData.conversionRate = 
      totalSessions > 0 ? (completedPurchases / totalSessions) * 100 : 0;
  }

  updateCustomerSegment(customer) {
    const daysSinceFirst = (Date.now() - customer.firstSeen) / (1000 * 60 * 60 * 24);
    
    if (customer.orderCount === 0) {
      customer.segment = 'prospect';
    } else if (customer.orderCount === 1 && daysSinceFirst < 30) {
      customer.segment = 'new';
    } else if (customer.orderCount > 1 && customer.totalSpent > 200) {
      customer.segment = 'vip';
    } else if (customer.orderCount > 1) {
      customer.segment = 'returning';
    } else if (daysSinceFirst > 365) {
      customer.segment = 'dormant';
    } else {
      customer.segment = 'regular';
    }
  }

  calculateGrowthRate(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  getLowStockThreshold(itemId) {
    // This could be configurable per item type
    const thresholds = {
      'full_weekend_pass': 50,
      'saturday_only': 25,
      'sunday_only': 25,
      'workshop_addon': 10
    };
    return thresholds[itemId] || 20;
  }

  // Additional helper methods would go here...
  getHourlyRevenue(date) {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const hourKey = `${date}T${i.toString().padStart(2, '0')}`;
      const hourData = this.metrics.revenue.get(hourKey);
      hours.push({
        hour: i,
        revenue: hourData?.revenue || 0,
        orders: hourData?.orders || 0
      });
    }
    return hours;
  }

  getNewCustomersToday() {
    const today = Date.now();
    const startOfDay = new Date(today).setHours(0, 0, 0, 0);
    
    let newCustomers = 0;
    for (const customer of this.metrics.customers.values()) {
      if (customer.firstSeen >= startOfDay) {
        newCustomers++;
      }
    }
    return newCustomers;
  }

  getReturningCustomersToday() {
    const today = Date.now();
    const startOfDay = new Date(today).setHours(0, 0, 0, 0);
    
    let returningCustomers = 0;
    for (const customer of this.metrics.customers.values()) {
      if (customer.lastSeen >= startOfDay && customer.firstSeen < startOfDay) {
        returningCustomers++;
      }
    }
    return returningCustomers;
  }

  getLowStockItems() {
    const lowStockItems = [];
    for (const [itemId, inventory] of this.metrics.inventory.entries()) {
      const latest = inventory.history[inventory.history.length - 1];
      if (latest && latest.available <= this.getLowStockThreshold(itemId)) {
        lowStockItems.push({
          itemId,
          available: latest.available,
          threshold: this.getLowStockThreshold(itemId)
        });
      }
    }
    return lowStockItems;
  }

  getRecentInventoryAlerts() {
    const alerts = [];
    const oneDayAgo = Date.now() - 86400000;
    
    for (const inventory of this.metrics.inventory.values()) {
      const recentAlerts = inventory.alerts.filter(alert => alert.timestamp > oneDayAgo);
      alerts.push(...recentAlerts.map(alert => ({
        itemId: inventory.itemId,
        ...alert
      })));
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }
}

// Global business intelligence instance
export const businessIntelligence = new BusinessIntelligence();

/**
 * Business Intelligence API endpoints
 */
export class BIApiEndpoints {
  constructor(bi = businessIntelligence) {
    this.bi = bi;
  }

  /**
   * Real-time dashboard endpoint
   */
  getDashboard() {
    return this.bi.generateDashboardData();
  }

  /**
   * Revenue analytics endpoint
   */
  getRevenueAnalytics(dateRange) {
    return {
      summary: this.bi.calculateKPIs(dateRange),
      daily: this.bi.generateReport('daily', dateRange),
      trends: this.getRevenueTrends(dateRange)
    };
  }

  /**
   * Customer analytics endpoint
   */
  getCustomerAnalytics() {
    return {
      segments: this.bi.generateCustomerSegmentReport(),
      behavior: this.getCustomerBehaviorAnalytics(),
      retention: this.getCustomerRetentionMetrics()
    };
  }

  /**
   * Conversion analytics endpoint
   */
  getConversionAnalytics(dateRange) {
    return {
      funnel: this.bi.getConversionFunnel(dateRange.startDate),
      rates: this.getConversionRateAnalytics(dateRange),
      optimization: this.getConversionOptimizationSuggestions()
    };
  }

  /**
   * Inventory analytics endpoint
   */
  getInventoryAnalytics() {
    return {
      levels: this.getCurrentInventoryLevels(),
      alerts: this.bi.getRecentInventoryAlerts(),
      forecasting: this.getInventoryForecast()
    };
  }

  // Helper methods for API endpoints...
  getRevenueTrends(dateRange) {
    // Implementation for revenue trend analysis
    return {};
  }

  getCustomerBehaviorAnalytics() {
    // Implementation for customer behavior analysis
    return {};
  }

  getCustomerRetentionMetrics() {
    // Implementation for retention metrics
    return {};
  }

  getConversionRateAnalytics(dateRange) {
    // Implementation for conversion rate analysis
    return {};
  }

  getConversionOptimizationSuggestions() {
    // Implementation for optimization suggestions
    return {};
  }

  getCurrentInventoryLevels() {
    // Implementation for current inventory levels
    return {};
  }

  getInventoryForecast() {
    // Implementation for inventory forecasting
    return {};
  }
}

export default {
  BusinessIntelligence,
  businessIntelligence,
  BIApiEndpoints
};