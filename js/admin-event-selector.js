/**
 * Admin Event Selector Component
 * 
 * Provides event filtering functionality for the admin dashboard.
 * Allows switching between different festival events and persists selection.
 */

// Events data structure with past and future events
const EVENTS_DATA = {
  all: {
    id: 'all',
    name: 'All Events',
    year: null,
    status: 'aggregate',
    description: 'Aggregate data from all events',
    color: '#5b6bb5'
  },
  '2026': {
    id: '2026',
    name: '2026 Boulder Fest',
    year: 2026,
    status: 'current',
    description: 'Current/upcoming festival event',
    color: '#cc2936',
    dates: 'May 15-17, 2026'
  },
  '2025': {
    id: '2025',
    name: '2025 Boulder Fest',
    year: 2025,
    status: 'past',
    description: 'Past festival event',
    color: '#28a745',
    dates: 'May 16-18, 2025'
  },
  '2024': {
    id: '2024',
    name: '2024 Boulder Fest',
    year: 2024,
    status: 'past',
    description: 'Past festival event',
    color: '#17a2b8',
    dates: 'May 17-19, 2024'
  }
};

// Storage key for persistence
const STORAGE_KEY = 'admin_selected_event';

// Default selected event
const DEFAULT_EVENT = 'all';

/**
 * Event Selector Class
 * Manages event selection UI and state
 */
class AdminEventSelector {
  constructor() {
    this.selectedEventId = this.getStoredSelection() || DEFAULT_EVENT;
    this.container = null;
    this.selectElement = null;
    this.eventListeners = [];
    
    // Bind methods
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
  }

