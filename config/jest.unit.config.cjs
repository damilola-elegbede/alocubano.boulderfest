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
    // Coverage thresholds kept at 0% (Phase 1 real source testing uses integration patterns)
    coverageThreshold: {
        global: {
            branches: 0,
            functions: 0,
            lines: 0,
            statements: 0
        }
    },
    // Performance optimizations for Phase 1 tests
    maxWorkers: '50%',
    testTimeout: 10000, // 10 seconds for complex integration tests
    clearMocks: true,
    resetMocks: true,
    // Enhanced error reporting for real source code testing
    verbose: true,
    errorOnDeprecated: true
};