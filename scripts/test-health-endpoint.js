#!/usr/bin/env node

/**
 * Health Endpoint Validation Script
 * 
 * Tests the /api/health/check endpoint to ensure it's working correctly
 * for CI/CD health checks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testHealthEndpoint(baseUrl = 'http://localhost:3000') {
  const healthUrl = `${baseUrl}/api/health/check`;
  
  console.log('🏥 Testing health endpoint...');
  console.log(`URL: ${healthUrl}`);
  console.log('');
  
  try {
    // Test with curl to simulate CI/CD environment
    const { stdout, stderr } = await execAsync(`curl -f -s -w "\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}" "${healthUrl}"`);
    
    const lines = stdout.split('\n');
    const httpCode = lines.find(line => line.startsWith('HTTP_CODE:'))?.split(':')[1];
    const timeTotal = lines.find(line => line.startsWith('TIME_TOTAL:'))?.split(':')[1];
    
    // Parse JSON response (everything except the last two lines)
    const jsonResponse = lines.slice(0, -2).join('\n');
    
    console.log('✅ Health check successful!');
    console.log(`HTTP Status: ${httpCode}`);
    console.log(`Response Time: ${parseFloat(timeTotal) * 1000}ms`);
    console.log('');
    
    try {
      const healthData = JSON.parse(jsonResponse);
      console.log('📊 Health Status:');
      console.log(`  Overall Status: ${healthData.status}`);
      console.log(`  Health Score: ${healthData.health_score || 'N/A'}`);
      console.log('');
      
      if (healthData.services) {
        console.log('🔧 Service Status:');
        Object.entries(healthData.services).forEach(([service, status]) => {
          const icon = status.status === 'healthy' ? '✅' : 
                      status.status === 'degraded' ? '⚠️' : '❌';
          console.log(`  ${icon} ${service}: ${status.status} (${status.response_time}ms)`);
        });
        console.log('');
      }
      
      if (healthData.recommendations && healthData.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        healthData.recommendations.forEach(rec => {
          const icon = rec.severity === 'critical' ? '🚨' : 
                      rec.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`  ${icon} ${rec.service}: ${rec.action}`);
        });
        console.log('');
      }
      
      return {
        success: httpCode === '200',
        status: healthData.status,
        responseTime: parseFloat(timeTotal) * 1000
      };
      
    } catch (parseError) {
      console.log('⚠️ Could not parse JSON response, but endpoint responded');
      console.log('Raw response:', jsonResponse);
      return {
        success: httpCode === '200',
        status: 'unknown',
        responseTime: parseFloat(timeTotal) * 1000
      };
    }
    
  } catch (error) {
    console.error('❌ Health check failed!');
    console.error(`Error: ${error.message}`);
    
    // Try to get more details
    try {
      const { stdout: debugOutput } = await execAsync(`curl -v "${healthUrl}" 2>&1 || true`);
      console.log('');
      console.log('🔍 Debug output:');
      console.log(debugOutput);
    } catch (debugError) {
      console.error('Could not get debug info:', debugError.message);
    }
    
    return {
      success: false,
      status: 'error',
      error: error.message
    };
  }
}

async function main() {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  
  console.log('🎪 A Lo Cubano Boulder Fest - Health Endpoint Test');
  console.log('==================================================');
  console.log('');
  
  const result = await testHealthEndpoint(baseUrl);
  
  if (result.success) {
    console.log('🎉 Health endpoint test passed!');
    process.exit(0);
  } else {
    console.log('💥 Health endpoint test failed!');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { testHealthEndpoint };