module.exports = {
    testEnvironment: 'jsdom',
    testMatch: [
        '**/tests/unit/**/*.test.js',
        '**/tests/integration/**/*.test.js'
    ],
    rootDir: '..',
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    collectCoverage: true,
    coverageDirectory: 'coverage/unit',
    coverageReporters: [
        'text',
        'lcov',
        'html',
        'json-summary'
    ],
    collectCoverageFrom: [
        'js/**/*.js',
        'api/**/*.js',
        '!js/**/*.test.js',
        '!**/node_modules/**'
    ],
    // No coverage thresholds - we use functional quality metrics instead
    // Performance optimizations for Phase 1 tests
    maxWorkers: '50%',
    testTimeout: 10000, // 10 seconds for complex integration tests
    clearMocks: true,
    resetMocks: true,
    // Enhanced error reporting for real source code testing
    verbose: true,
    errorOnDeprecated: true
};