// Navigation module for A Lo Cubano Boulder Fest

class Navigation {
    constructor() {
        this.currentDesign = localStorage.getItem('selectedDesign') || 'design1';
        this.mobileMenuOpen = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createMobileMenu();
        this.highlightCurrentPage();
    }

    setupEventListeners() {
    // Mobile menu toggle
        const menuToggle = document.querySelector('.menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Close mobile menu on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.mobileMenuOpen) {
                this.closeMobileMenu();
            }
        });

        // Close mobile menu on click outside
        document.addEventListener('click', (e) => {
            const mobileMenu = document.querySelector('.mobile-menu');
            const navList = document.querySelector('.nav-list');
            const menuToggle = document.querySelector('.menu-toggle');
            
            if (this.mobileMenuOpen && menuToggle && !menuToggle.contains(e.target)) {
                // Check if click is outside nav list (mobile menu)
                if (navList && !navList.contains(e.target)) {
                    this.closeMobileMenu();
                }
            }
        });

        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    createMobileMenu() {
        const nav = document.querySelector('.main-nav');
        const menuToggle = document.querySelector('.menu-toggle');
        
        if (!nav || !menuToggle) {
            return;
        }

        // Enhance existing menu toggle with proper structure
        if (!menuToggle.querySelector('.menu-icon')) {
            menuToggle.innerHTML = `
                <span class="menu-icon">
                    <span></span>
                    <span></span>
                    <span></span>
                </span>
            `;
        }

        // Add mobile menu class to nav list for overlay behavior
        const navList = document.querySelector('.nav-list');
        if (navList) {
            navList.classList.add('mobile-menu');
        }
    }

    toggleMobileMenu() {
        this.mobileMenuOpen = !this.mobileMenuOpen;
        const mobileMenu = document.querySelector('.mobile-menu');
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');

        if (this.mobileMenuOpen) {
            if (mobileMenu) mobileMenu.classList.add('is-open');
            if (navList) navList.classList.add('is-open');
            if (menuToggle) menuToggle.classList.add('is-active');
            document.body.style.overflow = 'hidden';
        } else {
            if (mobileMenu) mobileMenu.classList.remove('is-open');
            if (navList) navList.classList.remove('is-open');
            if (menuToggle) menuToggle.classList.remove('is-active');
            document.body.style.overflow = '';
        }
    }

    closeMobileMenu() {
        this.mobileMenuOpen = false;
        const mobileMenu = document.querySelector('.mobile-menu');
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');

        if (mobileMenu) mobileMenu.classList.remove('is-open');
        if (navList) navList.classList.remove('is-open');
        if (menuToggle) menuToggle.classList.remove('is-active');
        document.body.style.overflow = '';
    }

    highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-link');

        navLinks.forEach(link => {
            const linkPath = new URL(link.href).pathname;
            if (currentPath === linkPath || (currentPath.endsWith('/') && linkPath.endsWith('home.html'))) {
                link.classList.add('is-active');
            }
        });
    }

    setDesign(designName) {
        this.currentDesign = designName;
        localStorage.setItem('selectedDesign', designName);
    }

    getDesign() {
        return this.currentDesign;
    }
}

// Page transition effects
class PageTransition {
    constructor() {
        this.init();
    }

    init() {
    // Add transition class to body
        document.body.classList.add('page-transition');

        // Handle link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('#') && link.href.includes(window.location.host)) {
                e.preventDefault();
                this.navigateWithTransition(link.href);
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            this.loadPage(window.location.href, false);
        });
    }

    navigateWithTransition(url) {
        document.body.classList.add('page-exiting');

        setTimeout(() => {
            this.loadPage(url, true);
        }, 300);
    }

    async loadPage(url, pushState = true) {
        try {
            const response = await fetch(url);
            const html = await response.text();

            // Create a temporary DOM element to parse the HTML
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            // Update the page content
            document.body.innerHTML = newDoc.body.innerHTML;
            document.head.innerHTML = newDoc.head.innerHTML;

            // Update URL if needed
            if (pushState) {
                window.history.pushState({}, '', url);
            }

            // Re-initialize navigation
            new Navigation();

            // Remove exit class and add enter class
            document.body.classList.remove('page-exiting');
            document.body.classList.add('page-entering');

            setTimeout(() => {
                document.body.classList.remove('page-entering');
            }, 300);

        } catch (error) {
            // Page transition error, fallback to normal navigation
            window.location.href = url;
        }
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.navigation = new Navigation();
    window.pageTransition = new PageTransition();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Navigation, PageTransition };
}