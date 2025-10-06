/**
 * Dynamic Ticket Card Generator
 * Generates ticket cards from bootstrap.json data via API
 * Groups tickets by event and orders chronologically
 */

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
 * Format date range for display
 */
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const options = { month: 'short', day: 'numeric' };
  const year = start.getFullYear();

  if (start.toDateString() === end.toDateString()) {
    // Single day event
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else if (start.getMonth() === end.getMonth()) {
    // Same month
    return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}-${end.getDate()}, ${year}`;
  } else {
    // Different months
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}, ${year}`;
  }
}

/**
 * Generate event section header
 */
function generateEventHeader(event) {
  const dateRange = formatDateRange(event.start_date, event.end_date);
  return `
    <div class="event-section-header" data-event-id="${event.event_id}">
      <h2 class="event-title">${event.event_name}</h2>
      <p class="event-details">
        ${dateRange} • ${event.venue_name}
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
 * Get ticket color based on ticket type
 */
function getTicketColor(ticketTypeId) {
  // Map ticket types to colors (matching existing cards)
  const colorMap = {
    'weekender-2025-11-full': 'rgb(169, 169, 169)', // Gray
    'weekender-2025-11-class': 'rgb(255, 255, 255)', // White
    'test-vip-pass': 'rgb(255, 20, 147)', // Deep pink
    'test-weekender-pass': 'rgb(255, 20, 147)',
    'test-friday-pass': 'rgb(255, 20, 147)',
    'test-saturday-pass': 'rgb(255, 20, 147)',
    'test-sunday-pass': 'rgb(255, 20, 147)'
  };

  return colorMap[ticketTypeId] || 'rgb(169, 169, 169)'; // Default gray
}

/**
 * Generate ticket card HTML
 */
function generateTicketCard(ticketType, event) {
  const isComingSoon = ticketType.status === 'coming-soon';
  const isSoldOut = ticketType.status === 'sold-out';
  const isAvailable = ticketType.status === 'available';

  // Price display
  const priceDisplay = ticketType.price_cents
    ? `$${(ticketType.price_cents / 100).toFixed(2)}`
    : 'TBA';

  // Status banner
  let statusBanner = '';
  if (isComingSoon) {
    statusBanner = `
      <div class="ticket-status-banner coming-soon">
        COMING SOON
      </div>
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

  const ticketColor = getTicketColor(ticketType.id);
  const dateRange = formatDateRange(event.start_date, event.end_date);

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
             data-name="${ticketType.name}"
             data-venue="${event.venue_name}">

          <div class="ticket-header">
            <div class="event-label">EVENT</div>
            <div class="event-name">${event.event_name}</div>
          </div>

          <div class="ticket-body">
            <div class="ticket-type-section">
              <div class="field-label">Ticket Type</div>
              <div class="ticket-type">${ticketType.name.toUpperCase()}</div>
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
                <div class="venue-name">${event.venue_name}</div>
              </div>
            </div>

            ${isAvailable ? generateQuantitySelector() : ''}
          </div>
        </div>

        <!-- Back of card -->
        <div class="flip-card-back">
          <div class="card-back-content">
            <h3>${ticketType.name} Details</h3>
            <p>${ticketType.description || 'Details coming soon'}</p>
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
    initializeTicketCardGenerator
  };
}
