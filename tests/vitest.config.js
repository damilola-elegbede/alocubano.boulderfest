/**
 * Main Vitest Configuration - Delegates to Unit Test Config
 * This maintains backward compatibility while supporting the three-layer test pyramid
 */
import unitConfig from './config/vitest.unit.config.js';

/**
 * Default configuration delegates to optimized unit test configuration
 * This ensures that 'npm test' and 'npm run test:unit' remain fast (<2 seconds for 806+ tests)
 */
export default unitConfig;