module.exports = {
    testEnvironment: 'jsdom',
    testMatch: [
        '**/tests/unit/**/*.test.js'
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
    // Coverage thresholds kept at 0% until tests provide real coverage
    coverageThreshold: {
        global: {
            branches: 0,
            functions: 0,
            lines: 0,
            statements: 0
        }
    },
    verbose: true
};