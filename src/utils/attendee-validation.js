/**
 * Attendee Validation Utility
 * Validates attendee information for inline checkout registration
 */

// Validation patterns
const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s\-'.]{2,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a single attendee's information
 * @param {Object} attendee - Attendee data { firstName, lastName, email }
 * @returns {Object} - { valid: boolean, errors: { firstName?: string, lastName?: string, email?: string } }
 */
export function validateAttendee(attendee) {
  const errors = {};

  // Validate first name
  if (!attendee?.firstName || attendee.firstName.trim() === '') {
    errors.firstName = 'First name is required';
  } else if (!NAME_REGEX.test(attendee.firstName.trim())) {
    errors.firstName = 'Please enter a valid first name (2-50 characters, letters only)';
  }

  // Validate last name
  if (!attendee?.lastName || attendee.lastName.trim() === '') {
    errors.lastName = 'Last name is required';
  } else if (!NAME_REGEX.test(attendee.lastName.trim())) {
    errors.lastName = 'Please enter a valid last name (2-50 characters, letters only)';
  }

  // Validate email
  if (!attendee?.email || attendee.email.trim() === '') {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(attendee.email.trim())) {
    errors.email = 'Please enter a valid email address';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validates all attendees for tickets in the cart
 * @param {Array} cart - Cart items
 * @param {Object} attendeeData - Map of ticket keys to attendee data
 * @returns {Object} - { valid: boolean, allErrors: { [ticketKey]: { firstName?, lastName?, email? } }, missingCount: number }
 */
export function validateAllAttendees(cart, attendeeData) {
  const allErrors = {};
  let missingCount = 0;

  // Only validate tickets, not donations
  const ticketItems = cart.filter(item => item.type === 'ticket');

  for (const item of ticketItems) {
    const quantity = item.quantity || 1;

    for (let i = 0; i < quantity; i++) {
      // Generate unique key for each ticket instance using the same function
      // that TicketAttendeeForm and OrderSummary use
      const ticketKey = generateTicketKey(item, i);

      const attendee = attendeeData[ticketKey];

      if (!attendee || !attendee.email) {
        missingCount++;
        if (!attendee) {
          allErrors[ticketKey] = {
            firstName: 'First name is required',
            lastName: 'Last name is required',
            email: 'Email is required'
          };
        }
      } else {
        const { valid, errors } = validateAttendee(attendee);
        if (!valid) {
          allErrors[ticketKey] = errors;
        }
      }
    }
  }

  return {
    valid: Object.keys(allErrors).length === 0,
    allErrors,
    missingCount
  };
}

/**
 * Checks if the cart contains any tickets (requiring attendee info)
 * @param {Array} cart - Cart items
 * @returns {boolean}
 */
export function cartHasTickets(cart) {
  if (!cart || !Array.isArray(cart)) return false;
  return cart.some(item => item.type === 'ticket');
}

/**
 * Gets the total number of tickets in the cart
 * @param {Array} cart - Cart items
 * @returns {number}
 */
export function getTotalTicketCount(cart) {
  if (!cart || !Array.isArray(cart)) return 0;
  return cart
    .filter(item => item.type === 'ticket')
    .reduce((sum, item) => sum + (item.quantity || 1), 0);
}

/**
 * Generates a unique key for each ticket in an expanded cart
 * @param {Object} item - Cart item
 * @param {number} index - Index within the ticket type
 * @returns {string}
 */
export function generateTicketKey(item, index = 0) {
  // Handle eventId carefully - 0 is a valid eventId
  const eventId = item.eventId != null ? item.eventId : 'default';
  return `${item.ticketType}-${eventId}-${index}`;
}

export default {
  validateAttendee,
  validateAllAttendees,
  cartHasTickets,
  getTotalTicketCount,
  generateTicketKey
};
