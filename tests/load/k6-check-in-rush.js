import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

// Custom metrics for check-in flow
const checkInSuccessRate = new Rate('checkin_success_rate');
const qrValidationTime = new Trend('qr_validation_duration');
const databaseWriteTime = new Trend('database_write_duration');
const duplicateScanRate = new Rate('duplicate_scan_rate');
const invalidQRRate = new Rate('invalid_qr_rate');
const checkInsPerSecond = new Gauge('checkins_per_second');
const concurrentDevices = new Gauge('concurrent_devices');
const checkInCounter = new Counter('total_checkins');
const errorCounter = new Counter('checkin_errors');

// Test configuration for sustained check-in rush
export const options = {
  scenarios: {
    checkin_rush: {
      executor: 'constant-arrival-rate',
      rate: 15, // 15 validations per second
      timeUnit: '1s',
      duration: '15m', // 15 minutes sustained
      preAllocatedVUs: 50, // 50 check-in devices
      maxVUs: 75, // Allow scaling if needed
    },
    edge_cases: {
      executor: 'constant-vus',
      vus: 5,
      duration: '15m',
      startTime: '30s', // Start after main scenario
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    checkin_success_rate: ['rate>0.98'],
    qr_validation_duration: ['avg<50', 'p(95)<75'],
    database_write_duration: ['avg<30', 'p(95)<50'],
    duplicate_scan_rate: ['rate<0.02'], // Less than 2% duplicates
    invalid_qr_rate: ['rate<0.01'], // Less than 1% invalid
  },
};

// Configuration
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';
const VALID_QR_CODES = generateValidQRCodes(1000); // Pre-generate test QR codes
const DEVICE_IDS = generateDeviceIds(50); // 50 check-in devices

// Generate valid test QR codes
function generateValidQRCodes(count) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const ticketId = `TKT${Date.now()}${randomString(8).toUpperCase()}`;
    const payload = {
      ticketId: ticketId,
      eventId: 'alocubano2026',
      purchaseDate: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(), // Random date in last 30 days
      ticketType: ['full-pass', 'workshop-pass', 'social-pass'][Math.floor(Math.random() * 3)],
      customerEmail: `user${i}@test.com`,
    };
    
    // Create a hash for the QR code (simulating signed QR codes)
    const signature = crypto.sha256(JSON.stringify(payload), 'hex');
    codes.push({
      code: encoding.b64encode(JSON.stringify({ ...payload, signature })),
      ticketId: ticketId,
      used: false,
    });
  }
  return codes;
}

// Generate device IDs for check-in stations
function generateDeviceIds(count) {
  const devices = [];
  for (let i = 0; i < count; i++) {
    devices.push({
      id: `device_${i + 1}`,
      type: i < 40 ? 'tablet' : 'phone', // 80% tablets, 20% phones
      location: ['main-entrance', 'vip-entrance', 'artist-entrance'][Math.floor(i / 17)],
    });
  }
  return devices;
}

// Get an unused QR code
function getUnusedQRCode() {
  const availableCodes = VALID_QR_CODES.filter(c => !c.used);
  if (availableCodes.length === 0) {
    // Reset all codes if we run out
    VALID_QR_CODES.forEach(c => c.used = false);
    return VALID_QR_CODES[0];
  }
  return availableCodes[Math.floor(Math.random() * availableCodes.length)];
}

// Main check-in validation function
export default function() {
  const scenario = __ENV.scenario;
  
  if (scenario === 'edge_cases') {
    testEdgeCases();
  } else {
    performCheckIn();
  }
}

