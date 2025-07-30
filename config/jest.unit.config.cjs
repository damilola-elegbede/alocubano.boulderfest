module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js',
        '**/tests/integration/**/*.test.js',
        '**/tests/payment/**/*.test.js',
        '**/tests/security/**/*.test.js'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        // Conditionally ignore integration and performance tests for fast runs
        ...(process.env.FAST_TESTS === 'true' ? [
            '<rootDir>/tests/integration/',
            '<rootDir>/tests/performance/',
            '<rootDir>/tests/e2e/',
            '<rootDir>/tests/security/'
        ] : [])
    ],
    rootDir: '..',
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    // Enable coverage for payment system
    collectCoverage: true,
    collectCoverageFrom: [
        'lib/payment/**/*.js',
        'lib/db/**/*.js',
        'api/payment/**/*.js',
        'api/webhooks/**/*.js',
        '!**/node_modules/**',
        '!**/tests/**'
    ],
    coverageDirectory: 'tests/coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        './lib/payment/': {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90
        }
    },
    // Performance optimizations
    maxWorkers: '50%',
    testTimeout: 15000, // 15 seconds for complex integration tests
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    // Enhanced error reporting
    verbose: true,
    errorOnDeprecated: true,
    // Test environment setup
    globalSetup: './tests/config/globalSetup.js',
    globalTeardown: './tests/config/globalTeardown.js'
};