/**
 * Admin Test Dashboard JavaScript
 * Manages test dashboard functionality for the A Lo Cubano Boulder Fest admin dashboard
 */

// Import cart manager for proper cart integration
import { getCartManager } from '/js/lib/cart-manager.js';

// Simple logger implementation
const logger = {
    log: (...args) => console.log('[AdminTestDashboard]', ...args),
    error: (...args) => console.error('[AdminTestDashboard]', ...args),
    debug: (...args) => console.debug('[AdminTestDashboard]', ...args)
};

// Test dashboard configuration - with TEST prefixes for test items
const TEST_DASHBOARD_CONFIG = {
    testItems: {
        'TEST-2026-early-bird-full': {
            name: '[TEST] VIP Pass',
            price: 150.00,
            type: 'vip-pass',
            description: 'Full festival access with VIP perks'
        },
        'TEST-2026-full-pass': {
            name: '[TEST] Weekend Pass',
            price: 75.00,
            type: 'weekend-pass',
            description: 'Access to all weekend events'
        },
        'TEST-friday-pass': {
            name: '[TEST] Friday Pass',
            price: 35.00,
            type: 'friday-pass',
            description: 'Friday night access'
        },
        'TEST-saturday-pass': {
            name: '[TEST] Saturday Pass',
            price: 35.00,
            type: 'saturday-pass',
            description: 'Saturday access'
        },
        'TEST-sunday-pass': {
            name: '[TEST] Sunday Pass',
            price: 35.00,
            type: 'sunday-pass',
            description: 'Sunday access'
        },
        'TEST-donation': {
            name: '[TEST] Festival Donation',
            price: 25.00,
            type: 'donation',
            description: 'Support the festival'
        }
    },
    mainSiteUrl: window.location.origin
};

// Test dashboard state - simplified for cart manager integration
const testDashboardState = {
    initialized: false,
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
 * Initialize test dashboard functionality
 */
async function initializeTestDashboard() {
    if (testDashboardState.initialized) {
        return;
    }

    logger.log('🧪 Initializing Admin Test Dashboard');

    try {
        // Initialize cart manager
        const cartManager = getCartManager();
        await cartManager.initialize();

        // Load existing test cart data
        loadTestCartData();

        // Attach event listeners to test buttons
        attachTestDashboardEventListeners();

        // Update test statistics display
        updateTestStatistics();

        // Mark as initialized
        testDashboardState.initialized = true;

        // Dispatch initialization event
        window.dispatchEvent(new CustomEvent('admin-test-dashboard-initialized', {
            detail: { timestamp: Date.now() }
        }));

        logger.log('✅ Admin Test Dashboard initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize test dashboard:', error);
        showTestDashboardMessage('Failed to initialize test dashboard', 'error');
    }
}

/**
 * Load test cart data from cart manager
 */
function loadTestCartData() {
    try {
        const cartManager = getCartManager();
        const cartState = cartManager.getState();

        // Filter for TEST- prefixed tickets only for display
        const testTickets = {};
        Object.entries(cartState.tickets).forEach(([ticketType, ticket]) => {
            if (ticketType.startsWith('TEST-')) {
                testTickets[ticketType] = ticket;
            }
        });

        // Calculate totals for test tickets only
        calculateCartTotals(testTickets);

        logger.log('Loaded test cart data:', testTickets);
    } catch (error) {
        logger.error('Failed to load test cart data:', error);
        calculateCartTotals({});
    }
}


/**
 * Calculate cart totals for test tickets
 */
function calculateCartTotals(testTickets = {}) {
    testDashboardState.itemCount = 0;
    testDashboardState.totalValue = 0;

    Object.values(testTickets).forEach(ticket => {
        const quantity = ticket.quantity || 1;
        const price = ticket.price || 0;
        testDashboardState.itemCount += quantity;
        testDashboardState.totalValue += (price * quantity);
    });
}

/**
 * Attach event listeners to test dashboard elements
 */
function attachTestDashboardEventListeners() {
    // Test item add buttons - delegate to container for dynamic content
    const container = document.querySelector('.test-ticket-grid');
    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.closest('.test-add-btn')) {
                handleTestItemAdd(e);
            }
        });
    }

    // Make functions globally available for inline onclick handlers
    window.testDashboard = {
        viewCart: viewCartOnMainSite,
        clearCart: clearTestCart,
        cleanup: cleanupTestData,
        generate: generateTestData,
        addItem: (itemType) => addTestItemToCart(itemType)
    };

    // Also keep the old global functions for backwards compatibility
    window.viewCartOnMainSite = viewCartOnMainSite;
    window.clearTestCart = clearTestCart;
    window.cleanupTestData = cleanupTestData;
    window.generateTestData = generateTestData;
}

