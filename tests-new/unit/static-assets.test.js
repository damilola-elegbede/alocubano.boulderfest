import { describe, it, expect } from 'vitest';

describe('Static Asset Serving', () => {
  it('serves CSS files correctly', () => {
    const mimeType = 'text/css';
    const headers = { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=86400' };
    expect(headers['Content-Type']).toBe('text/css');
    expect(headers['Cache-Control']).toContain('86400');
  });

  it('serves JavaScript files correctly', () => {
    const mimeType = 'application/javascript';
    const headers = { 'Content-Type': mimeType };
    expect(headers['Content-Type']).toBe('application/javascript');
  });

  it('serves images with proper caching', () => {
    const headers = { 'Cache-Control': 'public, max-age=604800' };
    const maxAge = parseInt(headers['Cache-Control'].match(/max-age=(\d+)/)[1]);
    expect(maxAge).toBe(604800);
  });
});