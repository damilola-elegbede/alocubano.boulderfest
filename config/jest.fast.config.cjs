module.exports = {
    testEnvironment: 'node',
    testMatch: [
        // Only run simple unit tests without DOM dependencies
        '**/tests/unit/ticket-selection.test.js',
        '**/tests/unit/performance-metrics-api.test.js'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/tests/integration/',
        '<rootDir>/tests/performance/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/tests/security/',
        '<rootDir>/tests/payment/',
        // Skip DOM-dependent tests
        '<rootDir>/tests/unit/advanced-caching.test.js',
        '<rootDir>/tests/unit/virtual-gallery.test.js',
        '<rootDir>/tests/unit/navigation-simplified.test.js'
    ],
    rootDir: '..',
    // Skip setup files that might cause issues
    // setupFilesAfterEnv: ['./tests/unit-setup.cjs'],
    
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
    silent: true, // Reduce output
    // Set up minimal test environment
    globals: {
        'process.env.NODE_ENV': 'test',
        'process.env.FAST_TESTS': 'true',
        'process.env.SKIP_DB_TESTS': 'true'
    }
};