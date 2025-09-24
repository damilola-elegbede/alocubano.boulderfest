# Compact Mode Toggle - Integration Guide

A modern, accessible compact toggle for switching between Production and Test data modes in the admin dashboard.

## Overview

The Compact Mode Toggle replaces the large card-based mode selector with a small, efficient toggle that can be positioned in the header, as a floating element, or inline within content. It maintains full accessibility while saving significant screen space.

## Key Features

### ✅ Accessibility
- **ARIA Support**: `role="radiogroup"` and `role="radio"` for proper screen reader support
- **Keyboard Navigation**: Tab, Arrow keys, Enter, Space, Home, End support
- **Screen Reader Announcements**: Mode changes are announced to assistive technology
- **Focus Management**: Clear focus indicators and logical tab order
- **High Contrast**: Enhanced borders and outlines for high contrast mode users
- **Reduced Motion**: Respects `prefers-reduced-motion` preference

### ✅ Visual Design
- **Compact Size**: Takes minimal space while remaining touch-friendly (44px minimum)
- **Visual Indicators**: Icons, colors, and animations provide clear feedback
- **Loading States**: Shows loading spinner and disables interaction during data switches
- **Responsive**: Adapts to mobile screens with appropriate sizing
- **Theme Support**: Works with both light and dark admin themes

### ✅ Developer Experience
- **Easy Integration**: Simple HTML attributes or JavaScript API
- **Event System**: Custom events and callbacks for mode changes
- **Multiple Variants**: Header, floating, and inline positioning options
- **Auto-initialization**: Automatically finds and initializes toggles on page load

## Quick Start

### 1. Include Required Files

Add to your HTML head:

```html
<link rel="stylesheet" href="/css/admin-test-mode.css">
<script src="/js/compact-mode-toggle.js"></script>
```

### 2. Basic HTML Structure

```html
<!-- Simple auto-initialization -->
<div id="my-mode-toggle"
     class="compact-mode-toggle-init"
     data-variant="default"
     data-initial-mode="production">
</div>
```

### 3. JavaScript Integration

```javascript
// Manual initialization
const toggle = new CompactModeToggle('my-mode-toggle', {
  initialMode: 'production',
  onModeChange: (mode, previousMode) => {
    console.log(`Switched from ${previousMode} to ${mode}`);
    // Update your dashboard data here
  }
});

// Or listen for events
document.addEventListener('modeChange', (event) => {
  const { mode, previousMode } = event.detail;
  updateDashboard(mode);
});
```

## Integration Options

### Option 1: Header Placement (Recommended)

Replace the large mode toggle card with a compact header toggle:

```html
<header class="admin-header">
  <div class="admin-header-content">
    <div>
      <h1 class="admin-header-title">Admin Dashboard</h1>
    </div>
    <div class="admin-header-actions">
      <!-- Compact Mode Toggle -->
      <div id="header-mode-toggle"
           class="compact-mode-toggle-init"
           data-variant="header"
           data-show-label="false"
           data-initial-mode="production">
      </div>

      <!-- Other header actions -->
      <button class="admin-btn">Sync</button>
      <button class="admin-btn">Logout</button>
    </div>
  </div>
</header>
```

### Option 2: Floating Toggle

Position as a floating element in the viewport:

```html
<div id="floating-toggle"
     class="compact-mode-toggle-init"
     data-variant="floating"
     data-label="Quick Mode Switch">
</div>
```

### Option 3: Inline/Standalone

Use within dashboard sections:

```html
<div class="dashboard-controls">
  <div id="inline-toggle"
       class="compact-mode-toggle-init"
       data-variant="default"
       data-label="Data Mode">
  </div>
</div>
```

## Configuration Options

### Data Attributes (Auto-initialization)

```html
<div class="compact-mode-toggle-init"
     data-initial-mode="production"    <!-- 'production' | 'test' -->
     data-label="Data Mode"            <!-- Label text -->
     data-show-label="true"            <!-- Show/hide label -->
     data-variant="default">           <!-- 'default' | 'header' | 'floating' -->
</div>
```

### JavaScript Options

```javascript
const toggle = new CompactModeToggle(container, {
  initialMode: 'production',          // Initial mode: 'production' | 'test'
  label: 'Data Mode',                 // Toggle label text
  showLabel: true,                    // Show/hide label
  variant: 'default',                 // 'default' | 'header' | 'floating'
  onModeChange: (mode, prev) => {}    // Callback function
});
```

## API Reference

### Methods

```javascript
// Get current mode
const currentMode = toggle.getCurrentMode();

// Set mode programmatically
toggle.setMode('test', {
  showLoading: true,      // Show loading state
  loadingDuration: 1000,  // Loading duration in ms
  skipCallback: false     // Skip onModeChange callback
});

// Set loading state manually
toggle.setLoading(true);  // Show loading
toggle.setLoading(false); // Hide loading

// Clean up
toggle.destroy();
```

### Events

