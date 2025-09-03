#!/usr/bin/env node

/**
 * Preview Environment Validation Script
 * 
 * Validates that the Vercel preview deployment environment is ready for E2E testing:
 * - Checks if preview URL is accessible
 * - Validates critical API endpoints
 * - Verifies database connectivity
 * - Tests authentication endpoints
 * - Checks performance baseline
 * 
 * Used by CI/CD and local development to ensure preview deployments are test-ready.
 */

import fetch from 'node-fetch';

class PreviewEnvironmentValidator {
  constructor() {
    this.previewUrl = process.env.PREVIEW_URL || process.env.CI_EXTRACTED_PREVIEW_URL;
    this.timeout = 10000; // 10 seconds per check
    this.healthChecks = [];
    this.errors = [];
    this.warnings = [];

    console.log('🔍 Preview Environment Validator');
    console.log(`   Preview URL: ${this.previewUrl || 'Not set'}`);
    console.log(`   Check Timeout: ${this.timeout}ms`);
  }

  /**
   * Main validation method
   */
  async validate() {
    console.log('\n🚀 Starting Preview Environment Validation');
    console.log('='.repeat(60));

    if (!this.previewUrl) {
      throw new Error('PREVIEW_URL environment variable is required');
    }

    try {
      // Core validation checks
      await this.validateBasicConnectivity();
      await this.validateHealthEndpoint();
      await this.validateDatabaseConnectivity();
      await this.validateAPIEndpoints();
      await this.validateStaticAssets();
      await this.validateAuthenticationEndpoints();
      await this.validatePerformanceBaseline();

      // Generate report
      this.generateValidationReport();

      if (this.errors.length > 0) {
        throw new Error(`Validation failed with ${this.errors.length} critical errors`);
      }

      console.log('\n✅ Preview environment validation completed successfully');
      console.log('🎯 Environment is ready for E2E testing');
      return true;

    } catch (error) {
      console.error('\n❌ Preview environment validation failed:', error.message);
      this.generateErrorReport();
      throw error;
    }
  }

