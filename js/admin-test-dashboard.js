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

// Test dashboard state - simplified for cart manager integration
const testDashboardState = {
    initialized: false,
    cartManager: null,
    testTicketsData: new Map() // Store ticket data from API
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
 * Fetch test tickets from API
 */
async function fetchTestTickets() {
    try {
        logger.log('📡 Fetching test tickets from API...');

        const response = await fetch('/api/tickets/types?include_test=true&status=test');
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.tickets) {
            throw new Error('Invalid API response format');
        }

        // Store tickets in state
        testDashboardState.testTicketsData.clear();
        for (const ticket of result.tickets) {
            testDashboardState.testTicketsData.set(ticket.id, ticket);
        }

        logger.log(`✅ Loaded ${result.tickets.length} test tickets`);
        return result.tickets;

    } catch (error) {
        logger.error('Failed to fetch test tickets:', error);
        throw error;
    }
}

/**
 * Render test ticket cards dynamically
 */
function renderTestTickets(tickets) {
    const container = document.querySelector('.test-ticket-grid');
    if (!container) {
        logger.error('Test ticket grid container not found');
        return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Create ticket cards
    for (const ticket of tickets) {
        const card = createTestTicketCard(ticket);
        container.appendChild(card);
    }

    logger.log(`✅ Rendered ${tickets.length} test ticket cards`);
}

/**
 * Create a test ticket card element
 */
function createTestTicketCard(ticket) {
    const card = document.createElement('div');
    card.className = 'test-ticket-card';

    // Special styling for donation tickets
    if (ticket.id === 'test-donation') {
        card.classList.add('donation-card');
    }

    // Format price
    const price = (ticket.price_cents / 100).toFixed(0);

    // Create card content
    card.innerHTML = `
        <h4>${escapeHtml(ticket.name)}</h4>
        <div class="ticket-price">$${price}</div>
        <p class="ticket-description">${escapeHtml(ticket.description || '')}</p>
        <button class="test-add-btn admin-btn ${ticket.id === 'test-donation' ? 'admin-btn-primary' : 'admin-btn-success'}"
                data-item="${escapeHtml(ticket.id)}">
            ${ticket.id === 'test-donation' ? '+ Add Donation' : '+ Add to Cart'}
        </button>
    `;

    return card;
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

        // Static tickets are loaded from bootstrap.json in HTML
        // Dynamic loading disabled - tickets are hardcoded in test-dashboard.html
        // const tickets = await fetchTestTickets();
        // renderTestTickets(tickets);

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

    if (!itemType || !testDashboardState.testTicketsData.has(itemType)) {
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

    // Get ticket data from API cache
    const ticketData = testDashboardState.testTicketsData.get(itemType);
    if (!ticketData) {
        showTestDashboardMessage('Test item not found', 'error');
        return;
    }

    // Add TEST- prefix for cart storage
    const testItemType = `TEST-${itemType}`;

    try {
        // Add ticket using cart manager with TEST- prefix and API data
        await testDashboardState.cartManager.addTicket({
            ticketType: testItemType,
            price: ticketData.price_cents / 100, // Convert cents to dollars
            name: ticketData.name,
            eventId: ticketData.event_id,
            eventDate: ticketData.event_date,
            venue: ticketData.event_venue || 'Test Ballroom',
            quantity: 1
        });

        // Update display with fresh data and visual feedback
        updateTestStatistics();

        // Get current totals for announcement
        const { itemCount, totalValue } = calculateCartTotals();

        // Add visual feedback with cart count animation
        addCartCountAnimation();

        // Show success message with persistent indicator
        showTestDashboardMessage(`Added ${escapeHtml(ticketData.name)} to test cart`, 'success');
        showPersistentSuccessIndicator('Item added successfully');
        announceToScreenReader(`Successfully added ${ticketData.name} to test cart. Cart now has ${itemCount} items totaling $${totalValue.toFixed(2)}`);

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
        const ticketsUrl = `${window.location.origin}/tickets`;
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

        // Generate random test items from loaded tickets
        const itemTypes = Array.from(testDashboardState.testTicketsData.keys());

        if (itemTypes.length === 0) {
            showTestDashboardMessage('No test tickets available', 'error');
            return;
        }

        const numberOfItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
        let totalItems = 0;

        for (let i = 0; i < numberOfItems; i++) {
            const randomItemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];

            // Generate random quantity
            const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity

            // Add tickets using addTestItemToCart
            for (let j = 0; j < quantity; j++) {
                await addTestItemToCart(randomItemType);
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
        cartManagerAvailable: !!testDashboardState.cartManager,
        testTicketsLoaded: testDashboardState.testTicketsData.size
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
logger.debug('🧪 Admin Test Dashboard script loaded with dynamic ticket loading');