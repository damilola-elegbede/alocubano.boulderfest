import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Stress test metrics
const stressSuccessRate = new Rate('stress_success_rate');
const stressResponseTime = new Trend('stress_response_time');
const stressErrorRate = new Rate('stress_error_rate');
const systemBreakingPoint = new Gauge('system_breaking_point');
const recoveryTime = new Gauge('recovery_time_seconds');
const criticalErrors = new Counter('critical_errors');

// Stress test configuration - 2x expected peak (300 users)
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Quick ramp to moderate load
    { duration: '2m', target: 200 },   // Ramp to high load
    { duration: '2m', target: 300 },   // Reach stress level (2x peak)
    { duration: '3m', target: 300 },   // Maintain stress
    { duration: '2m', target: 50 },    // Quick drop to test recovery
    { duration: '2m', target: 75 },    // Normal load after stress
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // Relaxed thresholds for stress testing
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    stress_error_rate: ['rate<0.05'], // Allow up to 5% errors
    critical_errors: ['count<100'],   // Limit critical failures
  },
};

const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Track system state
let systemHealthy = true;
let breakingPointReached = false;
let breakingPointVUs = 0;
let recoveryStartTime = 0;

export default function() {
  const startTime = Date.now();
  
  // Aggressive request pattern for stress testing
  const operations = [
    { endpoint: '/api/tickets/create', method: 'POST', weight: 0.3 },
    { endpoint: '/api/tickets/validate', method: 'POST', weight: 0.2 },
    { endpoint: '/api/cart/add', method: 'POST', weight: 0.2 },
    { endpoint: '/pages/tickets.html', method: 'GET', weight: 0.15 },
    { endpoint: '/api/analytics/wallet-stats', method: 'GET', weight: 0.15 },
  ];
  
  // Select operation based on weight
  const random = Math.random();
  let cumulative = 0;
  let selectedOp = operations[0];
  
  for (const op of operations) {
    cumulative += op.weight;
    if (random < cumulative) {
      selectedOp = op;
      break;
    }
  }
  
  // Perform the operation
  let response;
  const headers = { 'Content-Type': 'application/json' };
  
  if (selectedOp.method === 'POST') {
    let payload = {};
    
    switch (selectedOp.endpoint) {
      case '/api/tickets/create':
        payload = {
          amount: 17500,
          source: 'tok_visa',
          sessionId: `stress_${__VU}_${Date.now()}`,
        };
        break;
      case '/api/tickets/validate':
        payload = {
          qr_code: `STRESS_QR_${__VU}_${Date.now()}`,
          device_id: `stress_device_${__VU}`,
        };
        break;
      case '/api/cart/add':
        payload = {
          ticketId: 'full-pass',
          quantity: Math.floor(Math.random() * 3) + 1,
          sessionId: `stress_${__VU}_${Date.now()}`,
        };
        break;
    }
    
    response = http.post(
      `${BASE_URL}${selectedOp.endpoint}`,
      JSON.stringify(payload),
      { headers, timeout: '5s' }
    );
  } else {
    response = http.get(`${BASE_URL}${selectedOp.endpoint}`, { timeout: '5s' });
  }
  
  const responseTime = Date.now() - startTime;
  stressResponseTime.add(responseTime);
  
  // Check response and track errors
  const success = response.status >= 200 && response.status < 400;
  stressSuccessRate.add(success ? 1 : 0);
  
  if (!success) {
    stressErrorRate.add(1);
    
    // Track critical errors (5xx, timeouts)
    if (response.status >= 500 || response.status === 0) {
      criticalErrors.add(1);
      
      // Check if system is breaking
      if (systemHealthy && __VU > 200) {
        const errorRate = criticalErrors.count / (__VU * __ITER);
        if (errorRate > 0.1) { // 10% critical error rate
          systemHealthy = false;
          breakingPointReached = true;
          breakingPointVUs = __VU;
          systemBreakingPoint.add(breakingPointVUs);
          recoveryStartTime = Date.now();
          
          console.log(`System breaking point reached at ${breakingPointVUs} VUs`);
        }
      }
    }
  }
  
  // Check system recovery
  if (!systemHealthy && __VU < 100) {
    const recentErrors = criticalErrors.count;
    sleep(1);
    const newErrors = criticalErrors.count;
    
    if (newErrors === recentErrors) {
      // No new errors in last second, system might be recovering
      systemHealthy = true;
      const recoveryDuration = (Date.now() - recoveryStartTime) / 1000;
      recoveryTime.add(recoveryDuration);
      console.log(`System recovered after ${recoveryDuration} seconds`);
    }
  }
  
  // Minimal sleep to maintain pressure
  sleep(Math.random() * 0.5);
}

