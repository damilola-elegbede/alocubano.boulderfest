import { getHealthChecker } from "../../lib/monitoring/health-checker.js";

/**
 * Reset circuit breakers for emergency recovery
 * This endpoint can be used to manually reset circuit breakers
 * when the system needs immediate recovery
 */
export default async function handler(req, res) {
  // Only allow POST requests for safety
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed_methods: ['POST'],
      description: 'Use POST to reset circuit breakers'
    });
  }

  try {
    // Get health checker instance
    const healthChecker = getHealthChecker();

    // Get current circuit breaker states before reset
    const statesBefore = healthChecker.getCircuitBreakerStates();

    // Reset all circuit breakers
    healthChecker.resetCircuitBreakers();

    // Get states after reset to confirm
    const statesAfter = healthChecker.getCircuitBreakerStates();

    // Count how many were reset
    const resetCount = Object.keys(statesBefore).filter(
      service => statesBefore[service].state !== 'closed'
    ).length;

    res.status(200).json({
      status: 'success',
      message: 'Circuit breakers reset successfully',
      reset_count: resetCount,
      timestamp: new Date().toISOString(),
      states_before: statesBefore,
      states_after: statesAfter,
      services: Object.keys(statesBefore),
      note: 'All circuit breakers have been reset to closed state'
    });

  } catch (error) {
    console.error('Circuit breaker reset failed:', error);

    res.status(500).json({
      status: 'error',
      error: 'Failed to reset circuit breakers',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}