/**
 * Real-time Monitoring Dashboard
 * Comprehensive system health and KPI visualization
 */

import { performanceMonitor, PerformanceDashboard } from './performance-monitor.js';
import { businessIntelligence, BIApiEndpoints } from './business-intelligence.js';
import { alertingSystem } from './alerting-system.js';

/**
 * Main Dashboard Controller
 */
export class MonitoringDashboard {
  constructor() {
    this.performanceDashboard = new PerformanceDashboard();
    this.biEndpoints = new BIApiEndpoints();
    this.updateInterval = 30000; // 30 seconds
    this.realTimeInterval = null;
    this.dashboardData = {
      lastUpdate: null,
      system: {},
      business: {},
      alerts: {},
      performance: {}
    };
  }

  /**
   * Start real-time dashboard updates
   */
  startRealTimeUpdates() {
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
    }

    this.updateDashboard();
    
    this.realTimeInterval = setInterval(() => {
      this.updateDashboard();
    }, this.updateInterval);

    console.log('Real-time dashboard updates started');
  }

  /**
   * Stop real-time dashboard updates
   */
  stopRealTimeUpdates() {
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
      this.realTimeInterval = null;
    }

    console.log('Real-time dashboard updates stopped');
  }

  /**
   * Update dashboard data
   */
  async updateDashboard() {
    try {
      const timestamp = Date.now();
      
      // Gather data from all monitoring systems
      const [systemHealth, businessMetrics, alertStatus, performanceData] = await Promise.all([
        this.getSystemHealth(),
        this.getBusinessMetrics(),
        this.getAlertStatus(),
        this.getPerformanceData()
      ]);

      this.dashboardData = {
        lastUpdate: timestamp,
        system: systemHealth,
        business: businessMetrics,
        alerts: alertStatus,
        performance: performanceData
      };

      // Emit update event for real-time clients
      this.emit('dashboard_update', this.dashboardData);
      
    } catch (error) {
      console.error('Failed to update dashboard:', error);
    }
  }

  /**
   * Get complete dashboard data
   */
  getDashboardData() {
    return this.dashboardData;
  }

  /**
   * Get system health metrics
   */
  async getSystemHealth() {
    const now = Date.now();
    const performanceStats = performanceMonitor.getAllStats(300000); // Last 5 minutes
    
    // Calculate overall system health score
    let healthScore = 100;
    let healthyServices = 0;
    let totalServices = 0;
    
    const serviceStatus = {};

    for (const [operation, stats] of Object.entries(performanceStats)) {
      if (!stats) continue;
      
      totalServices++;
      const violationRate = stats.violationCount / stats.count;
      
      if (violationRate < 0.05) { // Less than 5% violations
        healthyServices++;
        serviceStatus[operation] = 'healthy';
      } else if (violationRate < 0.15) { // Less than 15% violations
        serviceStatus[operation] = 'degraded';
        healthScore -= 10;
      } else {
        serviceStatus[operation] = 'unhealthy';
        healthScore -= 25;
      }
    }

    healthScore = Math.max(0, healthScore);

    return {
      timestamp: now,
      overallHealth: healthScore,
      status: this.getHealthStatus(healthScore),
      services: serviceStatus,
      uptime: this.calculateUptime(),
      activeAlerts: this.getActiveAlertCount(),
      systemLoad: await this.getSystemLoad(),
      memoryUsage: await this.getMemoryUsage(),
      networkStatus: await this.getNetworkStatus()
    };
  }

  /**
   * Get business metrics for dashboard
   */
  async getBusinessMetrics() {
    const businessData = businessIntelligence.generateDashboardData();
    
    return {
      revenue: {
        today: businessData.revenue.today,
        yesterday: businessData.revenue.yesterday,
        growth: businessData.revenue.growth,
        trend: this.calculateRevenueTrend(),
        target: this.getDailyRevenueTarget()
      },
      orders: {
        today: businessData.orders.today,
        yesterday: businessData.orders.yesterday,
        growth: businessData.orders.growth,
        pending: this.getPendingOrderCount(),
        failed: this.getFailedOrderCount()
      },
      customers: {
        active: this.getActiveCustomerCount(),
        new: businessData.customers.new,
        returning: businessData.customers.returning,
        satisfaction: this.getCustomerSatisfactionScore()
      },
      conversion: {
        rate: businessData.conversion.rate,
        funnel: businessData.conversion.funnel,
        abandonment: this.getCartAbandonmentRate()
      },
      inventory: {
        lowStock: businessData.inventory.lowStock.length,
        criticalItems: this.getCriticalInventoryItems(),
        reservations: this.getActiveReservations()
      }
    };
  }

  /**
   * Get alert status and summary
   */
  async getAlertStatus() {
    const activeAlerts = Array.from(alertingSystem.alerts.values())
      .filter(alert => alert.status === 'active');

    const alertsByCategory = {};
    const alertsBySeverity = {};

    activeAlerts.forEach(alert => {
      // Group by category
      if (!alertsByCategory[alert.category]) {
        alertsByCategory[alert.category] = 0;
      }
      alertsByCategory[alert.category]++;

      // Group by severity
      if (!alertsBySeverity[alert.severity]) {
        alertsBySeverity[alert.severity] = 0;
      }
      alertsBySeverity[alert.severity]++;
    });

    const recentAlerts = activeAlerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .map(alert => ({
        id: alert.id,
        title: alert.title,
        category: alert.category,
        severity: alert.severity,
        timestamp: alert.timestamp,
        component: alert.component
      }));

    return {
      totalActive: activeAlerts.length,
      byCategory: alertsByCategory,
      bySeverity: alertsBySeverity,
      recent: recentAlerts,
      criticalCount: alertsBySeverity.critical || 0,
      acknowledged: this.getAcknowledgedAlertCount(),
      resolved: this.getResolvedAlertCount()
    };
  }

  /**
   * Get performance data for dashboard
   */
  async getPerformanceData() {
    const snapshot = this.performanceDashboard.getSnapshot();
    
    return {
      apis: {
        responseTime: snapshot.apis?.avgResponseTime || 0,
        p95ResponseTime: snapshot.apis?.p95ResponseTime || 0,
        requestCount: snapshot.apis?.requestCount || 0,
        errorRate: this.calculateApiErrorRate(),
        throughput: this.calculateThroughput()
      },
      database: {
        queryTime: snapshot.database?.avgQueryTime || 0,
        p95QueryTime: snapshot.database?.p95QueryTime || 0,
        connectionPool: this.getDatabaseConnectionPoolStatus(),
        slowQueries: snapshot.database?.slowQueryCount || 0
      },
      payments: {
        processingTime: snapshot.payments?.avgProcessingTime || 0,
        successRate: this.getPaymentSuccessRate(),
        volume: this.getPaymentVolume(),
        methodBreakdown: this.getPaymentMethodBreakdown()
      },
      infrastructure: {
        cpuUsage: await this.getCPUUsage(),
        memoryUsage: await this.getMemoryUsage(),
        diskUsage: await this.getDiskUsage(),
        networkLatency: await this.getNetworkLatency()
      }
    };
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary() {
    const data = this.dashboardData;
    
    return {
      timestamp: Date.now(),
      overview: {
        systemHealth: data.system.overallHealth,
        revenue: {
          today: data.business.revenue.today,
          growth: data.business.revenue.growth
        },
        orders: {
          count: data.business.orders.today,
          successRate: this.getOrderSuccessRate()
        },
        alerts: {
          critical: data.alerts.criticalCount,
          total: data.alerts.totalActive
        }
      },
      kpis: {
        conversionRate: data.business.conversion.rate,
        averageOrderValue: this.calculateAverageOrderValue(),
        customerSatisfaction: data.business.customers.satisfaction,
        systemUptime: data.system.uptime
      },
      trends: {
        revenueGrowth: data.business.revenue.growth,
        orderGrowth: data.business.orders.growth,
        performanceTrend: this.getPerformanceTrend(),
        alertTrend: this.getAlertTrend()
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get real-time event stream for dashboard
   */
  getEventStream() {
    const events = [];
    
    // Recent orders
    const recentOrders = this.getRecentOrders(10);
    events.push(...recentOrders.map(order => ({
      type: 'order',
      timestamp: order.timestamp,
      message: `New order: ${order.orderNumber} - $${order.amount}`,
      severity: 'info'
    })));

    // Recent alerts
    const recentAlerts = this.dashboardData.alerts.recent.slice(0, 5);
    events.push(...recentAlerts.map(alert => ({
      type: 'alert',
      timestamp: alert.timestamp,
      message: alert.title,
      severity: alert.severity
    })));

    // Performance events
    const performanceEvents = this.getRecentPerformanceEvents(5);
    events.push(...performanceEvents);

    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }

  // Helper methods
  getHealthStatus(score) {
    if (score >= 95) return 'excellent';
    if (score >= 85) return 'good';
    if (score >= 70) return 'fair';
    if (score >= 50) return 'poor';
    return 'critical';
  }

  calculateUptime() {
    // This would calculate actual uptime based on your monitoring data
    // For now, return a mock value
    return 99.95;
  }

  getActiveAlertCount() {
    return Array.from(alertingSystem.alerts.values())
      .filter(alert => alert.status === 'active').length;
  }

  async getSystemLoad() {
    // Mock system load - integrate with actual system monitoring
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100
    };
  }

  async getMemoryUsage() {
    // Mock memory usage - integrate with actual system monitoring
    return {
      used: Math.random() * 8000,
      total: 8000,
      percentage: Math.random() * 100
    };
  }

  async getNetworkStatus() {
    // Mock network status - integrate with actual network monitoring
    return {
      latency: Math.random() * 100,
      throughput: Math.random() * 1000,
      errors: Math.random() * 10
    };
  }

  calculateRevenueTrend() {
    // Calculate revenue trend based on historical data
    return 'increasing'; // Mock
  }

  getDailyRevenueTarget() {
    // Get daily revenue target from business configuration
    return 50000; // Mock target
  }

  getPendingOrderCount() {
    // Get count of pending orders
    return 12; // Mock
  }

  getFailedOrderCount() {
    // Get count of failed orders today
    return 3; // Mock
  }

  getActiveCustomerCount() {
    // Get count of active customers (online now)
    return 45; // Mock
  }

  getCustomerSatisfactionScore() {
    // Get customer satisfaction score from surveys/feedback
    return 4.2; // Mock score out of 5
  }

  getCartAbandonmentRate() {
    // Calculate cart abandonment rate
    return 23.5; // Mock percentage
  }

  getCriticalInventoryItems() {
    // Get items with critically low inventory
    return ['full_weekend_pass']; // Mock
  }

  getActiveReservations() {
    // Get count of active ticket reservations
    return 28; // Mock
  }

  getAcknowledgedAlertCount() {
    return Array.from(alertingSystem.alerts.values())
      .filter(alert => alert.acknowledgments.length > 0).length;
  }

  getResolvedAlertCount() {
    return Array.from(alertingSystem.alerts.values())
      .filter(alert => alert.status === 'resolved').length;
  }

  calculateApiErrorRate() {
    // Calculate API error rate from recent metrics
    return 0.5; // Mock percentage
  }

  calculateThroughput() {
    // Calculate requests per second
    return 125; // Mock RPS
  }

  getDatabaseConnectionPoolStatus() {
    return {
      active: 8,
      idle: 12,
      total: 20
    };
  }

  getPaymentSuccessRate() {
    return 98.5; // Mock percentage
  }

  getPaymentVolume() {
    return {
      last24h: 156,
      lastHour: 12
    };
  }

  getPaymentMethodBreakdown() {
    return {
      card: 85,
      paypal: 10,
      other: 5
    };
  }

  async getCPUUsage() {
    return Math.random() * 100; // Mock
  }

  async getDiskUsage() {
    return {
      used: 45.2,
      available: 54.8
    };
  }

  async getNetworkLatency() {
    return Math.random() * 50; // Mock latency in ms
  }

  getOrderSuccessRate() {
    return 96.8; // Mock percentage
  }

  calculateAverageOrderValue() {
    return 125.50; // Mock AOV
  }

  getPerformanceTrend() {
    return 'stable'; // Mock: 'improving', 'stable', 'degrading'
  }

  getAlertTrend() {
    return 'decreasing'; // Mock: 'increasing', 'stable', 'decreasing'
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.dashboardData.system.overallHealth < 85) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'System health is below optimal. Consider scaling resources.',
        action: 'scale_infrastructure'
      });
    }

    if (this.dashboardData.alerts.criticalCount > 0) {
      recommendations.push({
        type: 'alerts',
        priority: 'critical',
        message: 'Critical alerts require immediate attention.',
        action: 'resolve_critical_alerts'
      });
    }

    if (this.dashboardData.business.conversion.rate < 2.0) {
      recommendations.push({
        type: 'business',
        priority: 'medium',
        message: 'Conversion rate is below target. Review checkout flow.',
        action: 'optimize_conversion'
      });
    }

    return recommendations;
  }

  getRecentOrders(limit = 10) {
    // Mock recent orders - integrate with actual order system
    return Array.from({ length: limit }, (_, i) => ({
      orderNumber: `ORD${Date.now() - i * 60000}`,
      amount: Math.random() * 200 + 50,
      timestamp: Date.now() - i * 60000
    }));
  }

  getRecentPerformanceEvents(limit = 5) {
    // Mock performance events
    return Array.from({ length: limit }, (_, i) => ({
      type: 'performance',
      timestamp: Date.now() - i * 300000,
      message: `API response time: ${Math.floor(Math.random() * 2000)}ms`,
      severity: 'info'
    }));
  }

  // Event emitter functionality
  emit(event, data) {
    // This would integrate with WebSocket or Server-Sent Events
    console.log(`Dashboard event: ${event}`, data);
  }
}

