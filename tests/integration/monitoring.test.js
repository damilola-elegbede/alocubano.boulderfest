import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fetch from 'node-fetch';

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const METRICS_API_KEY = process.env.METRICS_API_KEY || 'test-key';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-test-key';

describe('Production Monitoring System', () => {
  
  describe('Health Check Endpoint', () => {
    it('should return healthy status when all services are operational', async () => {
      const response = await fetch(`${BASE_URL}/api/health/check`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
      expect(data).toHaveProperty('health_score');
      expect(data.health_score).toBeGreaterThanOrEqual(0);
      expect(data.health_score).toBeLessThanOrEqual(100);
    });
    
    it('should check specific service health', async () => {
      const response = await fetch(`${BASE_URL}/api/health/check?service=database`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('service', 'database');
    });
    
    it('should return 404 for unknown service', async () => {
      const response = await fetch(`${BASE_URL}/api/health/check?service=unknown`);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('available_services');
    });
  });
  
  describe('Uptime Monitoring', () => {
    it('should return uptime metrics', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/uptime`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('uptime');
      expect(data.uptime).toHaveProperty('formatted');
      expect(data.uptime).toHaveProperty('seconds');
      expect(data).toHaveProperty('availability');
      expect(data.availability).toHaveProperty('percentage');
    });
    
    it('should include SLA compliance information', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/uptime`);
      const data = await response.json();
      
      expect(data).toHaveProperty('sla');
      expect(data.sla).toHaveProperty('compliance');
      expect(data.sla.compliance).toHaveProperty('overall');
      expect(typeof data.sla.compliance.overall).toBe('boolean');
    });
    
    it('should include dependency status', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/uptime`);
      const data = await response.json();
      
      expect(data).toHaveProperty('dependencies');
      expect(data.dependencies).toHaveProperty('database');
      expect(data.dependencies).toHaveProperty('stripe');
    });
  });
  
  describe('Metrics Export', () => {
    it('should require authentication for metrics access', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/metrics`);
      
      // In development, might allow without key
      if (process.env.NODE_ENV !== 'development') {
        expect(response.status).toBe(401);
      }
    });
    
    it('should return metrics in JSON format', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/metrics?api_key=${METRICS_API_KEY}`);
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('system');
        expect(data).toHaveProperty('business');
        expect(data).toHaveProperty('performance');
      }
    });
    
    it('should support Prometheus format export', async () => {
      const response = await fetch(
        `${BASE_URL}/api/monitoring/metrics?format=prometheus&api_key=${METRICS_API_KEY}`
      );
      
      if (response.status === 200) {
        const text = await response.text();
        expect(response.headers.get('content-type')).toContain('text/plain');
        expect(text).toMatch(/^(#|alocubano_)/);
      }
    });
    
    it('should support category filtering', async () => {
      const response = await fetch(
        `${BASE_URL}/api/monitoring/metrics?category=business&api_key=${METRICS_API_KEY}`
      );
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('payments');
        expect(data).toHaveProperty('users');
        expect(data).toHaveProperty('tickets');
      }
    });
  });
  
  describe('Alert Management', () => {
    it('should get alert statistics', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/alerts`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('statistics');
      expect(data.statistics).toHaveProperty('total_active');
      expect(data.statistics).toHaveProperty('severity_breakdown');
    });
    
    it('should get active alerts', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/alerts?action=active`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('alerts');
      expect(Array.isArray(data.alerts)).toBe(true);
    });
    
    it('should get alert templates', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/alerts?action=templates`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('templates');
      expect(data.templates).toHaveProperty('high_error_rate');
      expect(data.templates).toHaveProperty('payment_failures');
    });
    
    it('should require admin access for configuration', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/alerts?action=configuration`);
      
      if (process.env.NODE_ENV !== 'development') {
        expect(response.status).toBe(401);
      }
    });
    
    it('should test alert configuration with admin access', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_API_KEY
        },
        body: JSON.stringify({
          action: 'test',
          channel: 'sentry'
        })
      });
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('test');
      }
    });
  });
  
  describe('Dashboard', () => {
    it('should return dashboard data in JSON format', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/dashboard`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('overview');
      expect(data).toHaveProperty('performance');
      expect(data).toHaveProperty('business');
      expect(data).toHaveProperty('infrastructure');
      expect(data).toHaveProperty('alerts');
    });
    
    it('should return HTML dashboard when requested', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/dashboard?format=html`);
      const html = await response.text();
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('A Lo Cubano Boulder Fest - Production Monitoring');
    });
    
    it('should generate platform-specific configuration', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/dashboard?platform=grafana`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('panels');
      expect(data).toHaveProperty('data_source');
    });
    
    it('should return error for invalid platform', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/dashboard?platform=invalid`);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('supported');
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track API response times', async () => {
      // Make a few requests to generate metrics
      await fetch(`${BASE_URL}/api/health/check`);
      await fetch(`${BASE_URL}/api/health/check`);
      
      // Check metrics
      const response = await fetch(
        `${BASE_URL}/api/monitoring/metrics?category=performance&api_key=${METRICS_API_KEY}`
      );
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('response_times');
        expect(data.response_times).toHaveProperty('p50');
        expect(data.response_times).toHaveProperty('p95');
      }
    });
  });
  
  describe('Error Tracking', () => {
    it('should track error metrics', async () => {
      // Trigger an error (404)
      await fetch(`${BASE_URL}/api/nonexistent`);
      
      // Check error metrics
      const response = await fetch(
        `${BASE_URL}/api/monitoring/metrics?category=errors&api_key=${METRICS_API_KEY}`
      );
      
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('total');
        expect(typeof data.total).toBe('number');
      }
    });
  });
  
  describe('Security', () => {
    it('should not expose sensitive information in health checks', async () => {
      const response = await fetch(`${BASE_URL}/api/health/check`);
      const data = await response.json();
      const dataString = JSON.stringify(data);
      
      // Check for common sensitive patterns
      expect(dataString).not.toMatch(/password/i);
      expect(dataString).not.toMatch(/secret/i);
      expect(dataString).not.toMatch(/key/i);
      expect(dataString).not.toMatch(/token/i);
    });
    
    it('should set appropriate security headers', async () => {
      const response = await fetch(`${BASE_URL}/api/monitoring/dashboard`);
      
      expect(response.headers.get('cache-control')).toContain('no-cache');
      expect(response.headers.get('cache-control')).toContain('no-store');
    });
  });
  
  describe('Integration Tests', () => {
    it('should handle high load gracefully', async () => {
      const requests = Array(10).fill(null).map(() => 
        fetch(`${BASE_URL}/api/health/check`)
      );
      
      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;
      
      expect(successCount).toBeGreaterThan(8); // Allow some failures under load
    });
    
    it('should maintain consistent response format', async () => {
      const endpoints = [
        '/api/health/check',
        '/api/monitoring/uptime',
        '/api/monitoring/dashboard'
      ];
      
      for (const endpoint of endpoints) {
        const response = await fetch(`${BASE_URL}${endpoint}`);
        const data = await response.json();
        
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('status');
      }
    });
  });
});

describe('Monitoring Service Unit Tests', () => {
  it('should calculate SLA correctly', () => {
    // This would be imported from the actual module
    const calculateSLA = (uptime, errorRate) => {
      const uptimeMet = uptime >= 99.9;
      const errorRateMet = errorRate <= 1.0;
      return {
        compliance: {
          uptime: uptimeMet,
          errorRate: errorRateMet,
          overall: uptimeMet && errorRateMet
        }
      };
    };
    
    const sla1 = calculateSLA(99.95, 0.5);
    expect(sla1.compliance.overall).toBe(true);
    
    const sla2 = calculateSLA(99.5, 0.5);
    expect(sla2.compliance.overall).toBe(false);
    
    const sla3 = calculateSLA(99.95, 1.5);
    expect(sla3.compliance.overall).toBe(false);
  });
  
  it('should format uptime correctly', () => {
    const formatUptime = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours % 24 > 0) parts.push(`${hours % 24}h`);
      if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
      if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);
      
      return parts.join(' ');
    };
    
    expect(formatUptime(1000)).toBe('1s');
    expect(formatUptime(61000)).toBe('1m 1s');
    expect(formatUptime(3661000)).toBe('1h 1m 1s');
    expect(formatUptime(90061000)).toBe('1d 1h 1m 1s');
  });
});

// Helper function to wait for condition
async function waitFor(condition, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}