  /**
   * Get stored event selection from localStorage
   */
  getStoredSelection() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to read stored event selection:', error);
      return null;
    }
  }

  /**
   * Store event selection in localStorage
   */
  setStoredSelection(eventId) {
    try {
      localStorage.setItem(STORAGE_KEY, eventId);
    } catch (error) {
      console.warn('Failed to store event selection:', error);
    }
  }

  /**
   * Create the event selector UI
   */
  createSelector() {
    // Create container
    this.container = document.createElement('div');
    this.container.className = 'event-selector-container';
    this.container.innerHTML = `
      <div class="event-selector-wrapper">
        <label for="eventSelector" class="event-selector-label">
          <span class="selector-icon" aria-hidden="true">🗓️</span>
          Festival Event:
        </label>
        <select 
          id="eventSelector" 
          class="event-selector"
          aria-describedby="event-selector-description"
        >
          ${this.generateOptions()}
        </select>
        <div id="event-selector-description" class="event-description">
          ${this.getEventDescription(this.selectedEventId)}
        </div>
      </div>
    `;

    // Apply styles
    this.applyStyles();

    // Get select element reference
    this.selectElement = this.container.querySelector('#eventSelector');
    
    // Set initial selection
    this.selectElement.value = this.selectedEventId;

    // Add event listener
    this.selectElement.addEventListener('change', this.handleSelectionChange);

    return this.container;
  }

  /**
   * Generate option elements for the select
   */
  generateOptions() {
    return Object.values(EVENTS_DATA)
      .map(event => {
        const selected = event.id === this.selectedEventId ? 'selected' : '';
        const statusIcon = this.getStatusIcon(event.status);
        return `
          <option value="${event.id}" ${selected} data-status="${event.status}">
            ${statusIcon} ${event.name}
          </option>
        `;
      })
      .join('');
  }

  /**
   * Get status icon for event
   */
  getStatusIcon(status) {
    const icons = {
      'current': '🔴',
      'past': '✅',
      'aggregate': '📊'
    };
    return icons[status] || '📅';
  }

  /**
   * Get event description
   */
  getEventDescription(eventId) {
    const event = EVENTS_DATA[eventId];
    if (!event) return 'Unknown event';
    
    let description = event.description;
    if (event.dates) {
      description += ` • ${event.dates}`;
    }
    
    return description;
  }

  /**
   * Apply CSS styles to the component
   */
  applyStyles() {
    // Check if styles already applied
    if (document.getElementById('event-selector-styles')) return;

    const style = document.createElement('style');
    style.id = 'event-selector-styles';
    style.textContent = `
      .event-selector-container {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        border-left: 4px solid var(--color-primary, #5b6bb5);
      }

      .event-selector-wrapper {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .event-selector-label {
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text, #2c3e50);
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 0;
      }

      .selector-icon {
        font-size: 18px;
      }

      .event-selector {
        padding: 12px 16px;
        border: 2px solid var(--color-border, #d1d9e0);
        border-radius: 6px;
        background: white;
        font-size: 16px;
        font-weight: 500;
        color: var(--color-text, #2c3e50);
        cursor: pointer;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        min-height: 48px;
        appearance: none;
        background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5"><path fill="%23666" d="M2 0L0 2h4zm0 5L0 3h4z"/></svg>');
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 12px;
        padding-right: 40px;
      }

      .event-selector:focus {
        outline: 3px solid var(--color-focus-ring, #0066cc);
        outline-offset: 2px;
        border-color: var(--color-primary, #5b6bb5);
      }

      .event-selector:hover {
        border-color: var(--color-primary, #5b6bb5);
      }

      .event-description {
        font-size: 14px;
        color: var(--color-text-light, #5a6c7d);
        font-style: italic;
        padding-left: 26px;
        margin-top: -4px;
      }

      /* Mobile responsive */
      @media (max-width: 768px) {
        .event-selector-container {
          margin: 0 -15px 20px;
          border-radius: 0;
          border-left: none;
          border-top: 4px solid var(--color-primary, #5b6bb5);
        }

        .event-selector-wrapper {
          gap: 8px;
        }

        .event-selector-label {
          font-size: 15px;
        }

        .event-selector {
          font-size: 16px;
          padding: 14px 16px;
        }

        .event-description {
          font-size: 13px;
          padding-left: 22px;
        }
      }

      /* High contrast mode support */
      @media (prefers-contrast: high) {
        .event-selector {
          border-width: 2px;
          border-color: #000;
        }
        
        .event-selector:focus {
          outline-width: 3px;
          outline-color: #000;
        }
      }

      /* Animation for selection change */
      .event-selector-container.updating {
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .event-selector-container.updating .event-selector {
        pointer-events: none;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Handle selection change
   */
  handleSelectionChange(event) {
    const newEventId = event.target.value;
    
    // Add updating visual state
    this.container.classList.add('updating');
    
    // Update internal state
    this.selectedEventId = newEventId;
    
    // Update description
    const descriptionEl = this.container.querySelector('.event-description');
    if (descriptionEl) {
      descriptionEl.textContent = this.getEventDescription(newEventId);
    }
    
    // Store selection
    this.setStoredSelection(newEventId);
    
    // Emit custom event
    this.emitSelectionChange(newEventId);
    
    // Remove updating state after a short delay
    setTimeout(() => {
      this.container.classList.remove('updating');
    }, 200);
  }

  /**
   * Emit custom event for selection change
   */
  emitSelectionChange(eventId) {
    const event = EVENTS_DATA[eventId];
    
    const customEvent = new CustomEvent('eventSelectorChange', {
      detail: {
        eventId,
        event,
        previousEventId: this.getPreviousSelection(),
        filterFunction: this.getFilterFunction(eventId)
      },
      bubbles: true
    });
    
    // Dispatch from container if available, otherwise from document
    const target = this.container || document;
    target.dispatchEvent(customEvent);
    
    console.log('Event selector changed:', {
      selected: eventId,
      event: event?.name || 'Unknown'
    });
  }

  /**
   * Get filter function for the selected event
   */
  getFilterFunction(eventId) {
    if (eventId === 'all') {
      return () => true; // No filtering for "All Events"
    }
    
    const event = EVENTS_DATA[eventId];
    if (!event) return () => true;
    
    return (data) => {
      // Filter logic based on event year
      // This can be customized based on your data structure
      if (data.event_year) {
        return data.event_year === event.year;
      }
      
      // Default: assume data belongs to current event (2026) if no year specified
      return eventId === '2026';
    };
  }

  /**
   * Get previous selection (for comparison)
   */
  getPreviousSelection() {
    // This could be enhanced to track history if needed
    return this.getStoredSelection();
  }

  /**
   * Get currently selected event
   */
  getSelectedEvent() {
    return {
      id: this.selectedEventId,
      event: EVENTS_DATA[this.selectedEventId],
      filterFunction: this.getFilterFunction(this.selectedEventId)
    };
  }

  /**
   * Set selected event programmatically
   */
  setSelectedEvent(eventId) {
    if (!EVENTS_DATA[eventId]) {
      console.warn('Invalid event ID:', eventId);
      return false;
    }
    
    this.selectedEventId = eventId;
    
    if (this.selectElement) {
      this.selectElement.value = eventId;
      
      // Update description
      const descriptionEl = this.container.querySelector('.event-description');
      if (descriptionEl) {
        descriptionEl.textContent = this.getEventDescription(eventId);
      }
    }
    
    this.setStoredSelection(eventId);
    this.emitSelectionChange(eventId);
    
    return true;
  }

  /**
   * Get available events
   */
  getAvailableEvents() {
    return EVENTS_DATA;
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.selectElement) {
      this.selectElement.removeEventListener('change', this.handleSelectionChange);
    }
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    
    this.eventListeners = [];
  }
}

/**
 * Filter dashboard data by selected event
 * 
 * @param {Array} data - Raw dashboard data
 * @param {string} eventId - Selected event ID
 * @returns {Array} Filtered data
 */
function filterDashboardData(data, eventId = 'all') {
  if (eventId === 'all') {
    return data; // Return all data for aggregate view
  }
  
  const event = EVENTS_DATA[eventId];
  if (!event) {
    console.warn('Unknown event ID for filtering:', eventId);
    return data;
  }
  
  const filterFunction = new AdminEventSelector().getFilterFunction(eventId);
  return Array.isArray(data) ? data.filter(filterFunction) : data;
}

/**
 * Apply event filter to statistics
 * 
 * @param {Object} stats - Raw statistics object
 * @param {string} eventId - Selected event ID
 * @returns {Object} Filtered statistics
 */
function filterStatistics(stats, eventId = 'all') {
  if (eventId === 'all') {
    return stats; // Return aggregate statistics
  }
  
  // For now, return the stats as-is since we don't have multi-event data
  // This can be enhanced when historical data is available
  
  const event = EVENTS_DATA[eventId];
  if (!event) {
    console.warn('Unknown event ID for statistics filtering:', eventId);
    return stats;
  }
  
  // Add event context to stats
  return {
    ...stats,
    event_filter: {
      id: eventId,
      name: event.name,
      year: event.year,
      status: event.status
    }
  };
}

/**
 * Initialize event selector in the admin dashboard
 * 
 * @param {string|HTMLElement} targetSelector - Where to insert the selector
 * @returns {AdminEventSelector} Event selector instance
 */
function initializeEventSelector(targetSelector = '.dashboard-container') {
  const selector = new AdminEventSelector();
  const selectorElement = selector.createSelector();
  
  // Find target container
  const target = typeof targetSelector === 'string' 
    ? document.querySelector(targetSelector)
    : targetSelector;
    
  if (!target) {
    console.error('Target container not found for event selector:', targetSelector);
    return null;
  }
  
  // Insert at the beginning of the container
  target.insertBefore(selectorElement, target.firstChild);
  
  return selector;
}

// Export functions and classes for dashboard integration
export {
  AdminEventSelector,
  EVENTS_DATA,
  filterDashboardData,
  filterStatistics,
  initializeEventSelector,
  DEFAULT_EVENT,
  STORAGE_KEY
};

// Also provide global access for non-module usage
if (typeof window !== 'undefined') {
  window.AdminEventSelector = AdminEventSelector;
  window.EVENTS_DATA = EVENTS_DATA;
  window.filterDashboardData = filterDashboardData;
  window.filterStatistics = filterStatistics;
  window.initializeEventSelector = initializeEventSelector;
}