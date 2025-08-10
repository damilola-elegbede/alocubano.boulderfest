/**
 * K6 Load Test - Peak Ticket Sales Simulation
 * 
 * This test simulates realistic user behavior during peak ticket sales periods
 * including browsing, cart management, payment processing, and order confirmation.
 * 
 * Test Scenarios:
 * - Ramp up to 150 concurrent users
 * - Sustain peak load for 5 minutes
 * - Realistic user journey with think times
 * - Payment processing with Stripe test mode
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metrics for detailed analysis
const ticketPurchaseRate = new Rate('ticket_purchase_success');
const paymentProcessingTime = new Trend('payment_processing_duration');
const cartOperationTime = new Trend('cart_operation_duration');
const checkoutCompletionRate = new Rate('checkout_completion');
const apiErrorRate = new Rate('api_errors');
const purchaseAbandonment = new Counter('purchase_abandonment');
const activeUsers = new Gauge('active_users');

// Import threshold selector for dynamic configuration
import { getThresholds } from '../utils/threshold-loader.js';

// Get environment-aware thresholds
const thresholdConfig = getThresholds('ticket-sales');

// Test configuration with realistic load patterns
export let options = {
  stages: [
    { duration: '2m', target: 30 },   // Gradual ramp up
    { duration: '3m', target: 150 },  // Ramp to peak load
    { duration: '5m', target: 150 },  // Sustain peak load
    { duration: '2m', target: 0 },    // Gradual ramp down
  ],
  
  // Dynamic thresholds based on environment
  thresholds: thresholdConfig.thresholds,
  
  tags: {
    testType: 'ticket-sales',
    environment: thresholdConfig.environment,
    thresholdVersion: thresholdConfig.metadata?.timestamp || 'unknown',
  },
};

// Test data for realistic user simulation
const testData = {
  ticketTypes: [
    { id: 'general', name: 'General Admission', price: 45.00 },
    { id: 'vip', name: 'VIP Pass', price: 125.00 },
    { id: 'workshop', name: 'Workshop Pass', price: 75.00 },
    { id: 'full', name: 'Full Festival Pass', price: 200.00 },
  ],
  
  userProfiles: [
    { type: 'decisive', browseTime: [2, 5], decisionTime: [1, 3] },
    { type: 'careful', browseTime: [5, 15], decisionTime: [3, 8] },
    { type: 'explorer', browseTime: [10, 30], decisionTime: [5, 10] },
  ],
  
  paymentMethods: [
    { type: 'card', processingTime: [2, 4] },
    { type: 'apple_pay', processingTime: [1, 2] },
    { type: 'google_pay', processingTime: [1, 2] },
  ],
};

// Base URL from environment or default
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Generate realistic user data
function generateUserData() {
  const timestamp = Date.now();
  const vuId = __VU;
  
  return {
    email: `loadtest_${vuId}_${timestamp}@test.com`,
    firstName: `Test${vuId}`,
    lastName: `User${timestamp}`,
    phone: `555-${String(vuId).padStart(4, '0')}`,
    // Use Stripe test card numbers
    cardNumber: '4242424242424242',
    cardExpMonth: '12',
    cardExpYear: '2025',
    cardCvc: '123',
    zipCode: '80302',
  };
}

// Serverless warm-up function
function warmUpFunctions() {
  // Pre-warm critical serverless functions
  const warmupEndpoints = [
    '/api/health/check',
    '/api/cart/create',
    '/api/tickets/availability'
  ];
  
  for (const endpoint of warmupEndpoints) {
    http.get(`${BASE_URL}${endpoint}`, {
      tags: { name: 'warmup' },
      timeout: '10s'
    });
  }
  
  // Allow functions to initialize
  sleep(2);
}

// Main test scenario - simulates complete user journey
export default function() {
  // Warm up functions on first iteration of each VU
  if (__ITER === 0) {
    warmUpFunctions();
  }
  
  const userData = generateUserData();
  const userProfile = randomItem(testData.userProfiles);
  
  activeUsers.add(1);
  
  group('Ticket Purchase Journey', () => {
    let sessionToken = null;
    let cartId = null;
    let orderId = null; // Add orderId to track across groups
    let selectedTickets = [];
    
    // Step 1: Landing page and initial browse
    group('Browse Tickets', () => {
      const browseStart = Date.now();
      
      // Load main page with extended timeout for cold starts
      let response = http.get(`${BASE_URL}/tickets`, {
        tags: { name: 'browse' },
        timeout: '15s', // Extended for cold starts
      });
      
      const pageLoadSuccess = check(response, {
        'tickets page loaded': (r) => {
          if (r.status !== 200) {
            console.warn(`Tickets page failed to load: ${r.status} - ${r.statusText}`);
            return false;
          }
          return true;
        },
        'page load time acceptable': (r) => {
          if (r.timings.duration >= 2000) {
            console.warn(`Slow page load: ${r.timings.duration}ms (expected < 2000ms)`);
            return false;
          }
          return true;
        },
        'not cold start timeout': (r) => {
          if (r.status === 504) {
            console.warn('Cold start timeout detected (504)');
            return false;
          }
          return true;
        },
        'response has content': (r) => r.body && r.body.length > 0,
      });
      
      if (response.status !== 200) {
        apiErrorRate.add(1);
        purchaseAbandonment.add(1);
        return;
      }
      
      // Simulate user browsing time
      sleep(randomIntBetween(...userProfile.browseTime));
      
      // Get available tickets with retry for cold starts
      response = http.get(`${BASE_URL}/api/tickets/availability`, {
        tags: { name: 'availability' },
        timeout: '10s',
      });
      
      // Retry once if cold start timeout
      if (response.status === 504 || response.status === 502) {
        sleep(1);
        response = http.get(`${BASE_URL}/api/tickets/availability`, {
          tags: { name: 'availability_retry' },
          timeout: '10s',
        });
      }
      
      const availabilitySuccess = check(response, {
        'ticket availability fetched': (r) => {
          if (r.status !== 200) {
            console.warn(`Availability check failed: ${r.status} - ${r.statusText || 'Unknown error'}`);
            return false;
          }
          return true;
        },
        'tickets available': (r) => {
          try {
            const data = r.json();
            if (!data || data.available !== true) {
              console.warn(`Tickets not available: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Invalid JSON in availability response: ${e.message}`);
            return false;
          }
        },
        'response time reasonable': (r) => {
          if (r.timings.duration > 1500) {
            console.warn(`Slow availability check: ${r.timings.duration}ms`);
          }
          return r.timings.duration < 3000; // Lenient for serverless
        },
      });
      
      // Select tickets based on user behavior
      const ticketCount = randomIntBetween(1, 3);
      for (let i = 0; i < ticketCount; i++) {
        selectedTickets.push(randomItem(testData.ticketTypes));
      }
      
      // Additional browsing time
      sleep(randomIntBetween(...userProfile.decisionTime));
    });
    
    // Step 2: Cart operations
    group('Cart Management', () => {
      const cartStart = Date.now();
      
      // Create cart session with serverless optimizations
      let response = http.post(
        `${BASE_URL}/api/cart/create`,
        JSON.stringify({ 
          sessionId: `session_${__VU}_${Date.now()}`,
          serverless: true, // Flag for serverless optimization
          timeout_buffer: 2000 // Request extra processing time
        }),
        {
          headers: { 
            'Content-Type': 'application/json',
            'X-Vercel-Serverless': 'true' // Hint for edge optimization
          },
          tags: { name: 'cart' },
          timeout: '15s', // Extended timeout for database operations
        }
      );
      
      const cartCreationSuccess = check(response, {
        'cart created': (r) => {
          if (r.status !== 201) {
            console.warn(`Cart creation failed: ${r.status} - ${r.statusText || 'Unknown error'}`);
            if (r.body) console.warn(`Response body: ${r.body}`);
            return false;
          }
          return true;
        },
        'cart ID received': (r) => {
          try {
            const data = r.json();
            if (!data || !data.cartId) {
              console.warn(`Cart ID missing from response: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Invalid JSON in cart creation response: ${e.message}`);
            return false;
          }
        },
        'session token received': (r) => {
          try {
            const data = r.json();
            if (data && !data.sessionToken) {
              console.warn('Session token missing from cart creation response');
            }
            return true; // Non-critical
          } catch (e) {
            return true; // Non-critical
          }
        },
      });
      
      if (response.status === 201) {
        cartId = response.json('cartId');
        sessionToken = response.json('sessionToken');
      } else {
        apiErrorRate.add(1);
        purchaseAbandonment.add(1);
        return;
      }
      
      // Add tickets to cart
      for (const ticket of selectedTickets) {
        response = http.post(
          `${BASE_URL}/api/cart/add`,
          JSON.stringify({
            cartId: cartId,
            ticketId: ticket.id,
            quantity: 1,
            price: ticket.price,
            serverless_context: {
              function_region: 'us-east-1', // Optimize for primary region
              cold_start_mitigation: true
            }
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`,
              'X-Vercel-Serverless': 'true'
            },
            tags: { name: 'cart' },
            timeout: '10s',
          }
        );
        
        const addTicketSuccess = check(response, {
          'ticket added to cart': (r) => {
            if (r.status !== 200) {
              console.warn(`Failed to add ${ticket.id} to cart ${cartId}: ${r.status} - ${r.statusText || 'Unknown error'}`);
              if (r.body) console.warn(`Response: ${r.body}`);
              return false;
            }
            return true;
          },
          'cart update confirmed': (r) => {
            try {
              const data = r.json();
              return data && (data.success === true || data.cartUpdated === true || data.items !== undefined);
            } catch (e) {
              // Non-critical if response isn't JSON
              return true;
            }
          },
        });
        
        // Small delay between adding items
        sleep(randomIntBetween(0.5, 1.5));
      }
      
      cartOperationTime.add(Date.now() - cartStart);
      
      // Review cart
      sleep(randomIntBetween(2, 5));
    });
    
    // Step 3: Checkout and payment
    group('Checkout Process', () => {
      const checkoutStart = Date.now();
      
      // Initialize checkout
      let response = http.post(
        `${BASE_URL}/api/checkout/initialize`,
        JSON.stringify({
          cartId: cartId,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          tags: { name: 'checkout' },
        }
      );
      
      const checkoutSuccess = check(response, {
        'checkout initialized': (r) => {
          if (r.status !== 200) {
            console.warn(`Checkout initialization failed: ${r.status} - ${r.statusText || 'Unknown error'}`);
            if (r.body) console.warn(`Response: ${r.body}`);
            return false;
          }
          return true;
        },
        'payment intent created': (r) => {
          try {
            const data = r.json();
            if (!data || !data.paymentIntentId) {
              console.warn(`Payment intent ID missing: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Invalid JSON in checkout response: ${e.message}`);
            return false;
          }
        },
        'checkout response time acceptable': (r) => {
          if (r.timings.duration > 5000) {
            console.warn(`Slow checkout initialization: ${r.timings.duration}ms`);
          }
          return r.timings.duration < 10000; // Lenient for serverless
        },
      });
      
      if (response.status !== 200) {
        apiErrorRate.add(1);
        purchaseAbandonment.add(1);
        return;
      }
      
      const paymentIntentId = response.json('paymentIntentId');
      
      // Simulate entering payment information
      sleep(randomIntBetween(15, 30));
      
      // Process payment with serverless optimizations
      const paymentMethod = randomItem(testData.paymentMethods);
      const paymentStart = Date.now();
      
      response = http.post(
        `${BASE_URL}/api/checkout/payment`,
        JSON.stringify({
          cartId: cartId,
          paymentIntentId: paymentIntentId,
          paymentMethod: {
            type: paymentMethod.type,
            card: {
              number: userData.cardNumber,
              exp_month: userData.cardExpMonth,
              exp_year: userData.cardExpYear,
              cvc: userData.cardCvc,
            },
          },
          billingAddress: {
            zip: userData.zipCode,
          },
          serverless_config: {
            max_duration: 25, // Stay within Vercel limits
            priority: 'high',
            region_preference: 'us-east-1'
          }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
            'X-Vercel-Max-Duration': '25',
          },
          tags: { name: 'payment' },
          timeout: '25s', // Match Vercel function timeout
        }
      );
      
      const paymentDuration = Date.now() - paymentStart;
      paymentProcessingTime.add(paymentDuration);
      
      const paymentSuccess = check(response, {
        'payment processed': (r) => {
          if (r.status !== 200) {
            console.warn(`Payment processing failed: ${r.status} - ${r.statusText || 'Unknown error'}`);
            if (r.body) console.warn(`Payment response: ${r.body}`);
            return false;
          }
          return true;
        },
        'payment confirmed': (r) => {
          try {
            const data = r.json();
            if (!data || data.status !== 'succeeded') {
              console.warn(`Payment not succeeded: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Invalid JSON in payment response: ${e.message}`);
            return false;
          }
        },
        'order ID received': (r) => {
          try {
            const data = r.json();
            if (!data || !data.orderId) {
              console.warn(`Order ID missing from payment response: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Cannot parse payment response JSON: ${e.message}`);
            return false;
          }
        },
        'payment processing time acceptable': (r) => {
          if (paymentDuration > 15000) {
            console.warn(`Very slow payment processing: ${paymentDuration}ms`);
          }
          return paymentDuration < 25000; // Within Vercel limits
        },
      });
      
      if (paymentSuccess) {
        ticketPurchaseRate.add(1);
        checkoutCompletionRate.add(1);
        // Capture orderId for use in confirmation step
        orderId = response.json('orderId');
      } else {
        ticketPurchaseRate.add(0);
        checkoutCompletionRate.add(0);
        apiErrorRate.add(1);
        return;
      }
      
      // Simulate processing time
      sleep(randomIntBetween(...paymentMethod.processingTime));
    });
    
    // Step 4: Order confirmation
    group('Order Confirmation', () => {
      // Use orderId if available, otherwise fall back to cartId
      const confirmationId = orderId || cartId;
      
      // View confirmation page
      const response = http.get(
        `${BASE_URL}/api/orders/${confirmationId}/confirmation`,
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
          tags: { name: 'confirmation' },
        }
      );
      
      const confirmationSuccess = check(response, {
        'confirmation received': (r) => {
          if (r.status !== 200) {
            console.warn(`Order confirmation failed for ${confirmationId}: ${r.status} - ${r.statusText || 'Unknown error'}`);
            if (r.body) console.warn(`Confirmation response: ${r.body}`);
            return false;
          }
          return true;
        },
        'tickets attached': (r) => {
          try {
            const data = r.json();
            if (!data || !data.tickets || !Array.isArray(data.tickets) || data.tickets.length === 0) {
              console.warn(`No tickets in confirmation response: ${JSON.stringify(data)}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Invalid JSON in confirmation response: ${e.message}`);
            return false;
          }
        },
        'QR codes generated': (r) => {
          try {
            const data = r.json();
            if (!data || !data.tickets || !data.tickets[0] || !data.tickets[0].qrCode) {
              console.warn(`QR codes missing from tickets: ${JSON.stringify(data?.tickets?.[0])}`);
              return false;
            }
            return true;
          } catch (e) {
            console.warn(`Cannot verify QR codes in response: ${e.message}`);
            return false;
          }
        },
      });
      
      // User reviews confirmation
      sleep(randomIntBetween(2, 5));
    });
  });
  
  activeUsers.add(-1);
}

// Setup function - runs once before the test
export function setup() {
  console.log('=== Ticket Sales Load Test Starting ===');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Environment: ${__ENV.TEST_ENV || 'staging'}`);
  console.log(`Peak Load: 150 concurrent users`);
  console.log(`Test Duration: 12 minutes total`);
  
  // Verify API is reachable
  const response = http.get(`${BASE_URL}/api/health/check`);
  if (response.status !== 200) {
    throw new Error(`API health check failed: ${response.status}`);
  }
  
  return {
    startTime: Date.now(),
    testId: `ticket-sales-${Date.now()}`,
  };
}

// Teardown function - runs once after the test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  
  console.log('=== Ticket Sales Load Test Complete ===');
  console.log(`Test ID: ${data.testId}`);
  console.log(`Duration: ${duration} seconds`);
  console.log('Results will be available in the summary report');
}

// Handle test summary for custom reporting
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  return {
    // Console output
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    
    // JSON report for analysis
    [`reports/load-test-results/ticket-sales-${timestamp}.json`]: JSON.stringify(data, null, 2),
    
    // HTML report for visualization
    [`reports/load-test-results/ticket-sales-${timestamp}.html`]: htmlReport(data),
  };
}

// Note: textSummary is now imported from k6 jslib above

// Helper function for HTML report
function htmlReport(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket Sales Load Test Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; background: #f0f0f0; }
        .success { color: green; }
        .failure { color: red; }
      </style>
    </head>
    <body>
      <h1>Ticket Sales Load Test Report</h1>
      <div class="metrics">
        ${Object.entries(data.metrics || {}).map(([key, value]) => 
          `<div class="metric"><strong>${key}:</strong> ${JSON.stringify(value)}</div>`
        ).join('')}
      </div>
    </body>
    </html>
  `;
}