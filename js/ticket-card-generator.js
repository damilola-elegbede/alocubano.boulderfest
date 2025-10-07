/**
 * Dynamic Ticket Card Generator
 * Generates ticket cards from bootstrap.json data via API
 * Groups tickets by event and orders chronologically
 */

import timeManager from './time-manager.js';

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML injection
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Fetch tickets grouped by event from API
 */
async function fetchTicketsByEvent() {
  try {
    const response = await fetch('/api/tickets/types');
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error('Failed to fetch tickets:', error);
    throw error;
  }
}

/**
 * Format date range for display using timeManager (Mountain Time)
 */
function formatDateRange(startDate, endDate) {
  if (!timeManager) {
    console.warn('timeManager not available, falling back to basic formatting');
    return `${startDate} - ${endDate}`;
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  // Format individual dates using Mountain Time
  const startFormatted = timeManager.formatDate(start);
  const endFormatted = timeManager.formatDate(end);

  if (start.toDateString() === end.toDateString()) {
    // Single day event - include year
    return timeManager.formatDate(start, false); // short format with year
  } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    // Same month and year - show "May 15-17, 2026" format
    const monthDay = startFormatted.split(',')[0]; // "May 15"
    const endDay = end.getDate();
    const year = start.getFullYear();
    const month = monthDay.split(' ')[0]; // "May"
    const startDay = start.getDate();
    
    return `${month} ${startDay}-${endDay}, ${year}`;
  } else {
    // Different months - show full range
    const startParts = startFormatted.split(','); // ["May 15", " 2026"]
    const endParts = endFormatted.split(','); // ["May 17", " 2026"]
    const year = start.getFullYear();
    
    return `${startParts[0]} - ${endParts[0]}, ${year}`;
  }
}

/**
 * Generate event section header
 */
function generateEventHeader(event) {
  const dateRange = formatDateRange(event.start_date, event.end_date);
  const eventName = escapeHtml(event.event_name);
  const venueName = escapeHtml(event.venue_name);
  
  return `
    <div class="event-section-header" data-event-id="${event.event_id}">
      <h2 class="event-title">${eventName}</h2>
      <p class="event-details">
        ${dateRange} • ${venueName}
      </p>
    </div>
  `;
}

/**
 * Generate quantity selector HTML
 */
function generateQuantitySelector() {
  return `
    <div class="quantity-selector">
      <button
        class="qty-btn minus"
        data-action="decrease"
        type="button"
        aria-label="Decrease quantity"
      >
        -
      </button>
      <span class="quantity">0</span>
      <button
        class="qty-btn plus"
        data-action="increase"
        data-action-alt="add-to-cart"
        type="button"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  `;
}

/**
 * Get ticket color from API response
 * Uses color_rgb field provided by ticket-color-service pattern matching
 */
function getTicketColor(ticketType) {
  // Use color from API response (provided by ticket-color-service)
  // Falls back to gray if color not provided
  return ticketType.color_rgb || 'rgb(169, 169, 169)';
}

/**
 * Generate ticket card HTML
 */
