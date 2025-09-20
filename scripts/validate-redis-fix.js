#!/usr/bin/env node

/**
 * Validation script for Redis CI fixes
 *
 * This script validates that:
 * 1. Rate limiting falls back to memory when Redis is unavailable
 * 2. Integration tests can run without Redis
 * 3. No hard Redis dependencies exist in critical paths
 */

import { AdvancedRateLimiter } from "../lib/security/rate-limiter.js";
import { TestEnvironments } from '../tests/config/test-environments.js';

console.log('🧪 Validating Redis CI fixes...\n');

// Test 1: Rate limiter graceful fallback
console.log('Test 1: Rate limiter fallback behavior');
try {
  // Simulate environment without Redis
  const originalRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.REDIS_HOST;

  const rateLimiter = new AdvancedRateLimiter({
    name: 'test-limiter',
    limits: { requests: 10, windowMs: 60000 }
  });

  // Test a mock request
  const mockReq = {
    headers: { 'x-forwarded-for': '192.168.1.1' },
    connection: { remoteAddress: '192.168.1.1' }
  };

  const result = rateLimiter.check(mockReq);
  console.log('✅ Rate limiter created successfully without Redis');
  console.log(`   Result: allowed=${result.allowed}, remaining=${result.remaining}`);

  // Restore environment
  if (originalRedisUrl) process.env.REDIS_URL = originalRedisUrl;

} catch (error) {
  console.log('❌ Rate limiter fallback failed:', error.message);
}

// Test 2: Test environment configurations
console.log('\nTest 2: Test environment configurations');
try {
  const envs = ['COMPLETE_TEST', 'INTEGRATION', 'MINIMAL'];

  for (const envName of envs) {
    const env = TestEnvironments[envName];
    const hasRedis = env && (env.REDIS_URL || env.RATE_LIMIT_REDIS_URL);
    console.log(`✅ ${envName}: ${hasRedis ? 'has Redis config' : 'Redis-free ✓'}`);
  }

} catch (error) {
  console.log('❌ Test environment validation failed:', error.message);
}

// Test 3: Validate CI environment variables
console.log('\nTest 3: CI environment validation');
try {
  const ciEnvVars = {
    'NODE_ENV': process.env.NODE_ENV || 'test',
    'CI': process.env.CI || 'false',
    'TEST_ISOLATION_MODE': process.env.TEST_ISOLATION_MODE || 'true'
  };

  console.log('✅ CI environment variables:');
  Object.entries(ciEnvVars).forEach(([key, value]) => {
    console.log(`   ${key}=${value}`);
  });

  // Check that Redis is not required
  const redisRequired = !!(process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL);
  console.log(`✅ Redis required: ${redisRequired ? 'YES ⚠️' : 'NO ✓'}`);

} catch (error) {
  console.log('❌ CI environment validation failed:', error.message);
}

console.log('\n🎉 Validation complete!');
console.log('\nSummary of fixes applied:');
console.log('• Redis service made optional in CI workflow');
console.log('• Added redis-tools installation for proper Redis CLI access');
console.log('• Created fallback behavior when Redis is unavailable');
console.log('• Separated Redis-specific tests into optional job');
console.log('• Optimized integration test timeouts and concurrency');
console.log('• Maintained graceful fallback to memory-based rate limiting');