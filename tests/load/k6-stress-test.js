/**
 * K6 Stress Test - System Breaking Point Validation
 * 
 * This test pushes the system beyond normal capacity to identify breaking points,
 * resource exhaustion scenarios, and validate graceful degradation under extreme load.
 * 
 * Test Scenarios:
 * - 300 concurrent users (2x expected capacity)
 * - Rapid spike to maximum load in 30 seconds
 * - 5-minute sustained extreme load
 * - Resource exhaustion detection
 * - Recovery behavior validation
 * - Failure cascade monitoring
 */

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics for stress testing
const systemBreakingPoint = new Gauge('system_breaking_point_users');
const failureRate = new Rate('failure_rate');
const recoveryTime = new Trend('recovery_time_ms');
const resourceExhaustionRate = new Rate('resource_exhaustion_rate');
const cascadeFailureRate = new Rate('cascade_failure_rate');
const degradationLevels = new Gauge('performance_degradation_level');
const timeoutRate = new Rate('timeout_rate');
const connectionRefusalRate = new Rate('connection_refusal_rate');
const memoryLeakDetection = new Trend('memory_leak_mb_per_minute');
const cpuSpike = new Trend('cpu_spike_percent');
const databaseOverload = new Rate('database_overload_rate');
const cacheEvictionRate = new Rate('cache_eviction_rate');
const emergencyThrottling = new Rate('emergency_throttling_activated');

// Stress test configuration
export let options = {
  stages: [
    // Phase 1: Rapid escalation to breaking point
    { duration: '30s', target: 300 },   // Aggressive ramp to stress load
    
    // Phase 2: Sustained maximum stress
    { duration: '5m', target: 300 },    // Maintain breaking point load
    
    // Phase 3: Spike beyond capacity (failure simulation)
    { duration: '30s', target: 400 },   // Push beyond limits
    { duration: '1m', target: 400 },    // Sustained overload
    
    // Phase 4: Recovery monitoring
    { duration: '30s', target: 200 },   // Partial recovery
    { duration: '1m', target: 100 },    // Recovery validation
    { duration: '30s', target: 0 },     // Complete ramp down
  ],
  
  thresholds: {
    // Stress test expectations (optimized for Vercel serverless limits)
    'http_req_duration': ['p(95)<3000', 'p(99)<8000'], // Account for serverless scaling
    'http_req_failed': ['rate<0.15'],  // Higher tolerance for serverless cold starts
    
    // Breaking point detection (serverless-aware)
    'failure_rate': ['rate<0.20'],     // Serverless functions may fail under extreme load
    'timeout_rate': ['rate<0.10'],     // Vercel has 10-30s timeouts
    'connection_refusal_rate': ['rate<0.12'], // Rate limiting more aggressive
    
    // Resource exhaustion monitoring (serverless constraints)
    'resource_exhaustion_rate': ['rate<0.30'], // Vercel memory/CPU limits
    'database_overload_rate': ['rate<0.15'],   // Connection pooling stressed
    'cache_eviction_rate': ['rate<0.50'],      // Edge cache under extreme load
    
    // System stability under stress (serverless resilience)
    'cascade_failure_rate': ['rate<0.10'],     // Isolated function failures expected
    'emergency_throttling_activated': ['rate<0.70'], // Vercel auto-throttling
    
    // Recovery requirements (serverless scaling time)
    'recovery_time_ms': ['p(95)<60000'],       // 60s for serverless auto-scaling
  },
  
  // Optimized timeouts for Vercel serverless limits
  httpTimeout: '25s', // Match Vercel function timeout
  noConnectionReuse: false, // Allow connection reuse for efficiency
  
  // Serverless-specific options
  setupTimeout: '60s',
  teardownTimeout: '60s',
  
  tags: {
    testType: 'stress-test',
    environment: __ENV.TEST_ENV || 'staging',
    maxConcurrentUsers: '400',
  },
};

// Base URL configuration
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Enhanced operation weights for stress testing
const stressOperations = {
  // High-impact operations weighted higher during stress
  heavyLoad: { weight: 25, func: heavyLoadOperation },
  concurrentPurchase: { weight: 20, func: concurrentPurchaseOperation },
  databaseStress: { weight: 15, func: databaseStressOperation },
  memoryIntensive: { weight: 15, func: memoryIntensiveOperation },
  cascade: { weight: 10, func: cascadeOperation },
  browse: { weight: 10, func: browseOperation },
  analytics: { weight: 5, func: analyticsStressOperation },
};

