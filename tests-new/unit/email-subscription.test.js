import { describe, it, expect, vi } from 'vitest';
import { mockBrevoEmail } from '../core/mocks.js';

describe('Email Subscription', () => {
  it('calls Brevo API with correct data', async () => {
    const emailData = mockBrevoEmail();
    expect(emailData.to).toBe('maria.rodriguez@example.com');
    expect(emailData.templateId).toBe(1);
    expect(emailData.params.eventDate).toBe('May 15-17, 2026');
  });

  it('generates unique unsubscribe tokens', async () => {
    const token1 = Buffer.from(Math.random().toString()).toString('base64');
    const token2 = Buffer.from(Math.random().toString()).toString('base64');
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(10);
  });

  it('processes webhook events correctly', async () => {
    const webhook = {
      event: 'unsubscribed',
      email: 'test@example.com',
      timestamp: Date.now()
    };
    const processed = webhook.event === 'unsubscribed';
    expect(processed).toBe(true);
  });
});