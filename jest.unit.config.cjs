module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
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
    // Coverage thresholds with 80% minimum for gallery module
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        },
        // Specific thresholds for gallery functionality
        './js/components/lightbox.js': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        './js/gallery-*.js': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        './api/gallery.js': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    verbose: true
};