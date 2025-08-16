/**
 * Mock Server for CI Environment
 * Provides API response mocking when real server unavailable
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

class MockServer {
  constructor() {
    this.port = 3005;
    this.baseUrl = `http://localhost:${this.port}`;
    this.isRunning = false;
    this.mockResponses = new Map();
    this.requestLog = [];
    this.setupDefaultMocks();
  }

  setupDefaultMocks() {
    // Health endpoints
    this.addMock('GET', '/api/health/check', {
      status: 200,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        system: {
          nodeVersion: process.version,
          uptime: process.uptime()
        }
      }
    });

    this.addMock('GET', '/api/health/simple', {
      status: 200,
      data: { status: 'ok' }
    });

    this.addMock('GET', '/api/health/database', {
      status: 200,
      data: {
        status: 'healthy',
        database: {
          connected: true,
          type: 'sqlite'
        }
      }
    });

    // Admin endpoints
    this.addMock('POST', '/api/admin/login', {
      status: 200,
      data: { 
        token: 'mock-admin-token-' + crypto.randomBytes(16).toString('hex'),
        success: true
      }
    });

    this.addMock('GET', '/api/admin/dashboard', {
      status: 200,
      data: {
        totalTickets: 42,
        totalRevenue: 1500.00,
        recentRegistrations: []
      }
    });

    // Payment endpoints
    this.addMock('POST', '/api/payments/create-checkout-session', {
      status: 200,
      data: {
        url: 'https://checkout.stripe.com/mock-session',
        sessionId: 'cs_mock_session_' + crypto.randomBytes(8).toString('hex')
      }
    });

    // Stripe webhook with signature validation
    this.addMock('POST', '/api/payments/stripe-webhook', {
      handler: (req) => {
        const signature = req.headers?.['stripe-signature'];
        if (!signature) {
          return { status: 400, data: { error: 'Missing stripe-signature header' } };
        }
        // Mock validation - check for specific test signatures
        if (signature === 'invalid_signature') {
          return { status: 400, data: { error: 'Invalid signature' } };
        }
        return { status: 200, data: { received: true } };
      }
    });

    // Email endpoints
    this.addMock('POST', '/api/email/subscribe', {
      status: 200,
      data: { success: true, message: 'Subscribed successfully' }
    });

    this.addMock('GET', '/api/email/unsubscribe', {
      status: 200,
      data: { success: true, message: 'Unsubscribed successfully' }
    });

    this.addMock('POST', '/api/email/unsubscribe', {
      status: 200,
      data: { success: true, message: 'Unsubscribed successfully' }
    });

    this.addMock('POST', '/api/email/brevo-webhook', {
      status: 200,
      data: { received: true }
    });

    // Ticket endpoints
    this.addMock('GET', '/api/tickets/:ticketId', {
      status: 200,
      data: {
        id: ':ticketId',
        buyer_name: 'Test User',
        buyer_email: 'test@example.com',
        ticket_type: 'full-pass',
        created_at: new Date().toISOString()
      }
    });

    this.addMock('POST', '/api/tickets/validate', {
      status: 200,
      data: {
        valid: true,
        ticket: {
          id: 'test-ticket-id',
          buyer_name: 'Test User'
        }
      }
    });

    // Gallery endpoints
    this.addMock('GET', '/api/gallery', {
      status: 200,
      data: {
        files: [],
        totalCount: 0
      }
    });

    this.addMock('GET', '/api/featured-photos', {
      status: 200,
      data: {
        photos: []
      }
    });

    // Static file responses
    this.addMock('GET', '/', {
      status: 200,
      data: '<html><body>Mock Server Response</body></html>',
      headers: { 'Content-Type': 'text/html' }
    });

    this.addMock('GET', '/pages/index.html', {
      status: 200,
      data: '<html><body>Mock Home Page</body></html>',
      headers: { 'Content-Type': 'text/html' }
    });
  }

  async start() {
    if (this.isRunning) return this.baseUrl;
    
    console.log('🎭 Starting mock server for CI environment');
    console.log(`   Mock server ready at ${this.baseUrl}`);
    console.log('   To use real server, add VERCEL_TOKEN to GitHub secrets');
    
    this.isRunning = true;
    return this.baseUrl;
  }

  async stop() {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping mock server');
    this.isRunning = false;
    this.requestLog = [];
  }

  getUrl() {
    if (!this.isRunning) {
      throw new Error('Mock server is not running');
    }
    return this.baseUrl;
  }

  isServerRunning() {
    return this.isRunning;
  }

  async healthCheck() {
    return {
      healthy: true,
      status: 200,
      serverStatus: 'healthy',
      data: { status: 'healthy' },
      url: this.baseUrl,
      port: this.port
    };
  }

  async ping() {
    return {
      reachable: true,
      status: 200,
      url: this.baseUrl,
      port: this.port
    };
  }

  addMock(method, path, response) {
    const key = `${method}:${path}`;
    this.mockResponses.set(key, response);
  }

  getMockResponse(method, path, req = null) {
    // Direct match
    let key = `${method}:${path}`;
    if (this.mockResponses.has(key)) {
      const response = this.mockResponses.get(key);
      // Clone and update dynamic values
      return this.prepareMockResponse(response, path, null, req);
    }

    // Pattern matching for parameterized routes
    for (const [mockKey, response] of this.mockResponses) {
      const [mockMethod, mockPath] = mockKey.split(':');
      if (mockMethod === method) {
        const pattern = mockPath.replace(/:([^/]+)/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(path)) {
          // Clone response and substitute parameters
          return this.prepareMockResponse(response, path, mockPath, req);
        }
      }
    }

    // Default 404 response
    return {
      status: 404,
      data: { error: 'Not found' }
    };
  }

  prepareMockResponse(response, actualPath, mockPath = null, req = null) {
    // If response has a handler function, execute it
    if (response.handler && typeof response.handler === 'function') {
      return response.handler(req || {});
    }
    
    // Deep clone the response
    const cloned = JSON.parse(JSON.stringify(response));
    
    // Update dynamic timestamps
    if (cloned.data && typeof cloned.data === 'object') {
      if (cloned.data.timestamp !== undefined) {
        cloned.data.timestamp = new Date().toISOString();
      }
      if (cloned.data.created_at !== undefined) {
        cloned.data.created_at = new Date().toISOString();
      }
      if (cloned.data.system && cloned.data.system.uptime !== undefined) {
        cloned.data.system.uptime = process.uptime();
      }
    }
    
    // Replace path parameters
    if (mockPath && mockPath.includes(':')) {
      const paramNames = mockPath.match(/:([^/]+)/g) || [];
      const pattern = mockPath.replace(/:([^/]+)/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const matches = actualPath.match(regex);
      
      if (matches && paramNames.length > 0) {
        paramNames.forEach((paramName, index) => {
          const cleanParamName = paramName.substring(1);
          const paramValue = matches[index + 1];
          
          // Replace in response data
          const responseStr = JSON.stringify(cloned.data);
          const updatedStr = responseStr.replace(
            new RegExp(`:${cleanParamName}`, 'g'),
            paramValue
          );
          cloned.data = JSON.parse(updatedStr);
        });
      }
    }
    
    return cloned;
  }

  logRequest(method, path, body) {
    this.requestLog.push({
      method,
      path,
      body,
      timestamp: new Date().toISOString()
    });
  }

  getRequestLog() {
    return this.requestLog;
  }

  clearRequestLog() {
    this.requestLog = [];
  }

  // Helper method to check if a request was made
  wasRequestMade(method, pathPattern) {
    return this.requestLog.some(req => {
      if (req.method !== method) return false;
      if (typeof pathPattern === 'string') {
        return req.path === pathPattern;
      } else if (pathPattern instanceof RegExp) {
        return pathPattern.test(req.path);
      }
      return false;
    });
  }
}

export const mockServer = new MockServer();