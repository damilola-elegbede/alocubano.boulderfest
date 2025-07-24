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

    // Ticket card click events and keyboard accessibility
    document.querySelectorAll('.ticket-card').forEach(card => {
      // Make cards keyboard accessible
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
      
      // Click events
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('qty-btn')) {
          this.handleTicketCardClick(e);
        }
      });
      
      // Keyboard events for accessibility
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.target.classList.contains('qty-btn')) {
            this.handleTicketCardClick(e);
          }
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
        name: card.querySelector('h4').textContent
      });
      card.classList.add('selected');
      card.setAttribute('aria-pressed', 'true');
    } else {
      this.selectedTickets.delete(ticketType);
      card.classList.remove('selected');
      card.setAttribute('aria-pressed', 'false');
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
    const orderItemsEl = document.getElementById('order-items');
    const finalTotalEl = document.getElementById('final-total');
    const checkoutBtn = document.getElementById('checkout-button');
    
    let totalAmount = 0;
    
    // Clear existing order items
    if (orderItemsEl) {
      orderItemsEl.innerHTML = '';
    }
    
    // Add each selected ticket to order summary
    this.selectedTickets.forEach((ticket, ticketType) => {
      const itemAmount = ticket.quantity * ticket.price;
      totalAmount += itemAmount;
      
      if (orderItemsEl) {
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.innerHTML = `
          <span>${ticket.name} × ${ticket.quantity}</span>
          <span>$${itemAmount}</span>
        `;
        orderItemsEl.appendChild(orderItem);
      }
    });
    
    if (finalTotalEl) finalTotalEl.textContent = totalAmount;
    
    if (checkoutBtn) {
      checkoutBtn.disabled = totalAmount === 0;
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