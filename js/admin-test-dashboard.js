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
        'vip-pass': {
            name: '[TEST] VIP Pass',
            price: 150.00,
            type: 'vip-pass',
            description: 'Full festival access with VIP perks'
        },
        'weekend-pass': {
            name: '[TEST] Weekend Pass',
            price: 75.00,
            type: 'weekend-pass',
            description: 'Access to all weekend events'
        },
        'friday-pass': {
            name: '[TEST] Friday Pass',
            price: 35.00,
            type: 'friday-pass',
            description: 'Friday night access'
        },
        'saturday-pass': {
            name: '[TEST] Saturday Pass',
            price: 35.00,
            type: 'saturday-pass',
            description: 'Saturday access'
        },
        'sunday-pass': {
            name: '[TEST] Sunday Pass',
            price: 35.00,
            type: 'sunday-pass',
            description: 'Sunday access'
        },
        'donation': {
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
    cartManager: null
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
        // Initialize cart manager with error handling
        const cartManager = getCartManager();
        await cartManager.initialize();
        testDashboardState.cartManager = cartManager;

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
        showTestDashboardMessage('Failed to initialize test dashboard. Cart functionality may be unavailable.', 'error');

        // Provide fallback behavior
        testDashboardState.cartManager = null;
        attachTestDashboardEventListeners();
    }
}

/**
 * Get current cart state from cart manager (always fresh)
 */
function getCurrentCartState() {
    if (!testDashboardState.cartManager) {
        return { tickets: {} };
    }

    try {
        return testDashboardState.cartManager.getState();
    } catch (error) {
        logger.error('Failed to get cart state:', error);
        return { tickets: {} };
    }
}

/**
 * Get test tickets from current cart state
 */
function getTestTickets() {
    const cartState = getCurrentCartState();
    const testTickets = {};

    Object.entries(cartState.tickets).forEach(([ticketType, ticket]) => {
        if (ticketType.startsWith('TEST-')) {
            testTickets[ticketType] = ticket;
        }
    });

    return testTickets;
}

/**
 * Calculate cart totals for test tickets from current cart state
 */
function calculateCartTotals() {
    const testTickets = getTestTickets();
    let itemCount = 0;
    let totalValue = 0;

    Object.values(testTickets).forEach(ticket => {
        const quantity = ticket.quantity || 1;
        const price = ticket.price || 0;
        itemCount += quantity;
        totalValue += (price * quantity);
    });

    return { itemCount, totalValue };
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
    if (!button) {
        return;
    }

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
    if (!testDashboardState.cartManager) {
        showTestDashboardMessage('Cart manager not available', 'error');
        return;
    }

    // Get config using simple key (without TEST- prefix)
    const itemConfig = TEST_DASHBOARD_CONFIG.testItems[itemType];
    if (!itemConfig) {
        showTestDashboardMessage('Test item not found', 'error');
        return;
    }

    // Add TEST- prefix for cart storage
    const testItemType = `TEST-${itemType}`;

    // Determine test event details based on ticket type
    let testEventId;
    let testVenue = 'Test Ballroom';
    let testEventDate = '2028-02-29'; // Leap year date for test

    // Set event ID based on ticket type (using integer IDs for test events)
    if (itemType.includes('weekend') || itemType.includes('friday') || itemType.includes('saturday') || itemType.includes('sunday')) {
        testEventId = -2; // Test Weekender (negative ID for test)
    } else {
        testEventId = -1; // Test Festival (negative ID for test)
    }

    try {
        // Add ticket using cart manager with TEST- prefix and explicit test values
        await testDashboardState.cartManager.addTicket({
            ticketType: testItemType,
            price: itemConfig.price,
            name: itemConfig.name,
            eventId: testEventId,
            eventDate: testEventDate,
            venue: testVenue,
            quantity: 1
        });

        // Update display with fresh data and visual feedback
        updateTestStatistics();

        // Get current totals for announcement
        const { itemCount, totalValue } = calculateCartTotals();

        // Add visual feedback with cart count animation
        addCartCountAnimation();

        // Show success message with persistent indicator
        showTestDashboardMessage(`Added ${escapeHtml(itemConfig.name)} to test cart`, 'success');
        showPersistentSuccessIndicator('Item added successfully');
        announceToScreenReader(`Successfully added ${itemConfig.name} to test cart. Cart now has ${itemCount} items totaling $${totalValue.toFixed(2)}`);

    } catch (error) {
        logger.error('Failed to add test item to cart:', error);
        showTestDashboardMessage('Failed to add test item to cart', 'error');
    }
}

/**
 * Update test statistics display
 */