/**
 * Handle adding test items to cart
 */
function handleTestItemAdd(event) {
    const button = event.target.closest('.test-add-btn');
    if (!button) return;

    const itemType = button.dataset.item;

    if (!itemType || !TEST_DASHBOARD_CONFIG.testItems[itemType]) {
        showTestDashboardMessage('Invalid test item type', 'error');
        announceToScreenReader('Error: Invalid test item type');
        return;
    }

    // Show loading state with animation
    button.classList.add('adding');
    button.disabled = true;

    // Add item to test cart
    addTestItemToCart(itemType);

    // Remove loading state with a nice animation
    setTimeout(() => {
        button.classList.remove('adding');
        button.classList.add('added');
        setTimeout(() => {
            button.classList.remove('added');
            button.disabled = false;
        }, 1000);
    }, 300);
}

/**
 * Add test item to cart using cart manager
 */
async function addTestItemToCart(itemType) {
    // If itemType doesn't have TEST- prefix, add it
    const testItemType = itemType.startsWith('TEST-') ? itemType : `TEST-${itemType}`;
    const itemConfig = TEST_DASHBOARD_CONFIG.testItems[testItemType];

    if (!itemConfig) {
        showTestDashboardMessage('Test item not found', 'error');
        return;
    }

    try {
        const cartManager = getCartManager();

        // Add ticket using cart manager with TEST- prefix
        await cartManager.addTicket({
            ticketType: testItemType,
            price: itemConfig.price,
            name: itemConfig.name,
            eventId: 'test-event',
            quantity: 1
        });

        // Reload test cart data and update display
        loadTestCartData();
        updateTestStatistics();

        // Show success message and announce to screen readers
        showTestDashboardMessage(`Added ${escapeHtml(itemConfig.name)} to test cart`, 'success');
        announceToScreenReader(`Successfully added ${itemConfig.name} to test cart. Cart now has ${testDashboardState.itemCount} items totaling $${testDashboardState.totalValue.toFixed(2)}`);

        logger.debug('🧪 Test item added:', testItemType);
    } catch (error) {
        logger.error('Failed to add test item to cart:', error);
        showTestDashboardMessage('Failed to add test item to cart', 'error');
    }
}

/**
 * Update test statistics display
 */
function updateTestStatistics() {
    const cartCountElement = document.getElementById('testCartCount');
    const cartValueElement = document.getElementById('testCartValue');

    if (cartCountElement) {
        cartCountElement.textContent = testDashboardState.itemCount.toString();
        cartCountElement.setAttribute('aria-label', `${testDashboardState.itemCount} test items in cart`);
    }

    if (cartValueElement) {
        cartValueElement.textContent = `$${testDashboardState.totalValue.toFixed(2)}`;
        cartValueElement.setAttribute('aria-label', `Test cart value is $${testDashboardState.totalValue.toFixed(2)}`);
    }

    // Update the live region for screen readers
    const testStatsRegion = document.getElementById('testStats');
    if (testStatsRegion) {
        testStatsRegion.setAttribute('aria-label', `Test cart statistics: ${testDashboardState.itemCount} items, total value $${testDashboardState.totalValue.toFixed(2)}`);
    }
}

