import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import webhookHandler from '../../api/email/brevo-webhook.js';

// Create persistent mock service instances
const mockEmailService = {
    processWebhookEvent: vi.fn()
};

const mockBrevoService = {
    validateWebhookSignature: vi.fn()
};

// Mock the services
vi.mock('../../api/lib/email-subscriber-service.js', () => ({
    getEmailSubscriberService: vi.fn(() => mockEmailService)
}));

vi.mock('../../api/lib/brevo-service.js', () => ({
    getBrevoService: vi.fn(() => mockBrevoService)
}));

describe('Brevo Webhook Integration Tests', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        delete process.env.BREVO_WEBHOOK_SECRET;
    });
    
    // Helper function to create webhook request
    function createWebhookRequest(webhookData, signature = null) {
        const body = JSON.stringify(webhookData);
        const headers = {};
        
        if (signature) {
            headers['x-brevo-signature'] = signature;
        }
        
        const mocks = createMocks({
            method: 'POST',
            headers,
            body
        });
        
        // Mock the request methods for getRawBody
        mocks.req.setEncoding = vi.fn();
        mocks.req.on = vi.fn((event, callback) => {
            if (event === 'data') {
                callback(body);
            } else if (event === 'end') {
                callback();
            }
        });
        
        return mocks;
    }
    
    describe('POST /api/email/brevo-webhook', () => {
        it('should process valid webhook event', async () => {
            const webhookData = {
                event: 'delivered',
                email: 'test@example.com',
                date: '2024-01-30T10:00:00Z',
                messageId: 'msg-123'
            };
            
            const processedEvent = {
                eventType: 'delivered',
                email: 'test@example.com',
                occurredAt: '2024-01-30T10:00:00.000Z',
                data: { messageId: 'msg-123' }
            };
            
            mockEmailService.processWebhookEvent.mockResolvedValue(processedEvent);
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(200);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.success).toBe(true);
            expect(responseData.message).toBe('Email delivery recorded');
            expect(responseData.event).toEqual(processedEvent);
            
            expect(mockEmailService.processWebhookEvent).toHaveBeenCalledWith(webhookData);
        });
        
        it('should validate webhook signature when secret is configured', async () => {
            process.env.BREVO_WEBHOOK_SECRET = 'test-secret';
            
            const webhookData = {
                event: 'opened',
                email: 'test@example.com',
                date: '2024-01-30T10:00:00Z'
            };
            
            const processedEvent = {
                eventType: 'opened',
                email: 'test@example.com'
            };
            
            mockBrevoService.validateWebhookSignature.mockReturnValue(true);
            mockEmailService.processWebhookEvent.mockResolvedValue(processedEvent);
            
            const { req, res } = createWebhookRequest(webhookData, 'valid-signature');
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(200);
            expect(mockBrevoService.validateWebhookSignature).toHaveBeenCalled();
        });
        
        it('should reject webhook with invalid signature', async () => {
            process.env.BREVO_WEBHOOK_SECRET = 'test-secret';
            
            const webhookData = {
                event: 'opened',
                email: 'test@example.com'
            };
            
            mockBrevoService.validateWebhookSignature.mockReturnValue(false);
            
            const { req, res } = createWebhookRequest(webhookData, 'invalid-signature');
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(401);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.error).toBe('Invalid signature');
        });
        
        it('should reject webhook without signature when secret is configured', async () => {
            process.env.BREVO_WEBHOOK_SECRET = 'test-secret';
            
            const webhookData = {
                event: 'opened',
                email: 'test@example.com'
            };
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(401);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.error).toBe('Missing webhook signature');
        });
        
        it('should handle different event types with appropriate messages', async () => {
            const eventTests = [
                { event: 'delivered', expectedMessage: 'Email delivery recorded' },
                { event: 'opened', expectedMessage: 'Email open recorded' },
                { event: 'clicked', expectedMessage: 'Email click recorded' },
                { event: 'unsubscribed', expectedMessage: 'Unsubscribe processed' },
                { event: 'soft_bounce', expectedMessage: 'Soft bounce recorded' },
                { event: 'hard_bounce', expectedMessage: 'Hard bounce processed, contact marked as bounced' },
                { event: 'spam', expectedMessage: 'Spam complaint processed, contact marked as bounced' },
                { event: 'invalid_email', expectedMessage: 'Invalid email processed, contact marked as bounced' },
                { event: 'unknown_event', expectedMessage: 'Unknown event type processed: unknown_event' }
            ];
            
            for (const test of eventTests) {
                const webhookData = {
                    event: test.event,
                    email: 'test@example.com',
                    date: '2024-01-30T10:00:00Z'
                };
                
                const processedEvent = {
                    eventType: test.event,
                    email: 'test@example.com'
                };
                
                mockEmailService.processWebhookEvent.mockResolvedValue(processedEvent);
                
                const { req, res } = createWebhookRequest(webhookData);
                
                await webhookHandler(req, res);
                
                expect(res._getStatusCode()).toBe(200);
                
                const responseData = JSON.parse(res._getData());
                expect(responseData.message).toBe(test.expectedMessage);
                
                vi.clearAllMocks();
            }
        });
        
        it('should handle subscriber not found gracefully', async () => {
            const webhookData = {
                event: 'opened',
                email: 'notfound@example.com',
                date: '2024-01-30T10:00:00Z'
            };
            
            mockEmailService.processWebhookEvent.mockResolvedValue(null);
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(200);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.success).toBe(true);
            expect(responseData.message).toBe('Webhook processed (subscriber not found)');
        });
        
        it('should reject non-POST methods', async () => {
            const { req, res } = createMocks({
                method: 'GET'
            });
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(405);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.error).toBe('Method not allowed. Use POST.');
        });
        
        it('should reject malformed JSON payload', async () => {
            const invalidJson = 'invalid-json';
            const headers = {};
            
            const mocks = createMocks({
                method: 'POST',
                headers,
                body: invalidJson
            });
            
            // Mock the request methods for getRawBody to return invalid JSON
            mocks.req.setEncoding = vi.fn();
            mocks.req.on = vi.fn((event, callback) => {
                if (event === 'data') {
                    callback(invalidJson);
                } else if (event === 'end') {
                    callback();
                }
            });
            
            const originalConsole = console.error;
            console.error = vi.fn();
            
            await webhookHandler(mocks.req, mocks.res);
            
            expect(mocks.res._getStatusCode()).toBe(400);
            
            const responseData = JSON.parse(mocks.res._getData());
            expect(responseData.error).toBe('Invalid JSON payload');
            
            console.error = originalConsole;
        });
        
        it('should reject webhook missing required fields', async () => {
            const webhookData = {
                // Missing event and email fields
                date: '2024-01-30T10:00:00Z'
            };
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(400);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.error).toBe('Missing required webhook fields (event, email)');
        });
        
        it('should handle processing errors gracefully', async () => {
            const webhookData = {
                event: 'opened',
                email: 'test@example.com',
                date: '2024-01-30T10:00:00Z'
            };
            
            mockEmailService.processWebhookEvent.mockRejectedValue(
                new Error('Database connection failed')
            );
            
            const originalConsole = console.error;
            console.error = vi.fn();
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(res._getStatusCode()).toBe(500);
            
            const responseData = JSON.parse(res._getData());
            expect(responseData.error).toBe('Internal server error processing webhook');
            
            console.error = originalConsole;
        });
        
        it('should log webhook processing details', async () => {
            const webhookData = {
                event: 'delivered',
                email: 'test@example.com',
                date: '2024-01-30T10:00:00Z'
            };
            
            const processedEvent = {
                eventType: 'delivered',
                email: 'test@example.com'
            };
            
            mockEmailService.processWebhookEvent.mockResolvedValue(processedEvent);
            
            const originalConsole = console.log;
            console.log = vi.fn();
            
            const { req, res } = createWebhookRequest(webhookData);
            
            await webhookHandler(req, res);
            
            expect(console.log).toHaveBeenCalledWith(
                'Processing Brevo webhook:',
                expect.objectContaining({
                    event: 'delivered',
                    email: 'test@example.com',
                    timestamp: '2024-01-30T10:00:00Z'
                })
            );
            
            console.log = originalConsole;
        });
        
        it('should handle bounce events specifically', async () => {
            const bounceEvents = ['hard_bounce', 'spam', 'invalid_email'];
            
            for (const eventType of bounceEvents) {
                const webhookData = {
                    event: eventType,
                    email: 'test@example.com',
                    date: '2024-01-30T10:00:00Z'
                };
                
                const processedEvent = {
                    eventType,
                    email: 'test@example.com'
                };
                
                mockEmailService.processWebhookEvent.mockResolvedValue(processedEvent);
                
                const { req, res } = createWebhookRequest(webhookData);
                
                await webhookHandler(req, res);
                
                expect(res._getStatusCode()).toBe(200);
                
                const responseData = JSON.parse(res._getData());
                expect(responseData.message).toContain('bounced');
                
                vi.clearAllMocks();
            }
        });
    });
});