import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const paymentSuccessRate = new Rate('payment_success_rate');
const paymentDuration = new Trend('payment_duration');
const checkoutDuration = new Trend('checkout_duration');
const webhookProcessingTime = new Trend('webhook_processing_time');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 50 },   // Ramp up to 50 users
    { duration: '10m', target: 100 }, // Stay at 100 users
    { duration: '5m', target: 200 },  // Spike to 200 users
    { duration: '10m', target: 100 }, // Back to 100 users
    { duration: '5m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],           // Error rate < 1%
    http_req_duration: ['p(95)<200'],         // 95% of requests < 200ms
    payment_success_rate: ['rate>0.95'],      // Payment success > 95%
    payment_duration: ['p(95)<3000'],         // 95% of payments < 3s
    checkout_duration: ['p(95)<5000'],        // 95% of checkouts < 5s
  },
  ext: {
    loadimpact: {
      projectID: 3478233,
      name: "A Lo Cubano Payment Load Test"
    }
  }
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'https://staging-alocubano.vercel.app';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testCards = [
  { number: '4242424242424242', cvc: '123', exp: '12/25' }, // Success
  { number: '4000000000003220', cvc: '123', exp: '12/25' }, // 3DS required
  { number: '5555555555554444', cvc: '123', exp: '12/25' }, // Mastercard
];

const events = [
  { id: 'boulder-fest-2026', name: 'Boulder Fest 2026' },
  { id: 'weekender-2026-09', name: 'September Weekender 2026' }
];

const ticketTypes = [
  { type: 'full_festival', price: 15000 },
  { type: 'day_pass', price: 7500 },
  { type: 'workshop_only', price: 5000 }
];

// Helper functions
function generateCustomer() {
  const id = Math.floor(Math.random() * 100000);
  return {
    email: `loadtest${id}@example.com`,
    firstName: 'Load',
    lastName: `Test${id}`,
    phone: '+13035551234'
  };
}

function selectRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Test scenarios
export default function() {
  // Scenario 1: Browse events and tickets (80% of traffic)
  if (Math.random() < 0.8) {
    browseEvents();
  }
  
  // Scenario 2: Complete checkout (15% of traffic)
  else if (Math.random() < 0.95) {
    completeCheckout();
  }
  
  // Scenario 3: Process refund (5% of traffic)
  else {
    processRefund();
  }
  
  sleep(Math.random() * 3 + 1); // Random think time
}

function browseEvents() {
  // Get event details
  const event = selectRandom(events);
  const eventRes = http.get(`${BASE_URL}/api/events/${event.id}`);
  
  check(eventRes, {
    'event details loaded': (r) => r.status === 200,
    'event has tickets': (r) => r.json('tickets') !== null
  });
  
  // Get ticket availability
  const ticketsRes = http.get(`${BASE_URL}/api/tickets/availability?event=${event.id}`);
  
  check(ticketsRes, {
    'ticket availability loaded': (r) => r.status === 200,
    'tickets available': (r) => r.json('available') > 0
  });
}

