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

// Custom metrics for detailed analysis
const ticketPurchaseRate = new Rate('ticket_purchase_success');
const paymentProcessingTime = new Trend('payment_processing_duration');
const cartOperationTime = new Trend('cart_operation_duration');
const checkoutCompletionRate = new Rate('checkout_completion');
const apiErrorRate = new Rate('api_errors');
const purchaseAbandonment = new Counter('purchase_abandonment');
const activeUsers = new Gauge('active_users');

// Test configuration with realistic load patterns
export let options = {
  stages: [
    { duration: '2m', target: 30 },   // Gradual ramp up
    { duration: '3m', target: 150 },  // Ramp to peak load
    { duration: '5m', target: 150 },  // Sustain peak load
    { duration: '2m', target: 0 },    // Gradual ramp down
  ],
  thresholds: {
    // Response time requirements
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{name:payment}': ['p(95)<200'],
    'http_req_duration{name:cart}': ['p(95)<100'],
    
    // Error rate requirements
    'http_req_failed': ['rate<0.01'],
    'api_errors': ['rate<0.01'],
    
    // Business metrics
    'ticket_purchase_success': ['rate>0.95'],
    'checkout_completion': ['rate>0.90'],
    'payment_processing_duration': ['avg<200', 'p(95)<500'],
  },
  tags: {
    testType: 'ticket-sales',
    environment: __ENV.TEST_ENV || 'staging',
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

// Main test scenario - simulates complete user journey
export default function() {
  const userData = generateUserData();
  const userProfile = randomItem(testData.userProfiles);
  
  activeUsers.add(1);
  
  group('Ticket Purchase Journey', () => {
    let sessionToken = null;
    let cartId = null;
    let selectedTickets = [];
    
    // Step 1: Landing page and initial browse
    group('Browse Tickets', () => {
      const browseStart = Date.now();
      
      // Load main page
      let response = http.get(`${BASE_URL}/tickets`, {
        tags: { name: 'browse' },
      });
      
      check(response, {
        'tickets page loaded': (r) => r.status === 200,
        'page load time acceptable': (r) => r.timings.duration < 1000,
      });
      
      if (response.status !== 200) {
        apiErrorRate.add(1);
        purchaseAbandonment.add(1);
        return;
      }
      
      // Simulate user browsing time
      sleep(randomIntBetween(...userProfile.browseTime));
      
      // Get available tickets
      response = http.get(`${BASE_URL}/api/tickets/availability`, {
        tags: { name: 'availability' },
      });
      
      check(response, {
        'ticket availability fetched': (r) => r.status === 200,
        'tickets available': (r) => r.json('available') === true,
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
      
      // Create cart session
      let response = http.post(
        `${BASE_URL}/api/cart/create`,
        JSON.stringify({ sessionId: `session_${__VU}_${Date.now()}` }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'cart' },
        }
      );
      
      check(response, {
        'cart created': (r) => r.status === 201,
        'cart ID received': (r) => r.json('cartId') !== undefined,
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
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`,
            },
            tags: { name: 'cart' },
          }
        );
        
        check(response, {
          'ticket added to cart': (r) => r.status === 200,
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
      
      check(response, {
        'checkout initialized': (r) => r.status === 200,
        'payment intent created': (r) => r.json('paymentIntentId') !== undefined,
      });
      
      if (response.status !== 200) {
        apiErrorRate.add(1);
        purchaseAbandonment.add(1);
        return;
      }
      
      const paymentIntentId = response.json('paymentIntentId');
      
      // Simulate entering payment information
      sleep(randomIntBetween(15, 30));
      
      // Process payment
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
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          tags: { name: 'payment' },
          timeout: '30s',
        }
      );
      
      const paymentDuration = Date.now() - paymentStart;
      paymentProcessingTime.add(paymentDuration);
      
      const paymentSuccess = check(response, {
        'payment processed': (r) => r.status === 200,
        'payment confirmed': (r) => r.json('status') === 'succeeded',
        'order ID received': (r) => r.json('orderId') !== undefined,
      });
      
      if (paymentSuccess) {
        ticketPurchaseRate.add(1);
        checkoutCompletionRate.add(1);
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
      // View confirmation page
      const response = http.get(
        `${BASE_URL}/api/orders/${cartId}/confirmation`,
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
          tags: { name: 'confirmation' },
        }
      );
      
      check(response, {
        'confirmation received': (r) => r.status === 200,
        'tickets attached': (r) => r.json('tickets') !== undefined,
        'QR codes generated': (r) => r.json('tickets[0].qrCode') !== undefined,
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
  const response = http.get(`${BASE_URL}/api/health`);
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

// Helper function for text summary
function textSummary(data, options) {
  // K6 will provide this function
  return JSON.stringify(data.metrics, null, 2);
}

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