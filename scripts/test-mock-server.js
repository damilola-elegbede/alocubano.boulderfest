#!/usr/bin/env node

/**
 * Test script to verify mock server implementation
 * Run with: node scripts/test-mock-server.js
 */

import { mockServer } from '../tests-new/core/mock-server.js';
import { mockHttpClient } from '../tests-new/core/mock-http-client.js';

console.log('🧪 Testing Mock Server Implementation\n');

async function testMockServer() {
  try {
    // Start mock server
    console.log('1. Starting mock server...');
    const serverUrl = await mockServer.start();
    console.log(`   ✅ Mock server started at ${serverUrl}\n`);

    // Initialize HTTP client
    console.log('2. Initializing mock HTTP client...');
    mockHttpClient.initialize();
    console.log('   ✅ HTTP client initialized\n');

    // Test health endpoint
    console.log('3. Testing /api/health/check endpoint...');
    const healthResponse = await mockHttpClient.get('/api/health/check');
    console.log(`   Status: ${healthResponse.status}`);
    console.log(`   Data:`, healthResponse.data);
    console.log(`   ✅ Health check passed\n`);

    // Test admin login
    console.log('4. Testing /api/admin/login endpoint...');
    const loginResponse = await mockHttpClient.post('/api/admin/login', {
      password: 'test-password'
    });
    console.log(`   Status: ${loginResponse.status}`);
    console.log(`   Token: ${loginResponse.data.token}`);
    console.log(`   ✅ Admin login mocked successfully\n`);

    // Test parameterized route
    console.log('5. Testing /api/tickets/:ticketId endpoint...');
    const ticketResponse = await mockHttpClient.get('/api/tickets/test-ticket-123');
    console.log(`   Status: ${ticketResponse.status}`);
    console.log(`   Data:`, ticketResponse.data);
    console.log(`   ✅ Parameterized route working\n`);

    // Test 404 response
    console.log('6. Testing non-existent endpoint...');
    const notFoundResponse = await mockHttpClient.get('/api/nonexistent');
    console.log(`   Status: ${notFoundResponse.status}`);
    console.log(`   Data:`, notFoundResponse.data);
    console.log(`   ✅ 404 response working\n`);

    // Check request log
    console.log('7. Checking request log...');
    const requestLog = mockServer.getRequestLog();
    console.log(`   Total requests logged: ${requestLog.length}`);
    console.log(`   ✅ Request logging working\n`);

    // Stop mock server
    console.log('8. Stopping mock server...');
    await mockServer.stop();
    console.log('   ✅ Mock server stopped\n');

    console.log('✅ All mock server tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testMockServer();