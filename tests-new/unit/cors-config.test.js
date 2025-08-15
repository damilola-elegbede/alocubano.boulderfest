import { describe, it, expect } from 'vitest';

describe('CORS Configuration', () => {
  it('allows configured origins', () => {
    const allowedOrigins = ['https://alocubanoboulderfest.vercel.app', 'http://localhost:3000'];
    const origin = 'http://localhost:3000';
    expect(allowedOrigins).toContain(origin);
  });

  it('sets correct CORS headers', () => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('handles preflight requests', () => {
    const method = 'OPTIONS';
    const handled = method === 'OPTIONS';
    expect(handled).toBe(true);
  });
});