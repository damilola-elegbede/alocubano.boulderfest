#!/usr/bin/env node
/**
 * Build-Time Ticket Generator
 * Generates static ticket HTML from bootstrap.json for instant page loads
 *
 * CRITICAL: This script MUST exit with code 1 on ANY error to fail the build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Color mappings (matches lib/ticket-color-service.js fallback)
// IMPORTANT: Order matters - specific patterns must come before general patterns
const COLOR_MAPPINGS = [
  { pattern: 'test-', color: 'rgb(255, 20, 147)', name: 'Test' },
  { pattern: 'test_', color: 'rgb(255, 20, 147)', name: 'Test' },
  { pattern: 'full', color: 'rgb(169, 169, 169)', name: 'Full Pass' },
  { pattern: 'early-bird', color: 'rgb(169, 169, 169)', name: 'Full Pass' },
  { pattern: 'friday', color: 'rgb(255, 140, 0)', name: 'Friday' },
  { pattern: 'saturday', color: 'rgb(255, 215, 0)', name: 'Saturday' },
  { pattern: 'sunday', color: 'rgb(30, 144, 255)', name: 'Sunday' },
  { pattern: 'class', color: 'rgb(34, 139, 34)', name: 'Single Class' }, // Forest green - must come before 'weekender'
  { pattern: 'weekender', color: 'rgb(255, 255, 255)', name: 'Weekender' },
  { pattern: 'weekend', color: 'rgb(255, 255, 255)', name: 'Weekend' }
];

/**
 * Escape HTML to prevent XSS attacks
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
 * Get ticket color using pattern matching
 */
function getTicketColor(ticketId) {
  const ticketIdLower = ticketId.toLowerCase();

  for (const mapping of COLOR_MAPPINGS) {
    if (ticketIdLower.includes(mapping.pattern.toLowerCase())) {
      return mapping.color;
    }
  }

  return 'rgb(169, 169, 169)'; // Default gray
}

/**
 * Format date range for display (simple version without timeManager)
 */
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const options = { month: 'short', day: 'numeric', year: 'numeric' };

  if (start.toDateString() === end.toDateString()) {
    // Single day event
    return start.toLocaleDateString('en-US', options);
  } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    // Same month and year - show "Nov 8-9, 2025" format
    const month = start.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = start.getFullYear();

    return `${month} ${startDay}-${endDay}, ${year}`;
  } else {
    // Different months
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const year = start.getFullYear();

    return `${startFormatted} - ${endFormatted}, ${year}`;
  }
}

/**
 * Generate event section header
 */