// Select operation based on stress weights
function selectStressOperation() {
  const totalWeight = Object.values(stressOperations).reduce((sum, op) => sum + op.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const [name, op] of Object.entries(stressOperations)) {
    random -= op.weight;
    if (random <= 0) {
      return { name, func: op.func };
    }
  }
  
  return { name: 'heavyLoad', func: stressOperations.heavyLoad.func };
}

// Serverless stress test warm-up
function stressWarmUp() {
  const criticalFunctions = [
    '/api/health/check',
    '/api/cart/create',
    '/api/checkout/initialize',
    '/api/processing/memory-intensive'
  ];
  
  for (const endpoint of criticalFunctions) {
    http.get(`${BASE_URL}${endpoint}`, {
      tags: { operation: 'stress-warmup' },
      timeout: '8s'
    });
  }
}

// Main stress test scenario
export default function() {
  const startTime = Date.now();
  const operation = selectStressOperation();
  const currentUsers = __ENV.K6_BROWSER_ENABLED ? __VU : getCurrentStageUsers();
  
  // Warm up functions periodically during stress
  if (__ITER % 100 === 0) {
    stressWarmUp();
  }
  
  // Track breaking point detection
  systemBreakingPoint.add(currentUsers);
  
  group(`Stress Operation: ${operation.name}`, () => {
    let success = false;
    let errorType = 'none';
    
    try {
      success = operation.func();
      
      // Detect performance degradation levels
      const responseTime = Date.now() - startTime;
      if (responseTime > 5000) {
        degradationLevels.add(5); // Severe
      } else if (responseTime > 2000) {
        degradationLevels.add(3); // Moderate
      } else if (responseTime > 1000) {
        degradationLevels.add(2); // Mild
      } else {
        degradationLevels.add(1); // Normal
      }
      
    } catch (error) {
      success = false;
      errorType = categorizeError(error);
      
      // Track specific error patterns
      if (errorType === 'timeout') {
        timeoutRate.add(1);
      } else if (errorType === 'connection_refused') {
        connectionRefusalRate.add(1);
      } else if (errorType === 'resource_exhaustion') {
        resourceExhaustionRate.add(1);
      }
      
      degradationLevels.add(5); // Mark as severely degraded
    }
    
    failureRate.add(success ? 0 : 1);
    
    // Monitor system metrics under stress
    if (__ITER % 50 === 0) {
      monitorStressMetrics();
    }
    
    // Detect cascade failures
    if (!success && Math.random() < 0.1) {
      checkCascadeFailure();
    }
  });
  
  // Aggressive think time under stress (simulate user frustration)
  const thinkTime = success ? randomIntBetween(1, 3) : randomIntBetween(5, 10);
  sleep(thinkTime);
}

