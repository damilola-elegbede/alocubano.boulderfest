/**
 * Pure Cart Calculation Functions
 * 
 * Extracted from CartManager for unit testing.
 * These functions have no side effects and can be tested in isolation.
 */

/**
 * Calculate cart totals from cart state
 * @param {Object} cartState - Cart state with tickets and donations
 * @returns {Object} Calculated totals
 */
export function calculateCartTotals(cartState) {
  const { tickets = {}, donations = [] } = cartState;
  
  let ticketsTotal = 0;
  let ticketCount = 0;

  // Calculate tickets total
  Object.values(tickets).forEach((ticket) => {
    if (ticket && typeof ticket.price === 'number' && typeof ticket.quantity === 'number') {
      ticketsTotal += ticket.price * ticket.quantity;
      ticketCount += ticket.quantity;
    }
  });

  // Calculate donations total  
  const donationTotal = donations.reduce((sum, donation) => {
    if (donation && typeof donation.amount === 'number' && donation.amount > 0) {
      return sum + donation.amount;
    }
    return sum;
  }, 0);
  
  const donationCount = donations.filter(d => d && d.amount > 0).length;

  return {
    tickets: Math.round(ticketsTotal * 100) / 100, // Round to 2 decimal places
    donations: Math.round(donationTotal * 100) / 100,
    total: Math.round((ticketsTotal + donationTotal) * 100) / 100,
    itemCount: ticketCount,
    donationCount: donationCount
  };
}

/**
 * Calculate individual ticket line total
 * @param {number} price - Price per ticket
 * @param {number} quantity - Number of tickets
 * @returns {number} Line total
 */
export function calculateLineTotal(price, quantity) {
  if (typeof price !== 'number' || typeof quantity !== 'number' || price < 0 || quantity < 0) {
    return 0;
  }
  
  return Math.round(price * quantity * 100) / 100;
}

/**
 * Validate quantity adjustment
 * @param {number} currentQuantity - Current quantity
 * @param {string} action - 'increase' or 'decrease'
 * @returns {number} New quantity (constrained to valid range)
 */
export function calculateNewQuantity(currentQuantity, action) {
  const current = typeof currentQuantity === 'number' ? currentQuantity : 0;
  
  if (action === 'increase') {
    return Math.min(current + 1, 10); // Maximum 10 tickets per type
  } else if (action === 'decrease') {
    return Math.max(current - 1, 0); // Minimum 0 tickets
  }
  
  return current;
}

/**
 * Check if cart is empty
 * @param {Object} cartState - Cart state with tickets and donations
 * @returns {boolean} True if cart is empty
 */
export function isCartEmpty(cartState) {
  const { tickets = {}, donations = [] } = cartState;
  
  const hasTickets = Object.values(tickets).some(ticket => 
    ticket && ticket.quantity > 0
  );
  
  const hasDonations = donations.some(donation => 
    donation && donation.amount > 0
  );
  
  return !hasTickets && !hasDonations;
}

/**
 * Validate ticket data
 * @param {Object} ticketData - Ticket data to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateTicketData(ticketData) {
  const errors = [];
  
  if (!ticketData || typeof ticketData !== 'object') {
    errors.push('Ticket data must be an object');
    return { isValid: false, errors };
  }
  
  const { ticketType, price, name, quantity } = ticketData;
  
  if (!ticketType || typeof ticketType !== 'string') {
    errors.push('Ticket type is required and must be a string');
  }
  
  if (typeof price !== 'number' || price <= 0) {
    errors.push('Price must be a positive number');
  }
  
  if (!name || typeof name !== 'string') {
    errors.push('Name is required and must be a string');
  }
  
  if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 0)) {
    errors.push('Quantity must be a non-negative number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate donation data
 * @param {number} amount - Donation amount
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateDonationData(amount) {
  const errors = [];
  
  if (typeof amount !== 'number') {
    errors.push('Donation amount must be a number');
  } else if (amount <= 0) {
    errors.push('Donation amount must be positive');
  } else if (amount > 10000) {
    errors.push('Donation amount cannot exceed $10,000');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generate unique donation ID
 * @returns {string} Unique donation ID
 */
export function generateDonationId() {
  return `donation_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create donation object
 * @param {number} amount - Donation amount
 * @returns {Object} Donation object
 */
export function createDonation(amount) {
  const validation = validateDonationData(amount);
  if (!validation.isValid) {
    throw new Error(`Invalid donation: ${validation.errors.join(', ')}`);
  }
  
  return {
    id: generateDonationId(),
    amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
    name: 'Festival Support',
    addedAt: Date.now()
  };
}

/**
 * Apply quantity constraints
 * @param {number} quantity - Requested quantity
 * @returns {number} Constrained quantity
 */
export function applyQuantityConstraints(quantity) {
  if (typeof quantity !== 'number' || isNaN(quantity)) {
    return 0;
  }
  
  return Math.max(0, Math.min(quantity, 10)); // 0-10 tickets max
}

/**
 * Calculate cart item count (tickets + donations)
 * @param {Object} cartState - Cart state
 * @returns {number} Total item count
 */
export function calculateItemCount(cartState) {
  const totals = calculateCartTotals(cartState);
  return totals.itemCount + totals.donationCount;
}