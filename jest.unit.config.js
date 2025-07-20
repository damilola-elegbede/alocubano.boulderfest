module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    setupFilesAfterEnv: [
        './tests/unit-setup.js'
    ],
    collectCoverage: true,
    coverageDirectory: 'coverage/unit',
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],
    collectCoverageFrom: [
        'js/**/*.js',
        'api/**/*.js',
        '!js/**/*.test.js',
        '!**/node_modules/**'
    ],
    verbose: true
};