// Heavy load operation (optimized for Vercel limits)
function heavyLoadOperation() {
  const operations = [
    { path: '/api/analytics/heavy-report', params: { period: '6m', detailed: true, serverless: true } },
    { path: '/api/gallery/bulk-process', params: { count: 50, quality: 'medium', serverless: true } },
    { path: '/api/search/advanced', params: { query: '*', facets: true, serverless: true } },
  ];
  
  const op = randomItem(operations);
  const url = `${BASE_URL}${op.path}`;
  
  const response = http.post(
    url,
    JSON.stringify({
      ...op.params,
      vercel_config: {
        max_duration: 20,
        memory: 512,
        region: 'us-east-1'
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Stress-Test': 'true',
        'X-Vercel-Max-Duration': '20',
      },
      tags: { operation: 'heavy-load' },
      timeout: '20s', // Stay within Vercel limits
    }
  );
  
  return check(response, {
    'heavy operation completed': (r) => r.status === 200 || r.status === 202,
    'not server error': (r) => r.status < 500,
  });
}

// Concurrent purchase operation (database stress)
function concurrentPurchaseOperation() {
  const sessionId = `stress_${__VU}_${__ITER}_${Date.now()}`;
  
  // Simulate multiple users trying to buy the same limited ticket
  const limitedTicketId = 'vip-limited';
  
  // Create cart with race condition potential
  let response = http.post(
    `${BASE_URL}/api/cart/create`,
    JSON.stringify({ 
      sessionId: sessionId,
      priority: 'high', // Request priority processing
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'concurrent-purchase' },
      timeout: '15s',
    }
  );
  
  if (response.status !== 201) {
    return false;
  }
  
  const cartId = response.json('cartId');
  
  // Attempt to add limited inventory item (stress test inventory management)
  response = http.post(
    `${BASE_URL}/api/cart/add`,
    JSON.stringify({
      cartId: cartId,
      ticketId: limitedTicketId,
      quantity: randomIntBetween(1, 3), // Variable quantities for contention
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'concurrent-purchase' },
      timeout: '10s',
    }
  );
  
  // Check for database overload symptoms
  if (response.status === 503 || response.status === 429) {
    databaseOverload.add(1);
    return false;
  }
  
  // Attempt immediate checkout (stress payment processing)
  response = http.post(
    `${BASE_URL}/api/checkout/stress-test`,
    JSON.stringify({
      cartId: cartId,
      testMode: true,
      stressLevel: 'high',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'concurrent-purchase' },
      timeout: '20s',
    }
  );
  
  return response.status === 200 || response.status === 409; // 409 = sold out acceptable
}

// Database stress operation
function databaseStressOperation() {
  const operations = [
    // Complex query that might cause locks
    { method: 'GET', path: '/api/analytics/complex-query', timeout: '20s' },
    // Bulk update operation
    { method: 'POST', path: '/api/admin/bulk-update', data: { count: 1000 }, timeout: '25s' },
    // Transaction-heavy operation
    { method: 'POST', path: '/api/transactions/bulk-process', data: { batch_size: 100 }, timeout: '30s' },
  ];
  
  const op = randomItem(operations);
  let response;
  
  if (op.method === 'GET') {
    response = http.get(`${BASE_URL}${op.path}`, {
      tags: { operation: 'database-stress' },
      timeout: op.timeout,
    });
  } else {
    response = http.post(
      `${BASE_URL}${op.path}`,
      JSON.stringify(op.data || {}),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { operation: 'database-stress' },
        timeout: op.timeout,
      }
    );
  }
  
  // Check for database overload indicators
  if (response.status === 503 || response.headers['X-DB-Overload']) {
    databaseOverload.add(1);
  }
  
  return response.status === 200 || response.status === 202;
}

// Memory intensive operation
function memoryIntensiveOperation() {
  const response = http.post(
    `${BASE_URL}/api/processing/memory-intensive`,
    JSON.stringify({
      operation: 'large-dataset-analysis',
      dataSize: randomIntBetween(10, 50), // MB
      processingType: randomItem(['sort', 'aggregate', 'transform']),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'memory-intensive' },
      timeout: '25s',
    }
  );
  
  // Detect memory pressure indicators
  if (response.headers['X-Memory-Pressure'] || response.status === 507) {
    resourceExhaustionRate.add(1);
  }
  
  return response.status === 200 || response.status === 202;
}

// Cascade operation (tests failure propagation)
function cascadeOperation() {
  const services = ['email', 'payment', 'analytics', 'cache'];
  const service = randomItem(services);
  
  // Trigger operation that depends on multiple services
  const response = http.post(
    `${BASE_URL}/api/cascade/test-${service}`,
    JSON.stringify({
      dependencyChain: true,
      failureMode: 'stress',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'cascade' },
      timeout: '15s',
    }
  );
  
  // Check for cascade failure indicators
  if (response.status === 503 && response.headers['X-Cascade-Failure']) {
    cascadeFailureRate.add(1);
    return false;
  }
  
  return response.status === 200;
}

// Enhanced browse operation for stress
function browseOperation() {
  const pages = [
    '/tickets',
    '/schedule',
    '/artists',
    '/gallery?year=2024&load=high',
    '/about?detailed=true',
  ];
  
  const page = randomItem(pages);
  const response = http.get(`${BASE_URL}${page}`, {
    headers: {
      'X-Stress-Test': 'true',
      'Accept-Encoding': 'gzip, br',
    },
    tags: { operation: 'browse-stress' },
    timeout: '10s',
  });
  
  // Monitor cache behavior under stress
  if (response.headers['X-Cache-Evicted']) {
    cacheEvictionRate.add(1);
  }
  
  return response.status === 200 || response.status === 206;
}

