/**
 * Compact Mode Toggle Component
 * A Lo Cubano Boulder Fest - Admin Dashboard
 *
 * Accessible, compact toggle for switching between Production and Test data modes
 * Features: ARIA support, keyboard navigation, screen reader announcements,
 * touch-friendly design, loading states, and reduced motion support
 */

class CompactModeToggle {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.options = {
      initialMode: 'production',
      label: 'Data Mode',
      onModeChange: null,
      showLabel: true,
      variant: 'default', // 'default', 'header', 'floating'
      ...options
    };

    this.currentMode = this.options.initialMode;
    this.isLoading = false;
    this.announcer = null;

    this.init();
  }

  init() {
    this.createAnnouncer();
    this.render();
    this.attachEventListeners();
    this.setupKeyboardNavigation();
    console.log('CompactModeToggle initialized:', this.container.id || 'unnamed');
  }

  createAnnouncer() {
    // Create or reuse global announcer for screen readers
    this.announcer = document.getElementById('mode-toggle-announcer');
    if (!this.announcer) {
      this.announcer = document.createElement('div');
      this.announcer.id = 'mode-toggle-announcer';
      this.announcer.setAttribute('aria-live', 'polite');
      this.announcer.setAttribute('aria-atomic', 'true');
      this.announcer.className = 'visually-hidden';
      document.body.appendChild(this.announcer);
    }
  }

  render() {
    const containerId = this.container.id || `mode-toggle-${Date.now()}`;
    const labelId = `${containerId}-label`;
    const descId = `${containerId}-description`;

    // Apply variant class
    this.container.className = `compact-mode-toggle${this.options.variant === 'floating' ? ' floating-mode-toggle' : ''}`;
    if (this.isLoading) {
      this.container.classList.add('loading');
    }

    this.container.innerHTML = `
      ${this.options.showLabel ? `<span id="${labelId}" class="mode-toggle-label">${this.options.label}</span>` : ''}
      <div class="mode-switch${this.currentMode === 'test' ? ' test-mode' : ''}"
           role="radiogroup"
           aria-labelledby="${this.options.showLabel ? labelId : ''}"
           aria-describedby="${descId}"
           ${this.isLoading ? 'aria-busy="true"' : ''}>

        <button class="mode-option${this.currentMode === 'production' ? ' active' : ''}"
                role="radio"
                aria-checked="${this.currentMode === 'production'}"
                aria-label="Production data view"
                data-mode="production"
                ${this.isLoading ? 'disabled' : ''}>
          <span class="mode-icon" aria-hidden="true">🎯</span>
          <span>${this.options.variant === 'header' ? 'Live' : 'Production'}</span>
        </button>

        <button class="mode-option${this.currentMode === 'test' ? ' active' : ''}"
                role="radio"
                aria-checked="${this.currentMode === 'test'}"
                aria-label="Test data view"
                data-mode="test"
                ${this.isLoading ? 'disabled' : ''}>
          <span class="mode-icon" aria-hidden="true">🧪</span>
          <span>Test</span>
        </button>
      </div>

      <div class="mode-status-dot" aria-hidden="true"></div>

      <span id="${descId}" class="visually-hidden">
        Choose between viewing production data or test data.
        Production data shows live festival information while test data shows sample information for testing.
      </span>
    `;

    // Set container role for screen readers
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-labelledby', labelId);
  }

  attachEventListeners() {
    // Mode switch buttons
    this.container.addEventListener('click', (event) => {
      if (event.target.closest('.mode-option') && !this.isLoading) {
        const button = event.target.closest('.mode-option');
        const mode = button.dataset.mode;
        this.switchMode(mode);
      }
    });

    // Focus management
    this.container.addEventListener('focus', (event) => {
      if (event.target.matches('.mode-option')) {
        const modeSwitch = event.target.closest('.mode-switch');
        modeSwitch.style.outline = '2px solid var(--color-blue)';
        modeSwitch.style.outlineOffset = '2px';
      }
    }, true);

    this.container.addEventListener('blur', (event) => {
      if (event.target.matches('.mode-option')) {
        setTimeout(() => {
          if (!this.container.contains(document.activeElement)) {
            const modeSwitch = this.container.querySelector('.mode-switch');
            if (modeSwitch) {
              modeSwitch.style.outline = '';
              modeSwitch.style.outlineOffset = '';
            }
          }
        }, 10);
      }
    }, true);
  }

  setupKeyboardNavigation() {
    this.container.addEventListener('keydown', (event) => {
      if (event.target.closest('.mode-switch') && !this.isLoading) {
        const modeSwitch = event.target.closest('.mode-switch');
        const options = Array.from(modeSwitch.querySelectorAll('.mode-option'));
        const currentIndex = options.indexOf(document.activeElement);

        switch (event.key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            event.preventDefault();
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
            options[prevIndex].focus();
            break;

          case 'ArrowRight':
          case 'ArrowDown':
            event.preventDefault();
            const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
            options[nextIndex].focus();
            break;

          case 'Enter':
          case ' ':
            event.preventDefault();
            if (document.activeElement.matches('.mode-option')) {
              const mode = document.activeElement.dataset.mode;
              this.switchMode(mode);
            }
            break;

          case 'Home':
            event.preventDefault();
            options[0].focus();
            break;

          case 'End':
            event.preventDefault();
            options[options.length - 1].focus();
            break;
        }
      }
    });
  }

  switchMode(mode, options = {}) {
    if (this.isLoading || mode === this.currentMode) return;

    const {
      showLoading = true,
      loadingDuration = 1000,
      skipCallback = false
    } = options;

    const previousMode = this.currentMode;
    this.currentMode = mode;

    // Update visual state
    this.updateVisualState();

    // Announce to screen readers
    const modeLabel = mode === 'test' ? 'test data' : 'production data';
    setTimeout(() => {
      this.announcer.textContent = `Switched to ${modeLabel} view`;
    }, 100);

    // Show loading state if requested
    if (showLoading) {
      this.setLoading(true);
      setTimeout(() => {
        this.setLoading(false);
        this.announcer.textContent = `${modeLabel} view loaded successfully`;
      }, loadingDuration);
    }

    // Call callback if provided and not skipped
    if (this.options.onModeChange && !skipCallback) {
      try {
        this.options.onModeChange(mode, previousMode, this);
      } catch (error) {
        console.error('Error in onModeChange callback:', error);
      }
    }

    // Dispatch custom event
    this.container.dispatchEvent(new CustomEvent('modeChange', {
      detail: { mode, previousMode, toggle: this },
      bubbles: true
    }));

    console.log(`Mode switched from ${previousMode} to ${mode}`);
  }

  updateVisualState() {
    const modeSwitch = this.container.querySelector('.mode-switch');
    const allOptions = this.container.querySelectorAll('.mode-option');

    // Update switch background position
    if (this.currentMode === 'test') {
      modeSwitch.classList.add('test-mode');
    } else {
      modeSwitch.classList.remove('test-mode');
    }

    // Update ARIA states and active classes
    allOptions.forEach(option => {
      const isActive = option.dataset.mode === this.currentMode;
      option.setAttribute('aria-checked', isActive.toString());
      option.classList.toggle('active', isActive);
    });
  }

  setLoading(loading) {
    this.isLoading = loading;
    const modeSwitch = this.container.querySelector('.mode-switch');
    const allOptions = this.container.querySelectorAll('.mode-option');

    if (loading) {
      this.container.classList.add('loading');
      modeSwitch.setAttribute('aria-busy', 'true');
      allOptions.forEach(option => option.disabled = true);
    } else {
      this.container.classList.remove('loading');
      modeSwitch.setAttribute('aria-busy', 'false');
      allOptions.forEach(option => option.disabled = false);
    }
  }

  getCurrentMode() {
    return this.currentMode;
  }

  setMode(mode, options = {}) {
    if (['production', 'test'].includes(mode)) {
      this.switchMode(mode, options);
    } else {
      console.warn('Invalid mode:', mode, '. Expected "production" or "test"');
    }
  }

  destroy() {
    // Remove event listeners and clean up
    this.container.innerHTML = '';
    this.container.removeAttribute('role');
    this.container.removeAttribute('aria-labelledby');
    this.container.className = '';
    console.log('CompactModeToggle destroyed');
  }

  // Static method to create toggles from data attributes
  static initFromElement(element) {
    const options = {
      initialMode: element.dataset.initialMode || 'production',
      label: element.dataset.label || 'Data Mode',
      showLabel: element.dataset.showLabel !== 'false',
      variant: element.dataset.variant || 'default'
    };

    return new CompactModeToggle(element, options);
  }

  // Static method to initialize all toggles on the page
  static initAll(selector = '.compact-mode-toggle-init') {
    const elements = document.querySelectorAll(selector);
    const toggles = [];

    elements.forEach(element => {
      try {
        const toggle = CompactModeToggle.initFromElement(element);
        toggles.push(toggle);
      } catch (error) {
        console.error('Failed to initialize CompactModeToggle:', error, element);
      }
    });

    console.log(`Initialized ${toggles.length} CompactModeToggle instances`);
    return toggles;
  }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CompactModeToggle;
} else {
  window.CompactModeToggle = CompactModeToggle;
}

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      CompactModeToggle.initAll();
    });
  } else {
    CompactModeToggle.initAll();
  }
}