// Email Signup Component for A Lo Cubano Boulder Fest
// Mobile-optimized email capture with progressive enhancement

class EmailSignup {
  constructor(formSelector = '.notification-form') {
    this.forms = document.querySelectorAll(formSelector);
    this.init();
  }

  init() {
    this.forms.forEach(form => {
      this.setupForm(form);
    });
  }

  setupForm(form) {
    const emailInput = form.querySelector('input[type="email"]');
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (!emailInput || !submitButton) return;

    // Add mobile-specific attributes
    this.enhanceForMobile(emailInput);
    
    // Handle form submission
    form.addEventListener('submit', (e) => this.handleSubmit(e, form));
    
    // Real-time validation
    emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('error')) {
        this.validateEmail(emailInput);
      }
    });

    // Mobile-specific enhancements
    this.addMobileEnhancements(form, emailInput, submitButton);
  }

  enhanceForMobile(input) {
    // Set input attributes for optimal mobile experience
    input.setAttribute('autocomplete', 'email');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'email');
    
    // Ensure proper font size to prevent zoom on iOS
    if (window.innerWidth <= 768) {
      input.style.fontSize = '16px';
    }
  }

  addMobileEnhancements(form, input, button) {
    // Detect mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile || window.innerWidth <= 768) {
      // Add haptic feedback support (for devices that support it)
      this.addHapticFeedback(button);
      
      // Handle virtual keyboard
      this.handleVirtualKeyboard(form, input);
      
      // Add touch-friendly states
      this.addTouchStates(button);
    }
  }

  addHapticFeedback(button) {
    if ('vibrate' in navigator) {
      button.addEventListener('touchstart', () => {
        navigator.vibrate(10); // Light haptic feedback
      });
    }
  }

  handleVirtualKeyboard(form, input) {
    let formHeight;
    
    input.addEventListener('focus', () => {
      formHeight = form.offsetHeight;
      
      // Scroll form into view on mobile when keyboard appears
      setTimeout(() => {
        const rect = input.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        if (rect.bottom > viewportHeight * 0.5) {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
      if (document.activeElement === input) {
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
      }
    });
  }

  addTouchStates(button) {
    let touchStartTime;
    
    button.addEventListener('touchstart', () => {
      touchStartTime = Date.now();
      button.classList.add('touch-active');
    });
    
    button.addEventListener('touchend', () => {
      const touchDuration = Date.now() - touchStartTime;
      
      // Keep active state briefly for visual feedback
      setTimeout(() => {
        button.classList.remove('touch-active');
      }, Math.max(0, 100 - touchDuration));
    });
  }

  validateEmail(input) {
    const email = input.value.trim();
    const isValid = this.isValidEmail(email);
    
    // Remove previous error states
    input.classList.remove('error', 'success');
    this.removeMessage(input.parentNode, '.field-error');
    
    if (!email) {
      return true; // Empty is okay until submit
    }
    
    if (!isValid) {
      input.classList.add('error');
      this.showFieldError(input, 'Please enter a valid email address');
      return false;
    }
    
    input.classList.add('success');
    return true;
  }

  isValidEmail(email) {
    // More comprehensive email validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  showFieldError(input, message) {
    const error = document.createElement('span');
    error.className = 'field-error';
    error.textContent = message;
    error.setAttribute('role', 'alert');
    error.setAttribute('aria-live', 'polite');
    
    // Insert after input
    input.parentNode.insertBefore(error, input.nextSibling);
  }

  removeMessage(container, selector) {
    const message = container.querySelector(selector);
    if (message) {
      message.remove();
    }
  }

  async handleSubmit(e, form) {
    e.preventDefault();
    
    const emailInput = form.querySelector('input[type="email"]');
    const submitButton = form.querySelector('button[type="submit"]');
    
    // Validate before submission
    if (!this.validateEmail(emailInput)) {
      emailInput.focus();
      return;
    }
    
    // Show loading state
    this.setLoadingState(submitButton, true);
    
    try {
      // Simulate API call (replace with actual endpoint)
      const response = await this.submitEmail(emailInput.value);
      
      if (response.success) {
        this.showSuccess(form);
        form.reset();
        emailInput.classList.remove('success');
        
        // Track successful signup
        this.trackSignup(emailInput.value);
      } else {
        this.showError(form, response.message || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      console.error('Email signup error:', error);
      this.showError(form, 'Network error. Please check your connection and try again.');
    } finally {
      this.setLoadingState(submitButton, false);
    }
  }

  setLoadingState(button, isLoading) {
    if (isLoading) {
      button.classList.add('loading');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  }

  async submitEmail(email) {
    // TODO: Replace with actual API endpoint
    // For now, simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true });
      }, 1000);
    });
    
    /*
    // Actual implementation would look like:
    const response = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email })
    });
    
    return response.json();
    */
  }

  showSuccess(form) {
    this.removeMessage(form, '.notification-success, .notification-error');
    
    const success = document.createElement('div');
    success.className = 'notification-success';
    success.innerHTML = `
      <strong>Success!</strong> You're on the list. 
      We'll notify you about early bird tickets and exclusive updates.
    `;
    success.setAttribute('role', 'status');
    success.setAttribute('aria-live', 'polite');
    
    form.appendChild(success);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (success.parentNode) {
        success.remove();
      }
    }, 10000);
  }

  showError(form, message) {
    this.removeMessage(form, '.notification-success, .notification-error');
    
    const error = document.createElement('div');
    error.className = 'notification-error';
    error.innerHTML = `<strong>Error:</strong> ${message}`;
    error.setAttribute('role', 'alert');
    error.setAttribute('aria-live', 'assertive');
    
    form.appendChild(error);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (error.parentNode) {
        error.remove();
      }
    }, 5000);
  }

  trackSignup(email) {
    // Analytics tracking
    if (typeof gtag !== 'undefined') {
      gtag('event', 'newsletter_signup', {
        'event_category': 'engagement',
        'event_label': 'early_bird_2026'
      });
    }
    
    // You could also send to other analytics services
    console.log('Email signup tracked:', email.substring(0, 3) + '***');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new EmailSignup();
  });
} else {
  new EmailSignup();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailSignup;
}