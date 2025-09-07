import { describe, it, expect } from "vitest";

describe("Admin Events API", () => {

  describe("Event ID validation", () => {
    it("should validate event IDs correctly", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      // Valid event IDs
      expect(validator.validateEventId("event-2026")).toEqual({ isValid: true });
      expect(validator.validateEventId("boulderfest-2026")).toEqual({ isValid: true });
      expect(validator.validateEventId("cubano.fest.2026")).toEqual({ isValid: true });

      // Invalid event IDs
      expect(validator.validateEventId("")).toEqual({ isValid: true }); // Optional
      expect(validator.validateEventId("event with spaces")).toEqual({ 
        isValid: false, 
        error: "Event ID contains invalid characters" 
      });
      expect(validator.validateEventId("a".repeat(101))).toEqual({ 
        isValid: false, 
        error: "Invalid event ID format" 
      });
    });

    it("should validate null and undefined event IDs", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      expect(validator.validateEventId(null)).toEqual({ isValid: true });
      expect(validator.validateEventId(undefined)).toEqual({ isValid: true });
    });

    it("should validate non-string event IDs", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      expect(validator.validateEventId(123)).toEqual({ 
        isValid: false, 
        error: "Event ID must be a string" 
      });
      expect(validator.validateEventId({})).toEqual({ 
        isValid: false, 
        error: "Event ID must be a string" 
      });
    });
  });

  describe("Registration search parameter validation", () => {
    it("should include eventId in registration search validation", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      const params = {
        search: "test",
        eventId: "boulderfest-2026",
        limit: 10,
        offset: 0
      };

      const result = validator.validateRegistrationSearchParams(params);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized.eventId).toBe("boulderfest-2026");
    });

    it("should handle missing eventId in registration search", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      const params = {
        search: "test",
        limit: 10,
        offset: 0
      };

      const result = validator.validateRegistrationSearchParams(params);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitized.eventId).toBeUndefined();
    });

    it("should reject invalid eventId in registration search", async () => {
      const { getValidationService } = await import("../../api/lib/validation-service.js");
      const validator = getValidationService();

      const params = {
        search: "test",
        eventId: "invalid event id with spaces",
        limit: 10,
        offset: 0
      };

      const result = validator.validateRegistrationSearchParams(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Event ID contains invalid characters");
    });
  });

  describe("API endpoint imports", () => {
    it("should successfully import events API handler", async () => {
      const eventsHandler = await import("../../api/admin/events.js");
      expect(typeof eventsHandler.default).toBe("function");
    });

    it("should successfully import updated dashboard API handler", async () => {
      const dashboardHandler = await import("../../api/admin/dashboard.js");
      expect(typeof dashboardHandler.default).toBe("function");
    });

    it("should successfully import updated registrations API handler", async () => {
      const registrationsHandler = await import("../../api/admin/registrations.js");
      expect(typeof registrationsHandler.default).toBe("function");
    });
  });
});