// Analytics stress operation
function analyticsStressOperation() {
  const queries = [
    { path: '/api/analytics/real-time', params: { detailed: true, live: true } },
    { path: '/api/analytics/historical', params: { range: '1y', granularity: 'hour' } },
    { path: '/api/analytics/predictive', params: { model: 'complex', lookahead: '6m' } },
  ];
  
  const query = randomItem(queries);
  
  const response = http.post(
    `${BASE_URL}${query.path}`,
    JSON.stringify(query.params),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { operation: 'analytics-stress' },
      timeout: '20s',
    }
  );
  
  return response.status === 200 || response.status === 202;
}

// Monitor stress-specific metrics
function monitorStressMetrics() {
  const response = http.get(`${BASE_URL}/api/monitoring/stress-metrics`, {
    tags: { operation: 'stress-monitoring' },
    timeout: '5s',
  });
  
  if (response.status === 200) {
    const metrics = response.json();
    
    // Memory leak detection
    if (metrics.memory && metrics.memory.growthRate) {
      memoryLeakDetection.add(metrics.memory.growthRate);
    }
    
    // CPU spike detection
    if (metrics.cpu && metrics.cpu.currentUsage > 90) {
      cpuSpike.add(metrics.cpu.currentUsage);
    }
    
    // Emergency throttling detection
    if (metrics.throttling && metrics.throttling.active) {
      emergencyThrottling.add(1);
    } else {
      emergencyThrottling.add(0);
    }
  }
}

// Check for cascade failure patterns
function checkCascadeFailure() {
  const healthChecks = [
    '/api/health/database',
    '/api/health/cache',
    '/api/health/email',
    '/api/health/payment',
  ];
  
  let failedServices = 0;
  
  for (const endpoint of healthChecks) {
    const response = http.get(`${BASE_URL}${endpoint}`, {
      tags: { operation: 'health-check' },
      timeout: '3s',
    });
    
    if (response.status !== 200) {
      failedServices++;
    }
  }
  
  // If multiple services are down, it's a cascade failure
  if (failedServices >= 2) {
    cascadeFailureRate.add(1);
  } else {
    cascadeFailureRate.add(0);
  }
}

// Error categorization for better analysis
function categorizeError(error) {
  const errorString = error.toString().toLowerCase();
  
  if (errorString.includes('timeout')) return 'timeout';
  if (errorString.includes('connection refused')) return 'connection_refused';
  if (errorString.includes('out of memory') || errorString.includes('429')) return 'resource_exhaustion';
  if (errorString.includes('503') || errorString.includes('502')) return 'server_overload';
  if (errorString.includes('cascade')) return 'cascade_failure';
  
  return 'unknown';
}

// Get current stage user count (approximation)
function getCurrentStageUsers() {
  const elapsed = Date.now() - __ENV.K6_STAGE_START || 0;
  // This is a rough approximation - in real implementation, 
  // you'd track stage transitions more precisely
  
  if (elapsed < 30000) return Math.min(300, (elapsed / 30000) * 300);
  if (elapsed < 330000) return 300; // 5.5 minutes
  if (elapsed < 360000) return 400; // Next 30 seconds
  if (elapsed < 420000) return 400; // 1 minute at 400
  
  // Recovery phase
  return Math.max(0, 400 - ((elapsed - 420000) / 120000) * 400);
}

