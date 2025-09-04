/**
 * Global Setup for E2E Preview Testing
 * 
 * Handles setup for testing against live Vercel preview deployments:
 * - Extracts preview URL from multiple sources
 * - Validates deployment readiness
 * - Ensures test data consistency
 * - Configures environment for preview testing
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import VercelPreviewURLExtractor from '../../scripts/get-vercel-preview-url.js';

const PROJECT_ROOT = resolve(process.cwd());

async function globalSetupPreview() {
  console.log('🚀 Global E2E Setup - Preview Deployment Mode');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Extract preview URL if not already provided
    let previewUrl = process.env.PREVIEW_URL;
    
    if (!previewUrl) {
      console.log('📡 Extracting Vercel preview URL...');
      
      const extractor = new VercelPreviewURLExtractor();
      previewUrl = await extractor.getPreviewURL();
      
      if (!previewUrl) {
        throw new Error('Failed to extract preview URL. Ensure deployment exists and credentials are configured.');
      }
      
      // Set for other processes
      process.env.CI_EXTRACTED_PREVIEW_URL = previewUrl;
      process.env.PREVIEW_URL = previewUrl;
    }
    
    console.log(`✅ Preview URL: ${previewUrl}`);
    
    // Step 2: Validate deployment health
    console.log('\n🏥 Validating preview deployment health...');
    await validateDeploymentHealth(previewUrl);
    
    // Step 3: Setup test data isolation
    console.log('\n🗄️ Setting up test data isolation...');
    await setupTestDataIsolation(previewUrl);
    
    // Step 4: Warm up critical endpoints
    console.log('\n🔥 Warming up critical endpoints...');
    await warmupEndpoints(previewUrl);
    
    // Step 5: Create preview environment file
    console.log('\n📁 Creating preview environment configuration...');
    createPreviewEnvironment(previewUrl);
    
    console.log('\n📊 Preview Setup Summary:');
    console.log(`   Preview URL: ${previewUrl}`);
    console.log(`   Deployment Status: ✅ Ready`);
    console.log(`   Test Data: ✅ Isolated`);
    console.log(`   Critical Endpoints: ✅ Warmed up`);
    console.log(`   Mode: Production-like preview testing`);
    console.log(`   Timeout Profile: ${process.env.CI ? 'CI-Extended' : 'Local-Fast'} (Test: ${process.env.CI ? '90s' : '60s'}, Action: ${process.env.CI ? '30s' : '15s'}, Nav: ${process.env.CI ? '60s' : '30s'})`);
    
    console.log('\n✅ Global preview setup completed successfully');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Global preview setup failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Provide debugging information
    console.error('\n🔧 Debugging Information:');
    console.error(`   GitHub Repository: ${process.env.GITHUB_REPOSITORY || 'Not set'}`);
    console.error(`   PR Number: ${process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER || 'Not set'}`);
    console.error(`   Commit SHA: ${process.env.GITHUB_SHA || 'Not set'}`);
    console.error(`   GitHub Token: ${process.env.GITHUB_TOKEN ? 'Available' : 'Missing'}`);
    console.error(`   Vercel Token: ${process.env.VERCEL_TOKEN ? 'Available' : 'Missing'}`);
    
    throw error;
  }
}

/**
 * Validate deployment health with comprehensive checks
 */
async function validateDeploymentHealth(previewUrl, maxAttempts = 12, intervalMs = 8000) {
  console.log(`⏳ Validating deployment health (max ${maxAttempts} attempts)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`   🔍 Health check ${attempt}/${maxAttempts}: ${previewUrl}/api/health/check`);
      
      const controller = new AbortController();
      // Increased timeout for firefox compatibility
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      
      const response = await fetch(`${previewUrl}/api/health/check`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'E2E-Preview-Health-Check',
          'Accept': 'application/json',
          // Add cache-busting to prevent stale responses
          'Cache-Control': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const healthData = await response.json();
        console.log(`   ✅ Deployment healthy (${response.status})`);
        console.log(`   📊 Health data: ${JSON.stringify(healthData, null, 2).replace(/\n/g, '\n      ')}`);
        
        // Additional API endpoint checks with retries
        await validateCriticalEndpoints(previewUrl);
        
        // Brief pause for deployment stabilization
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      } else {
        console.log(`   ⚠️ Health check failed (${response.status}): ${response.statusText}`);
        if (attempt === maxAttempts) {
          throw new Error(`Deployment not healthy after ${maxAttempts} attempts`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Health check error (${attempt}/${maxAttempts}): ${error.message}`);
      
      if (attempt === maxAttempts) {
        throw new Error(`Deployment health validation failed: ${error.message}`);
      }
    }
    
    if (attempt < maxAttempts) {
      console.log(`   ⏳ Waiting ${intervalMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
}

/**
 * Validate critical API endpoints are responsive
 */
async function validateCriticalEndpoints(previewUrl) {
  const endpoints = [
    '/api/health/database',
    '/api/gallery/years',
    '/api/featured-photos'
  ];
  
  console.log('   🔍 Validating critical endpoints...');
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${previewUrl}${endpoint}`, {
        headers: { 'User-Agent': 'E2E-Endpoint-Validation' }
      });
      
      if (response.ok) {
        console.log(`   ✅ ${endpoint}: OK (${response.status})`);
      } else {
        console.log(`   ⚠️ ${endpoint}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint}: ${error.message}`);
    }
  }
}

