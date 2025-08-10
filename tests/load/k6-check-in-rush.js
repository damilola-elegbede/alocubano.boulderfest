/**
 * K6 Load Test - Check-in Rush QR Validation
 * 
 * This test simulates the high-frequency QR code validation during event check-in
 * periods with realistic mobile device behavior patterns and network conditions.
 * 
 * Test Scenarios:
 * - 50 concurrent check-in devices (staff tablets/phones)
 * - Sustain 15 QR validations per second for 15 minutes
 * - Include duplicate scans and invalid QR codes
 * - Test offline/online synchronization patterns
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

// Custom metrics for check-in performance
const checkInSuccessRate = new Rate('checkin_success_rate');
const qrValidationTime = new Trend('qr_validation_duration');
const databaseWriteTime = new Trend('database_write_duration');
const duplicateScanRate = new Rate('duplicate_scan_rate');
const invalidQRRate = new Rate('invalid_qr_rate');
const concurrentValidations = new Gauge('concurrent_validations');
const offlineSyncTime = new Trend('offline_sync_duration');
const devicePerformance = new Trend('device_response_time');

// Test configuration for sustained high-frequency validation
export let options = {
  scenarios: {
    // Main check-in rush scenario
    checkin_rush: {
      executor: 'constant-arrival-rate',
      rate: 15, // 15 validations per second
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: 50,
      maxVUs: 75,
      tags: { scenario: 'checkin_rush' },
    },
    
    // Duplicate scan testing
    duplicate_scans: {
      executor: 'constant-vus',
      vus: 5,
      duration: '15m',
      startTime: '30s', // Start after main scenario
      tags: { scenario: 'duplicate_testing' },
    },
    
    // Network failure simulation
    network_issues: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 0 },
        { duration: '2m', target: 10 }, // Simulate network issues
        { duration: '3m', target: 0 },
        { duration: '5m', target: 0 },
      ],
      tags: { scenario: 'network_simulation' },
    },
  },
  
  thresholds: {
    // Response time requirements for check-in
    'http_req_duration{scenario:checkin_rush}': ['p(95)<100', 'p(99)<200'],
    'qr_validation_duration': ['avg<50', 'p(95)<100'],
    'database_write_duration': ['avg<30', 'p(95)<50'],
    
    // Success rate requirements
    'checkin_success_rate': ['rate>0.98'],
    'duplicate_scan_rate': ['rate<0.05'],
    'invalid_qr_rate': ['rate<0.02'],
    
    // Error handling
    'http_req_failed{scenario:checkin_rush}': ['rate<0.01'],
    
    // Device performance
    'device_response_time': ['avg<150', 'p(95)<300'],
  },
  
  tags: {
    testType: 'check-in-validation',
    environment: __ENV.TEST_ENV || 'staging',
  },
};

// Base URL configuration
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Test data for realistic QR code simulation
const testData = {
  // Pre-generated valid ticket IDs for testing
  validTickets: generateValidTickets(1000),
  
  // Device types and their characteristics
  deviceTypes: [
    { type: 'ipad_pro', scanSpeed: 0.5, networkLatency: 20 },
    { type: 'android_tablet', scanSpeed: 0.7, networkLatency: 30 },
    { type: 'iphone_14', scanSpeed: 0.3, networkLatency: 25 },
    { type: 'budget_android', scanSpeed: 1.0, networkLatency: 50 },
  ],
  
  // Network conditions
  networkConditions: [
    { type: 'excellent', latency: 10, packetLoss: 0 },
    { type: 'good', latency: 30, packetLoss: 0.001 },
    { type: 'fair', latency: 100, packetLoss: 0.01 },
    { type: 'poor', latency: 500, packetLoss: 0.05 },
  ],
  
  // Check-in locations
  locations: [
    { id: 'main_entrance', name: 'Main Entrance' },
    { id: 'vip_entrance', name: 'VIP Entrance' },
    { id: 'artist_entrance', name: 'Artist Entrance' },
    { id: 'workshop_room', name: 'Workshop Room' },
  ],
};

// Generate valid test tickets
function generateValidTickets(count) {
  const tickets = [];
  for (let i = 0; i < count; i++) {
    tickets.push({
      ticketId: `TEST-${Date.now()}-${i}`,
      qrCode: generateQRCode(`TEST-${Date.now()}-${i}`),
      type: randomItem(['general', 'vip', 'workshop', 'full']),
      status: 'valid',
    });
  }
  return tickets;
}

// Generate QR code data
function generateQRCode(ticketId) {
  const data = {
    id: ticketId,
    event: 'alocubano-2026',
    timestamp: Date.now(),
    signature: crypto.sha256(ticketId + 'secret', 'hex'),
  };
  return encoding.b64encode(JSON.stringify(data));
}

// Parse QR code data
function parseQRCode(qrCode) {
  try {
    const decoded = encoding.b64decode(qrCode, 'utf8');
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

// Device authentication simulation
function authenticateDevice(deviceId) {
  const response = http.post(
    `${BASE_URL}/api/checkin/device/auth`,
    JSON.stringify({
      deviceId: deviceId,
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'device_auth' },
    }
  );
  
  if (response.status === 200) {
    return response.json('token');
  }
  return null;
}

// Main check-in validation scenario
export default function() {
  const scenario = __ENV.scenario || 'checkin_rush';
  
  if (scenario === 'checkin_rush') {
    performCheckInValidation();
  } else if (scenario === 'duplicate_testing') {
    performDuplicateTesting();
  } else if (scenario === 'network_simulation') {
    simulateNetworkIssues();
  }
}

// Perform QR code validation
function performCheckInValidation() {
  const deviceId = `device_${__VU}`;
  const device = randomItem(testData.deviceTypes);
  const location = randomItem(testData.locations);
  const networkCondition = randomItem(testData.networkConditions);
  
  // Track concurrent validations
  concurrentValidations.add(1);
  
  group('QR Code Validation', () => {
    // Select a ticket to validate
    const ticket = randomItem(testData.validTickets);
    const isInvalid = Math.random() < 0.01; // 1% invalid QR codes
    const isDuplicate = Math.random() < 0.03; // 3% duplicate scans
    
    // Prepare QR code data
    let qrCode = ticket.qrCode;
    if (isInvalid) {
      qrCode = 'INVALID_' + qrCode;
    }
    
    // Simulate device scan time
    sleep(device.scanSpeed);
    
    // Start validation timing
    const validationStart = Date.now();
    
    // Perform validation request
    const response = http.post(
      `${BASE_URL}/api/tickets/validate`,
      JSON.stringify({
        qr_code: qrCode,
        device_id: deviceId,
        location_id: location.id,
        timestamp: new Date().toISOString(),
        is_duplicate_attempt: isDuplicate,
        network_latency: networkCondition.latency,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Type': device.type,
          'X-Network-Condition': networkCondition.type,
        },
        tags: { 
          name: 'qr_validation',
          device: device.type,
          location: location.id,
        },
        timeout: '5s',
      }
    );
    
    const validationDuration = Date.now() - validationStart;
    qrValidationTime.add(validationDuration);
    devicePerformance.add(validationDuration + device.networkLatency);
    
    // Check validation results
    const validationSuccess = check(response, {
      'validation completed': (r) => r.status === 200 || r.status === 409,
      'response time acceptable': (r) => r.timings.duration < 200,
    });
    
    if (response.status === 200) {
      checkInSuccessRate.add(1);
      
      // Parse response for detailed checks
      const result = response.json();
      check(result, {
        'ticket validated': (r) => r.valid === true,
        'check-in recorded': (r) => r.checkedIn === true,
        'timestamp recorded': (r) => r.checkInTime !== undefined,
      });
      
      // Track database write time from response
      if (result.dbWriteTime) {
        databaseWriteTime.add(result.dbWriteTime);
      }
    } else if (response.status === 409) {
      // Duplicate scan
      duplicateScanRate.add(1);
      checkInSuccessRate.add(0);
    } else if (response.status === 400) {
      // Invalid QR code
      invalidQRRate.add(1);
      checkInSuccessRate.add(0);
    } else {
      checkInSuccessRate.add(0);
    }
    
    // Simulate network latency
    if (networkCondition.latency > 0) {
      sleep(networkCondition.latency / 1000);
    }
  });
  
  concurrentValidations.add(-1);
  
  // Small delay between scans (realistic staff behavior)
  sleep(randomIntBetween(0.1, 0.5));
}

// Test duplicate scan handling
function performDuplicateTesting() {
  const deviceId = `duplicate_tester_${__VU}`;
  
  group('Duplicate Scan Testing', () => {
    // Use a small set of tickets for intentional duplicates
    const testTicket = testData.validTickets[__ITER % 10];
    
    // First scan - should succeed
    let response = http.post(
      `${BASE_URL}/api/tickets/validate`,
      JSON.stringify({
        qr_code: testTicket.qrCode,
        device_id: deviceId,
        location_id: 'main_entrance',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'duplicate_first_scan' },
      }
    );
    
    const firstScanSuccess = response.status === 200;
    
    // Wait a bit
    sleep(randomIntBetween(2, 5));
    
    // Second scan - should be rejected as duplicate
    response = http.post(
      `${BASE_URL}/api/tickets/validate`,
      JSON.stringify({
        qr_code: testTicket.qrCode,
        device_id: deviceId,
        location_id: 'main_entrance',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'duplicate_second_scan' },
      }
    );
    
    check(response, {
      'duplicate detected': (r) => r.status === 409,
      'duplicate message': (r) => r.json('error')?.includes('already checked in'),
    });
    
    if (response.status === 409) {
      duplicateScanRate.add(1);
    }
  });
  
  sleep(randomIntBetween(5, 10));
}

// Simulate network issues and offline sync
function simulateNetworkIssues() {
  const deviceId = `offline_device_${__VU}`;
  const offlineQueue = [];
  
  group('Offline Sync Testing', () => {
    // Simulate collecting scans while offline
    const scanCount = randomIntBetween(5, 15);
    
    for (let i = 0; i < scanCount; i++) {
      const ticket = randomItem(testData.validTickets);
      offlineQueue.push({
        qr_code: ticket.qrCode,
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        offline: true,
      });
      
      // Simulate scan time
      sleep(randomIntBetween(1, 3));
    }
    
    // Simulate coming back online and syncing
    const syncStart = Date.now();
    
    const response = http.post(
      `${BASE_URL}/api/checkin/sync`,
      JSON.stringify({
        device_id: deviceId,
        validations: offlineQueue,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'offline_sync' },
        timeout: '30s',
      }
    );
    
    const syncDuration = Date.now() - syncStart;
    offlineSyncTime.add(syncDuration);
    
    check(response, {
      'sync completed': (r) => r.status === 200,
      'all validations processed': (r) => r.json('processed') === offlineQueue.length,
      'sync time acceptable': (r) => syncDuration < 5000,
    });
  });
  
  sleep(randomIntBetween(10, 30));
}

// Setup function
export function setup() {
  console.log('=== Check-in Rush Load Test Starting ===');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Target Rate: 15 QR validations/second`);
  console.log(`Duration: 15 minutes`);
  console.log(`Devices: 50-75 concurrent`);
  
  // Verify check-in API is ready
  const response = http.get(`${BASE_URL}/api/checkin/health`);
  if (response.status !== 200) {
    console.warn(`Check-in API health check returned: ${response.status}`);
  }
  
  return {
    startTime: Date.now(),
    testId: `checkin-rush-${Date.now()}`,
    totalDevices: 50,
  };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  
  console.log('=== Check-in Rush Load Test Complete ===');
  console.log(`Test ID: ${data.testId}`);
  console.log(`Duration: ${duration} seconds`);
  console.log(`Total Devices: ${data.totalDevices}`);
  console.log('Check-in validation metrics saved to reports');
}

// Custom summary handling
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Calculate additional metrics
  const customMetrics = {
    avgValidationTime: data.metrics.qr_validation_duration?.avg || 0,
    successRate: data.metrics.checkin_success_rate?.rate || 0,
    duplicateRate: data.metrics.duplicate_scan_rate?.rate || 0,
    totalValidations: data.metrics.iterations?.count || 0,
    validationsPerSecond: (data.metrics.iterations?.count || 0) / ((data.state?.testRunDurationMs || 1) / 1000),
  };
  
  return {
    // Console output
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    
    // JSON report
    [`reports/load-test-results/check-in-${timestamp}.json`]: JSON.stringify({
      ...data,
      customMetrics,
    }, null, 2),
    
    // HTML report
    [`reports/load-test-results/check-in-${timestamp}.html`]: generateHTMLReport(data, customMetrics),
  };
}

// Generate HTML report
function generateHTMLReport(data, customMetrics) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Check-in Rush Load Test Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .metric-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #2c3e50; }
        .metric-label { color: #7f8c8d; margin-top: 5px; }
        .success { color: #27ae60; }
        .warning { color: #f39c12; }
        .error { color: #e74c3c; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Check-in Rush Load Test Report</h1>
        <p>Test completed at ${new Date().toISOString()}</p>
      </div>
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value ${customMetrics.successRate > 0.98 ? 'success' : 'error'}">
            ${(customMetrics.successRate * 100).toFixed(2)}%
          </div>
          <div class="metric-label">Check-in Success Rate</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${customMetrics.avgValidationTime.toFixed(0)}ms</div>
          <div class="metric-label">Average Validation Time</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${customMetrics.validationsPerSecond.toFixed(1)}/s</div>
          <div class="metric-label">Validations Per Second</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value">${customMetrics.totalValidations}</div>
          <div class="metric-label">Total Validations</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-value ${customMetrics.duplicateRate < 0.05 ? 'success' : 'warning'}">
            ${(customMetrics.duplicateRate * 100).toFixed(2)}%
          </div>
          <div class="metric-label">Duplicate Scan Rate</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Helper for text summary
function textSummary(data, options) {
  return JSON.stringify(data.metrics, null, 2);
}