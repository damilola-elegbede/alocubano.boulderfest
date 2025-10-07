/**
 * Flip Card Functionality for Tickets
 * Handles click-to-flip animation and interaction
 * Uses event delegation to support dynamically generated cards
 */

class FlipCardManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Use event delegation on the container for dynamically added cards
        const container = document.querySelector('.tickets-container') || 
                         document.querySelector('#dynamic-ticket-container') || 
                         document.body;

        console.log('FlipCardManager: Binding events with delegation on', container);

        // Click event delegation for flip functionality
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.flip-card');
            if (!card) return;

            // Skip disabled tickets (coming soon, sold out)
            if (card.classList.contains('ticket-disabled')) {
                return;
            }

            // Don't flip if clicking on interactive elements
            if (this.shouldPreventFlip(e.target)) {
                return;
            }

            const ticketType = card.dataset.ticketType || 'unknown';
            console.log(`Click detected on card: ${ticketType}`, e.target);
            this.flipCard(card);
        });

        // Handle flip back button with delegation
        container.addEventListener('click', (e) => {
            const flipBackBtn = e.target.closest('.flip-back-btn');
            if (!flipBackBtn) return;

            e.stopPropagation();
            const card = flipBackBtn.closest('.flip-card');
            if (card) {
                this.flipCard(card, false); // Flip back to front
            }
        });

        // Keyboard accessibility - needs to be handled at document level
        document.addEventListener('keydown', (e) => {
            const card = e.target.closest('.flip-card');
            if (!card) return;

            // Skip disabled tickets
            if (card.classList.contains('ticket-disabled')) {
                return;
            }

            if (e.key === 'Enter' || e.key === ' ') {
                if (!this.shouldPreventFlip(e.target)) {
                    e.preventDefault();
                    this.flipCard(card);
                }
            }
            if (e.key === 'Escape') {
                this.flipCard(card, false); // Flip back to front
            }
        });

        // Set tabindex on existing cards and observe for new cards
        this.updateCardTabindex();
        this.observeNewCards(container);
    }

    updateCardTabindex() {
        document.querySelectorAll('.flip-card').forEach(card => {
            if (card.classList.contains('ticket-disabled')) {
                card.removeAttribute('tabindex');
                card.setAttribute('aria-disabled', 'true');
            } else {
                card.setAttribute('tabindex', '0');
                card.removeAttribute('aria-disabled');
            }
        });
    }

    observeNewCards(container) {
        // Use MutationObserver to handle dynamically added cards
        const observer = new MutationObserver((mutations) => {
            let hasNewCards = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.matches && node.matches('.flip-card')) {
                            hasNewCards = true;
                        } else if (node.querySelector) {
                            const cards = node.querySelectorAll('.flip-card');
                            if (cards.length > 0) {
                                hasNewCards = true;
                            }
                        }
                    }
                });
            });

            if (hasNewCards) {
                this.updateCardTabindex();
                console.log('New flip cards detected and configured');
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true
        });

        this.observer = observer;
    }

    shouldPreventFlip(target) {
        // Don't flip when clicking on interactive elements
        const preventFlipSelectors = [
            '.qty-btn',
            '.quantity',
            '.add-to-cart-btn',
            'button',
            'input',
            '.flip-back-btn'
        ];

        return preventFlipSelectors.some(selector => {
            return target.matches(selector) || target.closest(selector);
        });
    }

    flipCard(card, toBack = null) {
        const isFlipped = card.classList.contains('flipped');
        const ticketType = card.dataset.ticketType || 'unknown';

        console.log(`Flipping card: ${ticketType}, currently flipped: ${isFlipped}`);

        if (toBack === null) {
            // Toggle flip state
            card.classList.toggle('flipped');
        } else if (toBack && !isFlipped) {
            // Flip to back
            card.classList.add('flipped');
        } else if (!toBack && isFlipped) {
            // Flip to front
            card.classList.remove('flipped');
        }

        const newFlippedState = card.classList.contains('flipped');
        console.log(`Card ${ticketType} now flipped: ${newFlippedState}`);

        // Announce state change for screen readers
        const ticketTypeDisplay = card.querySelector('.ticket-type')?.textContent || 'Ticket';
        const newState = card.classList.contains('flipped') ? 'showing details' : 'showing front';

        // Create temporary announcement for screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `${ticketTypeDisplay} card ${newState}`;

        document.body.appendChild(announcement);
        setTimeout(() => {
            if (document.body.contains(announcement)) {
                document.body.removeChild(announcement);
            }
        }, 1000);
    }

    // Method to flip all cards back to front (useful for resetting)
    resetAllCards() {
        document.querySelectorAll('.flip-card.flipped').forEach(card => {
            this.flipCard(card, false);
        });
    }

    // Method to get flip state of a card
    isCardFlipped(card) {
        return card.classList.contains('flipped');
    }

    // Cleanup method
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}

// Initialize flip card manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.flip-card') || 
        document.querySelector('#dynamic-ticket-container') ||
        document.querySelector('.tickets-container')) {
        window.flipCardManager = new FlipCardManager();
        console.log('FlipCardManager initialized with event delegation');
    }
});

// Export function for dynamic card generation
// With event delegation, this is a no-op since new cards are automatically supported
window.initFlipCards = () => {
    console.log('initFlipCards called - using event delegation, new cards automatically supported');
    // Force tabindex update for any new cards
    if (window.flipCardManager) {
        window.flipCardManager.updateCardTabindex();
    }
};

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlipCardManager;
}
