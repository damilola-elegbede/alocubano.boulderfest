/**
 * Theme Toggle Component
 * Provides a three-state toggle for theme selection (System/Light/Dark)
 * Only appears on main site pages (hidden on admin pages)
 */

import { THEMES, getCurrentTheme, getThemePreference, setTheme, isAdminPage } from './theme-manager.js';

/**
 * Creates the theme toggle button HTML
 * @returns {string} HTML string for the toggle button
 */
function createToggleHTML() {
    return `
        <button
            id="theme-toggle"
            class="theme-toggle"
            aria-label="Toggle theme"
            title="Toggle theme (System/Light/Dark)"
        >
            <span class="theme-toggle-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            </span>
            <span class="theme-toggle-text">Theme</span>
        </button>
    `;
}

/**
 * Updates the toggle button appearance based on current theme
 * @param {HTMLElement} button - The toggle button element
 */
function updateToggleAppearance(button) {
    if (!button) return;

    const preference = getThemePreference();
    const effective = getCurrentTheme();

    // Update button text
    const textElement = button.querySelector('.theme-toggle-text');
    if (textElement) {
        let displayText;
        switch (preference) {
            case THEMES.SYSTEM:
                displayText = `System (${effective})`;
                break;
            case THEMES.LIGHT:
                displayText = 'Light';
                break;
            case THEMES.DARK:
                displayText = 'Dark';
                break;
            default:
                displayText = 'Theme';
        }
        textElement.textContent = displayText;
    }

    // Update button class for styling
    button.classList.remove('theme-system', 'theme-light', 'theme-dark');
    button.classList.add(`theme-${preference}`);

    // Update aria-label for accessibility
    button.setAttribute('aria-label', `Current theme: ${displayText}. Click to cycle themes.`);
}

/**
 * Cycles to the next theme in the sequence: System → Light → Dark → System
 */
function cycleTheme() {
    const current = getThemePreference();
    let next;

    switch (current) {
        case THEMES.SYSTEM:
            next = THEMES.LIGHT;
            break;
        case THEMES.LIGHT:
            next = THEMES.DARK;
            break;
        case THEMES.DARK:
            next = THEMES.SYSTEM;
            break;
        default:
            next = THEMES.SYSTEM;
    }

    setTheme(next);
}

/**
 * Handles theme toggle click
 * @param {Event} event - Click event
 */
function handleToggleClick(event) {
    event.preventDefault();
    cycleTheme();
}

/**
 * Handles theme change events from the theme manager
 * @param {CustomEvent} event - Theme change event
 */
function handleThemeChange(event) {
    const button = document.getElementById('theme-toggle');
    updateToggleAppearance(button);
}

/**
 * Initializes the theme toggle component
 * @param {string} containerId - ID of the container element
 * @returns {HTMLElement|null} The created toggle button or null
 */
export function initializeThemeToggle(containerId = '#theme-toggle-container') {
    // Don't create toggle on admin pages
    if (isAdminPage()) {
        console.log('Theme toggle disabled on admin pages');
        return null;
    }

    const container = typeof containerId === 'string'
        ? document.querySelector(containerId)
        : containerId;

    if (!container) {
        console.warn(`Theme toggle container not found: ${containerId}`);
        return null;
    }

    // Create and insert the toggle
    container.innerHTML = createToggleHTML();
    const button = container.querySelector('#theme-toggle');

    if (!button) {
        console.error('Failed to create theme toggle button');
        return null;
    }

    // Set up event listeners
    button.addEventListener('click', handleToggleClick);
    document.addEventListener('themechange', handleThemeChange);

    // Initialize appearance
    updateToggleAppearance(button);

    return button;
}

/**
 * Removes the theme toggle component
 * @param {string} containerId - ID of the container element
 */
export function removeThemeToggle(containerId = '#theme-toggle-container') {
    const container = typeof containerId === 'string'
        ? document.querySelector(containerId)
        : containerId;

    if (container) {
        container.innerHTML = '';
    }

    // Remove event listener
    document.removeEventListener('themechange', handleThemeChange);
}

/**
 * Auto-initialize if DOM is ready
 */
function autoInitialize() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeThemeToggle();
        });
    } else {
        initializeThemeToggle();
    }
}

// Auto-initialize when script loads
if (typeof document !== 'undefined') {
    autoInitialize();
}

export default {
    initializeThemeToggle,
    removeThemeToggle,
    cycleTheme
};