# Theme System Documentation

## Overview

The A Lo Cubano Boulder Fest website implements a sophisticated hybrid theme system that provides an optimal user experience across all pages while maintaining administrative consistency.

### Theme Options

- **System**: Automatically follows the user's operating system preference
- **Light**: Always uses light theme regardless of system preference
- **Dark**: Always uses dark theme regardless of system preference

### Hybrid Architecture

The theme system uses a **hybrid approach** that balances user control with administrative requirements:

- **Admin pages**: Always use dark theme (non-configurable for consistency)
- **Main site pages**: Full user control with three theme options
- **Persistent preferences**: User selections are saved in localStorage

### Key Benefits

- **Performance optimized**: Cached DOM queries and debounced operations
- **FOUC prevention**: Themes apply synchronously on page load
- **Accessibility**: Full keyboard navigation and ARIA attributes
- **System integration**: Respects user's OS-level dark mode preference
- **Admin consistency**: Fixed dark theme for administrative interfaces

## Architecture

### Core Components

#### Theme Manager (`js/theme-manager.js`)

The central theme management system that handles theme detection, application, and persistence.

**Key Features:**
- Hybrid theme detection (admin vs. main site)
- Performance-optimized caching system
- System preference monitoring
- Custom event system for component integration
- localStorage persistence with cache invalidation

**Core Functions:**
- `determineTheme()`: Resolves appropriate theme based on page type and preferences
- `applyTheme()`: Applies theme to document with performance optimization
- `setTheme(theme)`: Sets user preference and applies theme immediately
- `isAdminPage()`: Detects admin pages for fixed dark theme application

#### Theme Toggle Component (`js/theme-toggle.js`)

A three-state segmented control for user theme selection.

**Key Features:**
- Inline SVG icons for each theme state
- Accessible ARIA attributes and keyboard navigation
- Smooth transitions and visual feedback
- Hidden on admin pages (follows theme manager patterns)
- Performance-optimized event handling

**Component States:**
- **System (monitor icon)**: Auto-detects system preference
- **Light (sun icon)**: Forces light theme
- **Dark (moon icon)**: Forces dark theme

#### CSS Variable System (`css/base.css`)

Comprehensive design system built on CSS custom properties.

**Variable Categories:**
- **Brand colors**: Core festival brand palette
- **Semantic colors**: Context-aware color assignments
- **Theme-aware overrides**: Dark mode color mappings
- **Interactive states**: Hover, active, and focus states
- **Performance optimizations**: Consolidated alpha values and transitions

### Theme Detection Logic

```javascript
// Admin pages always get dark theme
if (isAdminPage()) {
    return THEMES.DARK;
}

// Main site: check user preference
const stored = getStoredPreference();
const preference = stored || THEMES.SYSTEM;

if (preference === THEMES.SYSTEM) {
    return detectSystemPreference();
}

return preference; // 'light' or 'dark'
```

### Performance Optimizations

- **Cached DOM queries**: Reduces repeated element lookups
- **Debounced localStorage**: Prevents excessive I/O operations
- **RequestAnimationFrame**: Smooth visual transitions
- **Performance monitoring**: Built-in timing measurements
- **Event delegation**: Reduced memory usage for event listeners

## Usage Guide

### Implementing Theme Support in New Pages

1. **Include theme manager early in page lifecycle:**

```html
<!-- Include before other scripts to prevent FOUC -->
<script type="module" src="/js/theme-manager.js"></script>
```

2. **Add theme toggle component (main site only):**

```javascript
import ThemeToggle from '/js/theme-toggle.js';

// Initialize theme toggle in navigation
const toggle = ThemeToggle.initialize('#theme-toggle-container');
```

3. **Use CSS variables for styling:**

```css
.my-component {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
}

/* Dark mode handled automatically via CSS variables */
```

### Adding Dark Mode to Components

#### Basic Component Styling

```css
.card {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-md);
    transition: var(--transition-theme);
}

.card:hover {
    background: var(--color-surface-hover);
}
```

#### Complex Component with State Colors

```css
.alert {
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
}

.alert--success {
    background: var(--color-success-light);
    border-color: var(--color-success);
    color: var(--color-success);
}

.alert--error {
    background: var(--color-error-light);
    border-color: var(--color-error);
    color: var(--color-error);
}
```

### CSS Variable Naming Conventions

#### Semantic Color Variables

