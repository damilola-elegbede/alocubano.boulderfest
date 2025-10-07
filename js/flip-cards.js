/**
 * Flip Card Functionality for Tickets
 * Handles click-to-flip animation and interaction
 */

class FlipCardManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Handle flip card clicks
        document.querySelectorAll('.flip-card').forEach(card => {
            // Skip event binding for disabled tickets (coming soon, sold out)
            if (card.classList.contains('ticket-disabled')) {
                console.log('Skipping flip binding for disabled ticket:', card.dataset.ticketType);
                return;
            }

            // Click on card (but not quantity buttons) to flip
            card.addEventListener('click', (e) => {
                // Don't flip if clicking on quantity buttons or other interactive elements
                if (this.shouldPreventFlip(e.target)) {
                    console.log('Flip prevented for interactive element:', e.target);
                    return;
                }

                const ticketType = card.dataset.ticketType || 'unknown';
                console.log(`Click detected on card: ${ticketType}`, e.target);
                this.flipCard(card);
            });

            // Handle flip back button
            const flipBackBtn = card.querySelector('.flip-back-btn');
            if (flipBackBtn) {
                flipBackBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.flipCard(card, false); // Flip back to front
                });
            }
        });

        // Handle keyboard accessibility
        document.querySelectorAll('.flip-card').forEach(card => {
            // Skip keyboard binding for disabled tickets
            if (card.classList.contains('ticket-disabled')) {
                // Remove tabindex from disabled cards so they're not keyboard-navigable
                card.removeAttribute('tabindex');
                return;
            }

            card.setAttribute('tabindex', '0');
            card.addEventListener('keydown', (e) => {
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
        });
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
}

// Initialize flip card manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.flip-card')) {
        window.flipCardManager = new FlipCardManager();
    }
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlipCardManager;
}