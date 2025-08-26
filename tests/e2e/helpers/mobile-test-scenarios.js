/**
 * Mobile Test Scenarios and Data Factory
 * Provides realistic mobile test scenarios and device-specific test data
 */

/**
 * Mobile registration test scenarios
 */
export const MOBILE_TEST_SCENARIOS = {
  quickRegistration: {
    name: 'Quick Registration',
    description: 'Fast registration path with minimal fields',
    data: {
      firstName: 'Quick',
      lastName: 'Mobile',
      email: 'quick.mobile@test.com',
      phone: '555-QUICK',
      completion: 'minimal'
    },
    expectedDuration: 30000, // 30 seconds
    touchInteractions: ['tap', 'swipe', 'scroll']
  },

  thoroughRegistration: {
    name: 'Thorough Registration',
    description: 'Complete registration with all optional fields',
    data: {
      firstName: 'Thorough',
      lastName: 'Complete',
      email: 'thorough.complete@test.com',
      phone: '+1 (555) 123-4567',
      dietaryRestrictions: 'Vegetarian, gluten-free',
      emergencyContact: 'Jane Doe - 555-HELP',
      specialRequests: 'Wheelchair accessible seating, advanced level classes',
      completion: 'complete'
    },
    expectedDuration: 120000, // 2 minutes
    touchInteractions: ['tap', 'longPress', 'scroll', 'swipe']
  },

  internationalUser: {
    name: 'International User',
    description: 'User with international formatting and special characters',
    data: {
      firstName: 'José María',
      lastName: 'García-López',
      email: 'jose.maria@ejemplo.es',
      phone: '+34 612 345 678',
      dietaryRestrictions: 'Sin gluten, vegetariano',
      emergencyContact: 'María García - +34 612 345 679',
      completion: 'complete'
    },
    expectedDuration: 90000, // 90 seconds
    touchInteractions: ['tap', 'scroll']
  },

  accessibilityUser: {
    name: 'Accessibility User',
    description: 'User requiring accessibility features',
    data: {
      firstName: 'Access',
      lastName: 'Ability',
      email: 'access.ability@test.com',
      phone: '555-ACCESS',
      specialRequests: 'Screen reader user, high contrast needed',
      completion: 'accessibility-focused'
    },
    expectedDuration: 180000, // 3 minutes
    touchInteractions: ['tap', 'longPress'],
    accessibilityFeatures: ['screenReader', 'highContrast', 'largeText']
  },

  errorRecovery: {
    name: 'Error Recovery',
    description: 'Scenario with common input errors and corrections',
    data: {
      firstName: '',
      lastName: 'ErrorTest',
      email: 'invalid-email',
      phone: 'not-a-phone',
      corrections: {
        firstName: 'Fixed',
        email: 'fixed@test.com',
        phone: '555-FIXED'
      }
    },
    expectedDuration: 60000, // 1 minute
    touchInteractions: ['tap', 'scroll'],
    errorHandling: true
  }
};

/**
 * Device-specific test configurations
 */
export const DEVICE_TEST_CONFIGS = {
  'iphone13': {
    name: 'iPhone 13',
    category: 'premium-phone',
    testPriority: ['touch-precision', 'safari-specific', 'ios-keyboard'],
    commonIssues: ['keyboard-overlap', 'safe-area-insets', 'touch-callouts'],
    performanceExpectations: {
      loadTime: 2000,
      interactionDelay: 100,
      scrollFPS: 60
    }
  },

  'iphone12Mini': {
    name: 'iPhone 12 Mini',
    category: 'compact-phone',
    testPriority: ['small-screen', 'touch-precision', 'content-fit'],
    commonIssues: ['content-overflow', 'small-touch-targets', 'keyboard-overlap'],
    performanceExpectations: {
      loadTime: 2500,
      interactionDelay: 150,
      scrollFPS: 60
    }
  },

  'pixel5': {
    name: 'Pixel 5',
    category: 'android-phone',
    testPriority: ['chrome-android', 'android-keyboard', 'gesture-nav'],
    commonIssues: ['keyboard-behavior', 'back-button', 'chrome-ui'],
    performanceExpectations: {
      loadTime: 2000,
      interactionDelay: 120,
      scrollFPS: 60
    }
  },

  'galaxyS21': {
    name: 'Galaxy S21',
    category: 'premium-android',
    testPriority: ['samsung-keyboard', 'edge-display', 'one-ui'],
    commonIssues: ['edge-touches', 'samsung-browser', 'dark-mode'],
    performanceExpectations: {
      loadTime: 1800,
      interactionDelay: 100,
      scrollFPS: 90
    }
  },

  'iPadMini': {
    name: 'iPad Mini',
    category: 'tablet',
    testPriority: ['tablet-layout', 'landscape-mode', 'larger-content'],
    commonIssues: ['layout-scaling', 'touch-hover', 'orientation-change'],
    performanceExpectations: {
      loadTime: 1500,
      interactionDelay: 80,
      scrollFPS: 60
    }
  }
};