// Monitor graceful degradation
export function checkGracefulDegradation(response) {
  if (response.status === 503) {
    // Service unavailable - check if graceful
    check(response, {
      'graceful error message': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.error && body.message && body.retryAfter;
      },
    });
    return true;
  }
  
  if (response.status === 429) {
    // Rate limited - expected under stress
    check(response, {
      'rate limit headers': (r) => {
        return r.headers['X-RateLimit-Limit'] && 
               r.headers['X-RateLimit-Remaining'] &&
               r.headers['X-RateLimit-Reset'];
      },
    });
    return true;
  }
  
  return false;
}

export function setup() {
  console.log('Starting stress test - pushing system to 2x expected capacity');
  console.log('Expected behavior: Some errors at peak, graceful degradation, quick recovery');
  
  return {
    testStartTime: new Date().toISOString(),
    environment: BASE_URL,
    targetStress: 300,
  };
}

export function teardown(data) {
  console.log('\n=== Stress Test Complete ===');
  console.log('Duration:', new Date() - new Date(data.testStartTime), 'ms');
  
  if (breakingPointReached) {
    console.log('Breaking point:', breakingPointVUs, 'concurrent users');
  } else {
    console.log('System handled full stress load without breaking');
  }
}

export function handleSummary(data) {
  const summary = {
    testType: 'stress-test',
    timestamp: new Date().toISOString(),
    stressLevel: '2x peak capacity (300 users)',
    results: {
      breakingPoint: breakingPointVUs || 'Not reached',
      successRate: data.metrics.stress_success_rate?.rate,
      errorRate: data.metrics.stress_error_rate?.rate,
      criticalErrors: data.metrics.critical_errors?.count,
      avgResponseTime: data.metrics.stress_response_time?.avg,
      p95ResponseTime: data.metrics.stress_response_time?.['p(95)'],
      p99ResponseTime: data.metrics.stress_response_time?.['p(99)'],
      recoveryTime: data.metrics.recovery_time_seconds?.avg,
    },
    gracefulDegradation: breakingPointVUs > 250, // Handled most of stress
    passed: data.metrics.stress_error_rate?.rate < 0.05,
  };
  
  return {
    'reports/load-test-results/stress-test-results.json': JSON.stringify(summary, null, 2),
    stdout: generateStressSummary(summary),
  };
}

function generateStressSummary(summary) {
  let text = '\n=== Stress Test Results ===\n';
  text += `Stress Level: ${summary.stressLevel}\n`;
  text += `\nSystem Performance:\n`;
  text += `  Breaking Point: ${summary.results.breakingPoint}\n`;
  text += `  Success Rate: ${(summary.results.successRate * 100).toFixed(2)}%\n`;
  text += `  Error Rate: ${(summary.results.errorRate * 100).toFixed(2)}%\n`;
  text += `  Critical Errors: ${summary.results.criticalErrors}\n`;
  text += `  Avg Response: ${summary.results.avgResponseTime?.toFixed(0)}ms\n`;
  text += `  P95 Response: ${summary.results.p95ResponseTime?.toFixed(0)}ms\n`;
  text += `  P99 Response: ${summary.results.p99ResponseTime?.toFixed(0)}ms\n`;
  text += `  Recovery Time: ${summary.results.recoveryTime?.toFixed(1)}s\n`;
  text += `\nGraceful Degradation: ${summary.gracefulDegradation ? 'YES' : 'NO'}\n`;
  text += `Test Result: ${summary.passed ? 'PASSED' : 'FAILED'}\n`;
  
  return text;
}