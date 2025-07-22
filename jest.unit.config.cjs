module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    collectCoverage: false,
    // TODO: Re-enable coverage after refactoring JS files to ES modules
    // coverageDirectory: 'coverage/unit',
    // coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    // collectCoverageFrom: ['js/**/*.js', 'api/**/*.js', '!js/**/*.test.js', '!**/node_modules/**'],
    // coverageThreshold: { global: { branches: 70, functions: 70, lines: 70, statements: 70 } },
    verbose: true
};