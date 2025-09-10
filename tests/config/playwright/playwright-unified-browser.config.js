/**
 * Unified Browser Matrix Playwright Configuration
 * 
 * Supports consistent browser testing across all workflows with:
 * - Standardized browser configurations
 * - Memory-optimized settings per browser
 * - Unified timeout and retry strategies
 * - Conflict-free concurrency controls
 */

import { defineConfig, devices } from '@playwright/test';

// Browser-specific configurations from unified matrix
const BROWSER_CONFIGS = {
  chromium: {
    name: 'Chrome',
    device: devices['Desktop Chrome'],
    memory: '3GB',
    timeout: 12 * 60 * 1000, // 12 minutes
    retries: 2,
    priority: 1
  },
  firefox: {
    name: 'Firefox', 
    device: devices['Desktop Firefox'],
    memory: '4GB',
    timeout: 15 * 60 * 1000, // 15 minutes
    retries: 3,
    priority: 2
  },
  webkit: {
    name: 'Safari',
    device: devices['Desktop Safari'],
    memory: '3GB',
    timeout: 18 * 60 * 1000, // 18 minutes
    retries: 3,
    priority: 3
  },
  'mobile-chrome': {
    name: 'Mobile Chrome',
    device: devices['Pixel 5'],
    memory: '3GB',
    timeout: 20 * 60 * 1000, // 20 minutes
    retries: 2,
    priority: 4
  },
  'mobile-safari': {
    name: 'Mobile Safari',
    device: devices['iPhone 12'],
    memory: '3GB', 
    timeout: 22 * 60 * 1000, // 22 minutes
    retries: 3,
    priority: 5
  }
};

// Get browser strategy from environment
const getBrowserStrategy = () => {
  const strategy = process.env.BROWSER_STRATEGY || 'standard';
  const isDraft = process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_PR_DRAFT === 'true';
  const isNightly = process.env.GITHUB_EVENT_NAME === 'schedule';
  
  if (isDraft) return 'chromium-only';
  if (isNightly) return 'extended';
  
  return strategy;
};

// Generate projects based on strategy
const generateProjects = (strategy) => {
  const strategies = {
    'chromium-only': ['chromium'],
    'standard': ['chromium', 'firefox'],
    'extended': ['chromium', 'firefox', 'webkit'],
    'full': ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari']
  };

  const browsers = strategies[strategy] || strategies['standard'];
  
  return browsers.map(browser => {
    const config = BROWSER_CONFIGS[browser];
    
    return {
      name: browser,
      use: {
        ...config.device,
        // Memory optimization
        launchOptions: {
          args: [
            `--memory-pressure-off`,
            `--max_old_space_size=${parseInt(config.memory) * 1024}`,
            '--disable-dev-shm-usage',
            '--disable-extensions'
          ]
        }
      },
      timeout: config.timeout,
      retries: process.env.CI ? config.retries : 1,
      metadata: {
        browser: browser,
        browserName: config.name,
        memory: config.memory,
        priority: config.priority
      }
    };
  });
};

// Determine base URL based on environment
const getBaseURL = () => {
  // Priority: PLAYWRIGHT_BASE_URL > BASE_URL > PREVIEW_URL > default
  return process.env.PLAYWRIGHT_BASE_URL || 
         process.env.BASE_URL || 
         process.env.PREVIEW_URL || 
         'http://localhost:3000';
};

// Get environment-specific configuration
const getEnvironmentConfig = () => {
  const isCI = !!process.env.CI;
  const strategy = getBrowserStrategy();
  
  return {
    // Test execution settings
    fullyParallel: strategy === 'chromium-only' || !isCI,
    workers: isCI ? 
      (strategy === 'full' ? 1 : 2) : // Sequential for full matrix in CI
      1, // Local development
    
    // Retry and timeout settings
    retries: isCI ? undefined : 0, // Use project-specific retries in CI
    timeout: 45000, // 45 seconds per test
    expect: {
      timeout: 10000 // 10 seconds for assertions
    },
    
    // Reporter configuration
    reporter: isCI ? [
      ['list'],
      ['html', { 
        outputFolder: 'playwright-report',
        open: 'never'
      }],
      ['json', {
        outputFile: 'test-results/results.json'
      }]
    ] : [
      ['list'],
      ['html', { open: 'on-failure' }]
    ],
    
    // Global settings
    forbidOnly: isCI,
    
    use: {
      // Base URL for all tests
      baseURL: getBaseURL(),
      
      // Tracing and debugging
      trace: isCI ? 'retain-on-failure' : 'on-first-retry',
      screenshot: isCI ? 'only-on-failure' : 'off',
      video: isCI ? 'retain-on-failure' : 'off',
      
      // Network and timing
      actionTimeout: 20000, // 20 seconds for actions
      navigationTimeout: 40000, // 40 seconds for navigation
      
      // Device settings
      viewport: { width: 1280, height: 720 },
      
      // Browser context settings
      ignoreHTTPSErrors: true,
      permissions: ['notifications']
    }
  };
};

// Log configuration for debugging
const logConfiguration = (config) => {
  if (!process.env.CI || process.env.PLAYWRIGHT_DEBUG) {
    console.log('\n🎭 Unified Browser Matrix Configuration:');
    console.log(`  Strategy: ${getBrowserStrategy()}`);
    console.log(`  Base URL: ${getBaseURL()}`);
    console.log(`  Projects: ${config.projects.map(p => p.name).join(', ')}`);
    console.log(`  Workers: ${config.workers}`);
    console.log(`  Fully Parallel: ${config.fullyParallel}`);
    console.log('');
  }
};

const config = defineConfig({
  testDir: '../../e2e/flows',
  
  // Environment-specific configuration
  ...getEnvironmentConfig(),
  
  // Browser projects based on strategy
  projects: generateProjects(getBrowserStrategy()),
  
  // Global setup and teardown
  globalSetup: '../../e2e/global-setup-ci.js',
  globalTeardown: '../../e2e/global-teardown.js'
});

// Log configuration
logConfiguration(config);

export default config;

// Export utility functions for use in other configs
export {
  BROWSER_CONFIGS,
  getBrowserStrategy,
  generateProjects,
  getBaseURL
};