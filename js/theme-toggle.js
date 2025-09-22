/**
 * Theme Toggle Component - Performance Optimized
 * Three-state toggle: System (auto), Light (sun), Dark (moon)
 * Integrates with theme-manager.js for theme state management
 *
 * Features:
 * - Segmented control with inline SVG icons
 * - Accessible with ARIA attributes and keyboard navigation
 * - Smooth transitions and clear active states
 * - Custom events for other components to listen
 * - Hidden on admin pages (follows existing theme manager patterns)
 *
 * Performance Optimizations:
 * - Event delegation for reduced memory usage
 * - Cached DOM queries
 * - Debounced localStorage access
 * - GPU-accelerated animations
 * - Efficient icon rendering
 */

import { THEMES, getCurrentTheme, isAdminPage } from './theme-manager.js';

// Theme toggle constants
const THEME_OPTIONS = {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
};

const LOCAL_STORAGE_KEY = 'theme-preference';
const TOGGLE_ID = 'theme-toggle';

// Performance optimization: Cache DOM queries and debounce operations
let cachedToggleElement = null;
let cachedButtons = null;
let storageTimeout = null;
let eventTimeout = null;
const DEBOUNCE_DELAY = 50; // ms

// Performance monitoring
const PERF_MARKS = {
    TOGGLE_START: 'toggle-start',
    TOGGLE_END: 'toggle-end',
    UPDATE_START: 'toggle-update-start',
    UPDATE_END: 'toggle-update-end'
};

/**
 * SVG icons for each theme state
 *
 * Inline SVG icons provide crisp rendering at any size and can be styled
 * with CSS. Icons are semantically appropriate:
 * - System: Monitor/desktop icon representing auto-detection
 * - Light: Sun icon representing light theme
 * - Dark: Moon icon representing dark theme
 */
const ICONS = {
    [THEME_OPTIONS.SYSTEM]: `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="2" y="3" width="12" height="8" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M5 13h6M7 11v2M9 11v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="6" cy="6" r="0.5" fill="currentColor"/>
            <circle cx="8" cy="6" r="0.5" fill="currentColor"/>
            <circle cx="10" cy="6" r="0.5" fill="currentColor"/>
        </svg>
    `,
    [THEME_OPTIONS.LIGHT]: `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.5 3.5L11 5M5 11l-1.5 1.5M12.5 12.5L11 11M5 5L3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
    `,
    [THEME_OPTIONS.DARK]: `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 2.5A6.5 6.5 0 1 0 13.5 10c-1 .5-2.2.8-3.4.8-3.6 0-6.6-2.9-6.6-6.5 0-1.2.3-2.4.8-3.4A6.4 6.4 0 0 1 6 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
        </svg>
    `
};

/**
 * Get current theme preference from localStorage with debouncing
 *
 * Reads user preference with validation. Falls back to 'system' if
 * no valid preference is stored. Provides safe access to localStorage.
 *
 * @returns {string} Valid theme preference or 'system' as fallback
 */
function getThemePreference() {
    if (typeof localStorage === 'undefined') {
        return THEME_OPTIONS.SYSTEM;
    }

    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return Object.values(THEME_OPTIONS).includes(stored) ? stored : THEME_OPTIONS.SYSTEM;
}

/**
 * Store theme preference in localStorage with debouncing for performance
 *
 * Debounces localStorage writes to prevent excessive I/O operations
 * during rapid theme switching. Improves performance especially on
 * slower devices or during animations.
 *
 * @param {string} theme - Valid theme preference to store
 */
function setThemePreference(theme) {
    if (typeof localStorage === 'undefined') {
        return;
    }

    // Debounce localStorage writes to prevent excessive I/O
    clearTimeout(storageTimeout);
    storageTimeout = setTimeout(() => {
        localStorage.setItem(LOCAL_STORAGE_KEY, theme);
    }, DEBOUNCE_DELAY);
}

/**
 * Get effective theme based on preference and system settings
 *
 * Resolves the actual theme that should be applied based on user preference.
 * If preference is 'system', detects the OS preference using media queries.
 *
 * @param {string} preference - User preference (optional, will detect if not provided)
 * @returns {string} Resolved theme ('light' or 'dark')
 */