function completeCheckout() {
  const startTime = new Date();
  const customer = generateCustomer();
  const event = selectRandom(events);
  const ticket = selectRandom(ticketTypes);
  const card = selectRandom(testCards);
  
  // Step 1: Create order
  const orderPayload = {
    eventId: event.id,
    items: [{
      ticketType: ticket.type,
      quantity: Math.floor(Math.random() * 3) + 1,
      unitPrice: ticket.price
    }],
    customer: customer
  };
  
  const orderRes = http.post(
    `${BASE_URL}/api/payment/orders`,
    JSON.stringify(orderPayload),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  
  check(orderRes, {
    'order created': (r) => r.status === 201,
    'order has ID': (r) => r.json('orderId') !== null
  });
  
  if (orderRes.status !== 201) return;
  
  const orderId = orderRes.json('orderId');
  
  // Step 2: Create payment intent
  const paymentIntentRes = http.post(
    `${BASE_URL}/api/payment/stripe/payment-intent`,
    JSON.stringify({
      orderId: orderId,
      paymentMethod: 'card'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  
  check(paymentIntentRes, {
    'payment intent created': (r) => r.status === 200,
    'client secret received': (r) => r.json('clientSecret') !== null
  });
  
  if (paymentIntentRes.status !== 200) return;
  
  const clientSecret = paymentIntentRes.json('clientSecret');
  
  // Step 3: Confirm payment (simulating frontend)
  sleep(2); // Simulate user entering card details
  
  const paymentStartTime = new Date();
  const confirmRes = http.post(
    `${BASE_URL}/api/payment/stripe/confirm`,
    JSON.stringify({
      paymentIntentId: clientSecret.split('_secret')[0],
      paymentMethod: {
        card: card,
        billing_details: {
          name: `${customer.firstName} ${customer.lastName}`,
          email: customer.email
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  
  const paymentSuccess = confirmRes.status === 200;
  paymentSuccessRate.add(paymentSuccess);
  paymentDuration.add(new Date() - paymentStartTime);
  
  check(confirmRes, {
    'payment confirmed': (r) => r.status === 200,
    'payment status success': (r) => r.json('status') === 'succeeded'
  });
  
  // Step 4: Verify order completion
  if (paymentSuccess) {
    const orderStatusRes = http.get(
      `${BASE_URL}/api/payment/orders/${orderId}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );
    
    check(orderStatusRes, {
      'order completed': (r) => r.json('status') === 'completed',
      'tickets issued': (r) => r.json('tickets') !== null
    });
  }
  
  checkoutDuration.add(new Date() - startTime);
}

function processRefund() {
  // Get a recent order (in real test, would use actual order ID)
  const ordersRes = http.get(
    `${BASE_URL}/api/payment/orders?status=completed&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  
  if (ordersRes.status !== 200 || !ordersRes.json('orders').length) return;
  
  const order = ordersRes.json('orders')[0];
  
  // Request refund
  const refundRes = http.post(
    `${BASE_URL}/api/payment/refunds`,
    JSON.stringify({
      orderId: order.id,
      amount: order.total,
      reason: 'load_test_refund'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    }
  );
  
  check(refundRes, {
    'refund initiated': (r) => r.status === 200,
    'refund ID received': (r) => r.json('refundId') !== null
  });
}

// Webhook simulation (runs periodically)
export function webhookSimulation() {
  const webhookTypes = [
    'payment_intent.succeeded',
    'payment_intent.failed',
    'charge.refunded'
  ];
  
  const webhookType = selectRandom(webhookTypes);
  const webhookStartTime = new Date();
  
  const webhookRes = http.post(
    `${BASE_URL}/api/payment/webhooks/stripe`,
    JSON.stringify({
      type: webhookType,
      data: {
        object: {
          id: `pi_test_${Date.now()}`,
          amount: 15000,
          currency: 'usd',
          metadata: {
            orderId: `test_order_${Date.now()}`
          }
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'test_signature'
      }
    }
  );
  
  webhookProcessingTime.add(new Date() - webhookStartTime);
  
  check(webhookRes, {
    'webhook processed': (r) => r.status === 200
  });
}

// Custom summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
    'summary.html': htmlReport(data),
  };
}

function textSummary(data, options) {
  // Custom text summary implementation
  return `
Load Test Summary
=================
Total Requests: ${data.metrics.http_reqs.values.count}
Request Rate: ${data.metrics.http_reqs.values.rate}/s
Failed Requests: ${data.metrics.http_req_failed.values.passes}

Payment Metrics:
- Success Rate: ${(data.metrics.payment_success_rate.values.rate * 100).toFixed(2)}%
- P95 Duration: ${data.metrics.payment_duration.values['p(95)']}ms
- P95 Checkout: ${data.metrics.checkout_duration.values['p(95)']}ms

Thresholds:
${Object.entries(data.metrics).map(([key, value]) => {
  if (value.thresholds) {
    const passed = Object.values(value.thresholds).every(t => t.ok);
    return `- ${key}: ${passed ? '✅ PASSED' : '❌ FAILED'}`;
  }
}).filter(Boolean).join('\n')}
  `;
}

function htmlReport(data) {
  // Generate HTML report
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Payment Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .metric { margin: 10px 0; padding: 10px; border-left: 3px solid #007bff; }
    .passed { border-color: #28a745; }
    .failed { border-color: #dc3545; }
  </style>
</head>
<body>
  <h1>Payment System Load Test Report</h1>
  <div class="metric ${data.metrics.payment_success_rate.thresholds ? 'passed' : 'failed'}">
    <h3>Payment Success Rate</h3>
    <p>${(data.metrics.payment_success_rate.values.rate * 100).toFixed(2)}%</p>
  </div>
  <!-- Additional metrics... -->
</body>
</html>
  `;
}