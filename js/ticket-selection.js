/**
 * Ticket Selection and Dynamic Pricing
 * Handles ticket selection, quantity management, and price calculation
 */

class TicketSelection {
  constructor() {
    this.selectedTickets = new Map();
    this.init();
  }

  init() {
    this.bindEvents();
    this.updateDisplay();
  }

  bindEvents() {
    // Quantity button events
    document.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleQuantityChange(e));
    });

    // Ticket card click events
    document.querySelectorAll('.ticket-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('qty-btn')) {
          this.handleTicketCardClick(e);
        }
      });
    });

    // Checkout button
    const checkoutBtn = document.getElementById('checkout-button');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => this.handleCheckout());
    }
  }

  handleQuantityChange(event) {
    event.stopPropagation();
    const btn = event.target;
    const card = btn.closest('.ticket-card');
    const ticketType = card.dataset.ticketType;
    const price = parseInt(card.dataset.price);
    const action = btn.dataset.action;
    const quantitySpan = card.querySelector('.quantity');
    
    let currentQuantity = parseInt(quantitySpan.textContent) || 0;
    
    if (action === 'increase') {
      currentQuantity++;
    } else if (action === 'decrease' && currentQuantity > 0) {
      currentQuantity--;
    }
    
    quantitySpan.textContent = currentQuantity;
    
    if (currentQuantity > 0) {
      this.selectedTickets.set(ticketType, {
        quantity: currentQuantity,
        price: price,
        name: card.querySelector('h3').textContent
      });
      card.classList.add('selected');
    } else {
      this.selectedTickets.delete(ticketType);
      card.classList.remove('selected');
    }
    
    this.updateDisplay();
  }

  handleTicketCardClick(event) {
    const card = event.currentTarget;
    const quantitySpan = card.querySelector('.quantity');
    const currentQuantity = parseInt(quantitySpan.textContent) || 0;
    
    if (currentQuantity === 0) {
      // Add one ticket
      const plusBtn = card.querySelector('.qty-btn.plus');
      plusBtn.click();
    }
  }

  updateDisplay() {
    const totalQuantityEl = document.getElementById('total-quantity');
    const totalAmountEl = document.getElementById('total-amount');
    const finalTotalEl = document.getElementById('final-total');
    const checkoutBtn = document.getElementById('checkout-button');
    
    let totalQuantity = 0;
    let totalAmount = 0;
    
    this.selectedTickets.forEach(ticket => {
      totalQuantity += ticket.quantity;
      totalAmount += ticket.quantity * ticket.price;
    });
    
    if (totalQuantityEl) totalQuantityEl.textContent = totalQuantity;
    if (totalAmountEl) totalAmountEl.textContent = totalAmount;
    if (finalTotalEl) finalTotalEl.textContent = totalAmount;
    
    if (checkoutBtn) {
      checkoutBtn.disabled = totalQuantity === 0;
    }
  }

  handleCheckout() {
    if (this.selectedTickets.size === 0) return;
    
    // For now, log the selection (later integrate with payment processor)
    console.log('Checkout initiated with:', Array.from(this.selectedTickets.entries()));
    
    // Simulate checkout process
    alert('Checkout functionality will be integrated with payment processor. Selected tickets logged to console.');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.ticket-selection')) {
    new TicketSelection();
  }
});