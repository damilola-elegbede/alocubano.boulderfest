#!/usr/bin/env node
/**
 * Drift Detection Helper - Development utilities for mock drift detection
 * 
 * Features:
 * - Quick drift checks during development
 * - Mock response generation from real API responses
 * - Selective endpoint testing
 * - Development server management
 */

import fs from 'fs/promises';
import path from 'path';
import { MockDriftDetector } from './mock-drift-detector.js';

class DriftHelper {
  constructor() {
    this.mockServerPath = path.join(process.cwd(), 'tests/ci-mock-server.js');
  }

  async quickCheck(endpoints = []) {
    console.log('🔍 Running quick drift check...\n');
    
    const detector = new MockDriftDetector({
      verbose: true,
      outputDir: '.tmp/quick-drift'
    });
    
    // Filter endpoints if specified
    if (endpoints.length > 0) {
      detector.endpoints = detector.endpoints.filter(ep => 
        endpoints.some(pattern => ep.path.includes(pattern))
      );
    }
    
    const report = await detector.detectDrift();
    return report;
  }

  async generateMockFromReal(endpoint) {
    console.log(`📡 Generating mock response for ${endpoint}...\n`);
    
    const detector = new MockDriftDetector({ verbose: true });
    
    // Start real server only
    await detector.startServer('real', 3000, 'scripts/vercel-dev-wrapper.js');
    
    try {
      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const endpointConfig = detector.endpoints.find(ep => ep.path === endpoint);
      if (!endpointConfig) {
        throw new Error(`Endpoint ${endpoint} not found in configuration`);
      }
      
      const response = await detector.makeRequest(detector.baseURL, endpointConfig);
      
      console.log('📄 Real API Response:');
      console.log(JSON.stringify({
        status: response.status,
        data: response.data
      }, null, 2));
      
      console.log('\n📋 Mock Response Format:');
      console.log(`'${endpointConfig.method} ${endpointConfig.path}': {`);
      console.log(`  status: ${response.status},`);
      console.log(`  data: ${JSON.stringify(response.data, null, 2).replace(/\n/g, '\n  ')}`);
      console.log(`},`);
      
      return response;
      
    } finally {
      await detector.stopServer('real');
    }
  }

