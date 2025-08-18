/**
 * Test Helpers - Minimal Utilities Only
 * Simple functions for HTTP requests and database operations.
 * Target: < 100 lines
 */
import { createClient } from '@libsql/client';

// Simple HTTP client - no complex abstractions
export async function testRequest(method, path, data = null) {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${path}`;
  
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
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
      ok: response.ok
    };
  } catch (error) {
    return {
      status: 0,
      data: { error: error.message },
      ok: false
    };
  }
}

// Simple database helper - direct SQL only
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
    return await this.client.execute({ sql, args: values });
  },

  async cleanup() {
    if (!this.client) return;
    
    // Clean test data only - simple pattern
    await this.client.execute({ 
      sql: "DELETE FROM registrations WHERE buyer_email LIKE 'test-%@%' OR buyer_email LIKE '%@example.com'",
      args: [] 
    });
    
    await this.client.execute({ 
      sql: "DELETE FROM newsletter_subscribers WHERE email LIKE 'test-%@%' OR email LIKE '%@example.com'", 
      args: [] 
    });
  }
};

// Simple cleanup - run after each test
export async function cleanup() {
  await testDb.cleanup();
}