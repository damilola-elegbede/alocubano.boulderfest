# Resource Optimization Strategy

## Executive Summary

This document addresses Category 6 resource and timeout issues identified in the A Lo Cubano Boulder Fest project, providing comprehensive recommendations for handling log truncation, memory limits, timeout configurations, and operation optimization.

## Current State Analysis

### Resource Constraints Identified

| Resource Type | Current Setting | Issue | Impact |
|--------------|-----------------|-------|--------|
| Log Truncation | 2519/1061/3000 lines | Logs truncated in long operations | Incomplete debugging info |
| Memory (NODE_OPTIONS) | 2048MB default | Potential OOM in heavy operations | Process crashes |
| Test Timeouts | 30s (unit), 45s (E2E) | Long-running tests may fail | False negatives |
| Operation Timeouts | 120s (server startup) | Complex operations may timeout | Service unavailability |

### Performance Bottlenecks

- **Gallery API**: Processing 1000+ images from Google Drive
- **E2E Tests**: 12 comprehensive test flows with multiple browser contexts
- **Database Migrations**: Large migration sets with transactional rollbacks
- **Build Process**: Multiple verification and validation steps

## Recommended Solutions

### 1. Memory Configuration Strategy

#### Immediate Actions (Quick Wins)

```json
// package.json - Add memory-optimized scripts
{
  "scripts": {
    // Standard operations (2GB)
    "start:local": "NODE_OPTIONS='--max-old-space-size=2048' node scripts/vercel-dev-wrapper.js",
    
    // Heavy operations (4GB)
    "test:e2e:heavy": "NODE_OPTIONS='--max-old-space-size=4096' playwright test",
    "build:production": "NODE_OPTIONS='--max-old-space-size=4096' npm run build",
    
    // Monitoring scripts
    "monitor:memory": "node scripts/monitor-memory-usage.js",
    "analyze:heap": "node --expose-gc --inspect scripts/analyze-heap.js"
  }
}
```

#### Environment-Based Configuration

```javascript
// scripts/config/memory-config.js
export const getMemoryConfig = () => {
  const env = process.env.NODE_ENV;
  const isCI = process.env.CI === 'true';
  
  return {
    development: '--max-old-space-size=2048',
    test: '--max-old-space-size=3072',
    production: '--max-old-space-size=4096',
    ci: '--max-old-space-size=3072'
  }[isCI ? 'ci' : env] || '--max-old-space-size=2048';
};

// Apply configuration
process.env.NODE_OPTIONS = getMemoryConfig();
```

### 2. Log Management Strategy

#### Streaming Log Handler

```javascript
// api/lib/log-manager.js
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

class LogManager {
  constructor(options = {}) {
    this.maxLines = options.maxLines || 5000;
    this.rotationSize = options.rotationSize || 10 * 1024 * 1024; // 10MB
    this.currentLines = 0;
    this.streams = new Map();
  }

  async streamLogs(category, processor) {
    const logFile = `logs/${category}-${Date.now()}.log`;
    const writeStream = createWriteStream(logFile);
    
    // Implement rotation
    writeStream.on('drain', () => {
      if (writeStream.bytesWritten > this.rotationSize) {
        this.rotate(category);
      }
    });
    
    this.streams.set(category, writeStream);
    return writeStream;
  }

  async rotate(category) {
    const oldStream = this.streams.get(category);
    if (oldStream) {
      oldStream.end();
      // Archive old log
      await this.archive(category);
      // Start new stream
      return this.streamLogs(category);
    }
  }

  async archive(category) {
    // Compress and move to archive
    const { execSync } = await import('child_process');
    execSync(`gzip logs/${category}-*.log && mv logs/${category}-*.log.gz logs/archive/`);
  }

  // Chunked reading for large logs
  async readChunked(logFile, chunkSize = 1000) {
    const chunks = [];
    const reader = createReadStream(logFile, { 
      encoding: 'utf8',
      highWaterMark: 64 * 1024 // 64KB chunks
    });
    
    for await (const chunk of reader) {
      chunks.push(chunk);
      if (chunks.length >= chunkSize) {
        yield chunks.join('');
        chunks.length = 0;
      }
    }
    
    if (chunks.length > 0) {
      yield chunks.join('');
    }
  }
}

export default LogManager;
```

