#!/usr/bin/env node

/**
 * CI/CD Environment Variable Validation Script
 * 
 * Validates that all required environment variables are properly configured
 * across different CI/CD environments and workflows.
 * 
 * Usage:
 *   node scripts/ci/validate-environment.js [--fix] [--env=ci|local|production]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Standard environment variable mapping
const ENVIRONMENT_VARIABLES = {
  // Universal variables used across all workflows
  UNIVERSAL: {
    NODE_VERSION: {
      description: 'Node.js version for consistent runtime',
      default: '20',
      required: false // Don't require for basic validation
    },
    CI: {
      description: 'CI environment flag',
      default: 'true',
      required: false
    }
  },

  // Test configuration variables
  TEST: {
    // Primary base URL for testing (standardized name)
    BASE_URL: {
      description: 'Primary base URL for testing (replaces PLAYWRIGHT_BASE_URL)',
      example: 'http://localhost:3000 | https://preview-xyz.vercel.app',
      required: false, // Not required for local validation
      aliases: ['PLAYWRIGHT_BASE_URL'] // Legacy names to replace
    },
    
    // Database configuration
    DATABASE_URL: {
      description: 'Database connection URL (environment-specific)',
      example: 'file:./data/test.db | libsql://production.turso.io',
      required: false, // Not required for basic validation
      environments: {
        local: 'file:./data/test.db',
        ci: 'file:./data/e2e-test.db',
        production: 'TURSO_DATABASE_URL'
      }
    },

    // CI environment type
    CI_ENVIRONMENT: {
      description: 'CI environment type (test/staging/production)',
      example: 'test | staging | production',
      required: false,
      default: 'test'
    }
  }
};

/**
 * Validates environment variables for a specific context
 */
function validateEnvironment(context = 'local', options = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  console.log(`= Validating environment variables for: ${context}`);