  /**
   * Validate basic connectivity to preview URL
   */
  async validateBasicConnectivity() {
    console.log('\n🌐 Validating Basic Connectivity...');
    
    try {
      const response = await this.makeRequest('/', { 
        headers: { 'User-Agent': 'Preview-Environment-Validator' }
      });
      
      if (response.ok) {
        this.addHealthCheck('Basic Connectivity', 'success', `HTTP ${response.status}`);
        console.log(`   ✅ Preview URL is accessible (${response.status})`);
        
        // Check response headers for Vercel deployment info
        const vercelRegion = response.headers.get('x-vercel-cache');
        const deploymentId = response.headers.get('x-vercel-id');
        
        if (deploymentId) {
          console.log(`   📋 Deployment ID: ${deploymentId}`);
        }
        if (vercelRegion) {
          console.log(`   🌍 Cache Status: ${vercelRegion}`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.addHealthCheck('Basic Connectivity', 'error', error.message);
      this.errors.push(`Basic connectivity failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate health check endpoint
   */
  async validateHealthEndpoint() {
    console.log('\n🏥 Validating Health Endpoint...');
    
    try {
      const response = await this.makeRequest('/api/health/check');
      
      if (response.ok) {
        const healthData = await response.json();
        this.addHealthCheck('Health Endpoint', 'success', JSON.stringify(healthData));
        
        console.log(`   ✅ Health check passed (${response.status})`);
        console.log(`   📊 Health data: ${JSON.stringify(healthData, null, 2).replace(/\n/g, '\n      ')}`);
        
        // Validate expected health data structure
        if (!healthData.status) {
          this.warnings.push('Health endpoint missing status field');
        }
        if (!healthData.timestamp) {
          this.warnings.push('Health endpoint missing timestamp field');
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.addHealthCheck('Health Endpoint', 'error', error.message);
      this.errors.push(`Health endpoint failed: ${error.message}`);
    }
  }

  /**
   * Validate database connectivity
   */
  async validateDatabaseConnectivity() {
    console.log('\n🗄️ Validating Database Connectivity...');
    
    try {
      const response = await this.makeRequest('/api/health/database');
      
      if (response.ok) {
        const dbData = await response.json();
        this.addHealthCheck('Database Connectivity', 'success', JSON.stringify(dbData));
        
        console.log(`   ✅ Database connection healthy (${response.status})`);
        console.log(`   📊 Database info: ${JSON.stringify(dbData, null, 2).replace(/\n/g, '\n      ')}`);
        
        // Check database type
        if (dbData.type) {
          console.log(`   🗄️ Database type: ${dbData.type}`);
        }
      } else {
        // Database health might not be critical for all deployments
        this.addHealthCheck('Database Connectivity', 'warning', `HTTP ${response.status}`);
        this.warnings.push(`Database health check failed: HTTP ${response.status}`);
        console.log(`   ⚠️ Database health check failed (${response.status}) - may be expected for preview`);
      }
    } catch (error) {
      this.addHealthCheck('Database Connectivity', 'warning', error.message);
      this.warnings.push(`Database connectivity warning: ${error.message}`);
      console.log(`   ⚠️ Database connectivity warning: ${error.message}`);
    }
  }

  /**
   * Validate critical API endpoints
   */
  async validateAPIEndpoints() {
    console.log('\n🚀 Validating API Endpoints...');
    
    const endpoints = [
      { path: '/api/gallery', name: 'Gallery API', critical: true },
      { path: '/api/featured-photos', name: 'Featured Photos API', critical: true },
      { path: '/api/gallery/years', name: 'Gallery Years API', critical: false },
      { path: '/api/registration/health', name: 'Registration Health', critical: false }
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`   🔍 Checking ${endpoint.name}: ${endpoint.path}`);
        
        const response = await this.makeRequest(endpoint.path);
        
        if (response.ok) {
          this.addHealthCheck(endpoint.name, 'success', `HTTP ${response.status}`);
          console.log(`   ✅ ${endpoint.name}: OK (${response.status})`);
          
          // Try to parse response if it's JSON
          try {
            const data = await response.json();
            if (Array.isArray(data)) {
              console.log(`   📊 ${endpoint.name}: ${data.length} items`);
            } else if (data.status) {
              console.log(`   📊 ${endpoint.name}: ${data.status}`);
            }
          } catch (parseError) {
            // Non-JSON response is okay for some endpoints
          }
        } else {
          const message = `HTTP ${response.status}: ${response.statusText}`;
          
          if (endpoint.critical) {
            this.addHealthCheck(endpoint.name, 'error', message);
            this.errors.push(`Critical API endpoint failed: ${endpoint.name} - ${message}`);
            console.log(`   ❌ ${endpoint.name}: FAILED (${response.status}) - CRITICAL`);
          } else {
            this.addHealthCheck(endpoint.name, 'warning', message);
            this.warnings.push(`API endpoint warning: ${endpoint.name} - ${message}`);
            console.log(`   ⚠️ ${endpoint.name}: FAILED (${response.status}) - non-critical`);
          }
        }
      } catch (error) {
        const message = error.message;
        
        if (endpoint.critical) {
          this.addHealthCheck(endpoint.name, 'error', message);
          this.errors.push(`Critical API endpoint error: ${endpoint.name} - ${message}`);
          console.log(`   ❌ ${endpoint.name}: ERROR - ${message} - CRITICAL`);
        } else {
          this.addHealthCheck(endpoint.name, 'warning', message);
          this.warnings.push(`API endpoint warning: ${endpoint.name} - ${message}`);
          console.log(`   ⚠️ ${endpoint.name}: ERROR - ${message} - non-critical`);
        }
      }
    }
  }

  /**
   * Validate static assets
   */
  async validateStaticAssets() {
    console.log('\n📁 Validating Static Assets...');
    
    const assets = [
      { path: '/css/styles.css', name: 'Main Stylesheet' },
      { path: '/js/main.js', name: 'Main JavaScript' },
      { path: '/pages/tickets.html', name: 'Tickets Page' },
      { path: '/pages/about.html', name: 'About Page' }
    ];
    
    for (const asset of assets) {
      try {
        console.log(`   🔍 Checking ${asset.name}: ${asset.path}`);
        
        const response = await this.makeRequest(asset.path);
        
        if (response.ok) {
          this.addHealthCheck(`Asset: ${asset.name}`, 'success', `HTTP ${response.status}`);
          console.log(`   ✅ ${asset.name}: OK (${response.status})`);
          
          // Check content length
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            console.log(`   📏 ${asset.name}: ${contentLength} bytes`);
          }
        } else {
          this.addHealthCheck(`Asset: ${asset.name}`, 'warning', `HTTP ${response.status}`);
          this.warnings.push(`Static asset warning: ${asset.name} - HTTP ${response.status}`);
          console.log(`   ⚠️ ${asset.name}: FAILED (${response.status})`);
        }
      } catch (error) {
        this.addHealthCheck(`Asset: ${asset.name}`, 'warning', error.message);
        this.warnings.push(`Static asset error: ${asset.name} - ${error.message}`);
        console.log(`   ⚠️ ${asset.name}: ERROR - ${error.message}`);
      }
    }
  }

  /**
   * Validate authentication endpoints (if available)
   */
  async validateAuthenticationEndpoints() {
    console.log('\n🔐 Validating Authentication Endpoints...');
    
    const authEndpoints = [
      { path: '/api/admin/login', name: 'Admin Login', method: 'POST' }
    ];
    
    for (const endpoint of authEndpoints) {
      try {
        console.log(`   🔍 Checking ${endpoint.name}: ${endpoint.path}`);
        
        // For auth endpoints, we just check they respond (not authenticate)
        const response = await this.makeRequest(endpoint.path, {
          method: endpoint.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined
        });
        
        // Auth endpoints might return 400/401 which is expected
        if (response.status === 400 || response.status === 401 || response.status === 422) {
          this.addHealthCheck(`Auth: ${endpoint.name}`, 'success', `Expected ${response.status}`);
          console.log(`   ✅ ${endpoint.name}: Expected response (${response.status})`);
        } else if (response.ok) {
          this.addHealthCheck(`Auth: ${endpoint.name}`, 'success', `HTTP ${response.status}`);
          console.log(`   ✅ ${endpoint.name}: OK (${response.status})`);
        } else {
          this.addHealthCheck(`Auth: ${endpoint.name}`, 'warning', `HTTP ${response.status}`);
          this.warnings.push(`Auth endpoint warning: ${endpoint.name} - HTTP ${response.status}`);
          console.log(`   ⚠️ ${endpoint.name}: Unexpected response (${response.status})`);
        }
      } catch (error) {
        this.addHealthCheck(`Auth: ${endpoint.name}`, 'warning', error.message);
        this.warnings.push(`Auth endpoint error: ${endpoint.name} - ${error.message}`);
        console.log(`   ⚠️ ${endpoint.name}: ERROR - ${error.message}`);
      }
    }
  }

  /**
   * Validate performance baseline
   */
  async validatePerformanceBaseline() {
    console.log('\n⚡ Validating Performance Baseline...');
    
    try {
      const startTime = Date.now();
      const response = await this.makeRequest('/api/health/check');
      const responseTime = Date.now() - startTime;
      
      console.log(`   ⏱️ Health check response time: ${responseTime}ms`);
      
      if (responseTime < 2000) {
        this.addHealthCheck('Performance Baseline', 'success', `${responseTime}ms`);
        console.log(`   ✅ Response time within acceptable range (${responseTime}ms < 2000ms)`);
      } else if (responseTime < 5000) {
        this.addHealthCheck('Performance Baseline', 'warning', `${responseTime}ms`);
        this.warnings.push(`Response time slower than ideal: ${responseTime}ms`);
        console.log(`   ⚠️ Response time slow but acceptable (${responseTime}ms)`);
      } else {
        this.addHealthCheck('Performance Baseline', 'error', `${responseTime}ms`);
        this.errors.push(`Response time too slow: ${responseTime}ms`);
        console.log(`   ❌ Response time too slow (${responseTime}ms >= 5000ms)`);
      }
    } catch (error) {
      this.addHealthCheck('Performance Baseline', 'warning', error.message);
      this.warnings.push(`Performance baseline check failed: ${error.message}`);
      console.log(`   ⚠️ Performance baseline check failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP request with timeout
   */
  async makeRequest(path, options = {}) {
    const url = `${this.previewUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Preview-Environment-Validator',
          ...options.headers
        },
        ...options
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Add health check result
   */
  addHealthCheck(name, status, details) {
    this.healthChecks.push({
      name,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Generate validation report
   */
  generateValidationReport() {
    console.log('\n📊 Validation Report');
    console.log('='.repeat(60));
    
    const successCount = this.healthChecks.filter(check => check.status === 'success').length;
    const warningCount = this.healthChecks.filter(check => check.status === 'warning').length;
    const errorCount = this.healthChecks.filter(check => check.status === 'error').length;
    
    console.log(`📈 Health Checks Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⚠️ Warnings: ${warningCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total: ${this.healthChecks.length}`);
    
    if (this.warnings.length > 0) {
      console.log(`\n⚠️ Warnings (${this.warnings.length}):`);
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
    
    if (this.errors.length > 0) {
      console.log(`\n❌ Critical Errors (${this.errors.length}):`);
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log(`\n🎯 Preview URL: ${this.previewUrl}`);
    console.log(`📅 Validation completed: ${new Date().toISOString()}`);
  }

  /**
   * Generate error report for debugging
   */
  generateErrorReport() {
    console.error('\n🚨 Preview Environment Validation Failed');
    console.error('='.repeat(60));
    console.error('This preview deployment is not ready for E2E testing.');
    console.error('');
    console.error('Common issues and solutions:');
    console.error('1. Deployment still in progress - wait and retry');
    console.error('2. Environment variables missing - check Vercel dashboard');
    console.error('3. API endpoints failing - check serverless function logs');
    console.error('4. Database connectivity issues - verify connection strings');
    console.error('');
    console.error('Debugging commands:');
    console.error(`   curl ${this.previewUrl}/api/health/check`);
    console.error(`   curl ${this.previewUrl}/api/health/database`);
    console.error('');
  }
}

// Main execution when called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PreviewEnvironmentValidator();
  
  validator.validate()
    .then(() => {
      console.log('\n🎉 Preview environment validation successful');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Preview environment validation failed');
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

export default PreviewEnvironmentValidator;