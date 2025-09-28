// Navigation module for A Lo Cubano Boulder Fest
// Enhanced with EventNavigationSystem for dropdown menus and keyboard accessibility

/**
 * EventBus - Lightweight event system for loose coupling
 */
class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
    }

    off(eventName, callback) {
        if (!this.events.has(eventName)) {
            return;
        }

        const callbacks = this.events.get(eventName);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(eventName, data) {
        if (!this.events.has(eventName)) {
            return;
        }

        this.events.get(eventName).forEach((callback) => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for '${eventName}':`, error);
            }
        });
    }

    once(eventName, callback) {
        const onceCallback = (data) => {
            callback(data);
            this.off(eventName, onceCallback);
        };
        this.on(eventName, onceCallback);
    }
}

/**
 * DropdownManager - Handles dropdown interactions with comprehensive keyboard and mouse support
 */
class DropdownManager {
    constructor(navigationSystem) {
        this.nav = navigationSystem;
        this.activeDropdown = null;
        this.dropdownTimers = new Map();
        this.activeObservers = new Map(); // Track active IntersectionObservers to prevent memory leaks
        this.config = {
            hoverDelay: 150,
            hideDelay: 300,
            keyboardNavEnabled: true,
            touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0
        };
        this.keyboardFocusIndex = -1;
        this.prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;
    }

    init() {
        this.setupDropdownListeners();
        this.setupKeyboardNavigation();
        this.setupTouchInteractions();
        this.setupAccessibilityFeatures();
    }

    setupDropdownListeners() {
    // Click handlers
        document.addEventListener('click', this.handleDropdownClick.bind(this));

        // Mouse interaction handlers (only for non-touch devices for better UX)
        if (!this.config.touchEnabled) {
            document.addEventListener(
                'mouseover',
                this.handleDropdownHover.bind(this)
            );
            document.addEventListener(
                'mouseout',
                this.handleDropdownLeave.bind(this)
            );
        }

        // Focus handlers for keyboard navigation
        document.addEventListener('focusin', this.handleDropdownFocus.bind(this));
        document.addEventListener('focusout', this.handleDropdownBlur.bind(this));
    }

    handleDropdownClick(event) {
        try {
            const trigger = event.target.closest('.nav-trigger, .dropdown-trigger');

            if (trigger) {
                event.preventDefault();
                this.toggleDropdown(trigger);
            } else if (
                !event.target.closest('.nav-item.has-dropdown, .dropdown-container')
            ) {
                // Click outside - close all dropdowns
                this.closeAllDropdowns();
            }
        } catch (error) {
            console.error('Error handling dropdown click:', error);
            // Gracefully close all dropdowns on error
            this.closeAllDropdowns();
        }
    }

    handleDropdownHover(event) {
        try {
            const container = this._findDropdownContainer(event.target);
            if (!container || this.config.touchEnabled) {
                return;
            }

            const trigger = this._findDropdownTrigger(container);
            if (!trigger) {
                return;
            }

            this._scheduleDropdownShow(container, trigger);
        } catch (error) {
            console.error('Error handling dropdown hover:', error);
        }
    }

    _findDropdownContainer(target) {
        return target.closest('.nav-item.has-dropdown, .dropdown-container');
    }

    _findDropdownTrigger(container) {
        return container.querySelector('.nav-trigger, .dropdown-trigger');
    }

    _scheduleDropdownShow(container, trigger) {
        // Clear any pending hide timer
        this.clearTimer(container);

        // Set show timer with Cuban rhythm-inspired timing
        const showTimer = setTimeout(() => {
            if (!this.prefersReducedMotion) {
                this.showDropdown(trigger);
            }
        }, this.config.hoverDelay);

        this.dropdownTimers.set(container, showTimer);
    }

    handleDropdownLeave(event) {
        try {
            const container = this._findDropdownContainer(event.target);
            if (!container) {
                return;
            }

            this._scheduleDropdownHide(container);
        } catch (error) {
            console.error('Error handling dropdown leave:', error);
        }
    }

    _scheduleDropdownHide(container) {
        // Clear show timer
        this.clearTimer(container);

        // Set hide timer
        const hideTimer = setTimeout(() => {
            this.hideDropdown(container);
        }, this.config.hideDelay);

        this.dropdownTimers.set(container, hideTimer);
    }

    handleDropdownFocus(event) {
        const container = event.target.closest(
            '.nav-item.has-dropdown, .dropdown-container'
        );
        if (!container) {
            return;
        }

        const trigger = container.querySelector('.dropdown-trigger');
        if (event.target === trigger) {
            // Focus on trigger - prepare keyboard navigation
            this.keyboardFocusIndex = -1;
        }
    }

    handleDropdownBlur(event) {
    // Use setTimeout to allow focus to move to related target
        setTimeout(() => {
            const container = event.target.closest(
                '.nav-item.has-dropdown, .dropdown-container'
            );
            if (!container) {
                return;
            }

            const relatedTarget = event.relatedTarget;
            if (!relatedTarget || !container.contains(relatedTarget)) {
                this.hideDropdown(container);
            }
        }, 10);
    }

    toggleDropdown(trigger) {
        const container = trigger.closest(
            '.nav-item.has-dropdown, .dropdown-container'
        );
        const menu = container.querySelector('.dropdown-menu');
        const isExpanded = trigger.getAttribute('aria-expanded') === 'true';

        if (isExpanded) {
            this.hideDropdown(container);
        } else {
            this.closeAllDropdowns();
            this.showDropdown(trigger);
        }
    }

    showDropdown(trigger) {
        try {
            const container = trigger.closest('.nav-item.has-dropdown, .dropdown-container');
            const menu = container.querySelector('.dropdown-menu');

            if (!container || !menu) {
                console.warn('Invalid dropdown structure - missing container or menu');
                return;
            }

            this._setDropdownAttributes(trigger, menu, true);
            this._setDropdownClasses(menu, container, true);
            this._activateDropdown(container);
            this._setupDropdownEnhancements(container, menu, trigger);
            this._emitDropdownEvent('dropdownOpened', { container, trigger, menu });
        } catch (error) {
            console.error('Error showing dropdown:', error);
        }
    }

    _setDropdownAttributes(trigger, menu, isOpen) {
        trigger.setAttribute('aria-expanded', isOpen.toString());
        menu.setAttribute('aria-hidden', (!isOpen).toString());
    }

    _setDropdownClasses(menu, container, isOpen) {
        if (isOpen) {
            menu.classList.add('is-open');
            container.classList.add('dropdown-active');
        } else {
            menu.classList.remove('is-open');
            container.classList.remove('dropdown-active');
        }
    }

    _activateDropdown(container) {
        this.activeDropdown = container;
        this.keyboardFocusIndex = -1;
    }

    _setupDropdownEnhancements(container, menu, trigger) {
        // Position dropdown intelligently
        this.positionDropdown(menu, trigger);

        // Setup intersection observer for performance
        this.setupIntersectionObserver(container);

        // Announce to screen readers
        this.announceDropdownState(trigger, true);

        // Prefetch event pages on hover (performance optimization)
        this.prefetchEventPages(container);
    }

    _emitDropdownEvent(eventName, data) {
        this.nav.eventBus.emit(eventName, {
            ...data,
            timestamp: Date.now()
        });
    }

    hideDropdown(container) {
        try {
            const trigger = container.querySelector('.nav-trigger, .dropdown-trigger');
            const menu = container.querySelector('.dropdown-menu');

            if (!trigger || !menu) {
                console.warn('Invalid dropdown structure - missing trigger or menu');
                return;
            }

            this._setDropdownAttributes(trigger, menu, false);
            this._setDropdownClasses(menu, container, false);
            this._deactivateDropdown(container);
            this._announceDropdownStateChange(trigger, false);
            this._emitDropdownEvent('dropdownClosed', { container, trigger, menu });
        } catch (error) {
            console.error('Error hiding dropdown:', error);
        }
    }

    _deactivateDropdown(container) {
        if (this.activeDropdown === container) {
            this.activeDropdown = null;
        }
        this.keyboardFocusIndex = -1;
    }

    _announceDropdownStateChange(trigger, isOpen) {
        try {
            this.announceDropdownState(trigger, isOpen);
        } catch (error) {
            console.error('Error announcing dropdown state:', error);
        }
    }

    setupKeyboardNavigation() {
        if (!this.config.keyboardNavEnabled) {
            return;
        }

        document.addEventListener('keydown', (event) => {
            // Handle dropdown triggers
            if (event.target.classList.contains('dropdown-trigger')) {
                this.handleTriggerKeydown(event);
                return;
            }

            // Handle dropdown menu navigation
            if (this.activeDropdown) {
                this.handleDropdownKeydown(event);
            }
        });
    }

    handleTriggerKeydown(event) {
        const trigger = event.target;
        const container = trigger.closest(
            '.nav-item.has-dropdown, .dropdown-container'
        );

        switch (event.key) {
        case 'ArrowDown':
        case 'Enter':
        case ' ': {
            event.preventDefault();
            this.showDropdown(trigger);
            // Focus first menu item
            setTimeout(() => {
                const firstItem = container.querySelector('.dropdown-link');
                if (firstItem) {
                    firstItem.focus();
                    this.keyboardFocusIndex = 0;
                }
            }, 10);
            break;
        }

        case 'Escape':
            event.preventDefault();
            this.hideDropdown(container);
            break;
        }
    }

    handleDropdownKeydown(event) {
        const menu = this.activeDropdown.querySelector('.dropdown-menu');
        const items = Array.from(menu.querySelectorAll('.dropdown-link'));
        const currentFocus = document.activeElement;
        let currentIndex = items.indexOf(currentFocus);

        switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            items[currentIndex].focus();
            this.keyboardFocusIndex = currentIndex;
            break;

        case 'ArrowUp':
            event.preventDefault();
            currentIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            items[currentIndex].focus();
            this.keyboardFocusIndex = currentIndex;
            break;

        case 'Home':
            event.preventDefault();
            items[0].focus();
            this.keyboardFocusIndex = 0;
            break;

        case 'End':
            event.preventDefault();
            items[items.length - 1].focus();
            this.keyboardFocusIndex = items.length - 1;
            break;

        case 'Escape':
            event.preventDefault();
            this.closeAllDropdowns();
            const trigger = this.activeDropdown?.querySelector('.dropdown-trigger');
            if (trigger) {
                trigger.focus();
            }
            break;

        case 'Tab':
        // Allow natural tab behavior, but close dropdown when tabbing out
            setTimeout(() => {
                if (!this.activeDropdown?.contains(document.activeElement)) {
                    this.closeAllDropdowns();
                }
            }, 10);
            break;

        case 'Enter':
        case ' ':
            if (currentFocus && currentFocus.classList.contains('dropdown-link')) {
                event.preventDefault();
                currentFocus.click();
            }
            break;
        }
    }

    setupTouchInteractions() {
        if (!this.config.touchEnabled) {
            return;
        }

        // Enhanced touch support for mobile devices
        document.addEventListener(
            'touchstart',
            (event) => {
                const dropdown = event.target.closest(
                    '.nav-item.has-dropdown, .dropdown-container'
                );
                if (!dropdown && this.activeDropdown) {
                    this.closeAllDropdowns();
                }
            },
            { passive: true }
        );

        // Prevent scroll when interacting with dropdowns on mobile
        document.addEventListener(
            'touchmove',
            (event) => {
                if (this.activeDropdown && event.target.closest('.dropdown-menu')) {
                    event.preventDefault();
                }
            },
            { passive: false }
        );
    }

    setupAccessibilityFeatures() {
    // Enhance focus visibility for keyboard users
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Tab') {
                document.body.classList.add('keyboard-nav');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-nav');
        });
    }

    positionDropdown(menu, trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollY = window.scrollY;

        // Reset positioning
        menu.style.left = '';
        menu.style.right = '';
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.transform = '';

        // Horizontal positioning
        if (triggerRect.left + menuRect.width > viewportWidth - 20) {
            menu.style.right = '0';
        } else {
            menu.style.left = '0';
        }

        // Vertical positioning
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        if (spaceBelow < menuRect.height && spaceAbove > menuRect.height) {
            // Not enough space below, but enough above
            menu.style.bottom = '100%';
            menu.style.marginBottom = '8px';
        } else {
            // Default: show below
            menu.style.top = '100%';
            menu.style.marginTop = '8px';
        }
    }

    setupIntersectionObserver(container) {
        if (!('IntersectionObserver' in window)) {
            return;
        }

        // Check if observer already exists for this container
        if (this.activeObservers.has(container)) {
            return; // Observer already set up, no need to create another
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting && this.activeDropdown === container) {
                        this.hideDropdown(container);
                    }
                });
            },
            {
                threshold: 0.1,
                rootMargin: '-50px'
            }
        );

        observer.observe(container);

        // Store the observer in the Map
        this.activeObservers.set(container, observer);

        // Clean up observer when dropdown closes
        this.nav.eventBus.once('dropdownClosed', (data) => {
            if (data.container === container) {
                this.cleanupObserver(container);
            }
        });
    }

    cleanupObserver(container) {
        const observer = this.activeObservers.get(container);
        if (observer) {
            observer.disconnect();
            this.activeObservers.delete(container);
        }
    }

    prefetchEventPages(container) {
    // Performance optimization: prefetch likely next pages
        const eventLinks = container.querySelectorAll('.dropdown-link[data-event]');

        eventLinks.forEach((link) => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    // Prefetch the page content
                    const prefetchLink = document.createElement('link');
                    prefetchLink.rel = 'prefetch';
                    prefetchLink.href = link.href;
                    document.head.appendChild(prefetchLink);
                });
            }
        });
    }

    announceDropdownState(trigger, isOpen) {
    // Create or update screen reader announcement
        let announcement = document.getElementById('dropdown-announcement');
        if (!announcement) {
            announcement = document.createElement('div');
            announcement.id = 'dropdown-announcement';
            announcement.setAttribute('aria-live', 'polite');
            announcement.setAttribute('aria-atomic', 'true');
            announcement.style.cssText =
        'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
            document.body.appendChild(announcement);
        }

        const triggerText = trigger.textContent.trim();
        announcement.textContent = `${triggerText} dropdown ${isOpen ? 'opened' : 'closed'}`;
    }

    clearTimer(container) {
        const timer = this.dropdownTimers.get(container);
        if (timer) {
            clearTimeout(timer);
            this.dropdownTimers.delete(container);
        }
    }

    closeAllDropdowns() {
        document
            .querySelectorAll('.nav-item.has-dropdown, .dropdown-container')
            .forEach((container) => {
                this.hideDropdown(container);
            });
    }

    destroy() {
    // Clean up event listeners and timers
        this.dropdownTimers.forEach((timer) => clearTimeout(timer));
        this.dropdownTimers.clear();

        // Clean up all active observers
        this.activeObservers.forEach((observer, container) => {
            observer.disconnect();
        });
        this.activeObservers.clear();

        this.activeDropdown = null;
    }
}

/**
 * EventNavigationSystem - Enhanced navigation management with dropdown functionality
 * Extends the existing SiteNavigation class while maintaining backward compatibility
 */
class SiteNavigation {
    constructor(config = {}) {
    // Legacy compatibility
        this.currentDesign = localStorage.getItem('selectedDesign') || 'design1';
        this.mobileMenuOpen = false;

        // Enhanced navigation properties
        this.currentEvent = null;
        this.currentPage = null;
        this.config = {
            enableDropdowns: true,
            enableKeyboardNav: true,
            enableEventSwitcher: true,
            cubanRhythmTiming: true, // Cuban dance-inspired animation timing
            ...config
        };

        // Event sub-page configuration for maintainability
        this.eventConfig = {
            subPageTypes: ['artists', 'schedule', 'gallery'],
            events: {
                'boulder-fest-2026': {
                    year: '2026',
                    prefix: '2026'
                },
                'boulder-fest-2025': {
                    year: '2025',
                    prefix: '2025'
                },
                'weekender-2025-11': {
                    year: '2025',
                    prefix: 'weekender-2025-11'
                }
            }
        };

        // Event system for loose coupling
        this.eventBus = new EventBus();

        // Dropdown manager
        this.dropdownManager = null;

        // Performance monitoring
        this.performanceMetrics = {
            navigationInteractions: 0,
            dropdownUsage: 0,
            keyboardNavUsage: 0
        };

        this.init();
    }

    init() {
    // Parse current route context
        this.parseCurrentRoute();

        // Setup event listeners (enhanced)
        this.setupEventListeners();

        // Initialize dropdown functionality
        if (this.config.enableDropdowns) {
            this.initializeDropdowns();
        }

        // Create mobile menu
        this.createMobileMenu();

        // Highlight current page
        this.highlightCurrentPage();

        // Initialize mobile menu properly
        this.ensureMenuStateSync();

        // Setup performance monitoring
        this.setupPerformanceMonitoring();

        // Setup accessibility enhancements
        this.setupAccessibilityEnhancements();
    }

    parseCurrentRoute() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(Boolean);

        // For future multi-event architecture
        if (segments.length >= 2) {
            // Event-specific page: /event-slug/page
            this.currentEvent = segments[0];
            this.currentPage = segments[1];
        } else if (segments.length === 1) {
            // Single page or legacy route
            this.currentEvent = null;
            this.currentPage = segments[0] || 'home';
        } else {
            // Root path
            this.currentEvent = null;
            this.currentPage = 'home';
        }

        // Emit route change event
        this.eventBus.emit('routeChanged', {
            event: this.currentEvent,
            page: this.currentPage,
            path: path,
            timestamp: Date.now()
        });
    }

    initializeDropdowns() {
        if (this.dropdownManager) {
            this.dropdownManager.destroy();
        }

        this.dropdownManager = new DropdownManager(this);
        this.dropdownManager.init();

        // Setup dropdown event listeners
        this.eventBus.on('dropdownOpened', (data) => {
            this.performanceMetrics.dropdownUsage++;
        });
    }

    setupPerformanceMonitoring() {
    // Track navigation interactions for analytics
        document.addEventListener('click', (event) => {
            if (event.target.matches('.nav-link, .dropdown-link')) {
                this.performanceMetrics.navigationInteractions++;

                // Cuban culture: Track rhythm of navigation
                this.eventBus.emit('navigationInteraction', {
                    type: 'click',
                    target: event.target.textContent,
                    timestamp: Date.now(),
                    metrics: this.performanceMetrics
                });
            }
        });
    }

    setupAccessibilityEnhancements() {
    // Enhanced focus management
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Tab') {
                this.performanceMetrics.keyboardNavUsage++;
                document.body.classList.add('keyboard-navigation-active');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation-active');
        });

        // Skip link for main content
        this.createSkipLink();
    }

    createSkipLink() {
    // Create skip link for keyboard users
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.textContent = 'Skip to main content';
        skipLink.className = 'skip-link';

        document.body.insertBefore(skipLink, document.body.firstChild);
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

        // Close mobile menu when navigation link is clicked
        document.addEventListener('click', (e) => {
            if (e.target.matches('.nav-link') && this.mobileMenuOpen) {
                this.closeMobileMenu();
            }
        });

        // Enhanced smooth scroll for anchor links with Cuban rhythm timing
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    // Cuban dance-inspired smooth scrolling
                    const scrollOptions = {
                        behavior: this.config.cubanRhythmTiming ? 'smooth' : 'auto',
                        block: 'start'
                    };
                    target.scrollIntoView(scrollOptions);

                    // Emit navigation event
                    this.eventBus.emit('anchorNavigation', {
                        target: anchor.getAttribute('href'),
                        timestamp: Date.now()
                    });
                }
            });
        });

        // Global keyboard shortcuts for power users
        document.addEventListener('keydown', (event) => {
            // Alt + M to toggle mobile menu
            if (event.altKey && event.key === 'm') {
                event.preventDefault();
                this.toggleMobileMenu();
            }

            // Alt + H to go home
            if (event.altKey && event.key === 'h') {
                event.preventDefault();
                window.location.href = '/home';
            }
        });

        // Enhanced visibility change handling
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.mobileMenuOpen) {
                this.closeMobileMenu();
            }
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
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');

        if (this.mobileMenuOpen) {
            if (navList) {
                navList.classList.add('is-open');
            }
            if (menuToggle) {
                menuToggle.classList.add('is-active');
                menuToggle.setAttribute('aria-expanded', 'true');
            }
            document.body.style.overflow = 'hidden';
        } else {
            if (navList) {
                navList.classList.remove('is-open');
            }
            if (menuToggle) {
                menuToggle.classList.remove('is-active');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
            document.body.style.overflow = '';
        }

        // Ensure menu state stays synchronized
        setTimeout(() => {
            this.ensureMenuStateSync();
        }, 100);
    }

    closeMobileMenu() {
        this.mobileMenuOpen = false;
        const menuToggle = document.querySelector('.menu-toggle');
        const navList = document.querySelector('.nav-list');

        if (navList) {
            navList.classList.remove('is-open');
        }
        if (menuToggle) {
            menuToggle.classList.remove('is-active');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
        document.body.style.overflow = '';
    }

    getEventSubPagePatterns() {
        const patterns = [];

        // Dynamically generate patterns from event configuration
        Object.values(this.eventConfig.events).forEach((event) => {
            this.eventConfig.subPageTypes.forEach((type) => {
                patterns.push(`/${event.prefix}-${type}`);
            });
        });

        return patterns;
    }

    highlightCurrentPage() {
        const currentPath = window.location.pathname;

        // Clear all active states first
        document.querySelectorAll('.nav-trigger, .nav-item, .nav-link, .dropdown-link, .event-nav-link').forEach((el) => {
            el.classList.remove('is-active', 'active', 'current');
            el.removeAttribute('aria-current');
        });

        // Define event sub-page patterns with their corresponding overview pages
        const eventPatterns = [
            // Boulder Fest 2025 (handle both redirected paths and direct paths)
            { overview: '/boulder-fest-2025', patterns: [
                '/boulder-fest-2025/artists', '/boulder-fest-2025/schedule', '/boulder-fest-2025/gallery'
            ] },
            // Boulder Fest 2026 (handle both redirected paths and direct paths)
            { overview: '/boulder-fest-2026', patterns: [
                '/boulder-fest-2026/artists', '/boulder-fest-2026/schedule', '/boulder-fest-2026/gallery'
            ] },
            // Weekender 2025-11
            { overview: '/weekender-2025-11', patterns: [
                '/weekender-2025-11/artists', '/weekender-2025-11/schedule', '/weekender-2025-11/gallery'
            ] },
        ];

        // Check if current page is an event sub-page
        let currentEventOverview = null;
        let isEventSubPage = false;

        for (const event of eventPatterns) {
            if (event.patterns.includes(currentPath)) {
                currentEventOverview = event.overview;
                isEventSubPage = true;
                break;
            }
        }

        // Handle regular navigation links
        const navLinks = document.querySelectorAll('.nav-link, .dropdown-link');
        navLinks.forEach((link) => {
            const linkPath = new URL(link.href).pathname;

            // Enhanced path matching for current page highlighting
            const isCurrentPage =
                currentPath === linkPath ||
                (currentPath === '/' && linkPath === '/home') ||
                (currentPath === '/home' && linkPath === '/home') ||
                (currentPath.startsWith(linkPath + '/') && linkPath !== '/') ||
                // Special case for event overview pages when on sub-pages
                (isEventSubPage && linkPath === currentEventOverview);

            if (isCurrentPage) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');

                // If this is in a dropdown, mark the parent trigger as active too
                const dropdown = link.closest('.nav-item.has-dropdown, .dropdown-container');
                if (dropdown) {
                    const trigger = dropdown.querySelector('.dropdown-trigger, .nav-trigger');
                    if (trigger) {
                        trigger.classList.add('is-active');
                        // Also mark the parent nav-item as active for desktop styles
                        const navItem = trigger.closest('.nav-item');
                        if (navItem) {
                            navItem.classList.add('is-active');
                        }
                    }
                }
            }
        });

        // Handle event sub-navigation links
        const eventNavLinks = document.querySelectorAll('.event-nav-link');
        eventNavLinks.forEach((link) => {
            const linkPath = new URL(link.href).pathname;

            // Map the actual paths to the link paths
            const pathMapping = {
                // Boulder Fest 2025
                '/boulder-fest-2025/artists': '/2025-artists',
                '/boulder-fest-2025/schedule': '/2025-schedule',
                '/boulder-fest-2025/gallery': '/2025-gallery',
                // Boulder Fest 2026
                '/boulder-fest-2026/artists': '/2026-artists',
                '/boulder-fest-2026/schedule': '/2026-schedule',
                '/boulder-fest-2026/gallery': '/2026-gallery',
                // Weekender 2025-11
                '/weekender-2025-11/artists': '/weekender-2025-11-artists',
                '/weekender-2025-11/schedule': '/weekender-2025-11-schedule',
                '/weekender-2025-11/gallery': '/weekender-2025-11-gallery'
            };

            // Check if current path matches either directly or through mapping
            const isCurrentPage = currentPath === linkPath ||
                                 (pathMapping[currentPath] && pathMapping[currentPath] === linkPath);

            if (isCurrentPage) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');
            }
        });

        // Ensure Events dropdown is highlighted when on any event page (overview or sub-page)
        const allEventPaths = [
            '/boulder-fest-2025', '/boulder-fest-2025/artists', '/boulder-fest-2025/schedule', '/boulder-fest-2025/gallery',
            '/boulder-fest-2026', '/boulder-fest-2026/artists', '/boulder-fest-2026/schedule', '/boulder-fest-2026/gallery',
            '/weekender-2025-11', '/weekender-2025-11/artists', '/weekender-2025-11/schedule', '/weekender-2025-11/gallery',
        ];

        if (allEventPaths.includes(currentPath)) {
            const eventsTriggers = document.querySelectorAll('[data-dropdown="events"], .nav-trigger');
            eventsTriggers.forEach((trigger) => {
                const triggerText = trigger.textContent.trim();
                if (triggerText.includes('Events')) {
                    trigger.classList.add('is-active');
                    // Also mark the parent nav-item as active for desktop styles
                    const navItem = trigger.closest('.nav-item');
                    if (navItem) {
                        navItem.classList.add('is-active');
                    }
                }
            });
        }
    }

    setDesign(designName) {
        this.currentDesign = designName;
        localStorage.setItem('selectedDesign', designName);
    }

    getDesign() {
        return this.currentDesign;
    }

    // Ensure hamburger button animation stays synchronized with menu state
    ensureMenuStateSync() {
        const menuToggle = document.querySelector('.menu-toggle');

        if (menuToggle) {
            const hasActiveClass = menuToggle.classList.contains('is-active');

            // Fix sync issues between menu state and hamburger animation
            if (this.mobileMenuOpen && !hasActiveClass) {
                menuToggle.classList.add('is-active');
                menuToggle.setAttribute('aria-expanded', 'true');
            } else if (!this.mobileMenuOpen && hasActiveClass) {
                menuToggle.classList.remove('is-active');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        }
    }

    // Navigation with transition (enhanced for Cuban rhythm)
    navigateWithTransition(url) {
    // Close any open dropdowns before navigation
        if (this.dropdownManager) {
            this.dropdownManager.closeAllDropdowns();
        }

        // Close mobile menu if open
        if (this.mobileMenuOpen) {
            this.closeMobileMenu();
        }

        // Cuban dance-inspired transition timing
        const transitionClass = this.config.cubanRhythmTiming
            ? 'page-exiting-cuban'
            : 'page-exiting';
        document.body.classList.add(transitionClass);

        const transitionDelay = this.config.cubanRhythmTiming ? 250 : 300;
        setTimeout(() => {
            window.location.href = url;
        }, transitionDelay);
    }

    // Get performance metrics
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            timestamp: Date.now(),
            activeDropdowns: document.querySelectorAll(
                '.nav-item.has-dropdown.dropdown-active, .dropdown-container.dropdown-active'
            ).length,
            mobileMenuOpen: this.mobileMenuOpen
        };
    }

    // Event-aware page title helper
    getPageDisplayName(page) {
        const displayNames = {
            home: 'Home',
            about: 'About',
            artists: 'Artists',
            schedule: 'Schedule',
            gallery: 'Gallery',
            tickets: 'Tickets',
            donations: 'Donate',
            contact: 'Contact',
            'about-festival': 'About Festival'
        };
        return displayNames[page] || page.charAt(0).toUpperCase() + page.slice(1);
    }

    // Clean up resources
    destroy() {
        if (this.dropdownManager) {
            this.dropdownManager.destroy();
        }

        // Clear any timers or observers
        this.eventBus.events.clear();
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
                if (
                    link &&
          link.href &&
          !link.href.startsWith('#') &&
          link.href.includes(window.location.host)
                ) {
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
                if (
                    !window.siteNavigation ||
          typeof window.siteNavigation.init !== 'function'
                ) {
                    window.siteNavigation = new SiteNavigation();
                } else {
                    // Just reinitialize the existing navigation
                    window.siteNavigation.init();
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

            scripts.forEach((script) => {
                if (script.src) {
                    // Check if this script is already loaded to avoid redeclaring classes
                    const scriptSrc = script.src;
                    const existingScript = document.querySelector(
                        `script[src="${scriptSrc}"]`
                    );

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
                            // SECURITY FIX: Safe DOM-based script execution (no Function constructor)
                            const scriptElement = document.createElement('script');
                            scriptElement.textContent = scriptContent;
                            document.head.appendChild(scriptElement);
                            document.head.removeChild(scriptElement); // Clean up immediately
                        } catch (error) {
                            console.warn('Error executing inline script safely:', error);
                        }
                    }
                }
            });
        }
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof SiteNavigation !== 'undefined') {
        if (typeof window.siteNavigation === 'undefined') {
            window.siteNavigation = new SiteNavigation();
        } else {
            window.siteNavigation.init();
        }
    }
    if (
        typeof PageTransition !== 'undefined' &&
    typeof window.pageTransition === 'undefined'
    ) {
        window.pageTransition = new PageTransition();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SiteNavigation, PageTransition };
}