```javascript
// Listen for mode changes
document.addEventListener('modeChange', (event) => {
  const { mode, previousMode, toggle } = event.detail;
  // Handle mode change
});
```

## Replacing the Existing Large Toggle

### Step 1: Remove Old Toggle

In your dashboard template, remove the large mode toggle card:

```javascript
// REMOVE THIS from displayStats() function
`
<!-- Data Mode Toggle -->
<div class="admin-stat-card data-mode-toggle" role="group" aria-labelledby="data-mode-heading">
    <h3 class="stat-label" id="data-mode-heading">Data View Mode</h3>
    <div class="data-mode-switcher" role="radiogroup" aria-labelledby="data-mode-heading">
        <!-- Large toggle buttons -->
    </div>
</div>
`
```

### Step 2: Add Compact Toggle

Add to your admin header:

```html
<div class="admin-header-actions">
  <!-- NEW: Compact Mode Toggle -->
  <div id="header-mode-toggle"
       class="compact-mode-toggle-init"
       data-variant="header"
       data-show-label="false">
  </div>

  <!-- Existing buttons -->
  <div id="header-event-selector-container"></div>
  <button class="admin-btn admin-btn-success" onclick="syncToSheets()">
    <span>Sync to Sheets</span>
  </button>
</div>
```

### Step 3: Update JavaScript

Replace the old `switchDataMode()` function:

```javascript
// OLD: Remove this function
function switchDataMode(isTestMode) { /* ... */ }

// NEW: Listen for mode changes
document.addEventListener('modeChange', (event) => {
  const { mode } = event.detail;
  const isTestMode = mode === 'test';

  // Update your existing logic
  window.testModeView = isTestMode;

  // Reload dashboard data
  const selectedEventId = window.eventSelector ? window.eventSelector.getSelectedEventId() : null;
  loadDashboardData(selectedEventId);

  // Update global indicators
  updateGlobalTestModeIndicator(isTestMode);
});
```

## Styling Variants

### Header Variant
- Compact size optimized for header placement
- Hidden label to save space
- Reduced padding and height

### Floating Variant
- Fixed positioning in viewport
- Semi-transparent background with backdrop blur
- Higher z-index for overlay placement
- Mobile-responsive positioning

### Default Variant
- Standard sizing with label
- Flexible for inline placement
- Full accessibility features

## Mobile Responsiveness

The toggle automatically adapts to mobile screens:

- **Larger touch targets** (40px+ height)
- **Centered layout** with full-width on small screens
- **Visible labels** on mobile for better context
- **Optimized floating position** (top-center instead of top-right)

## Accessibility Features

### Screen Reader Support
- Proper ARIA roles (`radiogroup`, `radio`)
- Descriptive labels and descriptions
- Live region announcements for mode changes
- Focus management and keyboard navigation

### Keyboard Navigation
- **Tab**: Navigate to toggle
- **Arrow keys**: Switch between modes
- **Enter/Space**: Activate selected mode
- **Home/End**: Jump to first/last option

### Visual Accessibility
- High contrast mode support with enhanced borders
- Clear focus indicators
- Non-color-dependent visual cues (icons, patterns)
- Respect for reduced motion preferences

## Browser Support

- **Modern browsers**: Full support with all features
- **IE 11**: Basic functionality (no CSS custom properties)
- **Mobile browsers**: Touch-optimized with proper sizing
- **Screen readers**: Full ARIA support

## Performance

- **Lightweight**: ~3KB CSS + ~5KB JavaScript (minified)
- **No dependencies**: Pure vanilla JavaScript
- **Efficient rendering**: Minimal DOM manipulation
- **Smooth animations**: CSS-based with GPU acceleration

## Troubleshooting

### Toggle doesn't appear
- Ensure CSS files are loaded
- Check for JavaScript errors
- Verify container element exists

### Keyboard navigation not working
- Check focus trap within toggle container
- Ensure buttons are not disabled
- Verify ARIA attributes are present

### Mode changes not triggering updates
- Listen for `modeChange` events
- Check onModeChange callback function
- Verify toggle is properly initialized

### Mobile layout issues
- Check viewport meta tag
- Ensure responsive CSS is loaded
- Test touch target sizes (minimum 44px)

## Migration Checklist

- [ ] Add compact-mode-toggle CSS and JS files
- [ ] Remove old large toggle card from dashboard
- [ ] Add compact toggle to header/desired location
- [ ] Update mode change handling code
- [ ] Test keyboard navigation
- [ ] Test screen reader announcements
- [ ] Verify mobile responsiveness
- [ ] Test with high contrast mode
- [ ] Validate loading states work correctly

## Example Implementation

See the following files for complete examples:
- `compact-mode-toggle-example.html` - Comprehensive examples and features
- `admin-dashboard-integration-example.html` - Dashboard integration example
- `js/compact-mode-toggle.js` - Full JavaScript implementation

## Support

For issues or questions about the Compact Mode Toggle:
1. Check this documentation
2. Review the example files
3. Test with browser developer tools
4. Verify accessibility with screen reader