function getEffectiveTheme(preference = null) {
    const pref = preference || getThemePreference();

    if (pref === THEME_OPTIONS.SYSTEM) {
        // Check system preference
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches
                ? THEMES.DARK
                : THEMES.LIGHT;
        }
        return THEMES.LIGHT; // Default fallback
    }

    return pref; // 'light' or 'dark'
}

/**
 * Apply theme to document
 *
 * Updates the document element's data-theme attribute based on the
 * resolved theme preference. Skips application on admin pages since
 * they use a fixed dark theme managed by theme-manager.js.
 *
 * @param {string} preference - Theme preference to apply
 */
function applyThemeToggle(preference) {
    if (typeof document === 'undefined') {
        return;
    }

    // Don't apply theme toggle on admin pages - they use fixed dark theme
    if (isAdminPage()) {
        return;
    }

    const effectiveTheme = getEffectiveTheme(preference);
    const root = document.documentElement;

    // Apply theme
    if (effectiveTheme === THEMES.DARK) {
        root.setAttribute('data-theme', THEMES.DARK);
    } else {
        root.removeAttribute('data-theme');
    }

    // Emit custom event for component integration
    const event = new CustomEvent('themechange', {
        detail: {
            theme: effectiveTheme,
            preference: preference,
            source: 'theme-toggle'
        }
    });
    document.dispatchEvent(event);
}

/**
 * Create theme toggle HTML structure
 *
 * Generates accessible HTML with proper ARIA attributes and semantic structure.
 * Uses a radiogroup pattern since theme selection is mutually exclusive.
 * Icons are included inline for immediate availability.
 *
 * @returns {string} Complete HTML structure for theme toggle
 */