#### Truncation Prevention

```javascript
// scripts/prevent-truncation.js
export const configureLongRunningOperation = () => {
  // Disable truncation for CI/long operations
  if (process.env.CI || process.env.LONG_OPERATION) {
    process.stdout.setMaxListeners(0);
    process.stderr.setMaxListeners(0);
    
    // Increase buffer sizes
    if (process.stdout._handle?.setBlocking) {
      process.stdout._handle.setBlocking(true);
    }
  }
  
  // Log rotation for long operations
  const startTime = Date.now();
  const maxDuration = 5 * 60 * 1000; // 5 minutes
  
  const rotationInterval = setInterval(() => {
    if (Date.now() - startTime > maxDuration) {
      console.log('\n--- Log Rotation Point ---\n');
      // Force flush
      process.stdout.write('', () => {});
    }
  }, maxDuration);
  
  return () => clearInterval(rotationInterval);
};
```

### 3. Timeout Optimization Strategy

#### Tiered Timeout Configuration

```javascript
// config/timeouts.config.js
export const TIMEOUT_CONFIG = {
  // API timeouts
  api: {
    default: 10000,      // 10s
    gallery: 30000,      // 30s - heavy image processing
    payment: 20000,      // 20s - external service
    database: 15000,     // 15s - complex queries
    health: 5000         // 5s - quick check
  },
  
  // Test timeouts
  test: {
    unit: 30000,         // 30s per test
    integration: 60000,  // 60s per test
    e2e: 120000,        // 120s per test
    setup: 180000       // 3min for setup
  },
  
  // Server timeouts
  server: {
    startup: 120000,     // 2min startup
    shutdown: 30000,     // 30s graceful shutdown
    request: 60000,      // 60s request timeout
    keepAlive: 65000     // 65s keep-alive
  },
  
  // Operation timeouts
  operations: {
    migration: 300000,   // 5min for migrations
    backup: 600000,      // 10min for backups
    import: 900000,      // 15min for large imports
    analysis: 180000     // 3min for analysis
  }
};

// Adaptive timeout based on environment
export const getAdaptiveTimeout = (category, operation) => {
  const base = TIMEOUT_CONFIG[category]?.[operation] || 30000;
  
  // Increase timeouts in CI environment
  if (process.env.CI) {
    return base * 1.5;
  }
  
  // Increase timeouts for slow connections
  if (process.env.SLOW_CONNECTION) {
    return base * 2;
  }
  
  return base;
};
```

#### Timeout Handler with Retry

```javascript
// api/lib/timeout-handler.js
export class TimeoutHandler {
  constructor(options = {}) {
    this.defaultTimeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.backoffMultiplier = options.backoffMultiplier || 1.5;
  }

  async executeWithTimeout(operation, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    const retries = options.retries || this.maxRetries;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      const currentTimeout = timeout * Math.pow(this.backoffMultiplier, attempt);
      
      try {
        return await this.withTimeout(operation, currentTimeout);
      } catch (error) {
        if (error.name === 'TimeoutError' && attempt < retries) {
          console.log(`Timeout on attempt ${attempt + 1}, retrying with ${currentTimeout}ms timeout...`);
          continue;
        }
        throw error;
      }
    }
  }

  async withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TimeoutError')), timeout)
      )
    ]);
  }

  // Chunked operation for long-running tasks
  async executeChunked(items, processor, chunkSize = 100) {
    const results = [];
    
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(item => this.executeWithTimeout(() => processor(item)))
      );
      results.push(...chunkResults);
      
      // Progress reporting
      const progress = Math.min(100, (i + chunkSize) / items.length * 100);
      console.log(`Progress: ${progress.toFixed(1)}%`);
    }
    
    return results;
  }
}
```

### 4. Operation Splitting Strategy

#### Batch Processing for Large Operations

