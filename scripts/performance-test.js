import https from 'https';
import { performance } from 'perf_hooks';

async function testEndpoint(url) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    https.get(url, (res) => {
      const end = performance.now();
      const duration = end - start;
      console.log(`${url}: ${res.statusCode} - ${duration.toFixed(2)}ms`);
      resolve({ url, status: res.statusCode, duration });
    }).on('error', reject);
  });
}

async function runPerformanceTests() {
  const baseUrl = process.env.BASE_URL || 'https://alocubano-boulderfest.vercel.app';
  const endpoints = ['/', '/tickets', '/about', '/artists'];
  
  console.log(`Performance testing: ${baseUrl}`);
  
  for (const endpoint of endpoints) {
    try {
      const result = await testEndpoint(`${baseUrl}${endpoint}`);
      if (result.duration > 2000) {
        console.warn(`⚠️  Slow response: ${endpoint} took ${result.duration}ms`);
      }
    } catch (error) {
      console.error(`❌ Failed to test ${endpoint}:`, error.message);
    }
  }
}

runPerformanceTests().catch(console.error);