function generateEventHeader(event) {
  const dateRange = formatDateRange(event.start_date, event.end_date);
  const eventName = escapeHtml(event.name);
  const venueName = escapeHtml(event.venue_name);

  return `
    <div class="event-section-header" data-event-id="${event.id}">
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
 * Generate ticket card HTML
 */
function generateTicketCard(ticketType, event) {
  const isComingSoon = ticketType.status === 'coming-soon';
  const isSoldOut = ticketType.status === 'sold-out';
  const isAvailable = ticketType.status === 'available';

  // Price display - handle null/undefined for $0.00 tickets
  const priceDisplay = (ticketType.price_cents !== null && ticketType.price_cents !== undefined)
    ? `$${(ticketType.price_cents / 100).toFixed(2)}`
    : 'TBA';

  // Status banner
  let statusBanner = '';
  if (isComingSoon) {
    statusBanner = `
      <div class="ticket-status-banner coming-soon">
        <span class="sr-only">COMING SOON</span>
      </div>
    `;
  } else if (isSoldOut) {
    statusBanner = `
      <div class="ticket-status-banner sold-out">
        SOLD OUT
      </div>
    `;
  }

  // Disable styling ONLY for coming-soon tickets
  const disabledClass = isComingSoon ? 'ticket-disabled' : '';
  const pointerEvents = isComingSoon ? 'pointer-events: none;' : '';
  const ariaDisabled = isComingSoon ? 'aria-disabled="true"' : '';

  const ticketColor = getTicketColor(ticketType.id);
  const dateRange = formatDateRange(event.start_date, event.end_date);

  // Escape user-controlled data to prevent XSS
  // CRITICAL: Always uppercase BEFORE escaping to prevent HTML entity corruption
  const rawTicketName = ticketType.name || '';
  const ticketName = escapeHtml(rawTicketName);
  const ticketNameUpper = escapeHtml(rawTicketName.toUpperCase());
  const ticketDescription = escapeHtml(ticketType.description || 'Details coming soon');
  const eventName = escapeHtml(event.name);
  const venueName = escapeHtml(event.venue_name);

  return `
    <div class="flip-card ${disabledClass}" data-ticket-status="${ticketType.status}" ${ariaDisabled}>
      <div class="flip-card-inner" style="${pointerEvents}">
        <!-- Front of card -->
        <div class="flip-card-front ticket-card vertical-design"
             data-ticket-id="${ticketType.id}"
             data-ticket-type="${ticketType.id}"
             data-event-id="${event.id}"
             data-price="${ticketType.price_cents ? (ticketType.price_cents / 100).toFixed(2) : '0.00'}"
             data-name="${escapeHtml(ticketType.name)}"
             data-venue="${escapeHtml(event.venue_name)}">

          ${statusBanner}

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
 * Generate test donation button HTML
 */
function generateTestDonationButton() {
  return `
  <!-- Test Donation Button -->
  <div class="test-donation-button-container" data-testid="test-donation-button" style="text-align: center; margin: 2rem 0;">
    <h3 style="color: var(--color-warning, #fbbf24); margin-bottom: 1rem;">
      🧪 Test Donation
    </h3>
    <p style="margin-bottom: 1rem; color: var(--color-text-secondary);">
      Add a $25 test donation to your cart for development testing
    </p>
    <button
      id="test-donation-button"
      class="cta-button"
      type="button"
      aria-label="Add $25 test donation to cart"
      style="background: var(--color-accent, #d97706); padding: 1rem 2rem; font-size: 1.1rem; border-radius: 8px; border: none; cursor: pointer; color: white; font-weight: 600; transition: all 0.3s ease;">
      ADD $25 TEST DONATION
    </button>
  </div>
  `;
}

/**
 * Main ticket generation logic
 */
try {
  console.log('🎫 Generating static ticket HTML...');

  const bootstrapPath = path.join(__dirname, '../config/bootstrap.json');

  // Detect environment
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  const isProduction = environment === 'production';
  const includeTestTickets = !isProduction;

  console.log(`  Environment: ${environment}`);
  console.log(`  Include test tickets: ${includeTestTickets}`);

  // Validate bootstrap file exists
  if (!fs.existsSync(bootstrapPath)) {
    throw new Error(`bootstrap.json not found at ${bootstrapPath}`);
  }

  // Read and parse bootstrap.json
  const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf8');
  let bootstrap;

  try {
    bootstrap = JSON.parse(bootstrapContent);
  } catch (parseError) {
    throw new Error(`Failed to parse bootstrap.json: ${parseError.message}`);
  }

  // Validate structure
  if (!bootstrap.events || !Array.isArray(bootstrap.events)) {
    throw new Error('Invalid bootstrap.json: missing or invalid "events" array');
  }

  if (!bootstrap.ticket_types || !Array.isArray(bootstrap.ticket_types)) {
    throw new Error('Invalid bootstrap.json: missing or invalid "ticket_types" array');
  }

  // Filter events based on environment
  const visibleEvents = bootstrap.events.filter(e => {
    // In production: exclude test events and hidden events
    if (isProduction) {
      if (e.status === 'test') return false;
      if (e.is_visible === false) return false;
      return true;
    }
    // In development/preview: include test events even if hidden, exclude non-test hidden events
    if (e.status === 'test') return true; // Always include test events in dev
    if (e.is_visible === false) return false; // Still exclude non-test hidden events
    return true;
  });

  console.log(`  Found ${visibleEvents.length} visible events (filtered from ${bootstrap.events.length} total)`);

  // Group tickets by event based on environment
  const eventTickets = new Map();
  const filteredTickets = bootstrap.ticket_types.filter(t => {
    if (isProduction && t.status === 'test') return false;
    return true;
  });

  filteredTickets.forEach(ticket => {
    const event = visibleEvents.find(e => e.id === ticket.event_id);
    if (event) {
      if (!eventTickets.has(event.id)) {
        eventTickets.set(event.id, {
          event,
          tickets: []
        });
      }
      eventTickets.get(event.id).tickets.push(ticket);
    }
  });

  console.log(`  Grouped ${filteredTickets.length} tickets for ${eventTickets.size} events`);

  // Validate we have tickets to generate
  if (eventTickets.size === 0) {
    throw new Error('No visible events with tickets found. Check bootstrap.json configuration.');
  }

  // Generate HTML
  let html = '';

  // Sort events chronologically by start_date
  const sortedEvents = Array.from(eventTickets.values()).sort((a, b) => {
    const dateA = new Date(a.event.start_date || '9999-12-31');
    const dateB = new Date(b.event.start_date || '9999-12-31');
    return dateA.getTime() - dateB.getTime();
  });

  // Separate production and test events
  const productionEvents = sortedEvents.filter(({ event }) => event.status !== 'test');
  const testEvents = sortedEvents.filter(({ event }) => event.status === 'test');

  // Generate production tickets
  productionEvents.forEach(({ event, tickets }) => {
    // Event section container
    html += `\n  <div class="event-section">\n`;
    html += generateEventHeader(event);

    // Ticket grid
    html += `    <div class="ticket-options-grid" data-event-id="${event.id}">\n`;

    // Sort tickets by display_order
    const sortedTickets = tickets.sort((a, b) =>
      (a.display_order || 0) - (b.display_order || 0)
    );

    sortedTickets.forEach(ticket => {
      html += generateTicketCard(ticket, event);
    });

    html += `    </div>\n`;
    html += `  </div>\n`;
  });

  // Generate test tickets section if in development/preview
  if (testEvents.length > 0 && includeTestTickets) {
    html += `
  <!-- Test Tickets Section (Development/Preview Only) -->
  <section class="ticket-selection" id="test-tickets-section" data-test-tickets="true">
    <h2 style="color: var(--color-warning, #fbbf24)">🧪 Test Tickets (Development Only)</h2>
    <p style="color: var(--color-text-secondary); margin-bottom: var(--space-lg)">
      These tickets are for testing purposes only and will not appear in production.
    </p>

    <div class="ticket-options-grid">
`;

    testEvents.forEach(({ event, tickets }) => {
      // Sort tickets by display_order
      const sortedTickets = tickets.sort((a, b) =>
        (a.display_order || 0) - (b.display_order || 0)
      );

      sortedTickets.forEach(ticket => {
        html += generateTicketCard(ticket, event);
      });
    });

    html += `    </div>\n`;

    // Add test donation button
    html += generateTestDonationButton();

    html += `  </section>\n`;
  }

  // Validate generated HTML is not empty
  if (!html.trim()) {
    throw new Error('Generated HTML is empty - ticket generation failed');
  }

  // Write static HTML to file for reference
  const outputPath = path.join(__dirname, '../public/generated/tickets.html');
  const outputDir = path.dirname(outputPath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf8');

  // Verify file was written
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Failed to write output file: ${outputPath}`);
  }

  // Inject HTML into tickets.html page
  const ticketsPagePath = path.join(__dirname, '../pages/core/tickets.html');

  if (!fs.existsSync(ticketsPagePath)) {
    throw new Error(`tickets.html not found at ${ticketsPagePath}`);
  }

  let ticketsPageContent = fs.readFileSync(ticketsPagePath, 'utf8');

  // Find and replace content between markers
  const startMarker = '<!--INJECT_TICKETS_START-->';
  const endMarker = '<!--INJECT_TICKETS_END-->';

  const startIndex = ticketsPageContent.indexOf(startMarker);
  const endIndex = ticketsPageContent.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Injection markers not found in tickets.html');
  }

  // Replace content between markers
  const before = ticketsPageContent.substring(0, startIndex + startMarker.length);
  const after = ticketsPageContent.substring(endIndex);
  const injectedContent = `\n              <!-- STATIC TICKETS INJECTED AT BUILD TIME -->\n${html}              <!-- END STATIC TICKETS -->\n              `;

  ticketsPageContent = before + injectedContent + after;

  // Write updated tickets.html
  fs.writeFileSync(ticketsPagePath, ticketsPageContent, 'utf8');

  const fileSizeKB = (html.length / 1024).toFixed(2);
  const productionTicketCount = productionEvents.reduce((sum, { tickets }) => sum + tickets.length, 0);
  const testTicketCount = testEvents.reduce((sum, { tickets }) => sum + tickets.length, 0);

  console.log('✅ Static tickets generated successfully');
  console.log(`  Static file: ${outputPath}`);
  console.log(`  Injected into: ${ticketsPagePath}`);
  console.log(`  Size: ${fileSizeKB} KB`);
  console.log(`  Production events: ${productionEvents.length}`);
  console.log(`  Production tickets: ${productionTicketCount}`);
  if (testEvents.length > 0) {
    console.log(`  Test events: ${testEvents.length}`);
    console.log(`  Test tickets: ${testTicketCount}`);
  }
  console.log(`  Total: ${sortedEvents.length} events, ${filteredTickets.length} tickets`);

  // Explicit success exit
  process.exit(0);

} catch (error) {
  console.error('');
  console.error('❌ FATAL: Ticket generation failed');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  console.error('');
  console.error('Build will fail. Fix the error above and try again.');
  console.error('');

  // FAIL THE BUILD - exit with error code 1
  process.exit(1);
}
