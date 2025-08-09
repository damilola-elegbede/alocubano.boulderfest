import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Metrics for sustained load testing
const sustainedSuccessRate = new Rate('sustained_success_rate');
const sustainedResponseTime = new Trend('sustained_response_time');
const sustainedErrorRate = new Rate('sustained_error_rate');
const requestsPerSecond = new Counter('requests_per_second');

// Test configuration for 30-minute sustained load
export const options = {
  stages: [
    { duration: '2m', target: 75 },   // Ramp up to sustained level
    { duration: '26m', target: 75 },  // Maintain sustained load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000', 'avg<250'],
    http_req_failed: ['rate<0.01'],
    sustained_success_rate: ['rate>0.99'],
    sustained_error_rate: ['rate<0.01'],
    sustained_response_time: ['avg<300', 'p(95)<500'],
  },
};

const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

// Simulate mixed user behavior patterns
const USER_SCENARIOS = [
  { name: 'browse_events', weight: 0.30 },    // 30% browsing
  { name: 'check_tickets', weight: 0.25 },    // 25% checking tickets
  { name: 'view_artists', weight: 0.20 },     // 20% viewing artists
  { name: 'purchase_flow', weight: 0.15 },    // 15% purchasing
  { name: 'check_schedule', weight: 0.10 },   // 10% checking schedule
];

// Select scenario based on weights
function selectScenario() {
  const random = Math.random();
  let cumulative = 0;
  
  for (const scenario of USER_SCENARIOS) {
    cumulative += scenario.weight;
    if (random < cumulative) {
      return scenario.name;
    }
  }
  return USER_SCENARIOS[0].name;
}

export default function() {
  const scenario = selectScenario();
  const startTime = Date.now();
  
  switch (scenario) {
    case 'browse_events':
      browseEvents();
      break;
    case 'check_tickets':
      checkTickets();
      break;
    case 'view_artists':
      viewArtists();
      break;
    case 'purchase_flow':
      simulatePurchase();
      break;
    case 'check_schedule':
      checkSchedule();
      break;
  }
  
  const responseTime = Date.now() - startTime;
  sustainedResponseTime.add(responseTime);
  requestsPerSecond.add(1);
}

function browseEvents() {
  group('Browse Events', () => {
    const pages = ['/index.html', '/pages/about.html', '/pages/gallery.html'];
    
    for (const page of pages) {
      const response = http.get(`${BASE_URL}${page}`);
      
      const success = check(response, {
        'page loaded': (r) => r.status === 200,
        'content present': (r) => r.body.length > 1000,
      });
      
      sustainedSuccessRate.add(success ? 1 : 0);
      if (!success) sustainedErrorRate.add(1);
      
      sleep(Math.random() * 3 + 2); // 2-5 seconds between pages
    }
  });
}

function checkTickets() {
  group('Check Tickets', () => {
    const response = http.get(`${BASE_URL}/pages/tickets.html`);
    
    const success = check(response, {
      'tickets page loaded': (r) => r.status === 200,
      'ticket info present': (r) => r.body.includes('ticket') || r.body.includes('pass'),
    });
    
    sustainedSuccessRate.add(success ? 1 : 0);
    if (!success) sustainedErrorRate.add(1);
    
    // Check availability
    const availabilityResponse = http.get(`${BASE_URL}/api/tickets/availability`);
    check(availabilityResponse, {
      'availability loaded': (r) => r.status === 200,
    });
    
    sleep(Math.random() * 5 + 3); // 3-8 seconds reviewing
  });
}

function viewArtists() {
  group('View Artists', () => {
    const response = http.get(`${BASE_URL}/pages/artists.html`);
    
    const success = check(response, {
      'artists page loaded': (r) => r.status === 200,
      'artist info present': (r) => r.body.length > 2000,
    });
    
    sustainedSuccessRate.add(success ? 1 : 0);
    if (!success) sustainedErrorRate.add(1);
    
    sleep(Math.random() * 4 + 2); // 2-6 seconds browsing
  });
}

function simulatePurchase() {
  group('Purchase Flow', () => {
    // Simplified purchase simulation for sustained load
    const ticketData = {
      ticketType: 'full-pass',
      quantity: 1,
      sessionId: `sustained_${__VU}_${Date.now()}`,
    };
    
    // Add to cart
    const cartResponse = http.post(
      `${BASE_URL}/api/cart/add`,
      JSON.stringify(ticketData),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const cartSuccess = check(cartResponse, {
      'added to cart': (r) => r.status === 200,
    });
    
    sustainedSuccessRate.add(cartSuccess ? 1 : 0);
    if (!cartSuccess) {
      sustainedErrorRate.add(1);
      return;
    }
    
    sleep(Math.random() * 10 + 5); // 5-15 seconds for checkout
    
    // Simulate payment (simplified)
    const paymentResponse = http.post(
      `${BASE_URL}/api/tickets/create`,
      JSON.stringify({
        amount: 17500, // $175.00
        source: 'tok_visa',
        sessionId: ticketData.sessionId,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const paymentSuccess = check(paymentResponse, {
      'payment processed': (r) => r.status === 200,
    });
    
    sustainedSuccessRate.add(paymentSuccess ? 1 : 0);
    if (!paymentSuccess) sustainedErrorRate.add(1);
  });
}

function checkSchedule() {
  group('Check Schedule', () => {
    const response = http.get(`${BASE_URL}/pages/schedule.html`);
    
    const success = check(response, {
      'schedule loaded': (r) => r.status === 200,
      'schedule content present': (r) => r.body.length > 1500,
    });
    
    sustainedSuccessRate.add(success ? 1 : 0);
    if (!success) sustainedErrorRate.add(1);
    
    sleep(Math.random() * 3 + 2); // 2-5 seconds reviewing
  });
}

export function handleSummary(data) {
  const summary = {
    testType: 'sustained-load',
    duration: '30 minutes',
    timestamp: new Date().toISOString(),
    metrics: {
      successRate: data.metrics.sustained_success_rate?.rate,
      errorRate: data.metrics.sustained_error_rate?.rate,
      avgResponseTime: data.metrics.sustained_response_time?.avg,
      p95ResponseTime: data.metrics.sustained_response_time?.['p(95)'],
      totalRequests: data.metrics.requests_per_second?.count,
    },
  };
  
  return {
    'reports/load-test-results/sustained-load-results.json': JSON.stringify(summary, null, 2),
  };
}