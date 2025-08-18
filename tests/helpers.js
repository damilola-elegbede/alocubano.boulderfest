/**
 * Test Helpers - Practical Utilities for Real Testing
 * Simple functions for HTTP requests, database operations, and test data creation.
 * Target: 70 lines of focused utility functions
 */
import { createClient } from '@libsql/client';

let requestCounter = 0;

// HTTP client with custom headers support
export async function testRequest(method, path, data = null, customHeaders = {}) {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;
  
  const options = {
    method,
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Test-Runner/1.0',
      ...customHeaders 
    }
  };
  
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = response.headers.get('content-type')?.includes('application/json') 
      ? await response.json() 
      : await response.text();
    
    return {
      status: response.status,
      data: responseData,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 0,
      data: { error: error.message },
      ok: false,
      headers: {}
    };
  }
}

// Database helper with enhanced operations
export const testDb = {
  client: null,
  
  async init() {
    if (this.client) return;
    
    this.client = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:test.db',
      authToken: process.env.TURSO_AUTH_TOKEN
    });
  },

  async query(sql, params = []) {
    await this.init();
    const result = await this.client.execute({ sql, args: params });
    return result.rows;
  },

  async insert(table, data) {
    await this.init();
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const result = await this.client.execute({ sql, args: values });
    return { ...result, insertId: result.lastInsertRowid };
  },

  async update(table, data, whereClause, whereParams = []) {
    await this.init();
    const setClauses = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(data), ...whereParams];
    
    const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`;
    return await this.client.execute({ sql, args: values });
  },

  async cleanup() {
    if (!this.client) return;
    
    // Clean test data - broader patterns to catch all test scenarios
    const cleanupQueries = [
      "DELETE FROM registrations WHERE buyer_email LIKE 'test-%@%'",
      "DELETE FROM newsletter_subscribers WHERE email LIKE 'test-%@%'",
      "DELETE FROM payment_events WHERE event_id LIKE 'evt_%test%'",
      "DELETE FROM registrations WHERE buyer_name LIKE '%Test%'"
    ];
    
    for (const query of cleanupQueries) {
      try {
        await this.client.execute({ sql: query, args: [] });
      } catch (error) {
        // Ignore cleanup errors - table might not exist in all test scenarios
        console.warn(`Cleanup warning: ${error.message}`);
      }
    }
  }
};

// Test data generators
export function generateUniqueEmail(prefix = 'test') {
  const timestamp = Date.now();
  const counter = ++requestCounter;
  return `${prefix}-${timestamp}-${counter}@example.com`;
}

export async function createTestTicket(ticketData = {}) {
  const defaultTicket = {
    buyer_email: generateUniqueEmail('ticket'),
    buyer_name: 'Test User',
    event_name: 'A Lo Cubano Boulder Fest 2026',
    ticket_type: 'Weekend Pass',
    unit_price_cents: 12500,
    total_amount_cents: 12500,
    currency: 'usd',
    status: 'confirmed',
    payment_id: `test_payment_${Date.now()}`,
    created_at: new Date().toISOString(),
    ...ticketData
  };
  
  const result = await testDb.insert('registrations', defaultTicket);
  return { ...defaultTicket, id: result.insertId };
}

// Utility functions
export async function withRetry(fn, maxAttempts = 3, delay = 100) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simple cleanup - run after each test
export async function cleanup() {
  await testDb.cleanup();
}