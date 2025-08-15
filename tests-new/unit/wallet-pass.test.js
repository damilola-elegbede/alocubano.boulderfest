import { describe, it, expect } from 'vitest';
import { mockTicketData } from '../core/mocks.js';

describe('Wallet Pass Generation', () => {
  it('generates Apple Wallet pass', () => {
    const ticket = mockTicketData();
    const pass = {
      passTypeIdentifier: 'pass.com.alocubano.ticket',
      serialNumber: ticket.ticketId,
      eventName: ticket.eventName
    };
    expect(pass.serialNumber).toBe('TCK-1234567890');
    expect(pass.eventName).toContain('A Lo Cubano');
  });

  it('generates Google Wallet pass', () => {
    const ticket = mockTicketData();
    const pass = {
      id: ticket.ticketId,
      classId: 'alocubano_ticket_class',
      state: 'ACTIVE'
    };
    expect(pass.id).toBe('TCK-1234567890');
    expect(pass.state).toBe('ACTIVE');
  });
});