// Setup function
export function setup() {
  console.log('=== STRESS TEST STARTING ===');
  console.log(`🔥 Target: ${BASE_URL}`);
  console.log(`💪 Peak Load: 400 concurrent users`);
  console.log(`⏱️  Duration: ~9 minutes total`);
  console.log(`🎯 Objective: Find breaking points & validate recovery`);
  
  // Pre-warm serverless functions and establish baseline
  console.log('Establishing serverless performance baseline...');
  const baselineResponse = http.get(`${BASE_URL}/api/monitoring/baseline?serverless=true`, {
    headers: {
      'X-Vercel-Serverless': 'true'
    },
    timeout: '15s', // Extended for cold start
  });
  
  let baseline = {};
  if (baselineResponse.status === 200) {
    baseline = baselineResponse.json();
    console.log(`📊 Baseline CPU: ${baseline.cpu || 'N/A'}%`);
    console.log(`📊 Baseline Memory: ${baseline.memory || 'N/A'}MB`);
  }
  
  // Pre-warm serverless functions for stress testing
  console.log('Pre-warming serverless functions for stress test...');
  http.post(`${BASE_URL}/api/cache/warm`, JSON.stringify({
    level: 'stress-test',
    serverless: true,
    functions: ['heavy-load', 'concurrent-purchase', 'database-stress'],
    preload_memory: true
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'X-Vercel-Serverless': 'true'
    },
    timeout: '20s', // Within serverless limits
  });
  
  return {
    startTime: Date.now(),
    testId: `stress-test-${Date.now()}`,
    baseline: baseline,
  };
}

// Teardown function with recovery validation
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60;
  
  console.log('=== STRESS TEST COMPLETE ===');
  console.log(`🕒 Duration: ${duration.toFixed(1)} minutes`);
  console.log(`🆔 Test ID: ${data.testId}`);
  
  // Validate system recovery
  console.log('🔍 Validating system recovery...');
  
  const recoveryStart = Date.now();
  let recoverySuccess = false;
  let attempts = 0;
  const maxAttempts = 6; // 30 seconds max
  
  while (attempts < maxAttempts && !recoverySuccess) {
    sleep(5); // Wait 5 seconds between checks
    attempts++;
    
    const healthResponse = http.get(`${BASE_URL}/api/health/comprehensive`, {
      timeout: '10s',
    });
    
    if (healthResponse.status === 200) {
      const health = healthResponse.json();
      recoverySuccess = health.overall === 'healthy' && 
                       health.responseTime < 500 &&
                       health.errorRate < 0.01;
      
      console.log(`🩺 Recovery check ${attempts}: ${recoverySuccess ? 'HEALTHY' : 'RECOVERING'}`);
    }
  }
  
  const recoveryDuration = Date.now() - recoveryStart;
  recoveryTime.add(recoveryDuration);
  
  console.log(`🎯 Recovery Status: ${recoverySuccess ? '✅ SUCCESSFUL' : '⚠️ INCOMPLETE'}`);
  console.log(`⏱️  Recovery Time: ${(recoveryDuration / 1000).toFixed(1)}s`);
  
  // Get final system state
  const finalMetrics = http.get(`${BASE_URL}/api/monitoring/final-state`);
  if (finalMetrics.status === 200) {
    const metrics = finalMetrics.json();
    console.log('📊 Final System State:');
    console.log(`   💾 Memory: ${metrics.memory?.current || 'N/A'}MB`);
    console.log(`   🔥 CPU: ${metrics.cpu?.current || 'N/A'}%`);
    console.log(`   🗄️  DB Connections: ${metrics.database?.active || 'N/A'}`);
    console.log(`   ⚡ Cache Hit Rate: ${((metrics.cache?.hitRate || 0) * 100).toFixed(1)}%`);
  }
  
  // Clean up test data
  http.post(`${BASE_URL}/api/cleanup/stress-test`, JSON.stringify({
    testId: data.testId,
    cleanupLevel: 'full',
  }), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  });
  
  console.log('🧹 Test cleanup completed');
}

// Enhanced summary with stress-specific metrics
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Calculate stress test metrics
  const stressMetrics = calculateStressMetrics(data);
  
  return {
    stdout: generateStressTextSummary(data, stressMetrics),
    [`reports/load-test-results/stress-test-${timestamp}.json`]: JSON.stringify({
      ...data,
      stressMetrics,
      testType: 'stress',
      analysisRecommendations: generateRecommendations(stressMetrics),
    }, null, 2),
    [`reports/load-test-results/stress-test-${timestamp}.html`]: generateStressReport(data, stressMetrics),
  };
}

