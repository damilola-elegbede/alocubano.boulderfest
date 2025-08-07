/**
 * Shared ticket configuration and constants
 * Centralizes all ticket-related mappings and settings to eliminate duplication
 */

export const TICKET_TYPE_MAP = {
  'vip-pass': 'VIP Pass',
  'weekend-pass': 'Weekend Pass',
  'friday-pass': 'Friday Pass',
  'saturday-pass': 'Saturday Pass',
  'sunday-pass': 'Sunday Pass',
  'workshop-beginner': 'Beginner Workshop',
  'workshop-intermediate': 'Intermediate Workshop',
  'workshop-advanced': 'Advanced Workshop',
  'workshop': 'Workshop',
  'social-dance': 'Social Dance',
  'general-admission': 'General Admission'
};

export const TICKET_STATUS = {
  VALID: 'valid',
  USED: 'used',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  TRANSFERRED: 'transferred'
};

export const EVENT_CONFIG = {
  'boulder-fest-2026': {
    name: 'A Lo Cubano Boulder Fest 2026',
    startDate: '2026-05-15',
    endDate: '2026-05-17',
    venue: 'Avalon Ballroom',
    address: '6185 Arapahoe Road, Boulder, CO 80303',
    dates: {
      friday: '2026-05-15',
      saturday: '2026-05-16',
      sunday: '2026-05-17'
    }
  }
};

export const TOKEN_EXPIRY = {
  ACCESS: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months in milliseconds
  ACTION: 30 * 60 * 1000, // 30 minutes in milliseconds
  VALIDATION: null // QR codes don't expire
};

export const TOKEN_ACTIONS = {
  TRANSFER: 'transfer',
  CANCEL: 'cancel',
  REFUND: 'refund',
  MODIFY: 'modify'
};

/**
 * Format ticket type for display
 */
export function formatTicketType(type) {
  return TICKET_TYPE_MAP[type] || type;
}

/**
 * Get event date based on event ID and ticket type
 */
export function getEventDate(eventId, ticketType) {
  const event = EVENT_CONFIG[eventId];
  if (!event) return null;

  if (ticketType.includes('friday')) return event.dates.friday;
  if (ticketType.includes('saturday')) return event.dates.saturday;
  if (ticketType.includes('sunday')) return event.dates.sunday;
  
  // Default to first day for weekend passes and general admission
  return event.dates.friday;
}

/**
 * Check if an item is a ticket item
 */
export function isTicketItem(item) {
  if (!item) return false;
  
  const description = (item.description || item.price?.product?.name || '').toLowerCase();
  return description.includes('ticket') || 
         description.includes('pass') || 
         description.includes('workshop') ||
         description.includes('registration');
}

/**
 * Extract ticket type from line item
 */
export function extractTicketType(item) {
  if (!item) return 'general-admission';
  
  const description = (item.description || item.price?.product?.name || '').toLowerCase();
  
  // Check for specific ticket types
  if (description.includes('vip')) return 'vip-pass';
  if (description.includes('weekend')) return 'weekend-pass';
  if (description.includes('friday')) return 'friday-pass';
  if (description.includes('saturday')) return 'saturday-pass';
  if (description.includes('sunday')) return 'sunday-pass';
  if (description.includes('workshop')) {
    if (description.includes('beginner')) return 'workshop-beginner';
    if (description.includes('intermediate')) return 'workshop-intermediate';
    if (description.includes('advanced')) return 'workshop-advanced';
    return 'workshop';
  }
  if (description.includes('social')) return 'social-dance';
  
  return 'general-admission';
}