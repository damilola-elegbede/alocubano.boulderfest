/**
 * K6 Load Test - Sustained Load Validation
 * 
 * This test validates system performance under sustained moderate load
 * to ensure stability and resource management over extended periods.
 * 
 * Test Scenarios:
 * - 75 concurrent users for 30 minutes
 * - Mixed operations: browsing, purchases, check-ins
 * - Memory leak detection
 * - Resource utilization monitoring
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics for sustained load monitoring
const operationSuccessRate = new Rate('operation_success_rate');
const memoryUsageTrend = new Trend('memory_usage_mb');
const cpuUsageTrend = new Trend('cpu_usage_percent');
const databaseConnectionsTrend = new Trend('database_connections');
const cacheHitRate = new Rate('cache_hit_rate');
const apiResponseTime = new Trend('api_response_time');
const errorRate = new Rate('error_rate');
const activeOperations = new Gauge('active_operations');

// Test configuration for sustained load
export let options = {
  stages: [
    { duration: '2m', target: 75 },   // Ramp up to target load
    { duration: '30m', target: 75 },  // Sustain target load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  
  thresholds: {
    // Performance requirements
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'api_response_time': ['avg<200', 'p(95)<500'],
    
    // Stability requirements
    'operation_success_rate': ['rate>0.98'],
    'error_rate': ['rate<0.02'],
    'cache_hit_rate': ['rate>0.70'],
    
    // Resource requirements
    'memory_usage_mb': ['avg<512', 'max<1024'],
    'cpu_usage_percent': ['avg<70', 'max<90'],
    'database_connections': ['avg<50', 'max<100'],
  },
  
  tags: {
    testType: 'sustained-load',
    environment: __ENV.TEST_ENV || 'staging',
  },
};

// Base URL configuration
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Operation types for mixed load
const operations = {
  browse: { weight: 40, func: browseOperation },
  search: { weight: 20, func: searchOperation },
  purchase: { weight: 15, func: purchaseOperation },
  checkin: { weight: 10, func: checkinOperation },
  analytics: { weight: 10, func: analyticsOperation },
  profile: { weight: 5, func: profileOperation },
};

// Calculate operation weights
function selectOperation() {
  const totalWeight = Object.values(operations).reduce((sum, op) => sum + op.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const [name, op] of Object.entries(operations)) {
    random -= op.weight;
    if (random <= 0) {
      return { name, func: op.func };
    }
  }
  
  return { name: 'browse', func: operations.browse.func };
}

// Main test scenario
export default function() {
  const operation = selectOperation();
  
  activeOperations.add(1);
  
  group(`Operation: ${operation.name}`, () => {
    const startTime = Date.now();
    const success = operation.func();
    const duration = Date.now() - startTime;
    
    apiResponseTime.add(duration);
    operationSuccessRate.add(success ? 1 : 0);
    errorRate.add(success ? 0 : 1);
    
    // Collect system metrics periodically
    if (__ITER % 100 === 0) {
      collectSystemMetrics();
    }
  });
  
  activeOperations.add(-1);
  
  // Realistic think time between operations
  sleep(randomIntBetween(2, 8));
}

// Browse operation
function browseOperation() {
  const pages = ['/tickets', '/schedule', '/artists', '/about', '/gallery'];
  const page = randomItem(pages);
  
  const response = http.get(`${BASE_URL}${page}`, {
    tags: { operation: 'browse' },
  });
  
  const success = check(response, {
    'page loaded': (r) => r.status === 200,
    'response time ok': (r) => r.timings.duration < 1000,
  });
  
  // Check cache headers
  if (response.headers['X-Cache-Hit']) {
    cacheHitRate.add(1);
  } else {
    cacheHitRate.add(0);
  }
  
  // Simulate reading time
  sleep(randomIntBetween(3, 10));
  
  return success;
}

// Search operation
function searchOperation() {
  const searchTerms = ['salsa', 'workshop', 'beginner', 'cuba', 'dance', 'music'];
  const term = randomItem(searchTerms);
  
  const response = http.get(`${BASE_URL}/api/search?q=${term}`, {
    tags: { operation: 'search' },
  });
  
  const success = check(response, {
    'search completed': (r) => r.status === 200,
    'results returned': (r) => r.json('results') !== undefined,
    'response time ok': (r) => r.timings.duration < 500,
  });
  
  // Check cache performance
  if (response.headers['X-Cache-Hit']) {
    cacheHitRate.add(1);
  } else {
    cacheHitRate.add(0);
  }
  
  sleep(randomIntBetween(2, 5));
  
  return success;
}

// Purchase operation (simplified)
function purchaseOperation() {
  // Create cart
  let response = http.post(
    `${BASE_URL}/api/cart/create`,
    JSON.stringify({ sessionId: `sustained_${__VU}_${__ITER}` }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'purchase' },
    }
  );
  
  if (response.status !== 201) {
    return false;
  }
  
  const cartId = response.json('cartId');
  
  // Add ticket
  response = http.post(
    `${BASE_URL}/api/cart/add`,
    JSON.stringify({
      cartId: cartId,
      ticketId: 'general',
      quantity: 1,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'purchase' },
    }
  );
  
  // Simulate checkout process
  sleep(randomIntBetween(5, 15));
  
  // Complete purchase (test mode)
  response = http.post(
    `${BASE_URL}/api/checkout/test-complete`,
    JSON.stringify({
      cartId: cartId,
      testMode: true,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'purchase' },
    }
  );
  
  return response.status === 200;
}

// Check-in operation
function checkinOperation() {
  const qrCode = `TEST-QR-${Date.now()}-${__VU}-${__ITER}`;
  
  const response = http.post(
    `${BASE_URL}/api/tickets/validate`,
    JSON.stringify({
      qr_code: qrCode,
      device_id: `sustained_device_${__VU}`,
      test_mode: true,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'checkin' },
    }
  );
  
  return response.status === 200 || response.status === 409;
}

// Analytics operation
function analyticsOperation() {
  const endpoints = [
    '/api/analytics/sales',
    '/api/analytics/attendance',
    '/api/analytics/demographics',
    '/api/analytics/wallet-stats',
  ];
  
  const endpoint = randomItem(endpoints);
  
  const response = http.get(`${BASE_URL}${endpoint}`, {
    tags: { operation: 'analytics' },
  });
  
  const success = check(response, {
    'analytics loaded': (r) => r.status === 200,
    'data returned': (r) => r.body.length > 0,
  });
  
  // Analytics queries might hit cache
  if (response.headers['X-Cache-Hit']) {
    cacheHitRate.add(1);
  } else {
    cacheHitRate.add(0);
  }
  
  sleep(randomIntBetween(3, 8));
  
  return success;
}

// Profile operation
function profileOperation() {
  const userId = `user_${__VU}`;
  
  const response = http.get(`${BASE_URL}/api/profile/${userId}`, {
    headers: {
      'Authorization': `Bearer test_token_${userId}`,
    },
    tags: { operation: 'profile' },
  });
  
  return response.status === 200 || response.status === 404;
}

// Collect system metrics
function collectSystemMetrics() {
  const response = http.get(`${BASE_URL}/api/monitoring/metrics`, {
    tags: { operation: 'metrics' },
    timeout: '5s',
  });
  
  if (response.status === 200) {
    const metrics = response.json();
    
    if (metrics.memory) {
      memoryUsageTrend.add(metrics.memory.usedMB || 0);
    }
    
    if (metrics.cpu) {
      cpuUsageTrend.add(metrics.cpu.percentage || 0);
    }
    
    if (metrics.database) {
      databaseConnectionsTrend.add(metrics.database.activeConnections || 0);
    }
  }
}

// Setup function
export function setup() {
  console.log('=== Sustained Load Test Starting ===');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Load: 75 concurrent users`);
  console.log(`Duration: 34 minutes total`);
  console.log(`Operations: Mixed workload simulation`);
  
  // Warm up cache
  console.log('Warming up cache...');
  http.post(`${BASE_URL}/api/cache/warm`, null, { timeout: '30s' });
  
  return {
    startTime: Date.now(),
    testId: `sustained-load-${Date.now()}`,
  };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60;
  
  console.log('=== Sustained Load Test Complete ===');
  console.log(`Test ID: ${data.testId}`);
  console.log(`Duration: ${duration.toFixed(1)} minutes`);
  
  // Get final system metrics
  const response = http.get(`${BASE_URL}/api/monitoring/metrics`);
  if (response.status === 200) {
    const metrics = response.json();
    console.log('Final System Metrics:');
    console.log(`- Memory: ${metrics.memory?.usedMB || 'N/A'} MB`);
    console.log(`- CPU: ${metrics.cpu?.percentage || 'N/A'}%`);
    console.log(`- DB Connections: ${metrics.database?.activeConnections || 'N/A'}`);
  }
}

// Custom summary
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Calculate stability metrics
  const stabilityMetrics = calculateStabilityMetrics(data);
  
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/load-test-results/sustained-load-${timestamp}.json`]: JSON.stringify({
      ...data,
      stabilityMetrics,
    }, null, 2),
    [`reports/load-test-results/sustained-load-${timestamp}.html`]: generateStabilityReport(data, stabilityMetrics),
  };
}

// Calculate stability metrics
function calculateStabilityMetrics(data) {
  const metrics = data.metrics;
  
  return {
    successRate: metrics.operation_success_rate?.rate || 0,
    errorRate: metrics.error_rate?.rate || 0,
    cacheHitRate: metrics.cache_hit_rate?.rate || 0,
    avgResponseTime: metrics.api_response_time?.avg || 0,
    p95ResponseTime: metrics.api_response_time?.['p(95)'] || 0,
    avgMemoryMB: metrics.memory_usage_mb?.avg || 0,
    maxMemoryMB: metrics.memory_usage_mb?.max || 0,
    avgCPU: metrics.cpu_usage_percent?.avg || 0,
    maxCPU: metrics.cpu_usage_percent?.max || 0,
    totalOperations: metrics.iterations?.count || 0,
    testDuration: (data.state?.testRunDurationMs || 0) / 1000 / 60,
  };
}

// Generate stability report
function generateStabilityReport(data, metrics) {
  const isStable = metrics.successRate > 0.98 && 
                   metrics.errorRate < 0.02 && 
                   metrics.avgMemoryMB < 512;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sustained Load Test - Stability Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f0f4f8; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; }
        .status { font-size: 1.2em; margin-top: 10px; }
        .status.stable { color: #48bb78; }
        .status.unstable { color: #f56565; }
        .metrics-container { margin-top: 30px; }
        .metric-group { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .metric-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
        .metric-row:last-child { border-bottom: none; }
        .metric-label { color: #4a5568; }
        .metric-value { font-weight: bold; color: #2d3748; }
        .chart { margin-top: 20px; padding: 20px; background: #f7fafc; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Sustained Load Test Report</h1>
        <div class="status ${isStable ? 'stable' : 'unstable'}">
          System Status: ${isStable ? '✅ STABLE' : '⚠️ UNSTABLE'}
        </div>
        <p>Test Duration: ${metrics.testDuration.toFixed(1)} minutes</p>
      </div>
      
      <div class="metrics-container">
        <div class="metric-group">
          <h2>Performance Metrics</h2>
          <div class="metric-row">
            <span class="metric-label">Success Rate</span>
            <span class="metric-value">${(metrics.successRate * 100).toFixed(2)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Error Rate</span>
            <span class="metric-value">${(metrics.errorRate * 100).toFixed(2)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cache Hit Rate</span>
            <span class="metric-value">${(metrics.cacheHitRate * 100).toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Avg Response Time</span>
            <span class="metric-value">${metrics.avgResponseTime.toFixed(0)}ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">P95 Response Time</span>
            <span class="metric-value">${metrics.p95ResponseTime.toFixed(0)}ms</span>
          </div>
        </div>
        
        <div class="metric-group">
          <h2>Resource Utilization</h2>
          <div class="metric-row">
            <span class="metric-label">Avg Memory Usage</span>
            <span class="metric-value">${metrics.avgMemoryMB.toFixed(0)} MB</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Max Memory Usage</span>
            <span class="metric-value">${metrics.maxMemoryMB.toFixed(0)} MB</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Avg CPU Usage</span>
            <span class="metric-value">${metrics.avgCPU.toFixed(1)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Max CPU Usage</span>
            <span class="metric-value">${metrics.maxCPU.toFixed(1)}%</span>
          </div>
        </div>
        
        <div class="metric-group">
          <h2>Test Summary</h2>
          <div class="metric-row">
            <span class="metric-label">Total Operations</span>
            <span class="metric-value">${metrics.totalOperations.toLocaleString()}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Operations/Minute</span>
            <span class="metric-value">${(metrics.totalOperations / metrics.testDuration).toFixed(0)}</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Text summary helper
function textSummary(data, options) {
  return JSON.stringify(data.metrics, null, 2);
}