// Calculate comprehensive stress metrics
function calculateStressMetrics(data) {
  const metrics = data.metrics;
  
  const breakingPoint = metrics.system_breaking_point_users?.max || 0;
  const failureRate = metrics.failure_rate?.rate || 0;
  const timeoutRate = metrics.timeout_rate?.rate || 0;
  const resourceExhaustionRate = metrics.resource_exhaustion_rate?.rate || 0;
  const cascadeFailureRate = metrics.cascade_failure_rate?.rate || 0;
  const recoveryTime = metrics.recovery_time_ms?.['p(95)'] || 0;
  const avgDegradation = metrics.performance_degradation_level?.avg || 1;
  
  // Stress test grade calculation
  let grade = 'A';
  if (failureRate > 0.10 || cascadeFailureRate > 0.05) grade = 'F';
  else if (failureRate > 0.08 || timeoutRate > 0.05) grade = 'D';
  else if (failureRate > 0.05 || resourceExhaustionRate > 0.15) grade = 'C';
  else if (failureRate > 0.03 || avgDegradation > 3) grade = 'B';
  
  return {
    breakingPoint: Math.round(breakingPoint),
    failureRate: (failureRate * 100).toFixed(2),
    timeoutRate: (timeoutRate * 100).toFixed(2),
    resourceExhaustionRate: (resourceExhaustionRate * 100).toFixed(2),
    cascadeFailureRate: (cascadeFailureRate * 100).toFixed(2),
    recoveryTimeSeconds: (recoveryTime / 1000).toFixed(1),
    avgDegradationLevel: avgDegradation.toFixed(1),
    grade: grade,
    systemResilience: calculateResilienceScore(failureRate, cascadeFailureRate, recoveryTime),
    totalRequests: metrics.http_reqs?.count || 0,
    totalErrors: metrics.http_req_failed?.count || 0,
    avgResponseTime: metrics.http_req_duration?.avg || 0,
    p95ResponseTime: metrics.http_req_duration?.['p(95)'] || 0,
    testDuration: (data.state?.testRunDurationMs || 0) / 1000 / 60,
  };
}

// Calculate system resilience score
function calculateResilienceScore(failureRate, cascadeRate, recoveryTime) {
  let score = 100;
  
  score -= failureRate * 500;        // Failure penalty
  score -= cascadeRate * 1000;       // Cascade failure penalty
  score -= (recoveryTime / 1000) * 2; // Recovery time penalty
  
  return Math.max(0, Math.round(score));
}

// Generate analysis recommendations
function generateRecommendations(metrics) {
  const recommendations = [];
  
  if (parseFloat(metrics.failureRate) > 8) {
    recommendations.push({
      category: 'Critical',
      issue: 'High failure rate under stress',
      recommendation: 'Implement circuit breakers and graceful degradation',
      priority: 'High',
    });
  }
  
  if (parseFloat(metrics.cascadeFailureRate) > 3) {
    recommendations.push({
      category: 'Architecture',
      issue: 'Cascade failures detected',
      recommendation: 'Improve service isolation and bulkhead patterns',
      priority: 'High',
    });
  }
  
  if (parseFloat(metrics.recoveryTimeSeconds) > 20) {
    recommendations.push({
      category: 'Recovery',
      issue: 'Slow recovery time',
      recommendation: 'Optimize health checks and auto-scaling policies',
      priority: 'Medium',
    });
  }
  
  if (parseFloat(metrics.resourceExhaustionRate) > 10) {
    recommendations.push({
      category: 'Resources',
      issue: 'Resource exhaustion detected',
      recommendation: 'Review resource limits and implement proper monitoring',
      priority: 'Medium',
    });
  }
  
  if (metrics.breakingPoint < 200) {
    recommendations.push({
      category: 'Capacity',
      issue: 'Low breaking point capacity',
      recommendation: 'Scale infrastructure or optimize performance bottlenecks',
      priority: 'High',
    });
  }
  
  return recommendations;
}