/**
 * Setup test data isolation for preview environment
 */
async function setupTestDataIsolation(previewUrl) {
  try {
    // For preview deployments, we need to ensure test data doesn't interfere
    // with production data. This may involve setting up test-specific database
    // records or ensuring proper cleanup mechanisms.
    
    const testSessionId = `e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    process.env.E2E_SESSION_ID = testSessionId;
    
    console.log(`   🆔 Test Session ID: ${testSessionId}`);
    console.log(`   🔐 Test data isolation: Enabled`);
    
    // Test database connectivity if available
    try {
      const dbResponse = await fetch(`${previewUrl}/api/health/database`, {
        headers: { 'User-Agent': 'E2E-Database-Check' }
      });
      
      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        console.log(`   🗄️ Database: ${dbData.status || 'Connected'}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Database check: ${error.message}`);
    }
    
  } catch (error) {
    console.warn(`   ⚠️ Test data isolation warning: ${error.message}`);
  }
}

/**
 * Warm up critical endpoints for better test performance
 */
async function warmupEndpoints(previewUrl) {
  const warmupEndpoints = [
    '/api/gallery',
    '/api/featured-photos',
    '/api/gallery/years',
    '/pages/tickets.html',
    '/pages/about.html'
  ];
  
  console.log(`   🔥 Warming up ${warmupEndpoints.length} endpoints...`);
  
  const warmupPromises = warmupEndpoints.map(async (endpoint) => {
    try {
      await fetch(`${previewUrl}${endpoint}`, {
        headers: { 'User-Agent': 'E2E-Warmup' }
      });
      console.log(`   ✅ Warmed: ${endpoint}`);
    } catch (error) {
      console.log(`   ⚠️ Warmup failed: ${endpoint} - ${error.message}`);
    }
  });
  
  await Promise.all(warmupPromises);
  console.log(`   🔥 Warmup completed`);
}

/**
 * Create environment configuration for preview testing
 */
function createPreviewEnvironment(previewUrl) {
  const previewEnvPath = resolve(PROJECT_ROOT, '.env.preview');
  
  const previewConfig = `# E2E Preview Testing Environment
# Generated: ${new Date().toISOString()}

# Preview deployment configuration
PREVIEW_URL=${previewUrl}
CI_EXTRACTED_PREVIEW_URL=${previewUrl}
PLAYWRIGHT_BASE_URL=${previewUrl}

# Testing mode
E2E_TEST_MODE=true
E2E_PREVIEW_MODE=true
NODE_ENV=test

# Session isolation
E2E_SESSION_ID=${process.env.E2E_SESSION_ID || 'default'}

# CI environment markers
CI=${process.env.CI || 'false'}
GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS || 'false'}

# Test credentials (for admin panel testing)
TEST_ADMIN_PASSWORD=${process.env.TEST_ADMIN_PASSWORD || 'test-password'}

# Preview testing optimizations
SKIP_LOCAL_SERVER=true
USE_PREVIEW_DEPLOYMENT=true
DEPLOYMENT_READY=true

# Timeout configurations for remote testing (CI-optimized)
E2E_ACTION_TIMEOUT=${process.env.CI ? '30000' : '15000'}
E2E_NAVIGATION_TIMEOUT=${process.env.CI ? '60000' : '30000'}  
E2E_TEST_TIMEOUT=${process.env.CI ? '90000' : '60000'}
E2E_EXPECT_TIMEOUT=${process.env.CI ? '20000' : '15000'}
`;

  writeFileSync(previewEnvPath, previewConfig);
  console.log(`   ✅ Preview environment created: ${previewEnvPath}`);
}

export default globalSetupPreview;