/**
 * Mobile-specific validation rules
 */
export const MOBILE_VALIDATION_RULES = {
  touchTargets: {
    minimumSize: 44, // Apple's recommendation
    preferredSize: 48, // Material Design
    spacing: 8 // Minimum spacing between targets
  },

  textInput: {
    minimumFontSize: 16, // Prevents zoom on iOS
    lineHeight: 1.4,
    padding: 12
  },

  forms: {
    maxFieldsPerScreen: 5,
    requiredFieldIndicators: true,
    errorMessageVisibility: true,
    progressIndicators: true
  },

  performance: {
    maxLoadTime: 3000,
    maxInteractionDelay: 300,
    minScrollFPS: 30
  },

  accessibility: {
    minContrastRatio: 4.5,
    focusIndicators: true,
    touchTargetLabels: true,
    screenReaderSupport: true
  }
};

/**
 * Generate mobile test data for specific scenarios
 */
export function generateMobileTestData(scenario = 'quickRegistration', deviceType = 'phone') {
  const baseScenario = MOBILE_TEST_SCENARIOS[scenario] || MOBILE_TEST_SCENARIOS.quickRegistration;
  const timestamp = Date.now();
  const testId = Math.random().toString(36).substring(7);

  const data = {
    ...baseScenario.data,
    timestamp,
    testId,
    scenario,
    deviceType,
    // Add unique identifiers to prevent test conflicts
    email: baseScenario.data.email.replace('@', `+${testId}@`),
    phone: baseScenario.data.phone ? `${baseScenario.data.phone}-${testId}` : undefined
  };

  // Add device-specific adjustments
  if (deviceType === 'tablet') {
    data.specialRequests = (data.specialRequests || '') + ' Tablet user, larger interface elements preferred';
  }

  return {
    ...data,
    metadata: {
      scenario: baseScenario.name,
      description: baseScenario.description,
      expectedDuration: baseScenario.expectedDuration,
      touchInteractions: baseScenario.touchInteractions,
      errorHandling: baseScenario.errorHandling || false,
      accessibilityFeatures: baseScenario.accessibilityFeatures || []
    }
  };
}

/**
 * Get device-specific test configuration
 */
export function getDeviceTestConfig(deviceName) {
  return DEVICE_TEST_CONFIGS[deviceName] || DEVICE_TEST_CONFIGS['pixel5'];
}

/**
 * Validate mobile interaction timing
 */
export function validateInteractionTiming(startTime, endTime, expectedDuration) {
  const actualDuration = endTime - startTime;
  const tolerance = expectedDuration * 0.5; // 50% tolerance
  
  return {
    actualDuration,
    expectedDuration,
    withinTolerance: actualDuration <= expectedDuration + tolerance,
    performance: actualDuration <= expectedDuration ? 'good' : 
                 actualDuration <= expectedDuration + tolerance ? 'acceptable' : 'poor'
  };
}

/**
 * Mobile error patterns for testing
 */
