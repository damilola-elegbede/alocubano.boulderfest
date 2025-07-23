// Navigation module for A Lo Cubano Boulder Fest

if (typeof Navigation === 'undefined') {
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

            // Mobile menu setup - class will be added only when menu is toggled
            // The 'is-open' class should only be added when menu is explicitly opened
        }

        toggleMobileMenu() {
            this.mobileMenuOpen = !this.mobileMenuOpen;
            const mobileMenu = document.querySelector('.mobile-menu');
            const menuToggle = document.querySelector('.menu-toggle');
            const navList = document.querySelector('.nav-list');

            if (this.mobileMenuOpen) {
                if (mobileMenu) {
                    mobileMenu.classList.add('is-open');
                }
                if (navList) {
                    navList.classList.add('is-open');
                }
                if (menuToggle) {
                    menuToggle.classList.add('is-active');
                }
                document.body.style.overflow = 'hidden';
            } else {
                if (mobileMenu) {
                    mobileMenu.classList.remove('is-open');
                }
                if (navList) {
                    navList.classList.remove('is-open');
                }
                if (menuToggle) {
                    menuToggle.classList.remove('is-active');
                }
                document.body.style.overflow = '';
            }
        }

        closeMobileMenu() {
            this.mobileMenuOpen = false;
            const mobileMenu = document.querySelector('.mobile-menu');
            const menuToggle = document.querySelector('.menu-toggle');
            const navList = document.querySelector('.nav-list');

            if (mobileMenu) {
                mobileMenu.classList.remove('is-open');
            }
            if (navList) {
                navList.classList.remove('is-open');
            }
            if (menuToggle) {
                menuToggle.classList.remove('is-active');
            }
            document.body.style.overflow = '';
        }

        highlightCurrentPage() {
            const currentPath = window.location.pathname;
            const navLinks = document.querySelectorAll('.nav-link');

            navLinks.forEach(link => {
                const linkPath = new URL(link.href).pathname;
                if (currentPath === linkPath || (currentPath === '/' && linkPath === '/home') || (currentPath === '/home' && linkPath === '/home')) {
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
}

// Page transition effects
if (typeof PageTransition === 'undefined') {
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

                // Re-execute scripts to restore functionality
                this.reExecuteScripts(newDoc);

                // Re-initialize navigation only if it doesn't exist or is broken
                if (!window.navigation || typeof window.navigation.init !== 'function') {
                    window.navigation = new Navigation();
                } else {
                // Just reinitialize the existing navigation
                    window.navigation.init();
                }

                // Remove exit class and add enter class
                document.body.classList.remove('page-exiting');
                document.body.classList.add('page-entering');

                setTimeout(() => {
                    document.body.classList.remove('page-entering');
                }, 300);

            } catch {
            // Page transition error, fallback to normal navigation
                window.location.href = url;
            }
        }

        reExecuteScripts(newDoc) {
        // Get all script tags from the new document
            const scripts = newDoc.querySelectorAll('script');

            scripts.forEach(script => {
                if (script.src) {
                // Check if this script is already loaded to avoid redeclaring classes
                    const scriptSrc = script.src;
                    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);

                    if (!existingScript) {
                    // External script - create new script element only if not already loaded
                        const newScript = document.createElement('script');
                        newScript.src = scriptSrc;
                        newScript.async = false; // Maintain execution order
                        document.head.appendChild(newScript);
                    }
                } else if (script.textContent) {
                // For inline scripts, check if it contains class declarations that might already exist
                    const scriptContent = script.textContent;
                    const hasClassDeclaration = /class\s+\w+/.test(scriptContent);

                    if (!hasClassDeclaration) {
                    // Inline script without class declarations - create safe execution context
                        try {
                        // Create a safe function execution instead of eval()
                            const scriptFunction = new Function(scriptContent);
                            scriptFunction();
                        } catch (error) {
                            console.warn('Error executing inline script:', error);
                        }
                    } else {
                    // Skip inline scripts with class declarations to avoid redeclaration errors
                        console.log('Skipping inline script with class declaration to avoid redeclaration');
                    }
                }
            });
        }
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Navigation !== 'undefined' && typeof window.navigation === 'undefined') {
        window.navigation = new Navigation();
    }
    if (typeof PageTransition !== 'undefined' && typeof window.pageTransition === 'undefined') {
        window.pageTransition = new PageTransition();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Navigation, PageTransition };
}