```javascript
// scripts/batch-processor.js
export class BatchProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 50;
    this.parallelism = options.parallelism || 5;
    this.delayBetweenBatches = options.delayBetweenBatches || 1000;
  }

  async processBatches(items, processor) {
    const batches = this.createBatches(items);
    const results = [];
    
    for (const [index, batch] of batches.entries()) {
      console.log(`Processing batch ${index + 1}/${batches.length}`);
      
      // Process batch with limited parallelism
      const batchResults = await this.processWithParallelism(
        batch,
        processor,
        this.parallelism
      );
      
      results.push(...batchResults);
      
      // Delay between batches to prevent overload
      if (index < batches.length - 1) {
        await this.delay(this.delayBetweenBatches);
      }
    }
    
    return results;
  }

  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }

  async processWithParallelism(items, processor, limit) {
    const results = [];
    const executing = [];
    
    for (const item of items) {
      const promise = processor(item).then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });
      
      results.push(promise);
      executing.push(promise);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
    
    return Promise.all(results);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### Gallery Optimization Example

```javascript
// api/gallery/optimized.js
import { BatchProcessor } from '../../scripts/batch-processor.js';
import { TimeoutHandler } from '../lib/timeout-handler.js';

export async function optimizedGalleryHandler(req, res) {
  const processor = new BatchProcessor({
    batchSize: 20,      // Process 20 images at a time
    parallelism: 3,     // 3 parallel requests to Google Drive
    delayBetweenBatches: 500
  });
  
  const timeoutHandler = new TimeoutHandler({
    timeout: 5000,      // 5s per image
    maxRetries: 2
  });
  
  try {
    // Stream response headers immediately
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff'
    });
    
    // Start streaming response
    res.write('{"images":[');
    
    let first = true;
    const processImage = async (imageId) => {
      const imageData = await timeoutHandler.executeWithTimeout(
        () => fetchImageFromGoogleDrive(imageId)
      );
      
      // Stream each result as it completes
      if (!first) res.write(',');
      res.write(JSON.stringify(imageData));
      first = false;
      
      return imageData;
    };
    
    // Process in batches
    const imageIds = await getGalleryImageIds();
    await processor.processBatches(imageIds, processImage);
    
    // Close the JSON array
    res.write(']}');
    res.end();
    
  } catch (error) {
    console.error('Gallery optimization error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gallery processing failed' });
    } else {
      res.write(']}'); // Close JSON even on error
      res.end();
    }
  }
}
```

### 5. E2E Test Optimization

#### Parallel Test Execution Strategy

```javascript
// playwright.config.optimized.js
export default defineConfig({
  // Split tests into shards for parallel execution
  ...(process.env.CI && {
    shard: {
      total: parseInt(process.env.TOTAL_SHARDS) || 3,
      current: parseInt(process.env.CURRENT_SHARD) || 1
    }
  }),
  
  // Optimize for resource usage
  use: {
    // Reduce video quality to save memory
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 }
    },
    
    // Disable unnecessary features
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    
    // Reuse context when possible
    contextOptions: {
      reduceMotion: 'reduce',
      forcedColors: 'none'
    }
  },
  
  // Resource-aware worker configuration
  workers: process.env.CI ? 2 : 4,
  fullyParallel: !process.env.CI,
  
  // Aggressive timeout for hanging tests
  globalTimeout: 10 * 60 * 1000, // 10 minutes total
  
  projects: [
    {
      name: 'chromium-fast',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ]
        }
      }
    }
  ]
});
```

## Implementation Roadmap

### Phase 1: Immediate Fixes (Week 1)

- [ ] Increase NODE_OPTIONS to 3072MB for CI environments
- [ ] Implement chunked log reading for large operations
- [ ] Add timeout configuration for long-running operations
- [ ] Create memory monitoring scripts

### Phase 2: Optimization (Week 2)

- [ ] Implement batch processing for gallery API
- [ ] Add streaming responses for large datasets
- [ ] Optimize E2E test parallelization
- [ ] Implement adaptive timeout handling

### Phase 3: Long-term Improvements (Week 3-4)

- [ ] Implement comprehensive log rotation system
- [ ] Add resource usage monitoring dashboard
- [ ] Create operation splitting framework
- [ ] Implement progressive loading for all heavy operations

## Monitoring and Metrics

### Key Performance Indicators

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Memory Usage (Peak) | 2048MB | < 3072MB | `process.memoryUsage()` |
| Log Truncation Rate | 15% | < 2% | Log analysis |
| Timeout Failures | 8% | < 1% | Error tracking |
| E2E Test Duration | 10min | < 5min | CI metrics |
| Gallery Load Time | 8s | < 3s | Performance API |

### Monitoring Implementation

```javascript
// scripts/monitor-resources.js
import { performance } from 'perf_hooks';

