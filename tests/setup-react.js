/**
 * React Testing Library Setup
 *
 * This file configures React Testing Library for Vitest-based component tests.
 * It follows the pattern established by setup-unit.js and setup-happy-dom.js.
 *
 * Features:
 * - Registers @testing-library/jest-dom custom matchers
 * - Configures automatic cleanup after each test
 * - Sets up React Testing Library defaults
 *
 * Used by: tests/config/vitest.unit.config.js
 * Pattern: Coexists with setup-unit.js and setup-happy-dom.js in unified config
 */

// IMPORTANT: Import expect from vitest FIRST and make it global
// This is required because @testing-library/jest-dom tries to call expect.extend()
import { expect, afterEach } from 'vitest';

// Make expect globally available for jest-dom
globalThis.expect = expect;

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Automatically cleanup after each test
// This ensures that each test has a clean DOM state
afterEach(() => {
    cleanup();
});

// Configure React Testing Library defaults (if needed in future)
// Example: configure({ testIdAttribute: 'data-test-id' })

// Log setup completion for debugging
if (process.env.VITEST_VERBOSE === 'true') {
    console.log('🧪 React Testing Library setup complete');
    console.log('   - @testing-library/jest-dom matchers registered');
    console.log('   - Automatic cleanup after each test enabled');
}
