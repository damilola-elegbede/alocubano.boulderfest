import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for ticket purchase flow
const ticketPurchaseRate = new Rate('ticket_purchase_success');
const paymentProcessingTime = new Trend('payment_processing_duration');
const cartOperationTime = new Trend('cart_operation_duration');
const pageLoadTime = new Trend('page_load_duration');
const errorRate = new Rate('errors');
const purchaseCompleteCounter = new Counter('purchases_completed');
const cartAbandonedCounter = new Counter('carts_abandoned');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 30 },   // Ramp up to 30 users
    { duration: '3m', target: 150 },  // Ramp up to peak load (150 users)
    { duration: '5m', target: 150 },  // Sustain peak load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    ticket_purchase_success: ['rate>0.95'],
    payment_processing_duration: ['avg<200', 'p(95)<400'],
    errors: ['rate<0.01'],
  },
};

// Test data configuration
const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';
const STRIPE_TEST_TOKEN = 'tok_visa'; // Stripe test token

// Ticket types and prices
const TICKET_TYPES = [
  { id: 'full-pass', name: 'Full Festival Pass', price: 175 },
  { id: 'workshop-pass', name: 'Workshop Pass', price: 120 },
  { id: 'social-pass', name: 'Social Dancing Pass', price: 85 },
  { id: 'single-workshop', name: 'Single Workshop', price: 30 },
  { id: 'friday-social', name: 'Friday Night Social', price: 25 },
  { id: 'saturday-social', name: 'Saturday Night Social', price: 25 },
];

// User data generator
function generateUserData() {
  const firstName = randomItem(['Carlos', 'Maria', 'Juan', 'Sofia', 'Luis', 'Isabella', 'Diego', 'Valentina']);
  const lastName = randomItem(['Rodriguez', 'Martinez', 'Garcia', 'Lopez', 'Hernandez', 'Gonzalez', 'Perez', 'Sanchez']);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${randomString(4)}@test.com`;
  
  return {
    firstName,
    lastName,
    email,
    phone: `303-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
  };
}

// Simulate realistic think time
function thinkTime(min, max) {
  sleep(Math.random() * (max - min) + min);
}

