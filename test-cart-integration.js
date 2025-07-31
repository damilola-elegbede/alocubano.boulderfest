/**
 * Test script to verify cart integration in header
 * This simulates adding items to cart and checks if the cart appears in the header
 */

// Simulate adding items to cart
function testCartIntegration() {
    console.log('🛒 Testing cart integration...');
    
    // Check if global cart exists
    if (typeof window.globalCart !== 'undefined') {
        console.log('✅ Global cart instance found');
        
        // Simulate cart data
        const testCartData = new Map([
            ['bf2026-early-bird-full', {
                name: 'Early Bird Full Pass',
                price: 100,
                quantity: 2,
                event: 'boulder-fest-2026'
            }],
            ['bf2026-single-workshop', {
                name: 'Single Workshop', 
                price: 30,
                quantity: 1,
                event: 'boulder-fest-2026'
            }]
        ]);
        
        // Store test data
        const cartSummary = {
            itemCount: 3,
            totalAmount: 230
        };
        
        // Trigger cart update
        window.globalCart.updateFromCartData(cartSummary);
        
        // Check if cart icon is in header
        const cartInHeader = document.querySelector('#header-right .global-cart-icon');
        const cartInBody = document.querySelector('body > .global-cart-icon');
        
        if (cartInHeader) {
            console.log('✅ Cart icon found in header-right container');
            console.log('📍 Cart position: header-integrated');
        } else if (cartInBody) {
            console.log('⚠️ Cart icon found in body (fallback mode)');
            console.log('📍 Cart position: body-fallback');
        } else {
            console.log('❌ Cart icon not found');
        }
        
        // Check badge
        const badge = document.getElementById('global-cart-badge');
        if (badge && badge.textContent === '3') {
            console.log('✅ Cart badge showing correct count: 3');
        } else {
            console.log('❌ Cart badge not showing correct count');
        }
        
        // Check visibility
        const cartIcon = document.getElementById('global-cart-icon');
        if (cartIcon && cartIcon.classList.contains('visible')) {
            console.log('✅ Cart icon is visible');
        } else {
            console.log('❌ Cart icon is not visible');
        }
        
    } else {
        console.log('❌ Global cart not initialized');
    }
}

// Run test when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(testCartIntegration, 1000); // Wait for cart to initialize
    });
} else {
    setTimeout(testCartIntegration, 1000);
}

// Export for manual testing
window.testCartIntegration = testCartIntegration;