/**
 * Admin Test Mode JavaScript
 * Manages test mode functionality for the A Lo Cubano Boulder Fest admin dashboard
 */

import { createLogger } from './lib/logger.js';
import { showAlert, showConfirm } from './lib/modal-utils.js';

const logger = createLogger('AdminTestMode');

// Test mode configuration
const TEST_MODE_CONFIG = {
    testItems: {
        'vip-pass': {
            name: 'VIP Pass',
            price: 150.00,
            type: 'vip-pass',
            description: 'Full festival access with VIP perks'
        },
        'weekend-pass': {
            name: 'Weekend Pass',
            price: 75.00,
            type: 'weekend-pass',
            description: 'Access to all weekend events'
        },
        'donation': {
            name: 'Festival Support Donation',
            price: 25.00,
            type: 'donation',
            description: 'Support the festival'
        }
    },
    cartStorageKey: 'admin_test_cart',
    mainSiteUrl: window.location.origin
};

// Test mode state
const testModeState = {
    initialized: false,
    cartItems: [],
    totalValue: 0,
    itemCount: 0
};

// HTML escaping function for security
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Initialize test mode functionality
 */
function initializeTestMode() {
    if (testModeState.initialized) {
        return;
    }

    logger.log('🧪 Initializing Admin Test Mode');

    // Load existing test cart data
    loadTestCartData();

    // Attach event listeners to test buttons
    attachTestModeEventListeners();

    // Update test statistics display
    updateTestStatistics();

    // Mark as initialized
    testModeState.initialized = true;

    // Dispatch initialization event
    window.dispatchEvent(new CustomEvent('admin-test-mode-initialized', {
        detail: { timestamp: Date.now() }
    }));

    logger.log('✅ Admin Test Mode initialized successfully');
}

/**
 * Load test cart data from localStorage
 */
function loadTestCartData() {
    try {
        const savedCart = localStorage.getItem(TEST_MODE_CONFIG.cartStorageKey);
        if (savedCart) {
            testModeState.cartItems = JSON.parse(savedCart);
        } else {
            testModeState.cartItems = [];
        }

        // Recalculate totals
        calculateCartTotals();
    } catch (error) {
        logger.error('Failed to load test cart data:', error);
        testModeState.cartItems = [];
        calculateCartTotals();
    }
}

/**
 * Save test cart data to localStorage
 */
function saveTestCartData() {
    try {
        localStorage.setItem(TEST_MODE_CONFIG.cartStorageKey, JSON.stringify(testModeState.cartItems));
    } catch (error) {
        logger.error('Failed to save test cart data:', error);
        showTestModeMessage('Failed to save test cart data', 'error');
    }
}

/**
 * Calculate cart totals
 */
function calculateCartTotals() {
    testModeState.itemCount = testModeState.cartItems.length;
    testModeState.totalValue = testModeState.cartItems.reduce((total, item) => {
        return total + (item.price * (item.quantity || 1));
    }, 0);
}

/**
 * Attach event listeners to test mode elements
 */
function attachTestModeEventListeners() {
    // Test item add buttons
    const testAddButtons = document.querySelectorAll('.test-add-btn');
    testAddButtons.forEach(button => {
        button.addEventListener('click', handleTestItemAdd);
    });

    // Make functions globally available for inline onclick handlers
    window.viewCartOnMainSite = viewCartOnMainSite;
    window.clearTestCart = clearTestCart;
    window.cleanupTestData = cleanupTestData;
    window.generateTestData = generateTestData;
}

/**
 * Handle adding test items to cart
 */
function handleTestItemAdd(event) {
    const button = event.currentTarget;
    const itemType = button.dataset.item;

    if (!itemType || !TEST_MODE_CONFIG.testItems[itemType]) {
        showTestModeMessage('Invalid test item type', 'error');
        announceToScreenReader('Error: Invalid test item type');
        return;
    }

    // Show loading state with ARIA attributes
    button.classList.add('test-mode-loading');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-label', `Adding ${TEST_MODE_CONFIG.testItems[itemType].name}...`);

    // Add item to test cart
    addTestItemToCart(itemType);

    // Remove loading state
    setTimeout(() => {
        button.classList.remove('test-mode-loading');
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.setAttribute('aria-label', `Add ${TEST_MODE_CONFIG.testItems[itemType].name} for $${TEST_MODE_CONFIG.testItems[itemType].price} to test cart`);
    }, 500);
}

/**
 * Add test item to cart
 */
function addTestItemToCart(itemType) {
    const itemConfig = TEST_MODE_CONFIG.testItems[itemType];
    if (!itemConfig) {
        showTestModeMessage('Test item not found', 'error');
        return;
    }

    // Create test item
    const testItem = {
        id: `test_${itemType}_${Date.now()}`,
        name: itemConfig.name,
        price: itemConfig.price,
        type: itemConfig.type,
        description: itemConfig.description,
        quantity: 1,
        isTestItem: true,
        addedAt: new Date().toISOString()
    };

    // Add to cart
    testModeState.cartItems.push(testItem);

    // Update totals and save
    calculateCartTotals();
    saveTestCartData();

    // Update display
    updateTestStatistics();

    // Show success message and announce to screen readers
    showTestModeMessage(`Added ${escapeHtml(itemConfig.name)} to test cart`, 'success');
    announceToScreenReader(`Successfully added ${itemConfig.name} to test cart. Cart now has ${testModeState.itemCount} items totaling $${testModeState.totalValue.toFixed(2)}`);

    logger.debug('🧪 Test item added:', testItem);
}

