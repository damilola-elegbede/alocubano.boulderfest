module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    setupFilesAfterEnv: [
        './tests/unit-setup.cjs'
    ],
    transform: { '^.+\\.js$': 'babel-jest' },
    collectCoverage: true,
    coverageDirectory: 'coverage/unit',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    collectCoverageFrom: ['js/**/*.js', 'api/**/*.js', '!js/**/*.test.js', '!**/node_modules/**'],
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