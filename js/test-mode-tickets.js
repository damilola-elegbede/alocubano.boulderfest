/**
 * Test Mode Tickets
 * Adds test ticket options to the tickets page in development/preview mode
 */

import { getEnvironment } from './environment-detector.js';

class TestModeTickets {
  constructor() {
    this.env = getEnvironment();
  }

  /**
   * Initialize test mode if appropriate
   */
  init() {
    if (!this.env.shouldShowTestContent()) {
      console.log('Test mode disabled in production');
      return;
    }

    console.log('Test mode enabled:', this.env.getDetails());

    // Add test mode banner
    this.addTestModeBanner();

    // Add test tickets section
    this.addTestTicketsSection();
  }

  /**
   * Add a banner indicating test mode is active
   */
  addTestModeBanner() {
    // Check if banner already exists
    if (document.getElementById('test-mode-banner')) {
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'test-mode-banner';
    banner.className = 'test-mode-banner';
    banner.innerHTML = `
      <div class="test-mode-content">
        <span class="test-mode-icon">🧪</span>
        <span class="test-mode-text">
          <strong>TEST MODE</strong> - ${this.env.getEnvironment().toUpperCase()} Environment
        </span>
        <span class="test-mode-info">Test tickets are visible for development purposes</span>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .test-mode-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%);
        color: white;
        padding: 8px 16px;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        animation: slideDown 0.3s ease-out;
      }

      @keyframes slideDown {
        from {
          transform: translateY(-100%);
        }
        to {
          transform: translateY(0);
        }
      }

      .test-mode-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .test-mode-icon {
        font-size: 20px;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
      }

      .test-mode-text {
        flex: 0 0 auto;
      }

      .test-mode-info {
        flex: 1 1 auto;
        opacity: 0.9;
        font-size: 12px;
        text-align: right;
      }

      @media (max-width: 640px) {
        .test-mode-info {
          display: none;
        }
      }

      /* Adjust page content to account for banner */
      body.has-test-banner {
        padding-top: 45px;
      }
    `;

    document.head.appendChild(style);
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('has-test-banner');
  }

  /**
   * Add test tickets section to the page
   */
  addTestTicketsSection() {
    // Find the ticket selection section
    const ticketSelection = document.querySelector('.ticket-selection');
    if (!ticketSelection) {
      console.warn('Ticket selection section not found');
      return;
    }

    // Check if test section already exists
    if (document.getElementById('test-tickets-section')) {
      return;
    }

    // Create test tickets section
    const testSection = document.createElement('div');
    testSection.id = 'test-tickets-section';
    testSection.className = 'ticket-category test-tickets-category';
    testSection.innerHTML = `
      <h3 style="color: #ff6b6b;">
        <span style="margin-right: 8px;">🧪</span>
        Test Tickets (Dev/Preview Only)
      </h3>
      <p class="category-description" style="color: #666; font-style: italic;">
        These tickets are for testing purposes only and will not appear in production
      </p>

      <div class="ticket-options">
        <!-- Test Full Pass -->
        <div class="ticket-card test-ticket" data-ticket-type="test-full-pass" data-testid="ticket-test-full-pass">
          <div class="ticket-header">
            <h4>TEST: Full Festival Pass</h4>
            <span class="price" data-price="5">$5</span>
          </div>
          <p class="ticket-description">Test ticket for full festival access</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" aria-label="Decrease quantity">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
          <button class="add-to-cart-btn" data-action="add-to-cart">
            Add to Cart
          </button>
        </div>

        <!-- Test Workshop -->
        <div class="ticket-card test-ticket" data-ticket-type="test-workshop" data-testid="ticket-test-workshop">
          <div class="ticket-header">
            <h4>TEST: Single Workshop</h4>
            <span class="price" data-price="2">$2</span>
          </div>
          <p class="ticket-description">Test ticket for single workshop</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" aria-label="Decrease quantity">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
          <button class="add-to-cart-btn" data-action="add-to-cart">
            Add to Cart
          </button>
        </div>

        <!-- Test Social -->
        <div class="ticket-card test-ticket" data-ticket-type="test-social" data-testid="ticket-test-social">
          <div class="ticket-header">
            <h4>TEST: Social Event</h4>
            <span class="price" data-price="1">$1</span>
          </div>
          <p class="ticket-description">Test ticket for social event</p>
          <div class="quantity-controls">
            <button class="qty-btn minus" data-action="decrease" aria-label="Decrease quantity">-</button>
            <span class="quantity">0</span>
            <button class="qty-btn plus" data-action="increase" aria-label="Increase quantity">+</button>
          </div>
          <button class="add-to-cart-btn" data-action="add-to-cart">
            Add to Cart
          </button>
        </div>
      </div>
    `;

    // Add styles for test tickets
    const style = document.createElement('style');
    style.textContent = `
      .test-tickets-category {
        border: 2px dashed #ff6b6b;
        background: linear-gradient(135deg, rgba(255, 107, 107, 0.05) 0%, rgba(254, 202, 87, 0.05) 100%);
        padding: 20px;
        border-radius: 12px;
        margin-top: 40px;
      }

      .test-ticket {
        position: relative;
        overflow: hidden;
      }

      .test-ticket::before {
        content: '🧪 TEST';
        position: absolute;
        top: 8px;
        right: -25px;
        background: #ff6b6b;
        color: white;
        padding: 2px 30px;
        font-size: 10px;
        font-weight: bold;
        transform: rotate(45deg);
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
      }

      .test-ticket .ticket-header h4 {
        color: #ff6b6b;
      }

      @media (prefers-color-scheme: dark) {
        .test-tickets-category {
          background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(254, 202, 87, 0.1) 100%);
        }
      }

      .dark-mode .test-tickets-category {
        background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(254, 202, 87, 0.1) 100%);
      }
    `;

    document.head.appendChild(style);

    // Insert test section at the beginning of ticket selection
    const firstCategory = ticketSelection.querySelector('.ticket-category');
    if (firstCategory) {
      ticketSelection.insertBefore(testSection, firstCategory);
    } else {
      ticketSelection.appendChild(testSection);
    }

    // Initialize the new ticket cards
    this.initializeTestTicketCards();
  }

  /**
   * Initialize test ticket cards with proper attributes
   */
  initializeTestTicketCards() {
    document.querySelectorAll('.test-ticket').forEach((card) => {
      // Set initial attributes
      card.setAttribute('data-quantity', '0');
      card.setAttribute('data-selected', 'false');
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('data-initialized', 'true');

      // Initialize quantity display
      const quantitySpan = card.querySelector('.quantity');
      if (quantitySpan) {
        quantitySpan.textContent = '0';
      }

      // Initialize add to cart button
      const addToCartBtn = card.querySelector('.add-to-cart-btn');
      if (addToCartBtn) {
        addToCartBtn.setAttribute('data-action-state', 'ready');
        addToCartBtn.disabled = false;
      }

      // Initialize quantity buttons
      const qtyButtons = card.querySelectorAll('.qty-btn');
      qtyButtons.forEach(btn => {
        btn.setAttribute('data-ready', 'true');
        btn.disabled = false;
      });
    });

    // Trigger re-initialization of ticket selection if it exists
    if (window.ticketSelection) {
      window.ticketSelection.initializeTicketCards();
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const testMode = new TestModeTickets();
    testMode.init();
  });
} else {
  const testMode = new TestModeTickets();
  testMode.init();
}

// Export for manual initialization if needed
export default TestModeTickets;