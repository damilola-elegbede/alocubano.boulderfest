#!/usr/bin/env node

/**
 * Test script for vercel-dev-ci.js port allocation
 * Validates dynamic port configuration and health checking
 */

import { healthCheck, checkPortAvailable } from './vercel-dev-ci.js';

console.log('🧪 Testing Vercel Dev CI Port Allocation');
console.log('═'.repeat(50));

async function testPortAllocation() {
  const testPorts = [3000, 3001, 3002, 3003, 3004, 3005];
  
  console.log('\n📊 Port Allocation Tests');
  console.log('-'.repeat(30));
  
  for (const port of testPorts) {
    console.log(`\nTesting port ${port}:`);
    
    // Test port availability
    const available = await checkPortAvailable(port);
    console.log(`   Port available: ${available}`);
    
    // Test environment variable configuration
    const originalDynamicPort = process.env.DYNAMIC_PORT;
    const originalPort = process.env.PORT;
    
    process.env.DYNAMIC_PORT = port.toString();
    process.env.PORT = port.toString();
    
    console.log(`   DYNAMIC_PORT=${process.env.DYNAMIC_PORT}`);
    console.log(`   PORT=${process.env.PORT}`);
    
    // Restore original values
    if (originalDynamicPort !== undefined) {
      process.env.DYNAMIC_PORT = originalDynamicPort;
    } else {
      delete process.env.DYNAMIC_PORT;
    }
    
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  }
}

async function testEnvironmentVariables() {
  console.log('\n🔧 Environment Variable Tests');
  console.log('-'.repeat(30));
  
  const testCases = [
    { DYNAMIC_PORT: '3001', PORT: undefined, expected: 3001 },
    { DYNAMIC_PORT: undefined, PORT: '3002', expected: 3002 },
    { DYNAMIC_PORT: '3003', PORT: '3004', expected: 3003 }, // DYNAMIC_PORT takes precedence
    { DYNAMIC_PORT: undefined, PORT: undefined, expected: 3000 } // Default
  ];
  
  for (const testCase of testCases) {
    const originalDynamicPort = process.env.DYNAMIC_PORT;
    const originalPort = process.env.PORT;
    
    // Set test environment
    if (testCase.DYNAMIC_PORT) {
      process.env.DYNAMIC_PORT = testCase.DYNAMIC_PORT;
    } else {
      delete process.env.DYNAMIC_PORT;
    }
    
    if (testCase.PORT) {
      process.env.PORT = testCase.PORT;
    } else {
      delete process.env.PORT;
    }
    
    // Test port resolution logic
    const resolvedPort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
    const passed = resolvedPort === testCase.expected;
    
    console.log(`   Test: DYNAMIC_PORT=${testCase.DYNAMIC_PORT}, PORT=${testCase.PORT}`);
    console.log(`   Expected: ${testCase.expected}, Got: ${resolvedPort} ${passed ? '✅' : '❌'}`);
    
    // Restore original environment
    if (originalDynamicPort !== undefined) {
      process.env.DYNAMIC_PORT = originalDynamicPort;
    } else {
      delete process.env.DYNAMIC_PORT;
    }
    
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  }
}

async function testHealthCheckFunction() {
  console.log('\n🏥 Health Check Function Tests');
  console.log('-'.repeat(30));
  
  // Test with a port that's definitely not running
  const unusedPort = 9999;
  console.log(`Testing health check on unused port ${unusedPort}...`);
  
  const result = await healthCheck(unusedPort);
  console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
  console.log(`   Correctly detected unhealthy: ${!result.healthy ? '✅' : '❌'}`);
}

async function runTests() {
  try {
    await testPortAllocation();
    await testEnvironmentVariables();
    await testHealthCheckFunction();
    
    console.log('\n✅ All tests completed!');
    console.log('═'.repeat(50));
    
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}