// Minimal global setup - will replace complex orchestration
import { vi } from "vitest";

// Set test environment
process.env.NODE_ENV = "test";
process.env.TURSO_DATABASE_URL = ":memory:";

// Simple fetch mock
global.fetch = vi.fn();

// Global cleanup
afterEach(() => {
  vi.clearAllMocks();

  // Reset environment changes
  process.env.NODE_ENV = "test";
  process.env.TURSO_DATABASE_URL = ":memory:";
});
