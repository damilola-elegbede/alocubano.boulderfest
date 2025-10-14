/**
 * Test Quality Helper
 *
 * Provides utilities to ensure E2E tests maintain quality standards:
 * - No silent passes (early returns without assertions)
 * - Proper use of test.skip() for conditional skipping
 * - Clear test outcomes
 *
 * Usage:
 *   import { ensureTestCompletion } from '../helpers/test-quality.js';
 *
 *   test('my test', async ({ page }) => {
 *     const tracker = ensureTestCompletion();
 *
 *     // ... test logic ...
 *     await expect(something).toBe(true);
 *     tracker.assertionMade();
 *
 *     tracker.complete(); // Verify test made assertions
 *   });
 */

/**
 * Best Practices for E2E Tests
 *
 * 1. NEVER use early return without test.skip():
 *    ❌ BAD:
 *      if (!condition) {
 *        console.log('Skipping...');
 *        return;
 *      }
 *
 *    ✅ GOOD:
 *      if (!condition) {
 *        test.skip(true, 'Feature not available');
 *      }
 *
 * 2. ALWAYS use test.skip(true, 'reason') inside running tests:
 *    ❌ BAD:  test.skip('reason');     // Without true parameter
 *    ✅ GOOD: test.skip(true, 'reason'); // With true parameter
 *
 * 3. ALWAYS make at least one assertion:
 *    ❌ BAD:  Test with only console.log() statements
 *    ✅ GOOD: Test with expect() assertions
 *
 * 4. Prefer explicit errors over silent returns:
 *    ❌ BAD:  return; (after encountering error)
 *    ✅ GOOD: throw new Error('Explicit failure reason');
 */

/**
 * Creates a test completion tracker
 * @returns {Object} Tracker with assertion tracking and completion validation
 */
export function ensureTestCompletion() {
  let assertionCount = 0;
  let completed = false;

  return {
    /**
     * Mark that an assertion was made
     */
    assertionMade() {
      assertionCount++;
    },

    /**
     * Mark multiple assertions
     * @param {number} count - Number of assertions made
     */
    assertionsMade(count) {
      assertionCount += count;
    },

    /**
     * Complete the test and verify assertions were made
     * @param {Object} options - Options for completion validation
     * @param {boolean} options.requireAssertions - Whether to require at least one assertion (default: true)
     * @throws {Error} If no assertions were made and requireAssertions is true
     */
    complete(options = {}) {
      const { requireAssertions = true } = options;
      completed = true;

      if (requireAssertions && assertionCount === 0) {
        throw new Error(
          'Test completed without making any assertions. ' +
          'Either add expect() calls or use test.skip(true, "reason") to skip the test.'
        );
      }
    },

    /**
     * Get current assertion count
     * @returns {number} Number of assertions tracked
     */
    getAssertionCount() {
      return assertionCount;
    },

    /**
     * Check if test was properly completed
     * @returns {boolean} Whether complete() was called
     */
    isCompleted() {
      return completed;
    }
  };
}

/**
 * Validates that a test skip reason is meaningful
 * @param {string} reason - Skip reason provided to test.skip()
 * @returns {boolean} Whether the reason is meaningful
 */
export function validateSkipReason(reason) {
  if (!reason || reason.trim().length === 0) {
    return false;
  }

  // Check for generic/meaningless reasons
  const genericReasons = ['skipping', 'skip', 'todo', 'fixme'];
  const lowerReason = reason.toLowerCase();

  // Reason should be more than just a generic word
  if (genericReasons.includes(lowerReason)) {
    return false;
  }

  // Reason should be at least 10 characters for meaningful context
  return reason.trim().length >= 10;
}

/**
 * Best practice: Replace early returns with test.skip()
 *
 * This function can be used as a reminder/validator during test development.
 * It throws an error to prevent accidental early returns.
 *
 * @param {string} reason - Reason for skipping
 * @throws {Error} Always throws to prevent silent early return
 */
export function preventEarlyReturn(reason) {
  throw new Error(
    `Early return detected! Use test.skip(true, '${reason}') instead of returning early. ` +
    'This ensures the test framework properly tracks the skip.'
  );
}

/**
 * Example usage in a test:
 *
 * test('example test', async ({ page }) => {
 *   const tracker = ensureTestCompletion();
 *
 *   // Check if feature is available
 *   const hasFeature = await checkFeature(page);
 *   if (!hasFeature) {
 *     test.skip(true, 'Feature not available in this environment');
 *     // No need to call tracker.complete() - test.skip() handles it
 *   }
 *
 *   // Perform test actions
 *   await page.goto('/some-page');
 *   await expect(page).toHaveURL(/some-page/);
 *   tracker.assertionMade();
 *
 *   // More assertions...
 *   await expect(page.locator('h1')).toBeVisible();
 *   tracker.assertionMade();
 *
 *   // Complete the test
 *   tracker.complete(); // Will throw if no assertions were made
 * });
 */
