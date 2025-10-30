/**
 * Performance Regression Detection E2E Tests
 * Tests to detect performance degradation over releases
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupPreviewEnvironment, cleanupPreviewEnvironment } from '../../config/preview-deployment.js';
import fs from 'fs/promises';
import path from 'path';

describe('Performance Regression Detection E2E', () => {
  let previewUrl;
  let page;
  const BASELINE_FILE = path.join(process.cwd(), '.tmp/performance-baseline.json');

  beforeAll(async () => {
    const setup = await setupPreviewEnvironment();
    previewUrl = setup.url;
    page = setup.page;

    // Ensure .tmp directory exists
    await fs.mkdir('.tmp', { recursive: true });
  }, 300000);

  afterAll(async () => {
    await cleanupPreviewEnvironment();
  });

  describe('Baseline Comparison', () => {
    it('should establish or compare against performance baseline', async () => {
      const currentMetrics = await collectPerformanceMetrics(page, previewUrl);

      let baseline;

      try {
        const baselineData = await fs.readFile(BASELINE_FILE, 'utf-8');
        baseline = JSON.parse(baselineData);
      } catch (error) {
        // No baseline exists, create one
        await fs.writeFile(BASELINE_FILE, JSON.stringify(currentMetrics, null, 2));
        console.log('Performance baseline established');
        return;
      }

      // Compare against baseline
      const regressions = detectRegressions(baseline, currentMetrics);

      if (regressions.length > 0) {
        console.warn('Performance regressions detected:', regressions);

        // Fail if critical regressions (>25% slower)
        const criticalRegressions = regressions.filter(r => r.percentChange > 25);

        if (criticalRegressions.length > 0) {
          expect(criticalRegressions).toEqual([]);
        }
      }

      // Update baseline if performance improved
      const improvements = regressions.filter(r => r.percentChange < -10);
      if (improvements.length > 0) {
        console.log('Performance improvements detected:', improvements);
        await fs.writeFile(BASELINE_FILE, JSON.stringify(currentMetrics, null, 2));
      }
    }, 60000);
  });

  describe('Core Web Vitals Tracking', () => {
    it('should measure and track Largest Contentful Paint (LCP)', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const lcp = await measureLCP(page);

      // Good: < 2.5s, Needs improvement: 2.5-4s, Poor: > 4s
      expect(lcp).toBeLessThan(2500);

      console.log(`LCP: ${lcp}ms`);
    }, 20000);

    it('should measure and track First Input Delay (FID)', async () => {
      await page.goto(previewUrl);

      const fid = await measureFID(page);

      if (fid !== null) {
        // Good: < 100ms, Needs improvement: 100-300ms, Poor: > 300ms
        expect(fid).toBeLessThan(100);
        console.log(`FID: ${fid}ms`);
      }
    }, 20000);

    it('should measure and track Cumulative Layout Shift (CLS)', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const cls = await measureCLS(page);

      // Good: < 0.1, Needs improvement: 0.1-0.25, Poor: > 0.25
      expect(cls).toBeLessThan(0.1);

      console.log(`CLS: ${cls}`);
    }, 20000);

    it('should measure First Contentful Paint (FCP)', async () => {
      await page.goto(previewUrl);

      const fcp = await measureFCP(page);

      // Good: < 1.8s, Needs improvement: 1.8-3s, Poor: > 3s
      expect(fcp).toBeLessThan(1800);

      console.log(`FCP: ${fcp}ms`);
    }, 15000);

    it('should measure Time to First Byte (TTFB)', async () => {
      const startTime = Date.now();

      const response = await page.request.get(previewUrl);

      const ttfb = Date.now() - startTime;

      // Good: < 800ms, Poor: > 1800ms
      expect(ttfb).toBeLessThan(800);

      console.log(`TTFB: ${ttfb}ms`);
    }, 10000);
  });

  describe('Resource Timing Analysis', () => {
    it('should track CSS load times', async () => {
      await page.goto(previewUrl);

      const cssMetrics = await page.evaluate(() => {
        const cssResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.css'));

        return cssResources.map(resource => ({
          name: resource.name.split('/').pop(),
          duration: resource.duration,
          size: resource.transferSize || 0,
        }));
      });

      cssMetrics.forEach(css => {
        expect(css.duration).toBeLessThan(500);
        console.log(`CSS ${css.name}: ${css.duration.toFixed(2)}ms, ${css.size} bytes`);
      });
    }, 15000);

    it('should track JavaScript load times', async () => {
      await page.goto(previewUrl);

      const jsMetrics = await page.evaluate(() => {
        const jsResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.js'));

        return jsResources.map(resource => ({
          name: resource.name.split('/').pop(),
          duration: resource.duration,
          size: resource.transferSize || 0,
        }));
      });

      jsMetrics.forEach(js => {
        expect(js.duration).toBeLessThan(1000);
        console.log(`JS ${js.name}: ${js.duration.toFixed(2)}ms, ${js.size} bytes`);
      });
    }, 15000);

    it('should track API response times', async () => {
      const apiEndpoints = [
        '/api/health/check',
        '/api/health/database',
      ];

      const apiMetrics = [];

      for (const endpoint of apiEndpoints) {
        const startTime = Date.now();
        await page.request.get(`${previewUrl}${endpoint}`);
        const responseTime = Date.now() - startTime;

        apiMetrics.push({
          endpoint,
          responseTime,
        });

        console.log(`API ${endpoint}: ${responseTime}ms`);
      }

      apiMetrics.forEach(metric => {
        expect(metric.responseTime).toBeLessThan(200);
      });
    }, 20000);
  });

  describe('Performance Budget Enforcement', () => {
    it('should enforce JavaScript bundle size budget', async () => {
      await page.goto(previewUrl);

      const totalJsSize = await page.evaluate(() => {
        const jsResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.js'));

        return jsResources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
      });

      // Budget: 300KB for all JS
      expect(totalJsSize).toBeLessThan(300 * 1024);

      console.log(`Total JS size: ${(totalJsSize / 1024).toFixed(2)}KB`);
    }, 15000);

    it('should enforce CSS bundle size budget', async () => {
      await page.goto(previewUrl);

      const totalCssSize = await page.evaluate(() => {
        const cssResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.css'));

        return cssResources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
      });

      // Budget: 100KB for all CSS
      expect(totalCssSize).toBeLessThan(100 * 1024);

      console.log(`Total CSS size: ${(totalCssSize / 1024).toFixed(2)}KB`);
    }, 15000);

    it('should enforce total page weight budget', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const totalPageWeight = await page.evaluate(() => {
        const allResources = performance.getEntriesByType('resource');
        return allResources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
      });

      // Budget: 2MB total page weight
      expect(totalPageWeight).toBeLessThan(2 * 1024 * 1024);

      console.log(`Total page weight: ${(totalPageWeight / 1024 / 1024).toFixed(2)}MB`);
    }, 15000);

    it('should enforce request count budget', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const requestCount = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length;
      });

      // Budget: 30 requests
      expect(requestCount).toBeLessThan(30);

      console.log(`Total requests: ${requestCount}`);
    }, 15000);
  });

  describe('Rendering Performance', () => {
    it('should measure rendering performance', async () => {
      await page.goto(previewUrl);

      const renderMetrics = await page.evaluate(() => {
        const paintEntries = performance.getEntriesByType('paint');
        return {
          firstPaint: paintEntries.find(e => e.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
        };
      });

      expect(renderMetrics.firstPaint).toBeLessThan(1000);
      expect(renderMetrics.firstContentfulPaint).toBeLessThan(1800);

      console.log('Render metrics:', renderMetrics);
    }, 15000);

    it('should measure DOM processing time', async () => {
      await page.goto(previewUrl);

      const domMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];

        if (!navigation) return null;

        return {
          domInteractive: navigation.domInteractive,
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          domComplete: navigation.domComplete,
        };
      });

      if (domMetrics) {
        expect(domMetrics.domInteractive).toBeLessThan(2000);
        expect(domMetrics.domComplete).toBeLessThan(3000);

        console.log('DOM metrics:', domMetrics);
      }
    }, 15000);
  });

  describe('Long-term Performance Tracking', () => {
    it('should track performance over multiple page loads', async () => {
      const loadTimes = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
        const loadTime = Date.now() - startTime;

        loadTimes.push(loadTime);

        await page.waitForTimeout(500);
      }

      // Calculate statistics
      const avg = loadTimes.reduce((a, b) => a + b) / loadTimes.length;
      const min = Math.min(...loadTimes);
      const max = Math.max(...loadTimes);

      console.log(`Load times - Avg: ${avg.toFixed(2)}ms, Min: ${min}ms, Max: ${max}ms`);

      // Average should be under 2 seconds
      expect(avg).toBeLessThan(2000);

      // Max should not be excessive
      expect(max).toBeLessThan(3000);
    }, 60000);

    it('should maintain consistent performance', async () => {
      const metrics = [];

      for (let i = 0; i < 5; i++) {
        const lcp = await measureLCP(page);
        metrics.push(lcp);

        await page.reload();
        await page.waitForTimeout(1000);
      }

      // Calculate coefficient of variation
      const avg = metrics.reduce((a, b) => a + b) / metrics.length;
      const variance = metrics.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / metrics.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / avg) * 100;

      console.log(`LCP consistency - CV: ${cv.toFixed(2)}%`);

      // Coefficient of variation should be under 20%
      expect(cv).toBeLessThan(20);
    }, 60000);
  });

  describe('Anomaly Detection', () => {
    it('should detect sudden performance spikes', async () => {
      const measurements = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
        const loadTime = Date.now() - startTime;

        measurements.push(loadTime);
      }

      // Detect outliers using IQR method
      measurements.sort((a, b) => a - b);

      const q1 = measurements[Math.floor(measurements.length * 0.25)];
      const q3 = measurements[Math.floor(measurements.length * 0.75)];
      const iqr = q3 - q1;

      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      const outliers = measurements.filter(m => m < lowerBound || m > upperBound);

      console.log(`Measurements: ${measurements.join(', ')}`);
      console.log(`Q1: ${q1}, Q3: ${q3}, IQR: ${iqr}`);
      console.log(`Outliers: ${outliers.length}`);

      // Should have minimal outliers
      expect(outliers.length).toBeLessThan(2);
    }, 60000);
  });

  describe('Regression Alert Thresholds', () => {
    it('should alert on >10% LCP regression', async () => {
      const currentLCP = await measureLCP(page);
      const threshold = 2000; // Baseline threshold

      const regression = ((currentLCP - threshold) / threshold) * 100;

      if (regression > 10) {
        console.warn(`LCP regression detected: ${regression.toFixed(2)}%`);
      }

      expect(regression).toBeLessThan(10);
    }, 20000);

    it('should alert on >15% page weight increase', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const currentWeight = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .reduce((sum, r) => sum + (r.transferSize || 0), 0);
      });

      const baselineWeight = 1.5 * 1024 * 1024; // 1.5MB baseline
      const increase = ((currentWeight - baselineWeight) / baselineWeight) * 100;

      if (increase > 15) {
        console.warn(`Page weight increased: ${increase.toFixed(2)}%`);
      }

      expect(increase).toBeLessThan(15);
    }, 15000);
  });
});

// Helper Functions

async function collectPerformanceMetrics(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paintEntries = performance.getEntriesByType('paint');

    return {
      navigationTiming: {
        domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart,
        loadComplete: navigation?.loadEventEnd - navigation?.loadEventStart,
      },
      paintTiming: {
        firstPaint: paintEntries.find(e => e.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime || 0,
      },
      resourceCount: performance.getEntriesByType('resource').length,
      totalTransferSize: performance.getEntriesByType('resource')
        .reduce((sum, r) => sum + (r.transferSize || 0), 0),
    };
  });

  return metrics;
}

function detectRegressions(baseline, current, threshold = 10) {
  const regressions = [];

  // Compare navigation timing
  if (current.navigationTiming.domContentLoaded > baseline.navigationTiming.domContentLoaded) {
    const percentChange = ((current.navigationTiming.domContentLoaded - baseline.navigationTiming.domContentLoaded) /
      baseline.navigationTiming.domContentLoaded) * 100;

    if (percentChange > threshold) {
      regressions.push({
        metric: 'domContentLoaded',
        baseline: baseline.navigationTiming.domContentLoaded,
        current: current.navigationTiming.domContentLoaded,
        percentChange,
      });
    }
  }

  // Compare paint timing
  if (current.paintTiming.firstContentfulPaint > baseline.paintTiming.firstContentfulPaint) {
    const percentChange = ((current.paintTiming.firstContentfulPaint - baseline.paintTiming.firstContentfulPaint) /
      baseline.paintTiming.firstContentfulPaint) * 100;

    if (percentChange > threshold) {
      regressions.push({
        metric: 'firstContentfulPaint',
        baseline: baseline.paintTiming.firstContentfulPaint,
        current: current.paintTiming.firstContentfulPaint,
        percentChange,
      });
    }
  }

  return regressions;
}

async function measureLCP(page) {
  return await page.evaluate(() => {
    return new Promise(resolve => {
      let lcp = 0;

      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        lcp = lastEntry.renderTime || lastEntry.loadTime;
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });

      // Resolve after load
      window.addEventListener('load', () => {
        setTimeout(() => {
          observer.disconnect();
          resolve(lcp);
        }, 2000);
      });
    });
  });
}

async function measureFID(page) {
  return await page.evaluate(() => {
    return new Promise(resolve => {
      let fid = null;

      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          fid = entries[0].processingStart - entries[0].startTime;
          observer.disconnect();
          resolve(fid);
        }
      });

      observer.observe({ entryTypes: ['first-input'] });

      // Timeout after 5 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(fid);
      }, 5000);
    });
  });
}

async function measureCLS(page) {
  return await page.evaluate(() => {
    return new Promise(resolve => {
      let cls = 0;

      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            cls += entry.value;
          }
        }
      });

      observer.observe({ entryTypes: ['layout-shift'] });

      // Measure for 5 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(cls);
      }, 5000);
    });
  });
}

async function measureFCP(page) {
  return await page.evaluate(() => {
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
    return fcp ? fcp.startTime : 0;
  });
}