/**
 * Dashboard API endpoints
 */
export class DashboardAPI {
  constructor() {
    this.dashboard = new MonitoringDashboard();
    this.dashboard.startRealTimeUpdates();
  }

  /**
   * Get complete dashboard data
   */
  getDashboard() {
    return this.dashboard.getDashboardData();
  }

  /**
   * Get executive summary
   */
  getExecutiveSummary() {
    return this.dashboard.generateExecutiveSummary();
  }

  /**
   * Get real-time event stream
   */
  getEventStream() {
    return this.dashboard.getEventStream();
  }

  /**
   * Get system health only
   */
  getSystemHealth() {
    return this.dashboard.dashboardData.system;
  }

  /**
   * Get business metrics only
   */
  getBusinessMetrics() {
    return this.dashboard.dashboardData.business;
  }

  /**
   * Get performance data only
   */
  getPerformanceData() {
    return this.dashboard.dashboardData.performance;
  }

  /**
   * Get alert status only
   */
  getAlertStatus() {
    return this.dashboard.dashboardData.alerts;
  }
}

// Global dashboard instance
export const monitoringDashboard = new MonitoringDashboard();
export const dashboardAPI = new DashboardAPI();

export default {
  MonitoringDashboard,
  DashboardAPI,
  monitoringDashboard,
  dashboardAPI
};