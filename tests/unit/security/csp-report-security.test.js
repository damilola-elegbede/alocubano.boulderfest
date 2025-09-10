/**
 * CSP Report Security Validation Tests
 * Tests the security fixes for content-type validation and size limits
 */

import { describe, it, expect, vi } from "vitest";

// Mock request/response objects for testing
function createMockRequest(options = {}) {
  const req = {
    method: options.method || "POST",
    headers: options.headers || {},
    on: vi.fn(),
    destroy: vi.fn(),
    connection: { remoteAddress: "127.0.0.1" },
  };

  // Set up event handling for data/end/error/close
  const eventHandlers = {};
  req.on.mockImplementation((event, handler) => {
    eventHandlers[event] = handler;
  });

  // Add helper to simulate request events
  req._triggerEvent = (event, data) => {
    if (eventHandlers[event]) {
      eventHandlers[event](data);
    }
  };

  return req;
}

function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(() => undefined),
    removeHeader: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
  };
  return res;
}

describe("CSP Report Security Validation", () => {
  describe("Content-Type Validation", () => {
    it("should accept application/csp-report content-type", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      // Import the handler dynamically to avoid module loading issues
      const { default: handler } = await import("../../../api/security/csp-report.js");

      // Simulate proper CSP report data flow
      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
        },
      });

      // Start the handler
      const handlerPromise = handler(req, res);

      // Simulate data chunks
      req._triggerEvent("data", Buffer.from(reportData));
      req._triggerEvent("end");

      await handlerPromise;

      // Should not return 415 error
      expect(res.status).not.toHaveBeenCalledWith(415);
    });

    it("should accept application/json content-type", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
        },
      });

      const handlerPromise = handler(req, res);
      req._triggerEvent("data", Buffer.from(reportData));
      req._triggerEvent("end");

      await handlerPromise;

      expect(res.status).not.toHaveBeenCalledWith(415);
    });

    it("should reject invalid content-type with 415", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "text/plain" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          type: "UnsupportedMediaType",
          message: "Content-Type must be application/csp-report or application/json",
          supportedTypes: ["application/csp-report", "application/json"],
        },
      });
    });

    it("should reject missing content-type with 415", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: {},
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(415);
    });

    it("should handle content-type with charset parameter", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
        },
      });

      const handlerPromise = handler(req, res);
      req._triggerEvent("data", Buffer.from(reportData));
      req._triggerEvent("end");

      await handlerPromise;

      expect(res.status).not.toHaveBeenCalledWith(415);
    });
  });

  describe("Size Limit Validation", () => {
    it("should accept requests under 10KB limit", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      // Create a report under 10KB (roughly 5KB)
      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
          "original-policy": "a".repeat(5000), // ~5KB policy
        },
      });

      const handlerPromise = handler(req, res);
      req._triggerEvent("data", Buffer.from(reportData));
      req._triggerEvent("end");

      await handlerPromise;

      expect(res.status).not.toHaveBeenCalledWith(413);
      expect(req.destroy).not.toHaveBeenCalled();
    });

    it("should reject requests over 10KB limit with 413", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      // Send data that exceeds 10KB limit
      const largeChunk = Buffer.alloc(11 * 1024); // 11KB
      req._triggerEvent("data", largeChunk);

      // Wait for async processing with proper timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          type: "PayloadTooLarge",
          message: "Request body exceeds maximum size of 10240 bytes",
          maxSize: 10240,
          receivedSize: 11264,
        },
      });
      expect(req.destroy).toHaveBeenCalled();

      // Trigger close event to complete the promise
      req._triggerEvent("close");

      // Complete the handler
      await handlerPromise.catch(() => {}); // Ignore errors for this test
    }, 5000); // 5 second timeout for this specific test

    it("should destroy request immediately when size limit exceeded", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      // Send first chunk under limit
      req._triggerEvent("data", Buffer.alloc(5 * 1024)); // 5KB
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(req.destroy).not.toHaveBeenCalled();

      // Send second chunk that exceeds limit
      req._triggerEvent("data", Buffer.alloc(6 * 1024)); // 6KB (total 11KB)
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(req.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(413);

      // Trigger close event to complete the promise
      req._triggerEvent("close");

      // Complete the handler
      await handlerPromise.catch(() => {});
    }, 5000); // 5 second timeout for this specific test

    it("should handle incremental data chunks correctly", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
        },
      });

      const handlerPromise = handler(req, res);

      // Send data in small chunks
      const chunks = [];
      const chunkSize = 100;
      for (let i = 0; i < reportData.length; i += chunkSize) {
        chunks.push(reportData.slice(i, i + chunkSize));
      }

      chunks.forEach(chunk => {
        req._triggerEvent("data", Buffer.from(chunk));
      });
      req._triggerEvent("end");

      await handlerPromise;

      expect(req.destroy).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(413);
    });
  });

  describe("Request Stream Handling", () => {
    it("should handle request close event properly", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      // Trigger large data and then close event
      req._triggerEvent("data", Buffer.alloc(11 * 1024)); // Exceeds limit
      await new Promise(resolve => setTimeout(resolve, 10));
      req._triggerEvent("close");

      await handlerPromise.catch(() => {});

      expect(req.destroy).toHaveBeenCalled();
    });

    it("should handle request error gracefully", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      req._triggerEvent("data", Buffer.from('{"csp-report": {'));
      req._triggerEvent("error", new Error("Connection reset"));

      await handlerPromise.catch(() => {});

      // Error handling may result in 400 or 500 depending on the error type
      expect([400, 500]).toContain(res.status.mock.calls[0]?.[0]);
    });

    it("should prevent race conditions in request handling", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      // Simulate rapid data/close events
      req._triggerEvent("data", Buffer.alloc(11 * 1024)); // Exceeds limit
      await new Promise(resolve => setTimeout(resolve, 5));
      req._triggerEvent("data", Buffer.from("more data")); // Should be ignored
      req._triggerEvent("close");
      req._triggerEvent("end"); // Should be handled gracefully

      await handlerPromise.catch(() => {});

      expect(req.destroy).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(413);
    });
  });

  describe("Security Edge Cases", () => {
    it("should handle malformed content-type headers", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/" }, // Malformed
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(415);
    });

    it("should handle case-insensitive content-type matching", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "Content-Type": "APPLICATION/JSON" }, // Different case
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const reportData = JSON.stringify({
        "csp-report": {
          "document-uri": "https://example.com",
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://malicious.com/script.js",
        },
      });

      const handlerPromise = handler(req, res);
      req._triggerEvent("data", Buffer.from(reportData));
      req._triggerEvent("end");

      await handlerPromise;

      expect(res.status).not.toHaveBeenCalledWith(415);
    });

    it("should prevent memory exhaustion attacks", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { "content-type": "application/csp-report" },
      });
      const res = createMockResponse();

      const { default: handler } = await import("../../../api/security/csp-report.js");

      const handlerPromise = handler(req, res);

      // Send chunks that accumulate to exceed the limit
      let totalSent = 0;
      const maxAttempts = 15; // Limit attempts to prevent infinite loops
      let attempts = 0;
      
      while (totalSent < 12000 && attempts < maxAttempts) { // 12KB total
        req._triggerEvent("data", Buffer.alloc(1000)); // 1KB chunks
        totalSent += 1000;
        attempts++;
        
        // Add small delay for async processing
        await new Promise(resolve => setTimeout(resolve, 5));
        
        if (req.destroy.mock.calls.length > 0) {
          break; // Request was destroyed due to size limit
        }
      }

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(req.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(413);

      // Trigger close event to complete the promise
      req._triggerEvent("close");

      // Complete the handler
      await handlerPromise.catch(() => {});
    }, 8000); // Reduced timeout but still sufficient
  });
});