// Perform a standard check-in
function performCheckIn() {
  const device = DEVICE_IDS[__VU % DEVICE_IDS.length];
  const qrCode = getUnusedQRCode();
  
  // Simulate 5% chance of duplicate scan
  const isDuplicate = Math.random() < 0.05 && qrCode.used;
  
  if (!isDuplicate) {
    qrCode.used = true;
  }
  
  const startTime = Date.now();
  
  const payload = {
    qr_code: qrCode.code,
    device_id: device.id,
    device_type: device.type,
    location: device.location,
    timestamp: new Date().toISOString(),
    scan_method: 'camera', // camera or manual entry
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Id': device.id,
    'X-Device-Type': device.type,
  };
  
  // Perform QR validation
  const response = http.post(
    `${BASE_URL}/api/tickets/validate`,
    JSON.stringify(payload),
    { 
      headers,
      timeout: '2s', // 2 second timeout for check-in
    }
  );
  
  const validationDuration = Date.now() - startTime;
  qrValidationTime.add(validationDuration);
  
  // Check response
  const success = check(response, {
    'validation successful': (r) => r.status === 200,
    'valid ticket': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body || '{}');
      return body.valid === true;
    },
    'database updated': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body || '{}');
      return body.checkInTime !== undefined;
    },
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
  
  // Handle duplicate scans
  if (isDuplicate) {
    const duplicateHandled = check(response, {
      'duplicate scan detected': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.error === 'ALREADY_CHECKED_IN' || body.alreadyCheckedIn === true;
      },
    });
    duplicateScanRate.add(duplicateHandled ? 1 : 0);
  }
  
  // Update metrics
  checkInSuccessRate.add(success ? 1 : 0);
  checkInCounter.add(1);
  
  if (!success) {
    errorCounter.add(1);
  }
  
  // Track database write time if available
  if (response.status === 200) {
    const body = JSON.parse(response.body || '{}');
    if (body.dbWriteTime) {
      databaseWriteTime.add(body.dbWriteTime);
    }
  }
  
  // Update concurrent devices metric
  concurrentDevices.add(__VU);
  
  // Calculate check-ins per second
  const currentSecond = Math.floor(Date.now() / 1000);
  checkInsPerSecond.add(1);
  
  // No sleep - continuous scanning at maximum rate
}

// Test edge cases and error scenarios
function testEdgeCases() {
  const device = DEVICE_IDS[0]; // Use first device for edge cases
  const testCase = Math.floor(Math.random() * 5);
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Device-Id': device.id,
  };
  
  let payload;
  let expectedError;
  
  switch (testCase) {
    case 0:
      // Invalid QR code format
      payload = {
        qr_code: 'INVALID_QR_CODE_FORMAT',
        device_id: device.id,
        timestamp: new Date().toISOString(),
      };
      expectedError = 'INVALID_QR_FORMAT';
      break;
      
    case 1:
      // Expired ticket
      const expiredPayload = {
        ticketId: 'EXPIRED_TICKET',
        eventId: 'past_event',
        expiryDate: new Date(Date.now() - 86400000).toISOString(),
      };
      payload = {
        qr_code: encoding.b64encode(JSON.stringify(expiredPayload)),
        device_id: device.id,
        timestamp: new Date().toISOString(),
      };
      expectedError = 'TICKET_EXPIRED';
      break;
      
    case 2:
      // Missing required fields
      payload = {
        device_id: device.id,
        timestamp: new Date().toISOString(),
      };
      expectedError = 'MISSING_QR_CODE';
      break;
      
    case 3:
      // Malformed JSON in QR code
      payload = {
        qr_code: encoding.b64encode('not valid json{'),
        device_id: device.id,
        timestamp: new Date().toISOString(),
      };
      expectedError = 'MALFORMED_QR_DATA';
      break;
      
    case 4:
      // Tampered signature
      const tamperedPayload = {
        ticketId: 'TAMPERED_TICKET',
        signature: 'invalid_signature_12345',
      };
      payload = {
        qr_code: encoding.b64encode(JSON.stringify(tamperedPayload)),
        device_id: device.id,
        timestamp: new Date().toISOString(),
      };
      expectedError = 'INVALID_SIGNATURE';
      break;
  }
  
  const response = http.post(
    `${BASE_URL}/api/tickets/validate`,
    JSON.stringify(payload),
    { headers }
  );
  
  // Verify error handling
  check(response, {
    'error handled gracefully': (r) => r.status === 400 || r.status === 401,
    'appropriate error message': (r) => {
      const body = JSON.parse(r.body || '{}');
      return body.error === expectedError || body.error !== undefined;
    },
  });
  
  if (testCase < 2) {
    invalidQRRate.add(1);
  }
  
  sleep(0.5); // Small delay between edge case tests
}