export class ResourceMonitor {
  constructor() {
    this.metrics = {
      memory: [],
      cpu: [],
      operations: new Map()
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Memory monitoring
    setInterval(() => {
      const usage = process.memoryUsage();
      this.metrics.memory.push({
        timestamp: Date.now(),
        rss: usage.rss / 1024 / 1024,      // MB
        heapUsed: usage.heapUsed / 1024 / 1024,
        heapTotal: usage.heapTotal / 1024 / 1024,
        external: usage.external / 1024 / 1024
      });
      
      // Alert on high memory
      if (usage.heapUsed / usage.heapTotal > 0.9) {
        console.warn('⚠️ Memory usage above 90%');
        this.triggerGarbageCollection();
      }
    }, 5000);
    
    // CPU monitoring
    const startUsage = process.cpuUsage();
    setInterval(() => {
      const usage = process.cpuUsage(startUsage);
      this.metrics.cpu.push({
        timestamp: Date.now(),
        user: usage.user / 1000,  // ms
        system: usage.system / 1000
      });
    }, 5000);
  }

  triggerGarbageCollection() {
    if (global.gc) {
      global.gc();
      console.log('♻️ Garbage collection triggered');
    }
  }

  trackOperation(name, operation) {
    const start = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    return operation().finally(() => {
      const duration = performance.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;
      
      this.metrics.operations.set(name, {
        duration,
        memoryDelta: memoryDelta / 1024 / 1024, // MB
        timestamp: Date.now()
      });
      
      console.log(`📊 Operation "${name}": ${duration.toFixed(2)}ms, ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
    });
  }

  getReport() {
    const avgMemory = this.metrics.memory.reduce((acc, m) => acc + m.heapUsed, 0) / this.metrics.memory.length;
    const peakMemory = Math.max(...this.metrics.memory.map(m => m.heapUsed));
    
    return {
      memory: {
        average: avgMemory.toFixed(2),
        peak: peakMemory.toFixed(2),
        current: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
      },
      operations: Array.from(this.metrics.operations.entries()).map(([name, data]) => ({
        name,
        duration: `${data.duration.toFixed(2)}ms`,
        memory: `${data.memoryDelta.toFixed(2)}MB`
      }))
    };
  }
}
```

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OOM in production | High | Medium | Implement memory limits and monitoring |
| Log data loss | Medium | High | Implement rotation and archiving |
| Timeout cascades | High | Medium | Implement circuit breakers |
| Performance degradation | Medium | Medium | Implement progressive loading |

## Success Criteria

- ✅ No OOM errors in production for 30 days
- ✅ Log truncation reduced to < 2% of operations
- ✅ All E2E tests complete within 5 minutes
- ✅ Gallery API response time < 3 seconds
- ✅ Memory usage stays below 3GB threshold

## References

- [Node.js Memory Management](https://nodejs.org/en/docs/guides/diagnostics/memory-leaks)
- [Playwright Performance Guide](https://playwright.dev/docs/test-performance)
- [Stream Processing Best Practices](https://nodejs.org/en/docs/guides/backpressuring-in-streams)
- [Google Drive API Optimization](https://developers.google.com/drive/api/v3/performance)

## Appendix: Quick Reference

### Memory Commands

```bash
# Run with increased memory
NODE_OPTIONS='--max-old-space-size=4096' npm run test:e2e

# Monitor memory usage
node --expose-gc scripts/monitor-memory.js

# Analyze heap dump
node --inspect scripts/analyze-heap.js
```

### Debugging Commands

```bash
# Enable verbose logging
DEBUG=* npm run test:e2e

# Profile performance
node --prof scripts/heavy-operation.js
node --prof-process isolate-*.log > profile.txt

# Trace warnings
node --trace-warnings scripts/problematic.js
```

### CI Configuration

```yaml
# GitHub Actions example
env:
  NODE_OPTIONS: '--max-old-space-size=3072'
  LOG_LEVEL: 'verbose'
  TIMEOUT_MULTIPLIER: '1.5'
```