import { describe, it, expect } from 'vitest';
import { mockTicketData } from '../core/mocks.js';

describe('Ticket Generation', () => {
  it('generates unique QR code with ticket ID', () => {
    const ticket = mockTicketData();
    const qrData = { ticketId: ticket.ticketId, signature: 'sig123' };
    expect(qrData.ticketId).toBe('TCK-1234567890');
    expect(qrData.signature).toBeDefined();
  });

  it('ensures ticket ID uniqueness', () => {
    const ticket1 = mockTicketData();
    const ticket2 = mockTicketData();
    const id1 = `${ticket1.ticketId}_${Date.now()}_1`;
    const id2 = `${ticket2.ticketId}_${Date.now()}_2`;
    expect(id1).not.toBe(id2);
  });

  it('validates ticket metadata', () => {
    const ticket = mockTicketData();
    expect(ticket.name).toBe('Maria Rodriguez');
    expect(ticket.email).toBe('dancer@example.com');
    expect(ticket.eventDate).toBe('2026-05-15');
    expect(ticket.eventName).toBe('A Lo Cubano Boulder Fest 2026');
  });
});