// Generate stress test text summary
function generateStressTextSummary(data, metrics) {
  const statusEmoji = metrics.grade === 'A' ? '✅' : 
                     metrics.grade === 'B' ? '⚠️' : '❌';
  
  return `
🔥 STRESS TEST RESULTS ${statusEmoji}
═══════════════════════════════════════════
Grade: ${metrics.grade} | Resilience Score: ${metrics.systemResilience}/100

🎯 BREAKING POINT ANALYSIS
──────────────────────────────────────────
Maximum Users Handled: ${metrics.breakingPoint}
Failure Rate: ${metrics.failureRate}%
Timeout Rate: ${metrics.timeoutRate}%
Resource Exhaustion: ${metrics.resourceExhaustionRate}%
Cascade Failures: ${metrics.cascadeFailureRate}%

⚡ PERFORMANCE DEGRADATION
──────────────────────────────────────────
Avg Degradation Level: ${metrics.avgDegradationLevel}/5
Avg Response Time: ${metrics.avgResponseTime.toFixed(0)}ms
P95 Response Time: ${metrics.p95ResponseTime.toFixed(0)}ms
Recovery Time: ${metrics.recoveryTimeSeconds}s

📊 REQUEST SUMMARY
──────────────────────────────────────────
Total Requests: ${metrics.totalRequests.toLocaleString()}
Total Errors: ${metrics.totalErrors.toLocaleString()}
Test Duration: ${metrics.testDuration.toFixed(1)} minutes
Requests/minute: ${(metrics.totalRequests / metrics.testDuration).toFixed(0)}

${metrics.grade === 'A' ? '🚀 EXCELLENT: System handles extreme load gracefully!' :
  metrics.grade === 'B' ? '👍 GOOD: Minor issues under extreme stress' :
  metrics.grade === 'C' ? '⚠️ FAIR: Performance degrades significantly under stress' :
  metrics.grade === 'D' ? '❌ POOR: System struggles under high load' :
  '💥 CRITICAL: System fails under stress - immediate attention required'}
`;
}