  async updateMockResponse(endpoint, newResponse) {
    console.log(`🔄 Updating mock response for ${endpoint}...\n`);
    
    try {
      const mockServerContent = await fs.readFile(this.mockServerPath, 'utf-8');
      
      // Find and replace the mock response
      const key = endpoint.replace('GET ', 'GET ').replace('POST ', 'POST ');
      const regex = new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*{[^}]+}`, 'g');
      
      const updatedContent = mockServerContent.replace(regex, 
        `'${key}': {\n    status: ${newResponse.status},\n    data: ${JSON.stringify(newResponse.data, null, 4).replace(/\n/g, '\n    ')}\n  }`
      );
      
      await fs.writeFile(this.mockServerPath, updatedContent);
      console.log('✅ Mock response updated successfully');
      
      // Verify the update worked
      await this.quickCheck([endpoint]);
      
    } catch (error) {
      console.error('❌ Failed to update mock response:', error.message);
      throw error;
    }
  }

  async listEndpoints() {
    const detector = new MockDriftDetector();
    
    console.log('📋 Available Endpoints for Drift Detection:\n');
    
    const byCategory = detector.endpoints.reduce((acc, ep) => {
      if (!acc[ep.category]) acc[ep.category] = [];
      acc[ep.category].push(ep);
      return acc;
    }, {});
    
    Object.entries(byCategory).forEach(([category, endpoints]) => {
      console.log(`📁 ${category.toUpperCase()}:`);
      endpoints.forEach(ep => {
        console.log(`   ${ep.method} ${ep.path}`);
      });
      console.log();
    });
  }

  async checkSpecificEndpoints(patterns) {
    console.log(`🎯 Checking specific endpoints matching: ${patterns.join(', ')}\n`);
    
    const report = await this.quickCheck(patterns);
    
    const driftedEndpoints = report.results.filter(r => !r.match);
    
    if (driftedEndpoints.length === 0) {
      console.log('✅ All specified endpoints are in sync!');
      return;
    }
    
    console.log(`⚠️ Found ${driftedEndpoints.length} drifted endpoints:\n`);
    
    driftedEndpoints.forEach(result => {
      console.log(`🔴 ${result.endpoint} (${result.severity} severity)`);
      result.differences.forEach(diff => {
        console.log(`   - ${diff.type}: ${diff.path}`);
        console.log(`     Mock: ${JSON.stringify(diff.mock)}`);
        console.log(`     Real: ${JSON.stringify(diff.real)}`);
      });
      console.log();
    });
  }

  async syncAllMocks() {
    console.log('🔄 Syncing all mock responses with real API...\n');
    
    const detector = new MockDriftDetector({ verbose: false });
    
    // Start real server
    await detector.startServer('real', 3000, 'scripts/vercel-dev-wrapper.js');
    
    try {
      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const responses = {};
      
      // Get all real responses
      for (const endpoint of detector.endpoints) {
        console.log(`📡 Fetching ${endpoint.method} ${endpoint.path}...`);
        const response = await detector.makeRequest(detector.baseURL, endpoint);
        responses[`${endpoint.method} ${endpoint.path}`] = {
          status: response.status,
          data: response.data
        };
      }
      
      // Update mock server file
      const mockServerContent = await fs.readFile(this.mockServerPath, 'utf-8');
      
      // Create backup
      await fs.writeFile(`${this.mockServerPath}.backup`, mockServerContent);
      console.log('💾 Created backup of mock server');
      
      // Generate new mock responses object
      let newMockResponses = '// Mock responses for all endpoints used by unit tests\nconst mockResponses = {\n';
      
      Object.entries(responses).forEach(([key, response]) => {
        newMockResponses += `  '${key}': {\n`;
        newMockResponses += `    status: ${response.status},\n`;
        newMockResponses += `    data: ${JSON.stringify(response.data, null, 4).replace(/\n/g, '\n    ')}\n`;
        newMockResponses += `  },\n`;
      });
      
      newMockResponses += '};';
      
      // Replace the mockResponses object in the file
      const updatedContent = mockServerContent.replace(
        /const mockResponses = {[\s\S]*?};/,
        newMockResponses
      );
      
      await fs.writeFile(this.mockServerPath, updatedContent);
      console.log('✅ All mock responses updated');
      
      // Verify sync worked
      console.log('\n🔍 Verifying sync...');
      await this.quickCheck();
      
    } finally {
      await detector.stopServer('real');
    }
  }
}

// CLI Support
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const helper = new DriftHelper();

  try {
    switch (command) {
      case 'quick':
      case 'check':
        await helper.quickCheck(args.slice(1));
        break;
        
      case 'generate':
        if (!args[1]) {
          console.error('❌ Please specify an endpoint path');
          console.log('Usage: npm run drift:generate /api/health/check');
          process.exit(1);
        }
        await helper.generateMockFromReal(args[1]);
        break;
        
      case 'update':
        if (!args[1] || !args[2]) {
          console.error('❌ Please specify endpoint and response data');
          console.log('Usage: npm run drift:update "GET /api/health/check" \'{"status": 200, "data": {...}}\'');
          process.exit(1);
        }
        const newResponse = JSON.parse(args[2]);
        await helper.updateMockResponse(args[1], newResponse);
        break;
        
      case 'list':
      case 'endpoints':
        await helper.listEndpoints();
        break;
        
      case 'specific':
        if (args.length < 2) {
          console.error('❌ Please specify endpoint patterns');
          console.log('Usage: npm run drift:specific health tickets');
          process.exit(1);
        }
        await helper.checkSpecificEndpoints(args.slice(1));
        break;
        
      case 'sync':
      case 'sync-all':
        await helper.syncAllMocks();
        break;
        
      case 'help':
      case '--help':
      case '-h':
      default:
        console.log(`
Mock Drift Detection Helper

Usage:
  node scripts/drift-helper.js <command> [options]

Commands:
  quick [patterns...]              Run quick drift check (optionally filtered)
  generate <endpoint>              Generate mock response from real API
  update <endpoint> <response>     Update specific mock response
  list                            List all available endpoints
  specific <patterns...>          Check specific endpoints only
  sync                            Sync all mock responses with real API
  help                            Show this help message

Examples:
  node scripts/drift-helper.js quick                    # Check all endpoints
  node scripts/drift-helper.js quick health tickets     # Check health & ticket endpoints
  node scripts/drift-helper.js generate /api/health/check
  node scripts/drift-helper.js list
  node scripts/drift-helper.js specific health
  node scripts/drift-helper.js sync                     # Dangerous: overwrites all mocks

Npm Scripts:
  npm run drift:quick              # Quick drift check
  npm run drift:list               # List endpoints  
  npm run drift:generate <path>    # Generate mock from real API
  npm run drift:sync               # Sync all mocks (use with caution)
`);
        break;
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    if (process.env.VERBOSE) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DriftHelper };