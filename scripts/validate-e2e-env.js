#!/usr/bin/env node

/**
 * E2E Environment Validation Script
 * 
 * Validates all E2E environment variables using the centralized configuration.
 * This script can be run before E2E tests to ensure proper environment setup.
 * 
 * Usage:
 *   node scripts/validate-e2e-env.js [--verbose] [--admin-tests] [--service-tests]
 * 
 * Exit codes:
 *   0 - All validations passed
 *   1 - Required environment variables missing
 *   2 - Script execution error
 */

import { E2E_CONFIG, validateE2EEnvironment, logE2EEnvironment } from '../config/e2e-env-config.js';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const adminTests = args.includes('--admin-tests') || args.includes('--admin');
const serviceTests = args.includes('--service-tests') || args.includes('--services');
const allTests = args.includes('--all');

// Help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
E2E Environment Validation Script

Usage: node scripts/validate-e2e-env.js [options]

Options:
  --verbose          Show detailed environment configuration
  --admin-tests      Validate admin test requirements
  --service-tests    Validate service integration requirements  
  --all              Validate all test scenarios
  --help, -h         Show this help message

Examples:
  node scripts/validate-e2e-env.js
  node scripts/validate-e2e-env.js --verbose --admin-tests
  node scripts/validate-e2e-env.js --all --verbose
`);
  process.exit(0);
}

async function main() {
  try {
    console.log('🔧 E2E Environment Validation');
    console.log('============================');
    
    // Determine validation options
    const validationOptions = {
      adminTests: adminTests || allTests || true, // Default to true for basic validation
      ciMode: E2E_CONFIG.CI,
      emailTests: serviceTests || allTests || E2E_CONFIG.ADVANCED_SCENARIOS,
      paymentTests: serviceTests || allTests || E2E_CONFIG.ADVANCED_SCENARIOS,
      walletTests: serviceTests || allTests || E2E_CONFIG.ADVANCED_SCENARIOS,
      throwOnMissing: false, // Don't throw, just report
    };
    
    console.log('📋 Validation Scope:');
    console.log(`  Admin Tests: ${validationOptions.adminTests ? '✓' : '✗'}`);
    console.log(`  CI Mode: ${validationOptions.ciMode ? '✓' : '✗'}`);
    console.log(`  Email Tests: ${validationOptions.emailTests ? '✓' : '✗'}`);
    console.log(`  Payment Tests: ${validationOptions.paymentTests ? '✓' : '✗'}`);
    console.log(`  Wallet Tests: ${validationOptions.walletTests ? '✓' : '✗'}`);
    console.log('');
    
    // Perform validation
    const result = validateE2EEnvironment(validationOptions);
    
    // Report results
    if (result.isValid) {
      console.log('✅ Environment validation passed!');
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(warning => {
          console.log(`   ${warning}`);
        });
      }
      
      if (verbose) {
        console.log('');
        logE2EEnvironment(true);
      }
      
      process.exit(0);
      
    } else {
      console.error('❌ Environment validation failed!');
      
      if (result.missing.length > 0) {
        console.error('\n❌ Missing required variables:');
        result.missing.forEach(item => {
          if (typeof item === 'string') {
            console.error(`   - ${item}`);
          } else {
            console.error(`   - ${item.key}: ${item.description}`);
          }
        });
      }
      
      if (result.warnings.length > 0) {
        console.error('\n⚠️  Warnings:');
        result.warnings.forEach(warning => {
          console.error(`   ${warning}`);
        });
      }
      
      console.error('\n💡 To fix these issues:');
      console.error('   1. Set the missing environment variables in .env.local');
      console.error('   2. Ensure Turso credentials are configured for E2E tests');
      console.error('   3. Check CLAUDE.md for complete environment setup guide');
      console.error('');
      
      if (verbose) {
        console.error('Current environment configuration:');
        logE2EEnvironment(true);
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Script execution failed:', error.message);
    
    if (verbose) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(2);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(2);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(2);
});

// Run the main function
main();