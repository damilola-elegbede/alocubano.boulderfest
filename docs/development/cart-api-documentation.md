# Cart Management System - API Documentation

This document provides comprehensive API documentation for the A Lo Cubano Boulder Fest cart management system.

## Architecture Overview

The cart system consists of three main components:

1. **CartManager** (`/js/lib/cart-manager.js`) - Core cart state management
2. **DonationSelection** (`/js/donation-selection.js`) - Donation interface handler  
3. **TicketSelection** (`/js/ticket-selection.js`) - Ticket interface handler

### Event-Driven Architecture

All components communicate via custom events dispatched on `document` and individual component instances.

## CartManager API

The `CartManager` class is the core state management system for cart operations.

### Constructor

```javascript
const cartManager = new CartManager();
```

**Features:**
- Extends `EventTarget` for custom event handling
- Automatically initializes storage coordination
- Sets up dual event dispatch (instance + document level)

### Public Methods

#### `updateTicketQuantity(ticketType, quantity)`

Updates or removes ticket quantities in the cart.

**Parameters:**
- `ticketType` (string) - Unique identifier for ticket type
- `quantity` (number) - New quantity (0 removes the ticket)

**Returns:** `Promise<void>`

**Events Emitted:**
- `cart:updated` - When cart state changes
- `cart:ticket:updated` - Specific to ticket changes

**Example:**
```javascript
await cartManager.updateTicketQuantity('early-bird-full', 2);
await cartManager.updateTicketQuantity('friday-pass', 0); // Removes ticket
```

#### `addTicket(ticketType, quantity, price, name, eventId)`

Adds tickets to the cart (incremental).

**Parameters:**
- `ticketType` (string) - Ticket identifier
- `quantity` (number) - Number to add
- `price` (number) - Price per ticket
- `name` (string) - Display name
- `eventId` (string) - Event identifier

**Example:**
```javascript
await cartManager.addTicket('early-bird-full', 1, 100, 'Early Bird Full Pass', 'alocubano-2026');
```

#### `addDonation(amount, type, metadata)`

Adds a donation to the cart.

**Parameters:**
- `amount` (number) - Donation amount
- `type` (string, optional) - Donation type ('general', 'scholarship', etc.)
- `metadata` (object, optional) - Additional donation info

**Events Emitted:**
- `cart:updated`
- `cart:donation:added`

**Example:**
```javascript
await cartManager.addDonation(50, 'scholarship', { message: 'Supporting students' });
```

#### `removeDonation(index)`

Removes a donation by index.

**Parameters:**
- `index` (number) - Index of donation to remove

**Example:**
```javascript
await cartManager.removeDonation(0); // Remove first donation
```

#### `clear()`

Clears all cart contents.

**Events Emitted:**
- `cart:cleared`
- `cart:updated`

**Example:**
```javascript
await cartManager.clear();
```

#### `getState()`

Returns current cart state (immutable copy).

**Returns:** `Object`
```javascript
{
  tickets: {
    'ticket-type': {
      quantity: number,
      price: number,
      name: string,
      eventId: string
    }
  },
  donations: [
    {
      amount: number,
      type: string,
      metadata: object,
      timestamp: number
    }
  ],
  total: number,
  itemCount: number
}
```

#### `emit(eventName, detail)`

Dispatches events on both the instance and document (dual dispatch fix).

**Parameters:**
- `eventName` (string) - Event name
- `detail` (any) - Event detail payload

**Example:**
```javascript
cartManager.emit('custom:event', { data: 'example' });
```

### Events

#### `cart:updated`
Fired whenever cart state changes.

**Detail:**
```javascript
{
  state: object,      // Current cart state
  change: string,     // Type of change ('ticket_added', 'donation_added', etc.)
  item: object        // Changed item details
}
```

#### `cart:initialized`
Fired when CartManager finishes initialization.

#### `cart:cleared`
Fired when cart is cleared.

#### `cart:ticket:added`, `cart:ticket:updated`, `cart:ticket:removed`
Fired for specific ticket operations.

#### `cart:donation:added`, `cart:donation:removed`
Fired for specific donation operations.

## DonationSelection API

Handles donation interface interactions.

### Constructor

```javascript
const donationSelection = new DonationSelection();
```

### Properties

- `selectedAmount` (number|string) - Currently selected amount or 'custom'
- `customAmount` (number|null) - Custom donation amount

### Public Methods

#### `handleDonationCardClick(event)`

Handles donation card selection with toggle behavior.

**Parameters:**
- `event` (Event) - Click event