```css
/* Background hierarchy */
--color-background          /* Page background */
--color-background-secondary /* Secondary areas */
--color-surface             /* Card/component surfaces */
--color-surface-elevated    /* Elevated surfaces (modals, dropdowns) */

/* Text hierarchy */
--color-text-primary        /* Main content text */
--color-text-secondary      /* Secondary information */
--color-text-tertiary       /* Subtle text */
--color-text-muted          /* Disabled/placeholder text */

/* Interactive states */
--color-primary             /* Primary actions */
--color-primary-hover       /* Primary hover state */
--color-secondary           /* Secondary actions */
--color-secondary-hover     /* Secondary hover state */
```

#### State and Border Variables

```css
/* State colors */
--color-success             /* Success states */
--color-warning             /* Warning states */
--color-error               /* Error states */
--color-info                /* Informational states */

/* Border hierarchy */
--color-border              /* Default borders */
--color-border-light        /* Subtle borders */
--color-border-strong       /* Emphasis borders */
```

### Best Practices

#### Color Usage Guidelines

1. **Always use semantic variables**: Prefer `--color-text-primary` over `--color-black`
2. **Theme-aware design**: Test components in both light and dark themes
3. **Consistent hierarchy**: Follow established text and background hierarchies
4. **State consistency**: Use standard state colors for success, error, warning
5. **Performance focus**: Use CSS variables for smooth theme transitions

#### Component Integration

```javascript
// Listen for theme changes in components
document.addEventListener('themechange', (event) => {
    const { theme, isAdminPage, userPreference } = event.detail;
    
    // Update component state based on theme
    updateComponentForTheme(theme);
});
```

#### Accessibility Considerations

```css
/* Ensure sufficient contrast in all themes */
.interactive-element {
    color: var(--color-text-primary);
    background: var(--color-surface);
}

/* Focus states should be visible in all themes */
.interactive-element:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}
```

## Developer Guide

### Testing Theme Functionality

#### Manual Testing

```javascript
// Test theme switching programmatically
import { setTheme, THEMES } from '/js/theme-manager.js';

// Switch to dark theme
setTheme(THEMES.DARK);

// Switch to light theme
setTheme(THEMES.LIGHT);

// Switch to system theme
setTheme(THEMES.SYSTEM);

// Check current theme
console.log('Current theme:', getCurrentTheme());
```

#### Theme Toggle Testing

```javascript
import ThemeToggle from '/js/theme-toggle.js';

// Initialize toggle for testing
const toggle = ThemeToggle.initialize('.test-container');

// Programmatically set preference
ThemeToggle.setPreference('dark');

// Get current preference
console.log('Preference:', ThemeToggle.getCurrentPreference());
```

#### System Integration Testing

```javascript
// Test system preference detection
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    console.log('System prefers dark mode');
} else {
    console.log('System prefers light mode');
}

// Test theme change listening
document.addEventListener('themechange', (event) => {
    console.log('Theme changed:', event.detail);
});
```

### Debugging Theme Issues

#### Common Issues and Solutions

1. **FOUC (Flash of Unstyled Content)**
   - Ensure theme-manager.js loads before other scripts
   - Check that CSS variables are properly defined
   - Verify theme applies synchronously

2. **Theme not persisting**
   - Check localStorage accessibility
   - Verify theme preference storage key matches
   - Ensure admin pages don't attempt to store preferences

3. **System theme not detected**
   - Verify `window.matchMedia` support
   - Check `prefers-color-scheme` media query
   - Test across different browsers and OS

#### Debug Utilities

```javascript
// Theme manager debug information
import { getPerformanceMetrics, clearPerformanceData } from '/js/theme-manager.js';

// Get performance metrics
console.log('Theme performance:', getPerformanceMetrics());

// Clear metrics and cache
clearPerformanceData();

// Theme toggle debug
console.log('Toggle state:', {
    preference: ThemeToggle.getCurrentPreference(),
    effective: ThemeToggle.getEffectiveTheme(),
    isAdmin: isAdminPage()
});
```

### Performance Considerations

#### Optimization Strategies

1. **Cached DOM queries**: Elements are cached after first access
2. **Debounced operations**: localStorage writes are debounced
3. **RAF for smooth transitions**: Visual updates use requestAnimationFrame
4. **Event delegation**: Minimal event listeners for better memory usage
5. **CSS variable efficiency**: Consolidated alpha values and transitions

#### Performance Monitoring

```javascript
// Built-in performance monitoring
const metrics = getPerformanceMetrics();
console.log('Theme operations:', metrics.measures);
console.log('Cache stats:', metrics.cacheStats);
```

#### Memory Management

```javascript
// Cleanup when components are destroyed
ThemeToggle.destroy(); // Removes DOM elements and event listeners
clearPerformanceData(); // Clears performance cache
```

