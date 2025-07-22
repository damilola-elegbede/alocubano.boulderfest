module.exports = {
    testEnvironment: 'node',
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
    // Coverage thresholds temporarily set to 0% for development
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