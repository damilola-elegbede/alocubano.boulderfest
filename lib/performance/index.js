/**
 * Performance Module Index
 * Entry point for database query optimization system
 */

export {
  default as QueryOptimizer,
  createQueryOptimizer,
  withQueryOptimization,
} from "./query-optimizer.js";
export {
  default as DatabasePerformanceService,
  getDatabasePerformanceService,
  initializePerformanceMonitoring,
} from "./database-performance-service.js";
export { default as FestivalQueryOptimizer } from "./festival-query-optimizer.js";

// Re-export main initialization function
export { initializePerformanceMonitoring as initializePerformanceSystem } from "./database-performance-service.js";

/**
 * Quick setup function for the entire performance system
 */
export async function setupPerformanceOptimization() {
  const { initializePerformanceMonitoring } = await import(
    "./database-performance-service.js"
  );
  return initializePerformanceMonitoring();
}