### Accessibility Requirements

#### ARIA Attributes

The theme toggle component implements full accessibility:

```html
<div class="theme-toggle" role="radiogroup" aria-label="Theme selection">
    <button 
        type="button"
        class="theme-toggle__option"
        data-theme="system"
        role="radio"
        aria-checked="true"
        aria-label="System theme"
        title="System theme">
        <!-- SVG icon -->
        <span class="theme-toggle__label sr-only">System</span>
    </button>
    <!-- Additional options... -->
</div>
```

#### Keyboard Navigation

- **Arrow keys**: Navigate between theme options
- **Home/End**: Jump to first/last option
- **Enter/Space**: Select theme option
- **Tab**: Move to next focusable element

#### Screen Reader Support

- Clear labeling for each theme option
- Role-based semantics (radiogroup/radio)
- State announcements via aria-checked
- Hidden text labels for icon-only buttons

## API Reference

### Theme Manager API

#### Constants

```javascript
import { THEMES } from '/js/theme-manager.js';

THEMES.LIGHT   // 'light'
THEMES.DARK    // 'dark'
THEMES.SYSTEM  // 'system'
```

#### Core Functions

```javascript
// Get resolved theme (light/dark only)
getCurrentTheme(): string

// Get user preference (system/light/dark)
getUserPreference(): string | null

// Set theme preference and apply
setTheme(theme: string): void

// Check if current page is admin
isAdminPage(): boolean

// Get system color scheme preference
detectSystemPreference(): string

// Initialize theme system
initializeTheme(): void
```

#### Performance Functions

```javascript
// Get performance metrics
getPerformanceMetrics(): Object

// Clear performance data and cache
clearPerformanceData(): void
```

### Theme Toggle API

#### Constants

```javascript
import { THEME_OPTIONS } from '/js/theme-toggle.js';

THEME_OPTIONS.SYSTEM  // 'system'
THEME_OPTIONS.LIGHT   // 'light'
THEME_OPTIONS.DARK    // 'dark'
```

#### Component Functions

```javascript
// Initialize theme toggle component
initializeThemeToggle(container?: string | Element): Object | null

// Get current user preference
getCurrentPreference(): string

// Set theme preference programmatically
setPreference(preference: string): void

// Get effective theme based on preference
getEffectiveTheme(preference?: string): string

// Cleanup component
destroyThemeToggle(): void
```

### CSS Custom Properties

#### Core Color Variables

```css
/* Brand colors */
--color-black: #000000
--color-white: #ffffff
--color-blue: #5b6bb5
--color-red: #cc2936

/* Semantic backgrounds */
--color-background: var(--color-white)
--color-surface: var(--color-white)
--color-surface-elevated: var(--color-white)

/* Text hierarchy */
--color-text-primary: var(--color-black)
--color-text-secondary: var(--color-gray-700)
--color-text-tertiary: var(--color-gray-500)

/* Interactive states */
--color-primary: var(--color-blue)
--color-primary-hover: #4a5ca3
--color-secondary: var(--color-red)
--color-secondary-hover: #b8242f
```

#### Dark Mode Overrides

```css
[data-theme="dark"] {
    --color-background: var(--color-gray-900)
    --color-surface: var(--color-gray-800)
    --color-text-primary: var(--color-white)
    --color-text-secondary: var(--color-gray-300)
    /* Additional overrides... */
}
```

### Event System

#### Theme Change Events

```javascript
// Listen for theme changes
document.addEventListener('themechange', (event) => {
    const {
        theme,           // Current active theme ('light'|'dark')
        isAdminPage,     // Boolean: is this an admin page
        userPreference,  // User's preference ('system'|'light'|'dark')
        previousTheme    // Previous theme value
    } = event.detail;
});

// Listen for preference changes (theme toggle)
document.addEventListener('themepreferencechange', (event) => {
    const {
        preference,      // New preference setting
        effectiveTheme,  // Resolved theme
        timestamp        // Performance timestamp
    } = event.detail;
});
```

#### System Preference Changes

```javascript
// Listen for system theme changes
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (event) => {
    if (event.matches) {
        console.log('System switched to dark mode');
    } else {
        console.log('System switched to light mode');
    }
});
```

## Maintenance Guide

### Updating Brand Colors

To modify the festival's brand colors, update the root CSS variables:

```css
:root {
    /* Update brand colors */
    --color-blue: #new-blue-value;
    --color-red: #new-red-value;
    
    /* Derived colors will automatically update */
    --color-primary: var(--color-blue);
    --color-secondary: var(--color-red);
}
```

