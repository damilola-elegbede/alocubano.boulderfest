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
    // Coverage collection disabled - focus on functional testing instead
    collectCoverage: false,
    // Performance optimizations for Phase 1 tests
    maxWorkers: '50%',
    testTimeout: 10000, // 10 seconds for complex integration tests
    clearMocks: true,
    resetMocks: true,
    // Enhanced error reporting for real source code testing
    verbose: true,
    errorOnDeprecated: true
};