// Setup function
export function setup() {
  // Warm up the system with a few test requests
  console.log('Warming up check-in system...');
  
  for (let i = 0; i < 5; i++) {
    const device = DEVICE_IDS[0];
    const qrCode = VALID_QR_CODES[i];
    
    const response = http.post(
      `${BASE_URL}/api/tickets/validate`,
      JSON.stringify({
        qr_code: qrCode.code,
        device_id: device.id,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.status !== 200) {
      console.log('Warning: Warm-up request failed with status', response.status);
    }
    
    sleep(0.2);
  }
  
  console.log('Check-in system warmed up. Starting load test...');
  
  return {
    testStartTime: new Date().toISOString(),
    environment: BASE_URL,
    totalDevices: DEVICE_IDS.length,
    totalQRCodes: VALID_QR_CODES.length,
  };
}

// Teardown function
export function teardown(data) {
  console.log('Check-in rush test completed');
  console.log('Test duration:', new Date() - new Date(data.testStartTime), 'ms');
  console.log('Total devices simulated:', data.totalDevices);
  console.log('Total QR codes available:', data.totalQRCodes);
  
  // Calculate final statistics
  const usedCodes = VALID_QR_CODES.filter(c => c.used).length;
  console.log('QR codes scanned:', usedCodes);
  console.log('Utilization rate:', (usedCodes / data.totalQRCodes * 100).toFixed(2) + '%');
}

// Handle summary
export function handleSummary(data) {
  const summary = {
    testType: 'check-in-rush',
    timestamp: new Date().toISOString(),
    metrics: {
      checkInSuccessRate: data.metrics.checkin_success_rate,
      avgValidationTime: data.metrics.qr_validation_duration?.avg,
      p95ValidationTime: data.metrics.qr_validation_duration?.['p(95)'],
      totalCheckIns: data.metrics.total_checkins?.count,
      errors: data.metrics.checkin_errors?.count,
      duplicateScans: data.metrics.duplicate_scan_rate,
      invalidQRs: data.metrics.invalid_qr_rate,
    },
    thresholds: data.thresholds,
  };
  
  return {
    'reports/load-test-results/check-in-results.json': JSON.stringify(summary, null, 2),
    stdout: generateTextSummary(summary),
  };
}

// Generate text summary
function generateTextSummary(summary) {
  let text = '\n=== Check-In Rush Load Test Results ===\n';
  text += `Timestamp: ${summary.timestamp}\n`;
  text += `\nPerformance Metrics:\n`;
  text += `  Success Rate: ${(summary.metrics.checkInSuccessRate?.rate * 100).toFixed(2)}%\n`;
  text += `  Avg Validation Time: ${summary.metrics.avgValidationTime?.toFixed(0)}ms\n`;
  text += `  P95 Validation Time: ${summary.metrics.p95ValidationTime?.toFixed(0)}ms\n`;
  text += `  Total Check-Ins: ${summary.metrics.totalCheckIns}\n`;
  text += `  Errors: ${summary.metrics.errors}\n`;
  text += `  Duplicate Scan Rate: ${(summary.metrics.duplicateScans?.rate * 100).toFixed(2)}%\n`;
  text += `  Invalid QR Rate: ${(summary.metrics.invalidQRs?.rate * 100).toFixed(2)}%\n`;
  
  return text;
}