function createToggleHTML() {
    return `
        <div class="theme-toggle" role="radiogroup" aria-label="Theme selection">
            ${Object.entries(THEME_OPTIONS)
                .map(([key, value]) => `
                <button
                    type="button"
                    class="theme-toggle__option theme-option"
                    data-theme="${value}"
                    role="radio"
                    aria-checked="false"
                    aria-label="${key.charAt(0) + key.slice(1).toLowerCase()} theme"
                    title="${key.charAt(0) + key.slice(1).toLowerCase()} theme"
                >
                    ${ICONS[value]}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Add CSS styles for the theme toggle
 *
 * Injects comprehensive CSS styles for the theme toggle component.
 * Styles include accessibility features, smooth transitions, and
 * theme-aware colors. Only injects once to avoid duplication.
 */
function addToggleStyles() {
    if (typeof document === 'undefined') {
        return;
    }

    const styleId = 'theme-toggle-styles';

    // Don't add styles twice
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .theme-toggle {
            display: inline-flex;
            background: var(--color-surface-secondary, #f8f9fa);
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 8px;
            padding: 2px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .theme-toggle__option {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 28px;
            border: none;
            background: transparent;
            border-radius: 6px;
            cursor: pointer;
            color: var(--color-text-secondary, #64748b);
            transition: all 0.15s ease;
            position: relative;
        }

        .theme-toggle__option:hover {
            background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
            color: var(--color-text-primary, #1e293b);
        }

        .theme-toggle__option:focus {
            outline: 2px solid var(--color-primary, #3b82f6);
            outline-offset: 2px;
            z-index: 1;
        }

        .theme-toggle__option[aria-checked="true"] {
            background: var(--color-primary, #3b82f6);
            color: white;
            box-shadow: 0 1px 2px rgba(59, 130, 246, 0.3);
        }

        .theme-toggle__option[aria-checked="true"]:hover {
            background: var(--color-primary-hover, #2563eb);
            color: white;
        }


        /* Dark theme styles */
        [data-theme="dark"] .theme-toggle {
            background: var(--color-surface-secondary-dark, #1f2937);
            border-color: var(--color-border-dark, #374151);
        }

        [data-theme="dark"] .theme-toggle__option {
            color: var(--color-text-secondary-dark, #9ca3af);
        }

        [data-theme="dark"] .theme-toggle__option:hover {
            background: var(--color-surface-hover-dark, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary-dark, #f9fafb);
        }

        [data-theme="dark"] .theme-toggle__option[aria-checked="true"] {
            background: var(--color-primary-dark, #3b82f6);
            color: white;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .theme-toggle {
                border-radius: 6px;
            }

            .theme-toggle__option {
                width: 28px;
                height: 24px;
            }
        }
    `;

    document.head.appendChild(style);
}

/**
 * Update toggle active state with performance optimization
 *
 * Updates the visual state of the toggle to reflect the current preference.
 * Uses cached DOM queries and requestAnimationFrame for smooth performance.
 * Only updates elements that actually changed to minimize DOM operations.
 *
 * @param {string} preference - Current theme preference
 */
function updateToggleState(preference) {
    performance.mark(PERF_MARKS.UPDATE_START);

    // Use cached elements to avoid repeated DOM queries
    if (!cachedToggleElement) {
        cachedToggleElement = document.getElementById(TOGGLE_ID);
    }

    if (!cachedToggleElement) return;

    if (!cachedButtons) {
        cachedButtons = cachedToggleElement.querySelectorAll('.theme-toggle__option, .theme-option');
    }

    // Batch DOM updates using RAF for smooth performance
    requestAnimationFrame(() => {
        cachedButtons.forEach(button => {
            const isActive = button.dataset.theme === preference;

            // Only update if state actually changed
            if (button.getAttribute('aria-checked') !== String(isActive)) {
                button.setAttribute('aria-checked', isActive);
            }
        });

        performance.mark(PERF_MARKS.UPDATE_END);
        if (performance.measure) {
            try {
                performance.measure('toggle-update', PERF_MARKS.UPDATE_START, PERF_MARKS.UPDATE_END);
            } catch (e) {
                // Start mark doesn't exist, skip measurement
            }
        }
    });
}

/**
 * Handle theme option click with performance optimization
 *
 * Responds to user clicks on theme options. Implements debouncing to
 * prevent rapid clicking issues and uses RAF for smooth visual updates.
 * Dispatches custom events for component integration.
 *
 * @param {Event} event - Click event from theme option button
 */
function handleThemeClick(event) {
    performance.mark(PERF_MARKS.TOGGLE_START);

    const button = event.target.closest('.theme-toggle__option, .theme-option');
    if (!button) return;

    const newPreference = button.dataset.theme;

    // Prevent rapid clicking
    if (eventTimeout) {
        clearTimeout(eventTimeout);
    }

    // Update preference and apply theme
    setThemePreference(newPreference);
    applyThemeToggle(newPreference);
    updateToggleState(newPreference);

    // Emit custom event for other components with debouncing
    eventTimeout = setTimeout(() => {
        const customEvent = new CustomEvent('themepreferencechange', {
            detail: {
                preference: newPreference,
                effectiveTheme: getEffectiveTheme(newPreference),
                timestamp: performance.now()
            }
        });
        document.dispatchEvent(customEvent);

        performance.mark(PERF_MARKS.TOGGLE_END);
        if (performance.measure) {
            try {
                performance.measure('theme-toggle', PERF_MARKS.TOGGLE_START, PERF_MARKS.TOGGLE_END);
            } catch (e) {
                // Start mark doesn't exist, skip measurement
            }
        }
    }, 16); // One frame delay for 60fps
}

/**
 * Handle keyboard navigation
 *
 * Implements full keyboard accessibility for the theme toggle.
 * Supports arrow keys for navigation and Home/End for quick selection.
 * Follows ARIA best practices for radiogroup pattern.
 *
 * @param {KeyboardEvent} event - Keyboard event to handle
 */
function handleKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        return;
    }

    event.preventDefault();

    const toggle = event.target.closest('.theme-toggle');
    if (!toggle) return; // Add null guard for safety

    const buttons = Array.from(toggle.querySelectorAll('.theme-toggle__option, .theme-option'));
    const currentIndex = buttons.findIndex(btn => btn === event.target);

    let newIndex;
    switch (event.key) {
        case 'ArrowLeft':
            newIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
            break;
        case 'ArrowRight':
            newIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
            break;
        case 'Home':
            newIndex = 0;
            break;
        case 'End':
            newIndex = buttons.length - 1;
            break;
    }

    buttons[newIndex].focus();
    buttons[newIndex].click();
}

/**
 * Listen for system theme changes
 *
 * Monitors the user's system-level dark/light mode preference and
 * automatically updates the theme when the user has 'system' selected.
 * Uses modern addEventListener with fallback for older browsers.
 */
function setupSystemThemeListener() {
    if (typeof window === 'undefined' || !window.matchMedia) {
        return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = () => {
        const currentPreference = getThemePreference();

        // Only update if user has system preference selected
        if (currentPreference === THEME_OPTIONS.SYSTEM) {
            applyThemeToggle(currentPreference);
        }
    };

    // Use modern addEventListener with fallback for older browsers
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleSystemThemeChange);
    }
}

/**
 * Initialize theme toggle component
 *
 * Main initialization function that sets up the complete theme toggle.
 * Handles DOM creation, event binding, and initial state setup.
 * Returns null on admin pages where theme toggle should be hidden.
 *
 * @param {string|Element} container - Container selector or element
 * @returns {Object|null} Component instance with element and state info
 */
function initializeThemeToggle(container) {
    if (typeof document === 'undefined') {
        return null;
    }

    // Don't show toggle on admin pages
    if (isAdminPage()) {
        return null;
    }

    // Add styles
    // Style injection removed - styles now handled by theme-toggle.css

    // Create container if not provided
    let toggleContainer;
    if (container) {
        toggleContainer = typeof container === 'string'
            ? document.querySelector(container)
            : container;
    } else {
        toggleContainer = document.createElement('div');
        toggleContainer.id = TOGGLE_ID;
    }

    if (!toggleContainer) {
        console.warn('Theme toggle: Container not found');
        return null;
    }

    // Set up HTML
    toggleContainer.innerHTML = createToggleHTML();
    toggleContainer.className = `${toggleContainer.className} theme-toggle-container`.trim();

    // Get current preference and apply theme
    const currentPreference = getThemePreference();
    applyThemeToggle(currentPreference);
    updateToggleState(currentPreference);

    // Add event listeners using event delegation
    toggleContainer.addEventListener('click', handleThemeClick);
    toggleContainer.addEventListener('keydown', handleKeyDown);

    // Set up system theme listener
    setupSystemThemeListener();

    return {
        element: toggleContainer,
        preference: currentPreference,
        effectiveTheme: getEffectiveTheme(currentPreference)
    };
}

/**
 * Get current theme preference
 *
 * Public API method to retrieve the current user preference.
 *
 * @returns {string} Current theme preference
 */
function getCurrentPreference() {
    return getThemePreference();
}

/**
 * Set theme preference programmatically
 *
 * Public API method to change theme preference from JavaScript.
 * Validates input and updates both storage and visual state.
 *
 * @param {string} preference - Theme preference to set
 */
function setPreference(preference) {
    if (!Object.values(THEME_OPTIONS).includes(preference)) {
        console.warn(`Invalid theme preference: ${preference}`);
        return;
    }

    setThemePreference(preference);
    applyThemeToggle(preference);
    updateToggleState(preference);
}

/**
 * Destroy theme toggle (cleanup)
 *
 * Removes the theme toggle from DOM.
 * Useful for single-page applications or dynamic content management.
 */
function destroyThemeToggle() {
    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
        toggle.remove();
    }
    // Note: Styles are now managed via external CSS file, no cleanup needed
}

// Export API
export {
    THEME_OPTIONS,
    initializeThemeToggle,
    getCurrentPreference,
    setPreference,
    getEffectiveTheme,
    destroyThemeToggle
};

// Default export for convenience
export default {
    THEME_OPTIONS,
    initialize: initializeThemeToggle,
    getCurrentPreference,
    setPreference,
    getEffectiveTheme,
    destroy: destroyThemeToggle
};