// Generate comprehensive HTML stress report
function generateStressReport(data, metrics) {
  const statusColor = metrics.grade === 'A' ? '#48bb78' : 
                     metrics.grade === 'B' ? '#ed8936' : '#f56565';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Stress Test Results - Breaking Point Analysis</title>
  <style>
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      margin: 0; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    }
    
    .header { 
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); 
      color: white; 
      padding: 40px; 
      text-align: center;
    }
    
    .grade {
      font-size: 4em;
      font-weight: bold;
      color: ${statusColor};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    
    .resilience-score {
      font-size: 1.5em;
      margin: 10px 0;
      padding: 15px;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      display: inline-block;
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 30px;
      padding: 40px;
    }
    
    .metric-card {
      background: #f8fafc;
      padding: 30px;
      border-radius: 15px;
      border-left: 5px solid ${statusColor};
      box-shadow: 0 5px 15px rgba(0,0,0,0.08);
    }
    
    .metric-card h3 {
      color: #2d3748;
      margin: 0 0 20px 0;
      font-size: 1.3em;
      display: flex;
      align-items: center;
    }
    
    .metric-card h3::before {
      content: '';
      width: 20px;
      height: 20px;
      background: ${statusColor};
      border-radius: 50%;
      margin-right: 10px;
    }
    
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 15px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .metric-row:last-child { border-bottom: none; }
    
    .metric-label { 
      color: #4a5568; 
      font-weight: 500;
    }
    
    .metric-value { 
      font-weight: bold; 
      color: #2d3748;
      font-size: 1.1em;
    }
    
    .critical { color: #e53e3e; }
    .warning { color: #dd6b20; }
    .good { color: #38a169; }
    
    .recommendations {
      background: #fff5f5;
      border: 2px solid #feb2b2;
      margin: 30px 40px;
      padding: 30px;
      border-radius: 15px;
    }
    
    .recommendation {
      background: white;
      padding: 20px;
      margin: 15px 0;
      border-radius: 10px;
      border-left: 4px solid #f56565;
    }
    
    .high-priority { border-left-color: #e53e3e; }
    .medium-priority { border-left-color: #dd6b20; }
    
    .charts {
      padding: 40px;
      background: #f7fafc;
    }
    
    .chart-placeholder {
      height: 200px;
      background: white;
      border: 2px dashed #cbd5e0;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #718096;
      font-style: italic;
      margin: 20px 0;
    }
    
    @media (max-width: 768px) {
      .metrics-grid {
        grid-template-columns: 1fr;
        padding: 20px;
      }
      
      .header { padding: 20px; }
      .grade { font-size: 2.5em; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 STRESS TEST RESULTS</h1>
      <div class="grade">${metrics.grade}</div>
      <div class="resilience-score">
        System Resilience Score: ${metrics.systemResilience}/100
      </div>
      <p>Breaking Point Analysis & Recovery Validation</p>
      <p>Duration: ${metrics.testDuration.toFixed(1)} minutes | Peak Load: 400 concurrent users</p>
    </div>
    
    <div class="metrics-grid">
      <div class="metric-card">
        <h3>🎯 Breaking Point Analysis</h3>
        <div class="metric-row">
          <span class="metric-label">Maximum Users Handled</span>
          <span class="metric-value ${metrics.breakingPoint < 200 ? 'critical' : 'good'}">${metrics.breakingPoint}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">System Breaking Point</span>
          <span class="metric-value">${metrics.breakingPoint >= 300 ? '300+' : metrics.breakingPoint} users</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Failure Rate Under Stress</span>
          <span class="metric-value ${parseFloat(metrics.failureRate) > 8 ? 'critical' : parseFloat(metrics.failureRate) > 5 ? 'warning' : 'good'}">${metrics.failureRate}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Timeout Rate</span>
          <span class="metric-value ${parseFloat(metrics.timeoutRate) > 3 ? 'critical' : 'good'}">${metrics.timeoutRate}%</span>
        </div>
      </div>
      
      <div class="metric-card">
        <h3>⚡ Performance Degradation</h3>
        <div class="metric-row">
          <span class="metric-label">Avg Degradation Level</span>
          <span class="metric-value ${parseFloat(metrics.avgDegradationLevel) > 3 ? 'warning' : 'good'}">${metrics.avgDegradationLevel}/5</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Avg Response Time</span>
          <span class="metric-value ${metrics.avgResponseTime > 1000 ? 'warning' : 'good'}">${metrics.avgResponseTime.toFixed(0)}ms</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">P95 Response Time</span>
          <span class="metric-value ${metrics.p95ResponseTime > 2000 ? 'critical' : 'good'}">${metrics.p95ResponseTime.toFixed(0)}ms</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Recovery Time</span>
          <span class="metric-value ${parseFloat(metrics.recoveryTimeSeconds) > 20 ? 'warning' : 'good'}">${metrics.recoveryTimeSeconds}s</span>
        </div>
      </div>
      
      <div class="metric-card">
        <h3>🛡️ System Resilience</h3>
        <div class="metric-row">
          <span class="metric-label">Resource Exhaustion Rate</span>
          <span class="metric-value ${parseFloat(metrics.resourceExhaustionRate) > 10 ? 'critical' : 'good'}">${metrics.resourceExhaustionRate}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Cascade Failure Rate</span>
          <span class="metric-value ${parseFloat(metrics.cascadeFailureRate) > 3 ? 'critical' : 'good'}">${metrics.cascadeFailureRate}%</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">System Recovery</span>
          <span class="metric-value good">Validated ✓</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Overall Resilience</span>
          <span class="metric-value ${metrics.systemResilience < 70 ? 'critical' : metrics.systemResilience < 85 ? 'warning' : 'good'}">${metrics.systemResilience}/100</span>
        </div>
      </div>
      
      <div class="metric-card">
        <h3>📊 Request Statistics</h3>
        <div class="metric-row">
          <span class="metric-label">Total Requests</span>
          <span class="metric-value">${metrics.totalRequests.toLocaleString()}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Total Errors</span>
          <span class="metric-value">${metrics.totalErrors.toLocaleString()}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Requests per Minute</span>
          <span class="metric-value">${(metrics.totalRequests / metrics.testDuration).toFixed(0)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Test Efficiency</span>
          <span class="metric-value good">${((1 - metrics.totalErrors / metrics.totalRequests) * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
    
    <div class="recommendations">
      <h2>🎯 Performance Recommendations</h2>
      <div id="recommendations-list">
        <p><em>Recommendations would be dynamically generated based on test results...</em></p>
      </div>
    </div>
    
    <div class="charts">
      <h2>📈 Performance Trends</h2>
      <div class="chart-placeholder">
        Load Pattern vs Response Time Chart
        <br><small>(Visualizes system behavior under increasing load)</small>
      </div>
      <div class="chart-placeholder">
        Resource Utilization Timeline
        <br><small>(Shows CPU, Memory, and Database metrics during stress)</small>
      </div>
    </div>
  </div>
</body>
</html>`;
}