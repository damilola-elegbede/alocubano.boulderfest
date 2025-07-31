/**
 * Multi-Event Tickets Navigation and Management
 * Handles smooth scrolling, section highlighting, and event-specific ticket management
 */

class MultiEventTickets {
    constructor() {
        this.init();
    }

    init() {
        this.setupSmoothScrolling();
        this.setupSectionHighlighting();
        this.setupNavigationUpdates();
        this.initializeActiveSection();
    }

    /**
     * Setup smooth scrolling for event navigation links
     */
    setupSmoothScrolling() {
        const navLinks = document.querySelectorAll('.event-nav-card');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                const targetId = link.getAttribute('href').substring(1);
                const targetSection = document.getElementById(targetId);
                
                if (targetSection) {
                    // Calculate offset for sticky navigation
                    const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
                    const offset = headerHeight + 20; // Add some padding
                    
                    const targetPosition = targetSection.offsetTop - offset;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Update active nav link
                    this.updateActiveNavLink(link);
                }
            });
        });
    }

    /**
     * Setup section highlighting based on scroll position
     */
    setupSectionHighlighting() {
        let ticking = false;
        
        const updateActiveSection = () => {
            const sections = document.querySelectorAll('.ticket-category');
            const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
            const offset = headerHeight + 100;
            
            let activeSection = null;
            
            sections.forEach(section => {
                const rect = section.getBoundingClientRect();
                const sectionTop = rect.top + window.pageYOffset;
                const sectionBottom = sectionTop + rect.height;
                const scrollPosition = window.pageYOffset + offset;
                
                if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                    activeSection = section;
                }
            });
            
            if (activeSection) {
                const sectionId = activeSection.id;
                const correspondingNavLink = document.querySelector(`[href="#${sectionId}"]`);
                if (correspondingNavLink) {
                    this.updateActiveNavLink(correspondingNavLink);
                }
            }
            
            ticking = false;
        };
        
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(updateActiveSection);
                ticking = true;
            }
        };
        
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    /**
     * Update active navigation link
     */
    updateActiveNavLink(activeLink) {
        // Remove active class from all links
        document.querySelectorAll('.event-nav-card').forEach(link => {
            link.classList.remove('active');
            link.style.borderColor = 'var(--color-gray-300)';
        });
        
        // Add active class to current link
        activeLink.classList.add('active');
        activeLink.style.borderColor = 'var(--color-black)';
    }

    /**
     * Setup navigation updates based on URL hash
     */
    setupNavigationUpdates() {
        // Handle initial page load with hash
        window.addEventListener('load', () => {
            if (window.location.hash) {
                const hash = window.location.hash.substring(1);
                const targetLink = document.querySelector(`[href="#${hash}"]`);
                if (targetLink) {
                    setTimeout(() => {
                        targetLink.click();
                    }, 100);
                }
            }
        });
        
        // Handle browser back/forward navigation
        window.addEventListener('popstate', () => {
            if (window.location.hash) {
                const hash = window.location.hash.substring(1);
                const targetLink = document.querySelector(`[href="#${hash}"]`);
                if (targetLink) {
                    this.updateActiveNavLink(targetLink);
                }
            }
        });
    }

    /**
     * Initialize the active section based on current scroll position
     */
    initializeActiveSection() {
        setTimeout(() => {
            // Trigger scroll event to set initial active section
            window.dispatchEvent(new Event('scroll'));
        }, 100);
    }

    /**
     * Scroll to a specific event section programmatically
     */
    scrollToEvent(eventId) {
        const targetSection = document.getElementById(eventId);
        const targetLink = document.querySelector(`[href="#${eventId}"]`);
        
        if (targetSection && targetLink) {
            targetLink.click();
        }
    }

    /**
     * Get currently active event section
     */
    getActiveEvent() {
        const activeLink = document.querySelector('.event-nav-link.active');
        if (activeLink) {
            return activeLink.getAttribute('href').substring(1);
        }
        return null;
    }
}

// Global navigation utilities
window.MultiEventNavigation = {
    /**
     * Navigate to specific event
     */
    goToEvent: function(eventId) {
        if (window.multiEventTickets) {
            window.multiEventTickets.scrollToEvent(eventId);
        }
    },
    
    /**
     * Get current active event
     */
    getCurrentEvent: function() {
        if (window.multiEventTickets) {
            return window.multiEventTickets.getActiveEvent();
        }
        return null;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.event-navigation')) {
        window.multiEventTickets = new MultiEventTickets();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiEventTickets;
}