/**
 * Update test statistics display
 */
function updateTestStatistics() {
    const cartCountElement = document.getElementById('testCartCount');
    const cartValueElement = document.getElementById('testCartValue');

    if (cartCountElement) {
        cartCountElement.textContent = testModeState.itemCount.toString();
        cartCountElement.setAttribute('aria-label', `${testModeState.itemCount} test items in cart`);
    }

    if (cartValueElement) {
        cartValueElement.textContent = `$${testModeState.totalValue.toFixed(2)}`;
        cartValueElement.setAttribute('aria-label', `Test cart value is $${testModeState.totalValue.toFixed(2)}`);
    }

    // Update the live region for screen readers
    const testStatsRegion = document.getElementById('testStats');
    if (testStatsRegion) {
        testStatsRegion.setAttribute('aria-label', `Test cart statistics: ${testModeState.itemCount} items, total value $${testModeState.totalValue.toFixed(2)}`);
    }
}

/**
 * Announce messages to screen readers
 */
function announceToScreenReader(message) {
    // Create or update announcement element
    let announcer = document.getElementById('test-mode-announcer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'test-mode-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'visually-hidden';
        document.body.appendChild(announcer);
    }

    // Clear and set message
    announcer.textContent = '';
    setTimeout(() => {
        announcer.textContent = message;
    }, 100);

    // Clear after announcement
    setTimeout(() => {
        announcer.textContent = '';
    }, 3000);
}

/**
 * View cart on main site
 */
function viewCartOnMainSite() {
    // Sync test cart to main site cart
    try {
    // Get existing main site cart
        const mainCart = JSON.parse(localStorage.getItem('cart') || '[]');

        // Add test items to main cart with test flag
        const updatedCart = [...mainCart, ...testModeState.cartItems];

        // Save updated cart
        localStorage.setItem('cart', JSON.stringify(updatedCart));

        // Open tickets page in new tab
        const ticketsUrl = `${TEST_MODE_CONFIG.mainSiteUrl}/tickets`;
        window.open(ticketsUrl, '_blank');

        showTestModeMessage('Test cart items added to main site cart', 'success');

        logger.debug('🧪 Test cart synced to main site');
    } catch (error) {
        logger.error('Failed to sync test cart to main site:', error);
        showTestModeMessage('Failed to sync test cart to main site', 'error');
    }
}

/**
 * Clear test cart
 */
async function clearTestCart() {
    if (testModeState.cartItems.length === 0) {
        showTestModeMessage('Test cart is already empty', 'info');
        announceToScreenReader('Test cart is already empty');
        return;
    }

    const confirmed = await showConfirm(
        'Are you sure you want to clear the test cart? This action cannot be undone.',
        'Clear Test Cart'
    );

    if (!confirmed) {
        announceToScreenReader('Clear cart action cancelled');
        return;
    }

    // Clear cart data
    testModeState.cartItems = [];
    calculateCartTotals();
    saveTestCartData();

    // Update display
    updateTestStatistics();

    // Show success message and announce
    showTestModeMessage('Test cart cleared successfully', 'success');
    announceToScreenReader('Test cart cleared successfully. Cart is now empty.');

    logger.debug('🧪 Test cart cleared');
}

/**
 * Cleanup all test data
 */
async function cleanupTestData() {
    const confirmMessage = `This will remove all test data including:
- Test cart items
- Test session data
- Test preferences

This action cannot be undone. Continue?`;

    const confirmed = await showConfirm(confirmMessage, 'Cleanup Test Data');

    if (!confirmed) {
        return;
    }

    try {
    // Clear test cart
        testModeState.cartItems = [];
        calculateCartTotals();

        // Remove all test-related localStorage items
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('test') || key.includes('admin_test'))) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Clear main cart test items
        const mainCart = JSON.parse(localStorage.getItem('cart') || '[]');
        const cleanedCart = mainCart.filter(item => !item.isTestItem);
        localStorage.setItem('cart', JSON.stringify(cleanedCart));

        // Update display
        updateTestStatistics();

        showTestModeMessage('All test data cleaned up successfully', 'success');

        logger.debug('🧪 Test data cleanup completed');
    } catch (error) {
        logger.error('Failed to cleanup test data:', error);
        showTestModeMessage('Failed to cleanup test data', 'error');
    }
}

/**
 * Generate test data for testing purposes
 */
