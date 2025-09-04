/**
 * Mobile Test Configuration
 * Configuration settings and constants for mobile registration testing
 */

export const MOBILE_TEST_CONFIG = {
  // Test execution settings (environment-adaptive)
  timeouts: {
    default: process.env.CI ? 20000 : 15000,
    networkIdle: process.env.CI ? 8000 : 5000,
    keyboard: process.env.CI ? 5000 : 3000,
    interaction: process.env.CI ? 3000 : 2000
  },

  // Mobile device emulation settings
  devices: {
    primary: ['iphone13', 'pixel5'],
    secondary: ['iphone12Mini', 'galaxyS21'],
    tablets: ['iPadMini', 'iPadAir']
  },

  // Test coverage requirements
  coverage: {
    minDeviceTypes: 2,
    minBrowsers: 2,
    requiredViewports: [
      { width: 375, height: 667 }, // iPhone 8
      { width: 393, height: 851 }, // Pixel 5
      { width: 768, height: 1024 }  // iPad Mini
    ]
  },

  // Performance thresholds
  performance: {
    loadTimeThreshold: 3000,
    interactionDelayThreshold: 300,
    touchTargetMinSize: 44,
    textMinFontSize: 16
  },

  // Accessibility requirements
  accessibility: {
    contrastRatioMin: 4.5,
    touchTargetSpacing: 8,
    requiredAriaLabels: true,
    keyboardNavigation: true
  },

  // Feature flags for different test scenarios
  features: {
    fileUpload: true,
    geolocation: false,
    camera: false,
    notifications: false
  },

  // Test data configuration
  testData: {
    generateUniqueEmails: true,
    cleanupAfterTests: true,
    preserveFailureData: true
  }
};

/**
 * Get configuration for specific test environment
 */
export function getMobileTestConfig(environment = 'test') {
  const baseConfig = { ...MOBILE_TEST_CONFIG };

  switch (environment) {
    case 'ci':
      return {
        ...baseConfig,
        timeouts: {
          ...baseConfig.timeouts,
          default: 30000,
          networkIdle: 10000,
          keyboard: 8000,
          interaction: 5000
        },
        devices: {
          primary: ['iphone13', 'pixel5'] // Minimal for CI speed
        }
      };

    case 'development':
      return {
        ...baseConfig,
        testData: {
          ...baseConfig.testData,
          cleanupAfterTests: false
        }
      };

    case 'production':
      return {
        ...baseConfig,
        devices: {
          ...baseConfig.devices,
          // Full device coverage for production validation
        },
        performance: {
          ...baseConfig.performance,
          loadTimeThreshold: 2000 // Stricter for production
        }
      };

    default:
      return baseConfig;
  }
}

/**
 * Validate mobile test environment
 */
export function validateMobileTestEnvironment(page) {
  return {
    hasTouchSupport: page.evaluate(() => 'ontouchstart' in window),
    hasGeolocation: page.evaluate(() => 'geolocation' in navigator),
    hasFileAPI: page.evaluate(() => typeof FileReader !== 'undefined'),
    hasVisualViewport: page.evaluate(() => !!window.visualViewport),
    userAgent: page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize()
  };
}