// Event Selector Component for Admin Portal
// Provides event filtering across all admin pages

class EventSelector {
  constructor() {
    this.selectedEventId = localStorage.getItem('selectedEventId') || 'all';
    this.events = [];
    this.initialized = false;
    this.listeners = new Set();
  }

  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadEvents();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize event selector:', error);
    }
  }

  async loadEvents() {
    try {
      const response = await fetch('/api/admin/events', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load events');
      }
      
      const data = await response.json();
      this.events = data.events || [];
      
      // If no event is selected or selected event doesn't exist, select the first active event
      if (this.selectedEventId === 'all' || !this.events.find(e => e.id === this.selectedEventId)) {
        const activeEvent = this.events.find(e => e.status === 'active' || e.status === 'upcoming');
        if (activeEvent) {
          this.selectedEventId = activeEvent.id.toString();
          localStorage.setItem('selectedEventId', this.selectedEventId);
        }
      }
    } catch (error) {
      console.error('Error loading events:', error);
      // Fallback to mock data if API not available
      this.events = [
        { id: 1, name: 'A Lo Cubano Boulder Fest 2026', slug: 'boulderfest-2026', type: 'festival', status: 'upcoming' },
        { id: 2, name: 'Winter Salsa Weekender 2025', slug: 'winter-weekender-2025', type: 'weekender', status: 'completed' },
        { id: 3, name: 'Spring Salsa Weekender 2026', slug: 'spring-weekender-2026', type: 'weekender', status: 'upcoming' }
      ];
    }
  }

  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    // Generate unique ID for this selector instance
    const selectorId = `event-selector-${containerId}`;
    const labelId = `event-selector-label-${containerId}`;

    // SECURITY: Use safe DOM construction instead of innerHTML to prevent XSS
    // Clear container safely
    container.innerHTML = '';

    // Create wrapper element
    const wrapper = document.createElement('div');
    wrapper.className = 'event-selector-wrapper';

    // Create label element
    const label = document.createElement('label');
    label.setAttribute('for', selectorId);
    label.id = labelId;
    label.className = 'event-selector-label';
    label.textContent = 'Event:'; // Safe text assignment

    // Create select element
    const select = document.createElement('select');
    select.id = selectorId;
    select.className = 'admin-select event-selector';

    // Add "All Events" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Events'; // Safe text assignment
    select.appendChild(allOption);

    // Add event options safely
    this.events.forEach(event => {
      const option = document.createElement('option');
      option.value = this.escapeAttribute(event.id.toString()); // Sanitize attribute
      option.selected = this.selectedEventId === event.id.toString();
      
      // SECURITY: Use textContent for user data to prevent XSS injection
      const displayText = `${this.escapeText(event.name)} (${this.escapeText(event.type)}) - ${this.escapeText(event.status)}`;
      option.textContent = displayText;
      
      select.appendChild(option);
    });

    // Assemble DOM structure
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);

    // Add event listener
    const selector = document.getElementById(selectorId);
    selector.addEventListener('change', (e) => {
      this.handleEventChange(e.target.value);
    });

    // Store reference to this selector for syncing
    if (!this.selectors) this.selectors = new Set();
    this.selectors.add(selectorId);
  }

  handleEventChange(eventId) {
    this.selectedEventId = eventId;
    localStorage.setItem('selectedEventId', eventId);
    
    // Sync all selector instances
    if (this.selectors) {
      this.selectors.forEach(selectorId => {
        const selector = document.getElementById(selectorId);
        if (selector && selector.value !== eventId) {
          selector.value = eventId;
        }
      });
    }
    
    // Notify listeners
    this.listeners.forEach(listener => {
      listener(eventId);
    });
    
    // Reload current page data with new event filter
    if (window.loadDashboardData) {
      window.loadDashboardData(eventId);
    } else if (window.loadRegistrations) {
      window.loadRegistrations(eventId);
    } else if (window.loadTickets) {
      window.loadTickets(eventId);
    } else {
      // Fallback: reload page
      window.location.reload();
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getSelectedEventId() {
    return this.selectedEventId === 'all' ? null : this.selectedEventId;
  }

  getSelectedEvent() {
    if (this.selectedEventId === 'all') return null;
    return this.events.find(e => e.id.toString() === this.selectedEventId);
  }

  // SECURITY: Helper methods for safe text and attribute sanitization
  escapeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeAttribute(value) {
    if (!value) return '';
    // For HTML attributes, we need to be more restrictive
    return String(value)
      .replace(/[^\w\-.:]/g, '') // Only allow alphanumeric, dash, dot, colon
      .substring(0, 100); // Limit length
  }
}

// Export as global for use in admin pages
window.EventSelector = EventSelector;

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    window.eventSelector = new EventSelector();
    await window.eventSelector.init();
  });
} else {
  window.eventSelector = new EventSelector();
  window.eventSelector.init();
}