function generateTicketCard(ticketType, event) {
  const isComingSoon = ticketType.status === 'coming-soon';
  const isSoldOut = ticketType.status === 'sold-out';
  const isAvailable = ticketType.status === 'available';

  // Price display - use explicit null/undefined check to handle $0.00 tickets
  const priceDisplay = (ticketType.price_cents !== null && ticketType.price_cents !== undefined)
    ? `$${(ticketType.price_cents / 100).toFixed(2)}`
    : 'TBA';

  // Status banner
  let statusBanner = '';
  if (isComingSoon) {
    statusBanner = `
      <div class="ticket-status-banner coming-soon"></div>
    `;
  } else if (isSoldOut) {
    statusBanner = `
      <div class="ticket-status-banner sold-out">
        SOLD OUT
      </div>
    `;
  }

  // Disable styling for non-available tickets
  const disabledClass = !isAvailable ? 'ticket-disabled' : '';
  const pointerEvents = !isAvailable ? 'pointer-events: none;' : '';

  const ticketColor = getTicketColor(ticketType);
  const dateRange = formatDateRange(event.start_date, event.end_date);

  // Escape user-controlled data to prevent XSS
  // Note: Uppercase BEFORE escaping to avoid corrupting HTML entities
  const ticketName = escapeHtml(ticketType.name);
  const ticketNameUpper = escapeHtml(ticketType.name.toUpperCase());
  const ticketDescription = escapeHtml(ticketType.description || 'Details coming soon');
  const eventName = escapeHtml(event.event_name);
  const venueName = escapeHtml(event.venue_name);

  return `
    <div class="flip-card ${disabledClass}" data-ticket-status="${ticketType.status}">
      ${statusBanner}
      <div class="flip-card-inner" style="${pointerEvents}">
        <!-- Front of card -->
        <div class="flip-card-front ticket-card vertical-design"
             data-ticket-id="${ticketType.id}"
             data-ticket-type="${ticketType.id}"
             data-event-id="${event.event_id}"
             data-price="${ticketType.price_cents ? (ticketType.price_cents / 100).toFixed(2) : '0.00'}"
             data-name="${escapeHtml(ticketType.name)}"
             data-venue="${escapeHtml(event.venue_name)}">

          <div class="ticket-header">
            <div class="event-label">EVENT</div>
            <div class="event-name">${eventName}</div>
          </div>

          <div class="ticket-body">
            <div class="ticket-type-section">
              <div class="field-label">Ticket Type</div>
              <div class="ticket-type">${ticketNameUpper}</div>
              <div class="ticket-color-indicator" style="display: flex; justify-content: center; margin: 6px 0;">
                <span class="ticket-color-circle" style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: ${ticketColor};"></span>
              </div>
              <div class="ticket-price">${priceDisplay}</div>
            </div>

            <div class="ticket-details">
              <div class="detail-row">
                <div class="field-label">Date</div>
                <div class="detail-value">${dateRange}</div>
              </div>
            </div>

            <div class="ticket-footer">
              <div class="venue-section">
                <div class="field-label">Venue</div>
                <div class="venue-name">${venueName}</div>
              </div>
            </div>

            ${isAvailable ? generateQuantitySelector() : ''}
          </div>
        </div>

        <!-- Back of card -->
        <div class="flip-card-back">
          <div class="card-back-content">
            <h3>${ticketName} Details</h3>
            <p>${ticketDescription}</p>
            ${isAvailable ? '<button class="flip-back-btn" aria-label="Flip back to front">← Back</button>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render all events and their tickets
 */
function renderTicketsByEvent(events, containerId) {
  const container = document.getElementById(containerId);

  if (!container) {
    console.error(`Container #${containerId} not found`);
    return;
  }

  // Clear loading state
  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = `
      <div class="no-tickets-state" style="text-align: center; padding: 3rem;">
        <p style="font-family: var(--font-mono); font-size: 1.125rem; color: var(--color-text-secondary);">
          No tickets available at this time. Check back soon!
        </p>
      </div>
    `;
    return;
  }

  events.forEach(event => {
    // Create event section container
    const sectionEl = document.createElement('div');
    sectionEl.className = 'event-section';

    // Add event header
    sectionEl.innerHTML = generateEventHeader(event);

    // Create ticket grid for this event
    const gridEl = document.createElement('div');
    gridEl.className = 'ticket-options-grid';
    gridEl.dataset.eventId = event.event_id;

    // Generate cards for all ticket types in this event
    event.ticket_types.forEach(ticketType => {
      const cardHTML = generateTicketCard(ticketType, event);
      gridEl.innerHTML += cardHTML;
    });

    sectionEl.appendChild(gridEl);
    container.appendChild(sectionEl);
  });

  console.log(`Rendered ${events.length} events with tickets`);
}

/**
 * Show error state
 */
function showErrorState(containerId = 'dynamic-ticket-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="error-state" style="text-align: center; padding: 3rem;">
      <p style="font-family: var(--font-mono); font-size: 1.125rem; color: var(--color-error, #dc2626);">
        Failed to load tickets. Please refresh the page or try again later.
      </p>
    </div>
  `;
}

/**
 * Initialize ticket card generator
 */
async function initializeTicketCardGenerator() {
  console.log('Initializing dynamic ticket card generator...');

  try {
    // Fetch tickets grouped by event
    const events = await fetchTicketsByEvent();
    console.log(`Fetched ${events.length} events from API`);

    // Render tickets
    renderTicketsByEvent(events, 'dynamic-ticket-container');

    // Re-initialize flip card functionality if available
    if (window.initFlipCards && typeof window.initFlipCards === 'function') {
      window.initFlipCards();
      console.log('Flip card functionality re-initialized');
    }

    console.log('Ticket card generator initialized successfully');
  } catch (error) {
    console.error('Failed to initialize ticket card generator:', error);
    showErrorState();
  }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTicketCardGenerator);
} else {
  // DOM already loaded
  initializeTicketCardGenerator();
}

// Export for testing/manual initialization
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchTicketsByEvent,
    generateTicketCard,
    renderTicketsByEvent,
    initializeTicketCardGenerator,
    escapeHtml
  };
}