async function generateTestData() {
    const confirmed = await showConfirm(
        'This will generate sample test data. Continue?',
        'Generate Test Data'
    );

    if (!confirmed) {
        return;
    }

    try {
    // Clear existing test data first
        testModeState.cartItems = [];

        // Generate random test items
        const itemTypes = Object.keys(TEST_MODE_CONFIG.testItems);
        const numberOfItems = Math.floor(Math.random() * 5) + 1; // 1-5 items

        for (let i = 0; i < numberOfItems; i++) {
            const randomItemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            const itemConfig = TEST_MODE_CONFIG.testItems[randomItemType];

            const testItem = {
                id: `test_${randomItemType}_${Date.now()}_${i}`,
                name: itemConfig.name,
                price: itemConfig.price,
                type: itemConfig.type,
                description: itemConfig.description,
                quantity: Math.floor(Math.random() * 3) + 1, // 1-3 quantity
                isTestItem: true,
                addedAt: new Date().toISOString()
            };

            testModeState.cartItems.push(testItem);
        }

        // Update totals and save
        calculateCartTotals();
        saveTestCartData();

        // Update display
        updateTestStatistics();

        showTestModeMessage(`Generated ${numberOfItems} test items`, 'success');

        logger.debug('🧪 Test data generated:', testModeState.cartItems);
    } catch (error) {
        logger.error('Failed to generate test data:', error);
        showTestModeMessage('Failed to generate test data', 'error');
    }
}

/**
 * Show test mode message
 */
function showTestModeMessage(message, type = 'info') {
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `test-${type}-indicator`;
    messageElement.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;

    // Find the test mode section
    const testModeSection = document.getElementById('testModeSection');
    if (!testModeSection) {
        logger.log(message);
        return;
    }

    // Insert message at the top of the section
    testModeSection.insertBefore(messageElement, testModeSection.firstChild);

    // Remove message after 3 seconds
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
        }
    }, 3000);
}

/**
 * Get test mode status
 */
function getTestModeStatus() {
    return {
        initialized: testModeState.initialized,
        itemCount: testModeState.itemCount,
        totalValue: testModeState.totalValue,
        cartItems: testModeState.cartItems
    };
}

/**
 * Export test cart data (for debugging/development)
 */
function exportTestCartData() {
    const data = {
        timestamp: new Date().toISOString(),
        cartItems: testModeState.cartItems,
        totals: {
            itemCount: testModeState.itemCount,
            totalValue: testModeState.totalValue
        }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-cart-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showTestModeMessage('Test cart data exported successfully', 'success');
}

// Make functions globally available
window.testMode = {
    initialize: initializeTestMode,
    getStatus: getTestModeStatus,
    exportData: exportTestCartData,
    addItem: addTestItemToCart,
    clearCart: clearTestCart,
    cleanup: cleanupTestData,
    generate: generateTestData,
    showKeyboardShortcutsHelp: showKeyboardShortcutsHelp,
    announceToScreenReader: announceToScreenReader
};

/**
 * Handle keyboard shortcuts for test mode
 */
function handleTestModeKeyboardShortcuts(event) {
    // Check if Alt key is pressed (for accessibility)
    if (!event.altKey) {
        return;
    }

    switch (event.key.toLowerCase()) {
    case 't':
        // Alt+T: Toggle between test and production mode
        event.preventDefault();
        const currentMode = window.testModeView || false;
        window.switchDataMode && window.switchDataMode(!currentMode);
        break;

    case 'v':
        // Alt+V: Add VIP pass
        event.preventDefault();
        addTestItemToCart('vip-pass');
        break;

    case 'w':
        // Alt+W: Add Weekend pass
        event.preventDefault();
        addTestItemToCart('weekend-pass');
        break;

    case 'd':
        // Alt+D: Add Donation
        event.preventDefault();
        addTestItemToCart('donation');
        break;

    case 'c':
        // Alt+C: Clear test cart
        event.preventDefault();
        clearTestCart();
        break;

    case 'g':
        // Alt+G: Generate test data
        event.preventDefault();
        generateTestData();
        break;

    case 'h':
        // Alt+H: Show keyboard shortcuts help
        event.preventDefault();
        showKeyboardShortcutsHelp();
        break;
    }
}

/**
 * Show keyboard shortcuts help
 */
async function showKeyboardShortcutsHelp() {
    const helpMessage = `Test Mode Keyboard Shortcuts:
• Alt+T: Toggle test/production mode
• Alt+V: Add VIP Pass to cart
• Alt+W: Add Weekend Pass to cart
• Alt+D: Add Donation to cart
• Alt+C: Clear test cart
• Alt+G: Generate test data
• Alt+H: Show this help
• Tab: Navigate between elements
• Enter/Space: Activate buttons
• Escape: Cancel operations`;

    await showAlert(helpMessage, 'Keyboard Shortcuts Help');
    announceToScreenReader('Keyboard shortcuts help displayed');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTestMode);
} else {
    initializeTestMode();
}

// Add keyboard shortcut support
document.addEventListener('keydown', handleTestModeKeyboardShortcuts);

// Add escape key handler for canceling operations
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
    // Cancel any loading operations
        const loadingButtons = document.querySelectorAll('.test-mode-loading');
        loadingButtons.forEach(button => {
            button.classList.remove('test-mode-loading');
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });

        // Announce escape action
        announceToScreenReader('Operation cancelled');
    }
});

// Debug logging
logger.debug('🧪 Admin Test Mode script loaded with accessibility enhancements');