**Features:**
- **Toggle Selection**: Click selected card to deselect
- **Custom Input**: Clicking custom card shows input field
- **Keyboard Support**: Enter/Space key support

#### `handleCustomAmountChange(event)`

Handles custom amount input changes.

**Parameters:**
- `event` (Event) - Input event

**Behavior:**
- Validates input (minimum $1)
- Reverts to "CUSTOM" display when empty
- Updates button state immediately

#### `handleDonate()`

Processes donation and adds to cart.

**Events Dispatched:**
- `donation-amount-changed` with `{ amount: number }`

**Features:**
- **Validation**: Ensures amount > 0
- **Cart Integration**: Dispatches event for cart system
- **UI Reset**: Clears form after successful addition
- **Celebration Animation**: Shows success feedback

#### `updateDisplay()`

Updates donate button text and state.

**Button States:**
- `"SELECT AMOUNT"` - When no amount selected
- `"ADD TO CART - $X"` - When amount selected
- Disabled when no valid amount

### Custom Events

#### `donation-amount-changed`
Dispatched when user confirms donation.

**Detail:**
```javascript
{ amount: number }
```

### HTML Structure Requirements

```html
<div class="donation-selection">
  <div class="donation-card" data-amount="20">
    <div class="donation-amount">$20</div>
  </div>
  <div class="donation-card" data-amount="custom">
    <div class="donation-amount">CUSTOM</div>
  </div>
</div>
<button id="donate-button">ADD TO CART</button>
```

## TicketSelection API

Handles ticket interface interactions.

### Constructor

```javascript
const ticketSelection = new TicketSelection();
```

### Properties

- `selectedTickets` (Map) - Currently selected tickets

### Public Methods

#### `async init()`

Initializes the ticket selection system.

**Features:**
- **Cart Manager Wait**: Waits for CartManager initialization
- **Event Binding**: Sets up all event listeners
- **State Sync**: Synchronizes with existing cart state

#### `async waitForCartManager()`

Waits for CartManager to be available.

**Returns:** `Promise<void>`

**Timeout:** 5 seconds (with warning)

#### `handleQuantityChange(event)`

Handles quantity button clicks.

**Parameters:**
- `event` (Event) - Click event from + or - button

**Features:**
- **Event Propagation**: Uses `stopPropagation()` to prevent card clicks
- **Quantity Validation**: Prevents negative quantities
- **Immediate Update**: Updates UI and cart state
- **Event Dispatch**: Fires `ticket-quantity-changed` event

#### `handleTicketCardClick(event)`

Handles clicking on ticket cards.

**Parameters:**
- `event` (Event) - Click event

**Behavior:**
- If quantity is 0, adds 1 ticket
- Ignores clicks on quantity buttons (via propagation stop)

#### `syncWithCartState()`

Synchronizes UI with cart localStorage state.

**Features:**
- **Parse Safety**: Handles corrupted localStorage gracefully
- **UI Update**: Updates all quantity displays
- **State Consistency**: Ensures UI matches cart state
- **ARIA Updates**: Maintains accessibility attributes

### Custom Events

#### `ticket-quantity-changed`
Dispatched when ticket quantities change.

**Detail:**
```javascript
{
  ticketType: string,
  quantity: number,
  price: number,
  name: string,
  eventId: string
}
```

### HTML Structure Requirements

```html
<div class="ticket-selection">
  <div class="ticket-card" data-ticket-type="early-bird-full" data-price="100">
    <h4>Early Bird Full Pass</h4>
    <div class="quantity-selector">
      <button class="qty-btn minus" data-action="decrease">-</button>
      <span class="quantity">0</span>
      <button class="qty-btn plus" data-action="increase">+</button>
    </div>
  </div>
</div>
```

## Integration Patterns

### Component Communication

All components communicate via events:

```javascript
// Donation to Cart
document.addEventListener('donation-amount-changed', (e) => {
  cartManager.addDonation(e.detail.amount);
});

// Ticket to Cart  
document.addEventListener('ticket-quantity-changed', (e) => {
  const { ticketType, quantity, price, name, eventId } = e.detail;
  cartManager.updateTicketQuantity(ticketType, quantity);
});

// Cart Updates
document.addEventListener('cart:updated', (e) => {
  updateCartUI(e.detail.state);
});
```

### State Persistence

Cart state is automatically persisted to `localStorage`:

```javascript
// Key: 'alocubano_cart'
// Value: JSON string of cart state
{
  tickets: {...},
  donations: [...],
  total: number,
  timestamp: number
}
```

