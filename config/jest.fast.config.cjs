module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/tests/integration/',
        '<rootDir>/tests/performance/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/tests/security/',
        '<rootDir>/tests/payment/'
    ],
    rootDir: '..',
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    // Disable coverage for fast tests
    collectCoverage: false,
    // Performance optimizations for fast tests
    maxWorkers: '50%',
    testTimeout: 5000, // 5 seconds max per test
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    // Skip global setup/teardown for fast tests
    verbose: false,
    // Set up minimal test environment
    globals: {
        'process.env.NODE_ENV': 'test',
        'process.env.FAST_TESTS': 'true',
        'process.env.SKIP_DB_TESTS': 'true'
    }
};