/**
 * Announce messages to screen readers
 */
function announceToScreenReader(message) {
    // Create or update announcement element
    let announcer = document.getElementById('test-dashboard-announcer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'test-dashboard-announcer';
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
 * View cart on main site - cart is already synced via cart manager
 */
function viewCartOnMainSite() {
    try {
        // Open tickets page in new tab - cart is already synced
        const ticketsUrl = `${TEST_DASHBOARD_CONFIG.mainSiteUrl}/tickets`;
        window.open(ticketsUrl, '_blank');

        showTestDashboardMessage('Opening tickets page with test items...', 'info');
        announceToScreenReader('Opening tickets page in new tab with test items');

        logger.log('🌍 Viewing cart on main site with test items');
    } catch (error) {
        logger.error('Failed to open tickets page:', error);
        showTestDashboardMessage('Failed to open tickets page', 'error');
    }
}

/**
 * Clear test cart using cart manager
 */
async function clearTestCart() {
    try {
        const cartManager = getCartManager();
        const cartState = cartManager.getState();

        // Find all TEST- prefixed tickets
        const testTickets = Object.keys(cartState.tickets).filter(ticketType =>
            ticketType.startsWith('TEST-')
        );

        if (testTickets.length === 0) {
            showTestDashboardMessage('Test cart is already empty', 'info');
            announceToScreenReader('Test cart is already empty');
            return;
        }

        const confirmed = window.confirm(
            'Are you sure you want to clear the test cart? This action cannot be undone.'
        );

        if (!confirmed) {
            announceToScreenReader('Clear cart action cancelled');
            return;
        }

        // Remove each test ticket using cart manager
        for (const ticketType of testTickets) {
            await cartManager.removeTicket(ticketType);
        }

        // Update display
        loadTestCartData();
        updateTestStatistics();

        // Show success message and announce
        showTestDashboardMessage('Test cart cleared successfully', 'success');
        announceToScreenReader('Test cart cleared successfully. Test items removed.');

        logger.debug('🧪 Test cart cleared');
    } catch (error) {
        logger.error('Failed to clear test cart:', error);
        showTestDashboardMessage('Failed to clear test cart', 'error');
    }
}

/**
 * Cleanup all test data using cart manager
 */
async function cleanupTestData() {
    const confirmMessage = `This will remove all test data including:
- Test cart items (TEST- prefixed tickets)
- Test session data
- Test preferences

This action cannot be undone. Continue?`;

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
        return;
    }

    try {
        const cartManager = getCartManager();
        const cartState = cartManager.getState();

        // Remove all TEST- prefixed tickets
        const testTickets = Object.keys(cartState.tickets).filter(ticketType =>
            ticketType.startsWith('TEST-')
        );

        for (const ticketType of testTickets) {
            await cartManager.removeTicket(ticketType);
        }

        // Remove all test-related localStorage items (excluding the main cart)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key !== 'alocubano_cart' && (key.includes('test') || key.includes('admin_test'))) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Update display
        loadTestCartData();
        updateTestStatistics();

        showTestDashboardMessage('All test data cleaned up successfully', 'success');

        logger.debug('🧪 Test data cleanup completed');
    } catch (error) {
        logger.error('Failed to cleanup test data:', error);
        showTestDashboardMessage('Failed to cleanup test data', 'error');
    }
}

/**
 * Generate test data using cart manager
 */
async function generateTestData() {
    const confirmed = window.confirm(
        'This will generate sample test data. Continue?'
    );

    if (!confirmed) {
        return;
    }

    try {
        const cartManager = getCartManager();

        // Clear existing test tickets first
        await clearTestCart();

        // Generate random test items
        const itemTypes = Object.keys(TEST_DASHBOARD_CONFIG.testItems);
        const numberOfItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
        let totalItems = 0;

        for (let i = 0; i < numberOfItems; i++) {
            const randomItemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            const itemConfig = TEST_DASHBOARD_CONFIG.testItems[randomItemType];

            // Generate random quantity
            const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity

            // Add tickets using cart manager
            for (let j = 0; j < quantity; j++) {
                await cartManager.addTicket({
                    ticketType: randomItemType,
                    price: itemConfig.price,
                    name: itemConfig.name,
                    eventId: 'test-event',
                    quantity: 1
                });
                totalItems++;
            }
        }

        // Update display
        loadTestCartData();
        updateTestStatistics();

        showTestDashboardMessage(`Generated ${totalItems} test items`, 'success');

        logger.debug('🧪 Test data generated');
    } catch (error) {
        logger.error('Failed to generate test data:', error);
        showTestDashboardMessage('Failed to generate test data', 'error');
    }
}

/**
 * Show test dashboard message
 */
function showTestDashboardMessage(message, type = 'info') {
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `test-${type}-indicator`;
    messageElement.innerHTML = `
        <span>${escapeHtml(message)}</span>
    `;

    // Find the test dashboard section
    const testDashboardSection = document.getElementById('testDashboardSection');
    if (!testDashboardSection) {
        logger.log(message);
        return;
    }

    // Insert message at the top of the section
    testDashboardSection.insertBefore(messageElement, testDashboardSection.firstChild);

    // Remove message after 3 seconds
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
        }
    }, 3000);
}

