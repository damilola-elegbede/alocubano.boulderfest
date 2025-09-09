/**
 * Pure Cart Persistence Functions
 *
 * Extracted from CartManager for unit testing.
 * These functions handle cart state serialization, deserialization, and validation.
 */

/**
 * Default cart state structure
 */
export const DEFAULT_CART_STATE = {
    tickets: {},
    donations: [],
    metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: null
    }
};

/**
 * Generate session ID
 * @returns {string} Unique session ID
 */
export function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

/**
 * Create initial cart state
 * @returns {Object} Initial cart state
 */
export function createInitialCartState() {
    return {
        tickets: {},
        donations: [],
        metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sessionId: generateSessionId()
        }
    };
}

/**
 * Serialize cart state for storage
 * @param {Object} cartState - Cart state to serialize
 * @returns {string} Serialized cart state
 */
export function serializeCartState(cartState) {
    if (!cartState || typeof cartState !== 'object') {
        return JSON.stringify(createInitialCartState());
    }

    try {
    // Update timestamp before serializing
        const stateToSerialize = {
            ...cartState,
            metadata: {
                ...cartState.metadata,
                updatedAt: Date.now()
            }
        };

        return JSON.stringify(stateToSerialize);
    } catch (error) {
    // Fallback to initial state if serialization fails
        return JSON.stringify(createInitialCartState());
    }
}

/**
 * Deserialize cart state from storage
 * @param {string} serializedState - Serialized cart state
 * @returns {Object} Deserialized cart state or initial state if invalid
 */
export function deserializeCartState(serializedState) {
    if (!serializedState || typeof serializedState !== 'string') {
        return createInitialCartState();
    }

    try {
        const parsed = JSON.parse(serializedState);

        // Migrate old donation format if needed
        const migrated = migrateDonationFormat(parsed);

        // Validate and return
        if (isValidCartState(migrated)) {
            return migrated;
        }

        return createInitialCartState();
    } catch (error) {
    // Invalid JSON, return initial state
        return createInitialCartState();
    }
}

/**
 * Validate cart state structure
 * @param {Object} cartState - Cart state to validate
 * @returns {boolean} True if valid cart state
 */
export function isValidCartState(cartState) {
    if (!cartState || typeof cartState !== 'object') {
        return false;
    }

    // Check required properties
    if (!cartState.metadata || typeof cartState.metadata !== 'object') {
        return false;
    }

    if (!cartState.tickets || typeof cartState.tickets !== 'object') {
        return false;
    }

    if (!Array.isArray(cartState.donations)) {
        return false;
    }

    // Check metadata structure
    const { metadata } = cartState;
    if (typeof metadata.createdAt !== 'number' ||
      typeof metadata.updatedAt !== 'number') {
        return false;
    }

    return true;
}

/**
 * Migrate old donation format to new array format
 * @param {Object} cartState - Cart state that may need migration
 * @returns {Object} Cart state with migrated donations
 */
export function migrateDonationFormat(cartState) {
    if (!cartState || typeof cartState !== 'object') {
        return createInitialCartState();
    }

    const migrated = { ...cartState };

    // Handle donation format migration
    if (migrated.donations && !Array.isArray(migrated.donations)) {
        if (migrated.donations.amount && migrated.donations.amount > 0) {
            // Convert old single donation to array format
            migrated.donations = [{
                id: `donation_${Date.now()}_migrated`,
                amount: migrated.donations.amount,
                name: 'Festival Support',
                addedAt: migrated.donations.updatedAt || Date.now()
            }];
        } else {
            // No donation amount, use empty array
            migrated.donations = [];
        }
    }

    // Ensure donations is array
    if (!Array.isArray(migrated.donations)) {
        migrated.donations = [];
    }

    return migrated;
}

/**
 * Clean invalid data from cart state
 * @param {Object} cartState - Cart state to clean
 * @returns {Object} Cleaned cart state
 */