function updateTestStatistics() {
    // Always get fresh data from cart manager
    const { itemCount, totalValue } = calculateCartTotals();

    const cartCountElement = document.getElementById('testCartCount');
    const cartValueElement = document.getElementById('testCartValue');

    if (cartCountElement) {
        // Add pulse animation when count changes
        const currentCount = parseInt(cartCountElement.textContent) || 0;
        if (currentCount !== itemCount) {
            cartCountElement.classList.add('count-updated');
            setTimeout(() => cartCountElement.classList.remove('count-updated'), 600);
        }

        cartCountElement.textContent = itemCount.toString();
        cartCountElement.setAttribute('aria-label', `${itemCount} test items in cart`);
    }

    if (cartValueElement) {
        // Add highlight animation when value changes
        const currentValue = cartValueElement.textContent;
        const newValue = `$${totalValue.toFixed(2)}`;
        if (currentValue !== newValue) {
            cartValueElement.classList.add('value-updated');
            setTimeout(() => cartValueElement.classList.remove('value-updated'), 600);
        }

        cartValueElement.textContent = newValue;
        cartValueElement.setAttribute('aria-label', `Test cart value is $${totalValue.toFixed(2)}`);
    }

    // Update the live region for screen readers
    const testStatsRegion = document.getElementById('testStats');
    if (testStatsRegion) {
        testStatsRegion.setAttribute('aria-label', `Test cart statistics: ${itemCount} items, total value $${totalValue.toFixed(2)}`);
    }
}

/**
 * Add cart count animation for visual feedback
 */
function addCartCountAnimation() {
    const cartCountElement = document.getElementById('testCartCount');
    if (cartCountElement) {
        cartCountElement.classList.add('cart-bounce');
        setTimeout(() => cartCountElement.classList.remove('cart-bounce'), 500);
    }
}

/**
 * Show persistent success indicator
 */
function showPersistentSuccessIndicator(message) {
    // Create or update the success indicator
    let indicator = document.getElementById('cart-success-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'cart-success-indicator';
        indicator.className = 'cart-success-indicator';

        // Insert after the cart statistics
        const testStats = document.getElementById('testStats');
        if (testStats && testStats.parentNode) {
            testStats.parentNode.insertBefore(indicator, testStats.nextSibling);
        }
    }

    // Update the indicator content
    indicator.innerHTML = `<span class="success-checkmark">✓</span> ${escapeHtml(message)}`;
    indicator.classList.add('show');

    // Auto-hide after 5 seconds
    clearTimeout(indicator.hideTimer);
    indicator.hideTimer = setTimeout(() => {
        indicator.classList.remove('show');
    }, 5000);
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

    } catch (error) {
        logger.error('Failed to open tickets page:', error);
        showTestDashboardMessage('Failed to open tickets page', 'error');
    }
}

/**
 * Clear test cart using cart manager
 */
async function clearTestCart() {
    if (!testDashboardState.cartManager) {
        showTestDashboardMessage('Cart manager not available', 'error');
        return;
    }

    try {
        // Find all TEST- prefixed tickets from current state
        const testTickets = Object.keys(getTestTickets());

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
            await testDashboardState.cartManager.removeTicket(ticketType);
        }

        // Update display with fresh data
        updateTestStatistics();

        // Show success message and announce
        showTestDashboardMessage('Test cart cleared successfully', 'success');
        announceToScreenReader('Test cart cleared successfully. Test items removed.');

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
        // Remove all TEST- prefixed tickets if cart manager is available
        if (testDashboardState.cartManager) {
            const testTickets = Object.keys(getTestTickets());

            for (const ticketType of testTickets) {
                await testDashboardState.cartManager.removeTicket(ticketType);
            }
        }

        // Remove specific test-related localStorage items (more targeted)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            // Only remove keys that specifically start with admin_test_ or are exactly admin_test_session
            if (key && (key.startsWith('admin_test_') || key === 'admin_test_session')) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Update display with fresh data
        updateTestStatistics();

        showTestDashboardMessage('All test data cleaned up successfully', 'success');

    } catch (error) {
        logger.error('Failed to cleanup test data:', error);
        showTestDashboardMessage('Failed to cleanup test data', 'error');
    }
}

/**
 * Generate test data using cart manager
 */
async function generateTestData() {
    if (!testDashboardState.cartManager) {
        showTestDashboardMessage('Cart manager not available', 'error');
        return;
    }

    const confirmed = window.confirm(
        'This will generate sample test data. Continue?'
    );

    if (!confirmed) {
        return;
    }

    try {
        // Clear existing test tickets first
        await clearTestCart();

        // Generate random test items using simple keys (without TEST- prefix)
        const itemTypes = Object.keys(TEST_DASHBOARD_CONFIG.testItems);
        const numberOfItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
        let totalItems = 0;

        for (let i = 0; i < numberOfItems; i++) {
            const randomItemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];

            // Generate random quantity
            const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity

            // Add tickets using addTestItemToCart which handles TEST- prefix
            for (let j = 0; j < quantity; j++) {
                await addTestItemToCart(randomItemType); // Uses simple key, function adds TEST- prefix
                totalItems++;
            }
        }

        // Update display with fresh data
        updateTestStatistics();

        showTestDashboardMessage(`Generated ${totalItems} test items`, 'success');

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
    const { itemCount, totalValue } = calculateCartTotals();
    return {
        initialized: testDashboardState.initialized,
        itemCount,
        totalValue,
        cartManagerAvailable: !!testDashboardState.cartManager
    };
}

/**
 * Export test cart data (for debugging/development)
 */
function exportTestCartData() {
    const { itemCount, totalValue } = calculateCartTotals();
    const testTickets = getTestTickets();

    const data = {
        timestamp: new Date().toISOString(),
        cartData: testTickets,
        totals: {
            itemCount,
            totalValue
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


// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTestDashboard);
} else {
    initializeTestDashboard();
}

// Enhanced loading for admin test dashboard with visual feedback
logger.debug('🧪 Admin Test Dashboard script loaded with visual feedback enhancements');