// Main test function
export default function() {
  const user = generateUserData();
  const sessionId = `session_${__VU}_${Date.now()}`;
  
  // Initialize request headers
  const headers = {
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId,
  };

  // User journey through ticket purchase
  group('Ticket Purchase Flow', () => {
    
    // Step 1: Browse tickets page
    group('Browse Tickets', () => {
      const startTime = Date.now();
      const response = http.get(`${BASE_URL}/pages/tickets.html`, { headers });
      
      check(response, {
        'tickets page loaded': (r) => r.status === 200,
        'page load time < 1s': (r) => r.timings.duration < 1000,
      });
      
      pageLoadTime.add(Date.now() - startTime);
      thinkTime(3, 8); // User reviews ticket options
    });

    // Step 2: Select tickets and add to cart
    group('Add to Cart', () => {
      const selectedTickets = [];
      const numTickets = Math.floor(Math.random() * 3) + 1; // 1-3 tickets
      
      for (let i = 0; i < numTickets; i++) {
        const ticket = randomItem(TICKET_TYPES);
        selectedTickets.push({
          ...ticket,
          quantity: Math.floor(Math.random() * 2) + 1, // 1-2 quantity
        });
      }

      const cartStartTime = Date.now();
      
      // Add each ticket to cart
      for (const ticket of selectedTickets) {
        const cartResponse = http.post(
          `${BASE_URL}/api/cart/add`,
          JSON.stringify({
            ticketId: ticket.id,
            quantity: ticket.quantity,
            price: ticket.price,
            sessionId: sessionId,
          }),
          { headers }
        );

        check(cartResponse, {
          'ticket added to cart': (r) => r.status === 200,
          'cart updated successfully': (r) => {
            const body = JSON.parse(r.body || '{}');
            return body.success === true;
          },
        });

        thinkTime(1, 2); // Time between adding items
      }
      
      cartOperationTime.add(Date.now() - cartStartTime);
    });

    // Step 3: Proceed to checkout
    group('Checkout Process', () => {
      thinkTime(2, 5); // User reviews cart
      
      // Get cart total
      const cartResponse = http.get(`${BASE_URL}/api/cart/summary?sessionId=${sessionId}`, { headers });
      
      const cartValid = check(cartResponse, {
        'cart summary retrieved': (r) => r.status === 200,
        'cart has items': (r) => {
          const body = JSON.parse(r.body || '{}');
          return body.items && body.items.length > 0;
        },
      });

      if (!cartValid) {
        cartAbandonedCounter.add(1);
        errorRate.add(1);
        return; // Exit if cart is invalid
      }

      const cart = JSON.parse(cartResponse.body);
      thinkTime(15, 30); // User enters payment information
      
      // Step 4: Process payment
      group('Payment Processing', () => {
        const paymentStartTime = Date.now();
        
        const paymentData = {
          amount: cart.total,
          currency: 'usd',
          source: STRIPE_TEST_TOKEN,
          description: `Festival tickets for ${user.email}`,
          metadata: {
            sessionId: sessionId,
            customerEmail: user.email,
            customerName: `${user.firstName} ${user.lastName}`,
            customerPhone: user.phone,
            cartItems: JSON.stringify(cart.items),
          },
        };

        const paymentResponse = http.post(
          `${BASE_URL}/api/tickets/create`,
          JSON.stringify(paymentData),
          { headers }
        );

        const paymentDuration = Date.now() - paymentStartTime;
        paymentProcessingTime.add(paymentDuration);

        const paymentSuccess = check(paymentResponse, {
          'payment processed': (r) => r.status === 200,
          'payment successful': (r) => {
            const body = JSON.parse(r.body || '{}');
            return body.payment_status === 'succeeded';
          },
          'ticket created': (r) => {
            const body = JSON.parse(r.body || '{}');
            return body.ticketId && body.qrCode;
          },
        });

        ticketPurchaseRate.add(paymentSuccess);
        
        if (paymentSuccess) {
          purchaseCompleteCounter.add(1);
          
          // Step 5: View confirmation
          group('Confirmation', () => {
            thinkTime(2, 3); // User reviews confirmation
            
            const confirmationResponse = http.get(
              `${BASE_URL}/api/tickets/confirmation?sessionId=${sessionId}`,
              { headers }
            );
            
            check(confirmationResponse, {
              'confirmation page loaded': (r) => r.status === 200,
              'QR code generated': (r) => {
                const body = JSON.parse(r.body || '{}');
                return body.qrCode !== undefined;
              },
            });
          });
        } else {
          errorRate.add(1);
          cartAbandonedCounter.add(1);
        }
      });
    });
  });

  // Simulate different user behaviors
  const behavior = Math.random();
  if (behavior < 0.1) {
    // 10% of users abandon cart early
    cartAbandonedCounter.add(1);
    return;
  } else if (behavior < 0.15) {
    // 5% of users experience network issues
    group('Network Error Simulation', () => {
      const errorResponse = http.get(`${BASE_URL}/api/tickets/create`, {
        timeout: '1s', // Simulate timeout
      });
      
      check(errorResponse, {
        'handles timeout gracefully': (r) => r.status === 408 || r.status === 0,
      });
      
      errorRate.add(1);
    });
  }
}

// Setup function (runs once per VU)
export function setup() {
  // Verify test environment is ready
  const healthCheck = http.get(`${BASE_URL}/api/health/check`);
  
  if (healthCheck.status !== 200) {
    throw new Error('Test environment is not ready. Health check failed.');
  }
  
  return {
    testStartTime: new Date().toISOString(),
    environment: BASE_URL,
  };
}

// Teardown function (runs once after all iterations)
export function teardown(data) {
  // Generate summary report
  console.log('Test completed at:', new Date().toISOString());
  console.log('Test duration:', new Date() - new Date(data.testStartTime), 'ms');
  console.log('Environment tested:', data.environment);
}

// Handle test results
export function handleSummary(data) {
  return {
    'reports/load-test-results/ticket-sales-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Helper function for text summary
function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  let summary = '';
  
  // Add metrics summary
  if (data.metrics) {
    summary += `${indent}=== Performance Metrics ===\n`;
    summary += `${indent}Purchase Success Rate: ${(data.metrics.ticket_purchase_success.rate * 100).toFixed(2)}%\n`;
    summary += `${indent}Error Rate: ${(data.metrics.errors.rate * 100).toFixed(2)}%\n`;
    summary += `${indent}Avg Payment Processing: ${data.metrics.payment_processing_duration.avg.toFixed(0)}ms\n`;
    summary += `${indent}P95 Response Time: ${data.metrics.http_req_duration['p(95)'].toFixed(0)}ms\n`;
    summary += `${indent}Purchases Completed: ${data.metrics.purchases_completed.count}\n`;
    summary += `${indent}Carts Abandoned: ${data.metrics.carts_abandoned.count}\n`;
  }
  
  return summary;
}