export function cleanCartState(cartState) {
    if (!isValidCartState(cartState)) {
        return createInitialCartState();
    }

    const cleaned = { ...cartState };

    // Clean invalid tickets
    const validTickets = {};
    Object.entries(cleaned.tickets).forEach(([ticketType, ticket]) => {
        if (isValidTicket(ticket)) {
            validTickets[ticketType] = ticket;
        }
    });
    cleaned.tickets = validTickets;

    // Clean invalid donations
    cleaned.donations = cleaned.donations.filter(donation => isValidDonation(donation));

    // Update timestamp
    cleaned.metadata.updatedAt = Date.now();

    return cleaned;
}

/**
 * Validate individual ticket data
 * @param {Object} ticket - Ticket to validate
 * @returns {boolean} True if valid ticket
 */
export function isValidTicket(ticket) {
    if (!ticket || typeof ticket !== 'object') {
        return false;
    }

    const { ticketType, price, name, quantity } = ticket;

    return (
        typeof ticketType === 'string' && ticketType.length > 0 &&
    typeof price === 'number' && price > 0 &&
    typeof name === 'string' && name.length > 0 &&
    typeof quantity === 'number' && quantity > 0
    );
}

/**
 * Validate individual donation data
 * @param {Object} donation - Donation to validate
 * @returns {boolean} True if valid donation
 */
export function isValidDonation(donation) {
    if (!donation || typeof donation !== 'object') {
        return false;
    }

    const { id, amount, name } = donation;

    return (
        typeof id === 'string' && id.length > 0 &&
    typeof amount === 'number' && amount > 0 &&
    typeof name === 'string' && name.length > 0
    );
}

/**
 * Calculate cart state size in bytes (for storage limits)
 * @param {Object} cartState - Cart state
 * @returns {number} Size in bytes
 */
export function calculateCartStateSize(cartState) {
    try {
        const serialized = serializeCartState(cartState);
        return new Blob([serialized]).size;
    } catch (error) {
        return 0;
    }
}

/**
 * Check if cart state is within storage limits
 * @param {Object} cartState - Cart state
 * @param {number} maxSize - Maximum size in bytes (default: 5MB)
 * @returns {boolean} True if within limits
 */
export function isWithinStorageLimits(cartState, maxSize = 5 * 1024 * 1024) {
    return calculateCartStateSize(cartState) <= maxSize;
}

/**
 * Create cart state diff for debugging/logging
 * @param {Object} oldState - Previous cart state
 * @param {Object} newState - New cart state
 * @returns {Object} Diff object
 */
export function createCartStateDiff(oldState, newState) {
    const diff = {
        tickets: {
            added: [],
            updated: [],
            removed: []
        },
        donations: {
            added: [],
            removed: []
        },
        totalsChanged: false
    };

    // Check ticket changes
    const oldTicketTypes = Object.keys(oldState?.tickets || {});
    const newTicketTypes = Object.keys(newState?.tickets || {});

    // Find added tickets
    newTicketTypes.forEach(type => {
        if (!oldTicketTypes.includes(type)) {
            diff.tickets.added.push(type);
        } else {
            // Check for quantity updates
            const oldTicket = oldState.tickets[type];
            const newTicket = newState.tickets[type];
            if (oldTicket.quantity !== newTicket.quantity) {
                diff.tickets.updated.push({
                    type,
                    oldQuantity: oldTicket.quantity,
                    newQuantity: newTicket.quantity
                });
            }
        }
    });

    // Find removed tickets
    oldTicketTypes.forEach(type => {
        if (!newTicketTypes.includes(type)) {
            diff.tickets.removed.push(type);
        }
    });

    // Check donation changes (simple count comparison)
    const oldDonationCount = oldState?.donations?.length || 0;
    const newDonationCount = newState?.donations?.length || 0;

    if (newDonationCount > oldDonationCount) {
        diff.donations.added = Array(newDonationCount - oldDonationCount).fill('donation');
    } else if (newDonationCount < oldDonationCount) {
        diff.donations.removed = Array(oldDonationCount - newDonationCount).fill('donation');
    }

    // Check if any changes occurred
    diff.totalsChanged = (
        diff.tickets.added.length > 0 ||
    diff.tickets.updated.length > 0 ||
    diff.tickets.removed.length > 0 ||
    diff.donations.added.length > 0 ||
    diff.donations.removed.length > 0
    );

    return diff;
}