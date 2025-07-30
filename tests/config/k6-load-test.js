/**
 * k6 Load Testing Configuration for Payment System
 * Tests performance under various load conditions
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const paymentSuccessRate = new Rate('payment_success');
const checkoutCompletionRate = new Rate('checkout_completion');

// Test configuration
export const options = {
    scenarios: {
        // Scenario 1: Normal load
        normal_load: {
            executor: 'constant-vus',
            vus: 50,
            duration: '5m',
            startTime: '0s',
        },
        // Scenario 2: Peak hours simulation
        peak_hours: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },  // Ramp up
                { duration: '5m', target: 100 },  // Stay at peak
                { duration: '2m', target: 200 },  // Surge
                { duration: '1m', target: 50 },   // Cool down
            ],
            startTime: '5m',
        },
        // Scenario 3: Ticket release surge
        ticket_release: {
            executor: 'shared-iterations',
            vus: 500,
            iterations: 1000,
            maxDuration: '5m',
            startTime: '15m',
        },
        // Scenario 4: Sustained load
        sustained_load: {
            executor: 'constant-arrival-rate',
            rate: 100,
            timeUnit: '1s',
            duration: '10m',
            preAllocatedVUs: 200,
            maxVUs: 500,
            startTime: '20m',
        },
    },
    thresholds: {
        // API response time thresholds
        http_req_duration: [
            'p(50)<200',   // 50% of requests under 200ms
            'p(95)<500',   // 95% of requests under 500ms
            'p(99)<1000',  // 99% of requests under 1s
        ],
        // Error rate threshold
        http_req_failed: ['rate<0.01'], // Less than 1% error rate
        // Custom metric thresholds
        errors: ['rate<0.05'],
        payment_success: ['rate>0.95'],
        checkout_completion: ['rate>0.90'],
    },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'https://alocubanoboulderfest.com';
const ticketTypes = ['full-festival', 'workshop-only', 'social-only'];
const quantities = [1, 2, 3, 4, 5, 6]; // Include group sizes
const testCards = [
    '4242424242424242', // Visa
    '5555555555554444', // Mastercard
    '378282246310005',  // Amex
];

// Helper functions
function generateCustomer() {
    const id = Math.floor(Math.random() * 100000);
    return {
        email: `loadtest${id}@example.com`,
        name: `Load Test User ${id}`,
        phone: `303-555-${String(id).padStart(4, '0')}`,
    };
}

function generateAddress() {
    const addresses = [
        { country: 'US', state: 'CO', city: 'Boulder', zip: '80303' },
        { country: 'US', state: 'CA', city: 'Los Angeles', zip: '90001' },
        { country: 'CA', province: 'ON', city: 'Toronto', zip: 'M5V 3A9' },
    ];
    return randomItem(addresses);
}

// Main test scenario
export default function() {
    const customer = generateCustomer();
    const ticketType = randomItem(ticketTypes);
    const quantity = randomItem(quantities);
    
    // Step 1: Browse tickets page
    let res = http.get(`${BASE_URL}/tickets`, {
        headers: { 'Accept': 'text/html' },
        tags: { name: 'browse_tickets' },
    });
    
    check(res, {
        'tickets page loads': (r) => r.status === 200,
        'page loads quickly': (r) => r.timings.duration < 1000,
    });
    
    sleep(randomBetween(1, 3)); // User thinking time
    
    // Step 2: Create checkout session
    const checkoutPayload = {
        items: [{ ticketType, quantity }],
        customerEmail: customer.email,
        successUrl: `${BASE_URL}/success`,
        cancelUrl: `${BASE_URL}/tickets`,
    };
    
    res = http.post(
        `${BASE_URL}/api/payments/create-checkout-session`,
        JSON.stringify(checkoutPayload),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': 'test-csrf-token', // Would be dynamic in real scenario
            },
            tags: { name: 'create_checkout' },
        }
    );
    
    const checkoutSuccess = check(res, {
        'checkout session created': (r) => r.status === 200,
        'session ID returned': (r) => r.json('sessionId') !== undefined,
        'checkout URL returned': (r) => r.json('checkoutUrl') !== undefined,
    });
    
    if (!checkoutSuccess) {
        errorRate.add(1);
        return;
    }
    
    const sessionId = res.json('sessionId');
    sleep(randomBetween(2, 5)); // Time to fill payment form
    
    // Step 3: Simulate payment completion (webhook)
    // In real scenario, this would be Stripe processing
    const webhookPayload = {
        type: 'checkout.session.completed',
        data: {
            object: {
                id: sessionId,
                payment_status: 'paid',
                amount_total: quantity * 30000, // $300 per ticket
                customer_email: customer.email,
                metadata: {
                    items: JSON.stringify([{ ticketType, quantity }]),
                },
            },
        },
    };
    
    res = http.post(
        `${BASE_URL}/api/payments/webhook`,
        JSON.stringify(webhookPayload),
        {
            headers: {
                'Content-Type': 'application/json',
                'stripe-signature': 'test_webhook_signature',
            },
            tags: { name: 'payment_webhook' },
        }
    );
    
    const paymentSuccess = check(res, {
        'webhook processed': (r) => r.status === 200,
        'payment completed': (r) => r.json('received') === true,
    });
    
    paymentSuccessRate.add(paymentSuccess ? 1 : 0);
    
    // Step 4: Check payment status
    sleep(1);
    
    res = http.get(`${BASE_URL}/api/payments/status/${sessionId}`, {
        headers: { 'Accept': 'application/json' },
        tags: { name: 'check_status' },
    });
    
    const statusCheck = check(res, {
        'status retrieved': (r) => r.status === 200,
        'payment confirmed': (r) => r.json('status') === 'paid',
    });
    
    checkoutCompletionRate.add(statusCheck ? 1 : 0);
    
    // Step 5: Load confirmation page
    res = http.get(`${BASE_URL}/success?session_id=${sessionId}`, {
        headers: { 'Accept': 'text/html' },
        tags: { name: 'confirmation_page' },
    });
    
    check(res, {
        'confirmation page loads': (r) => r.status === 200,
        'shows success message': (r) => r.body.includes('Thank You'),
    });
}

// Scenario-specific functions
export function ticketReleaseSurge() {
    // Simulate everyone trying to buy tickets at once
    const customer = generateCustomer();
    
    const payload = {
        items: [{ ticketType: 'full-festival', quantity: 2 }],
        customerEmail: customer.email,
    };
    
    const res = http.post(
        `${BASE_URL}/api/payments/create-checkout-session`,
        JSON.stringify(payload),
        {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'ticket_surge' },
            timeout: '10s',
        }
    );
    
    check(res, {
        'handles surge': (r) => r.status === 200 || r.status === 429,
        'no server errors': (r) => r.status < 500,
    });
}

// Helper function for random sleep
function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

// Teardown function
export function teardown(data) {
    console.log('Load test completed');
    console.log(`Error rate: ${errorRate.rate}`);
    console.log(`Payment success rate: ${paymentSuccessRate.rate}`);
    console.log(`Checkout completion rate: ${checkoutCompletionRate.rate}`);
}