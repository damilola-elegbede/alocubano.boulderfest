/**
 * Tests for encryption-key API endpoint
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock environment variable
const MOCK_SECRET = 'test-secret-key-for-encryption-testing-32chars';

describe('api/checkout/encryption-key', () => {
    let handler;
    let originalEnv;

    beforeEach(async () => {
        // Save original env
        originalEnv = process.env.ATTENDEE_ENCRYPTION_SECRET;
        process.env.ATTENDEE_ENCRYPTION_SECRET = MOCK_SECRET;

        // Clear module cache and reimport
        vi.resetModules();
        const module = await import('../../../../api/checkout/encryption-key.js');
        handler = module.default;
    });

    afterEach(() => {
        // Restore original env
        if (originalEnv !== undefined) {
            process.env.ATTENDEE_ENCRYPTION_SECRET = originalEnv;
        } else {
            delete process.env.ATTENDEE_ENCRYPTION_SECRET;
        }
        vi.clearAllMocks();
    });

    function createMockRequest(options = {}) {
        return {
            method: options.method || 'GET',
            query: options.query || {},
            headers: options.headers || { 'x-forwarded-for': '127.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
        };
    }

    function createMockResponse() {
        const res = {
            statusCode: 200,
            body: null,
            headers: {},
            status: vi.fn(function (code) {
                this.statusCode = code;
                return this;
            }),
            json: vi.fn(function (data) {
                this.body = data;
                return this;
            }),
            setHeader: vi.fn(function (name, value) {
                this.headers[name] = value;
            }),
        };
        return res;
    }

    describe('HTTP Methods', () => {
        it('should return 405 for POST requests', async () => {
            const req = createMockRequest({ method: 'POST' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(405);
            expect(res.body.error).toBe('Method not allowed');
        });

        it('should return 405 for PUT requests', async () => {
            const req = createMockRequest({ method: 'PUT' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(405);
        });

        it('should accept GET requests', async () => {
            const req = createMockRequest({ method: 'GET' });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Key Derivation', () => {
        it('should return a base64-encoded key', async () => {
            const req = createMockRequest({
                query: { sessionId: 'test-session-123' },
            });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.body.key).toBeDefined();
            expect(typeof res.body.key).toBe('string');
            // Base64 characters only
            expect(res.body.key).toMatch(/^[A-Za-z0-9+/=]+$/);
        });

        it('should return the same key for the same sessionId', async () => {
            const sessionId = 'consistent-session';

            const req1 = createMockRequest({ query: { sessionId } });
            const res1 = createMockResponse();
            await handler(req1, res1);

            const req2 = createMockRequest({ query: { sessionId } });
            const res2 = createMockResponse();
            await handler(req2, res2);

            expect(res1.body.key).toBe(res2.body.key);
        });

        it('should return different keys for different sessionIds', async () => {
            const req1 = createMockRequest({ query: { sessionId: 'session-a' } });
            const res1 = createMockResponse();
            await handler(req1, res1);

            const req2 = createMockRequest({ query: { sessionId: 'session-b' } });
            const res2 = createMockResponse();
            await handler(req2, res2);

            expect(res1.body.key).not.toBe(res2.body.key);
        });

        it('should generate a sessionId if not provided', async () => {
            const req = createMockRequest({ query: {} });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.sessionId.length).toBeGreaterThan(0);
        });
    });

    describe('Response Structure', () => {
        it('should return key, sessionId, expiresIn, and algorithm', async () => {
            const req = createMockRequest({
                query: { sessionId: 'test-session' },
            });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.body).toHaveProperty('key');
            expect(res.body).toHaveProperty('sessionId', 'test-session');
            expect(res.body).toHaveProperty('expiresIn', 3600);
            expect(res.body).toHaveProperty('algorithm', 'AES-256-GCM');
        });
    });

    describe('Input Validation', () => {
        it('should reject sessionId with invalid characters', async () => {
            const req = createMockRequest({
                query: { sessionId: '<script>alert("xss")</script>' },
            });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.body.error).toBe('Invalid session ID format');
        });

        it('should reject sessionId that is too long', async () => {
            const req = createMockRequest({
                query: { sessionId: 'a'.repeat(200) },
            });
            const res = createMockResponse();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should accept valid sessionId formats', async () => {
            const validIds = [
                'simple-id',
                'session_123',
                'abc-123-def-456',
                'UUID-like-1234-5678',
            ];

            for (const sessionId of validIds) {
                const req = createMockRequest({ query: { sessionId } });
                const res = createMockResponse();

                await handler(req, res);

                expect(res.status).toHaveBeenCalledWith(200);
            }
        });
    });

    describe('Error Handling', () => {
        it('should return 500 if ATTENDEE_ENCRYPTION_SECRET is not configured', async () => {
            delete process.env.ATTENDEE_ENCRYPTION_SECRET;

            // Re-import to pick up missing env var
            vi.resetModules();
            const module = await import('../../../../api/checkout/encryption-key.js');
            const freshHandler = module.default;

            const req = createMockRequest({ query: { sessionId: 'test' } });
            const res = createMockResponse();

            await freshHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.body.error).toBe('Encryption service not configured');
        });
    });
});