export const MOBILE_ERROR_PATTERNS = {
  networkError: {
    description: 'Simulate network failure during registration',
    triggerCondition: 'form-submit',
    expectedBehavior: 'show-retry-option',
    recoverySteps: ['tap-retry', 'wait-network']
  },

  validationError: {
    description: 'Form validation errors on mobile',
    triggerCondition: 'invalid-input',
    expectedBehavior: 'inline-error-display',
    recoverySteps: ['fix-input', 'clear-error']
  },

  keyboardInterference: {
    description: 'Mobile keyboard covering form elements',
    triggerCondition: 'input-focus',
    expectedBehavior: 'scroll-to-visible',
    recoverySteps: ['auto-scroll', 'keyboard-dismiss']
  },

  orientationChange: {
    description: 'Layout breaks on orientation change',
    triggerCondition: 'device-rotation',
    expectedBehavior: 'maintain-layout',
    recoverySteps: ['layout-adjust', 'content-reflow']
  },

  touchTargetMiss: {
    description: 'Touch targets too small for accurate tapping',
    triggerCondition: 'small-target-tap',
    expectedBehavior: 'successful-interaction',
    recoverySteps: ['increase-target-size', 'add-padding']
  }
};

/**
 * Generate mobile accessibility test data
 */
export function generateAccessibilityTestData() {
  return {
    screenReaderLabels: [
      'First name input field',
      'Last name input field', 
      'Email address input field',
      'Phone number input field',
      'Submit registration button'
    ],
    
    focusOrder: [
      'firstName',
      'lastName', 
      'email',
      'phone',
      'submit'
    ],

    ariaAttributes: {
      'input[name="firstName"]': { 'aria-label': 'First name', 'aria-required': 'true' },
      'input[name="lastName"]': { 'aria-label': 'Last name', 'aria-required': 'true' },
      'input[name="email"]': { 'aria-label': 'Email address', 'aria-required': 'true' },
      'input[name="phone"]': { 'aria-label': 'Phone number', 'aria-required': 'false' },
      'button[type="submit"]': { 'aria-label': 'Submit registration form' }
    },

    colorContrastPairs: [
      { foreground: '#000000', background: '#ffffff', ratio: 21 },
      { foreground: '#333333', background: '#ffffff', ratio: 12.63 },
      { foreground: '#666666', background: '#ffffff', ratio: 5.74 }
    ]
  };
}

/**
 * Mobile performance benchmarks
 */
export const MOBILE_PERFORMANCE_BENCHMARKS = {
  loadTime: {
    excellent: 1000,
    good: 2000,
    acceptable: 3000,
    poor: 5000
  },

  interactionDelay: {
    excellent: 50,
    good: 100,
    acceptable: 200,
    poor: 500
  },

  scrollFPS: {
    excellent: 60,
    good: 45,
    acceptable: 30,
    poor: 15
  },

  memoryUsage: {
    excellent: 50, // MB
    good: 100,
    acceptable: 200,
    poor: 400
  }
};

/**
 * Create mobile test report data
 */
export function createMobileTestReport(testResults) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      testsRun: testResults.length,
      passed: testResults.filter(r => r.status === 'passed').length,
      failed: testResults.filter(r => r.status === 'failed').length,
      skipped: testResults.filter(r => r.status === 'skipped').length
    },
    deviceCoverage: {},
    performanceMetrics: {},
    accessibilityScore: 0,
    recommendations: []
  };

  // Analyze device coverage
  testResults.forEach(result => {
    if (result.device) {
      report.deviceCoverage[result.device] = (report.deviceCoverage[result.device] || 0) + 1;
    }
  });

  // Calculate performance metrics
  const performanceResults = testResults.filter(r => r.performanceData);
  if (performanceResults.length > 0) {
    report.performanceMetrics = {
      averageLoadTime: performanceResults.reduce((acc, r) => acc + r.performanceData.loadTime, 0) / performanceResults.length,
      averageInteractionDelay: performanceResults.reduce((acc, r) => acc + r.performanceData.interactionDelay, 0) / performanceResults.length,
      touchTargetCompliance: performanceResults.filter(r => r.performanceData.touchTargetCompliance).length / performanceResults.length
    };
  }

  // Generate recommendations
  if (report.summary.failed > 0) {
    report.recommendations.push('Review failed tests for mobile-specific issues');
  }
  
  if (report.performanceMetrics.averageLoadTime > 3000) {
    report.recommendations.push('Optimize mobile loading performance');
  }

  if (report.performanceMetrics.touchTargetCompliance < 0.8) {
    report.recommendations.push('Increase touch target sizes to meet accessibility standards');
  }

  return report;
}