### Modifying Theme Behavior

#### Changing Admin Theme

To modify the admin theme from dark to light:

```javascript
// In theme-manager.js, update determineTheme()
function determineTheme() {
    if (isAdminPage()) {
        return THEMES.LIGHT; // Changed from THEMES.DARK
    }
    // ... rest of function
}
```

#### Adding New Theme Options

1. **Update theme constants:**

```javascript
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system',
    HIGH_CONTRAST: 'high-contrast' // New theme
};
```

2. **Add CSS variables:**

```css
[data-theme="high-contrast"] {
    --color-background: #ffffff;
    --color-text-primary: #000000;
    /* High contrast overrides */
}
```

3. **Update theme toggle:**

```javascript
const THEME_OPTIONS = {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark',
    HIGH_CONTRAST: 'high-contrast' // New option
};
```

### Adding New Theme Variations

#### Seasonal Themes

```css
[data-theme="winter"] {
    --color-primary: #2563eb; /* Winter blue */
    --color-secondary: #dc2626; /* Winter red */
    /* Additional winter styling */
}

[data-theme="summer"] {
    --color-primary: #f59e0b; /* Summer gold */
    --color-secondary: #10b981; /* Summer green */
    /* Additional summer styling */
}
```

#### Event-Specific Themes

```css
[data-theme="festival"] {
    --color-background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --color-surface: rgba(255, 255, 255, 0.9);
    /* Festival-specific overrides */
}
```

### Troubleshooting Common Issues

#### Issue: Theme Not Applying on Page Load

**Symptoms:**
- Flash of unstyled content (FOUC)
- Theme applies after page loads

**Solutions:**
1. Ensure theme-manager.js loads before other scripts
2. Check that CSS variables are defined in base.css
3. Verify theme manager auto-initializes on module load

#### Issue: Theme Toggle Not Visible

**Symptoms:**
- Theme toggle doesn't appear on main site pages
- Toggle appears on admin pages (incorrect)

**Solutions:**
1. Check `isAdminPage()` detection logic
2. Verify toggle initialization in page scripts
3. Ensure theme toggle styles are loaded

#### Issue: System Theme Not Updating

**Symptoms:**
- System theme option doesn't follow OS changes
- Theme stuck on initial system preference

**Solutions:**
1. Verify `window.matchMedia` support
2. Check media query event listener setup
3. Test `prefers-color-scheme` detection

#### Issue: Theme Preference Not Persisting

**Symptoms:**
- Theme resets on page reload
- Preferences don't save between sessions

**Solutions:**
1. Check localStorage availability
2. Verify storage key consistency
3. Ensure admin pages don't attempt storage

#### Issue: Performance Problems

**Symptoms:**
- Slow theme switching
- High memory usage
- Choppy animations

**Solutions:**
1. Enable performance monitoring
2. Check for excessive DOM queries
3. Verify RAF usage for animations
4. Clear performance cache periodically

### Debugging Checklist

When troubleshooting theme issues:

1. **Check browser console** for JavaScript errors
2. **Verify CSS variables** are properly defined
3. **Test localStorage** accessibility and values
4. **Check media queries** with developer tools
5. **Monitor performance** with built-in metrics
6. **Test across browsers** and operating systems
7. **Verify ARIA attributes** for accessibility
8. **Check event listeners** are properly attached

### Performance Monitoring

#### Built-in Metrics

```javascript
// Get detailed performance information
const metrics = getPerformanceMetrics();
console.table(metrics.measures);
console.log('Cache stats:', metrics.cacheStats);
```

#### Custom Performance Tracking

```javascript
// Add custom performance marks
performance.mark('custom-theme-operation-start');
// ... perform operation
performance.mark('custom-theme-operation-end');
performance.measure('custom-operation', 
    'custom-theme-operation-start', 
    'custom-theme-operation-end'
);
```

### Browser Support

The theme system supports all modern browsers:

- **Chrome/Edge**: Full support
- **Firefox**: Full support  
- **Safari**: Full support
- **Mobile browsers**: Full support

**Graceful degradation:**
- CSS variables fallback to default values
- `matchMedia` fallback to light theme
- localStorage fallback to session-only preferences

## Conclusion

The A Lo Cubano Boulder Fest theme system provides a robust, performant, and accessible way to manage visual themes across the website. Its hybrid approach balances user control with administrative consistency, while the performance optimizations ensure smooth operation even on resource-constrained devices.

For additional questions or support, refer to the main project documentation or contact the development team.