/**
 * Get test dashboard status
 */
function getTestDashboardStatus() {
    return {
        initialized: testDashboardState.initialized,
        itemCount: testDashboardState.itemCount,
        totalValue: testDashboardState.totalValue,
        cartData: testDashboardState.cartData
    };
}

/**
 * Export test cart data (for debugging/development)
 */
function exportTestCartData() {
    const data = {
        timestamp: new Date().toISOString(),
        cartData: testDashboardState.cartData,
        totals: {
            itemCount: testDashboardState.itemCount,
            totalValue: testDashboardState.totalValue
        }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-cart-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showTestDashboardMessage('Test cart data exported successfully', 'success');
}

// Make functions globally available
window.testDashboard = {
    initialize: initializeTestDashboard,
    getStatus: getTestDashboardStatus,
    exportData: exportTestCartData,
    addItem: addTestItemToCart,
    clearCart: clearTestCart,
    cleanup: cleanupTestData,
    generate: generateTestData,
    viewCart: viewCartOnMainSite,
    announceToScreenReader: announceToScreenReader
};

/**
 * Handle keyboard shortcuts for test dashboard
 */
function handleTestDashboardKeyboardShortcuts(event) {
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
            addTestItemToCart('TEST-2026-early-bird-full');
            break;

        case 'w':
            // Alt+W: Add Weekend pass
            event.preventDefault();
            addTestItemToCart('TEST-2026-full-pass');
            break;

        case 'd':
            // Alt+D: Add Donation
            event.preventDefault();
            addTestItemToCart('TEST-donation');
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
    const helpMessage = `Test Dashboard Keyboard Shortcuts:
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

    window.alert(helpMessage);
    announceToScreenReader('Keyboard shortcuts help displayed');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTestDashboard);
} else {
    initializeTestDashboard();
}

// Add keyboard shortcut support
document.addEventListener('keydown', handleTestDashboardKeyboardShortcuts);

// Add escape key handler for canceling operations
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        // Cancel any loading operations
        const loadingButtons = document.querySelectorAll('.test-dashboard-loading');
        loadingButtons.forEach(button => {
            button.classList.remove('test-dashboard-loading');
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });

        // Announce escape action
        announceToScreenReader('Operation cancelled');
    }
});

// Debug logging
logger.debug('🧪 Admin Test Dashboard script loaded with correct cart structure');