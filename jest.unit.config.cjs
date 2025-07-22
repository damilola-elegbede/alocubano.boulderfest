module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    transform: {},
    collectCoverage: true,
    coverageDirectory: 'coverage/unit',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    collectCoverageFrom: ['js/**/*.js', 'api/**/*.js', '!js/**/*.test.js', '!**/node_modules/**'],
    coverageThreshold: { 
        global: { 
            branches: 20, 
            functions: 20, 
            lines: 20, 
            statements: 20 
        } 
    },
    verbose: true
};