### Cross-Tab Synchronization

Components listen for storage events:

```javascript
window.addEventListener('storage', (event) => {
  if (event.key === 'alocubano_cart') {
    syncWithCartState();
  }
});
```

## Error Handling

### Common Patterns

```javascript
// Safe localStorage access
let cartState = {};
try {
  const stored = localStorage.getItem('alocubano_cart');
  cartState = stored ? JSON.parse(stored) : {};
} catch (error) {
  console.warn('Failed to parse cart state:', error);
  cartState = { tickets: {}, donations: [], total: 0 };
}

// Safe event dispatch
try {
  document.dispatchEvent(new CustomEvent('cart:updated', { detail }));
} catch (error) {
  console.error('Event dispatch failed:', error);
}

// Safe DOM access
const element = document.querySelector('.cart-element');
if (element) {
  element.textContent = 'Updated';
}
```

### Error Events

```javascript
// Cart errors
document.addEventListener('cart:error', (e) => {
  console.error('Cart error:', e.detail);
  showUserFriendlyError('Cart operation failed. Please try again.');
});
```

## Testing Integration

### Unit Testing

```javascript
// Mock CartManager for testing
const mockCartManager = {
  updateTicketQuantity: vi.fn(),
  addDonation: vi.fn(),
  clear: vi.fn(),
  getState: vi.fn(() => ({ tickets: {}, donations: [], total: 0 }))
};

window.cartManager = mockCartManager;
```

### Integration Testing

```javascript
// Test event flow
const ticketSelection = new TicketSelection();
const cartUpdatedSpy = vi.fn();

document.addEventListener('cart:updated', cartUpdatedSpy);

// Simulate ticket addition
ticketSelection.handleQuantityChange(mockEvent);

expect(cartUpdatedSpy).toHaveBeenCalled();
```

## Performance Considerations

### Event Throttling

For rapid interactions:

```javascript
let updateTimeout;
function throttledUpdate() {
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    updateCartUI();
  }, 100);
}
```

### Memory Management

```javascript
// Clean up event listeners
class Component {
  destroy() {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
  }
}
```

## CSS Classes and Styling

### Required CSS Classes

```css
/* Donation Selection */
.donation-selection { /* Container */ }
.donation-card { /* Individual donation options */ }
.donation-card.selected { /* Selected state */ }
.custom-amount-wrapper { /* Custom input wrapper - FIX */ }
.dollar-sign { /* Dollar sign in custom input */ }
.custom-amount-input { /* Custom amount input field */ }

/* Ticket Selection */
.ticket-selection { /* Container */ }
.ticket-card { /* Individual ticket cards */ }
.ticket-card.selected { /* Selected state */ }
.quantity-selector { /* Quantity controls container */ }
.qty-btn { /* Quantity buttons */ }
.quantity { /* Quantity display */ }

/* Cart UI */
.floating-cart-container { /* Main cart container */ }
.cart-header h3 { /* "Your Cart" - 24px font */ }
.cart-category-header { /* Category headers - 18px font */ }
.cart-close { /* Close button - no border */ }
.cart-clear-btn { /* Clear cart button */ }
```

## Browser Compatibility

### Supported Features

- **ES6 Classes**: Required
- **Custom Events**: Required
- **Local Storage**: Required
- **Event Target**: Required (polyfill for IE11)
- **Map**: Required (polyfill for IE11)

### Polyfills Needed

For IE11 support:
```javascript
// Custom Event polyfill
// Map polyfill
// Promise polyfill
```

## Debugging

### Debug Mode

Enable debug logging:

```javascript
window.cartDebug = true;

// Provides access to:
window.cartDebug.getState() // Current cart state
window.cartDebug.clearCache() // Clear all caches
window.cartDebug.getCacheStats() // Cache statistics
```

### Common Issues

1. **Cart not showing**: Check `display` property and event dispatch
2. **Quantities jumping**: Verify mathematical operations use absolute values
3. **Sync issues**: Check localStorage and event propagation
4. **Custom input styling**: Verify wrapper structure and CSS

---

## Migration Guide

### From Previous Version

If upgrading from an older cart system:

1. **Update Event Names**: Use new event naming convention
2. **Check CSS Classes**: Verify all required classes exist
3. **Test Typography**: Ensure font sizes match specification
4. **Validate Integration**: Test all component interactions

### Breaking Changes

- Event names changed to use `cart:` prefix
- Custom donation input requires new HTML structure
- CartManager API methods now return Promises

---

*API Documentation v1.1 - Updated August 2025*