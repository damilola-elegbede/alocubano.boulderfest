import { describe, it, expect } from 'vitest';

describe('Cart Calculations', () => {
  it('calculates correct total price', () => {
    const cart = [
      { price: 140, quantity: 2 },
      { price: 50, quantity: 1 }
    ];
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    expect(total).toBe(330);
  });

  it('applies early bird discount correctly', () => {
    const price = 140;
    const earlyBirdDiscount = 0.15;
    const discounted = price * (1 - earlyBirdDiscount);
    expect(discounted).toBe(119);
  });

  it('calculates tax correctly', () => {
    const subtotal = 330;
    const taxRate = 0.08;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    expect(tax).toBe(26.40);
  });
});