/**
 * Network Simulation Utilities for E2E Testing
 * Provides comprehensive network failure simulation and recovery testing capabilities
 * 
 * Features:
 * - Network condition simulation (offline, slow-3g, slow-4g, fast-3g, 4g)
 * - Network interruption during critical operations
 * - Packet loss and latency injection
 * - Connection recovery testing with exponential backoff
 * - Timeout handling validation
 * - Network-aware retry mechanisms
 * 
 * PRD Requirements: REQ-E2E-001, REQ-BUS-003, REQ-INT-001
 */

export class NetworkSimulation {
    constructor(page, context) {
        this.page = page;
        this.context = context;
        this.originalRoutes = new Map();
        this.activeInterceptions = new Set();
        this.networkLogs = [];
        this.retryAttempts = new Map();
        
        // Network condition presets
        this.networkConditions = {
            offline: {
                offline: true,
                downloadThroughput: 0,
                uploadThroughput: 0,
                latency: 0
            },
            'slow-3g': {
                offline: false,
                downloadThroughput: 500 * 1024 / 8, // 500 Kbps
                uploadThroughput: 500 * 1024 / 8,
                latency: 2000 // 2 seconds
            },
            'slow-4g': {
                offline: false,
                downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
                uploadThroughput: 750 * 1024 / 8, // 750 Kbps
                latency: 500 // 500ms
            },
            'fast-3g': {
                offline: false,
                downloadThroughput: 1.6 * 1024 * 1024 / 8, // 1.6 Mbps
                uploadThroughput: 750 * 1024 / 8, // 750 Kbps
                latency: 150 // 150ms
            },
            '4g': {
                offline: false,
                downloadThroughput: 4 * 1024 * 1024 / 8, // 4 Mbps
                uploadThroughput: 3 * 1024 * 1024 / 8, // 3 Mbps
                latency: 50 // 50ms
            }
        };

        // Timeout configurations for different operations
        this.timeouts = {
            payment: 10000, // 10 seconds max for payment operations
            api: 5000, // 5 seconds max for API calls
            image: 8000, // 8 seconds max for image loading
            gallery: 15000, // 15 seconds max for gallery loading
            admin: 7000 // 7 seconds max for admin operations
        };
    }

    /**
     * Simulate specific network conditions
     */
    async simulateNetworkCondition(condition) {
        if (!this.networkConditions[condition]) {
            throw new Error(`Unknown network condition: ${condition}`);
        }

        const settings = this.networkConditions[condition];
        await this.context.setNetworkConditions(settings);
        
        this.log(`Network condition set to: ${condition}`, settings);
        return settings;
    }

    /**
     * Simulate network interruption during critical operations
     */
    async simulateNetworkInterruption(options = {}) {
        const {
            duration = 5000, // 5 seconds default
            endpoints = [], // Specific endpoints to interrupt
            onInterruption = null,
            onRecovery = null
        } = options;

        this.log('Starting network interruption', { duration, endpoints });

        // Intercept network requests and fail them
        const interceptionId = `interruption_${Date.now()}`;
        this.activeInterceptions.add(interceptionId);

        await this.page.route('**/*', async (route) => {
            if (!this.activeInterceptions.has(interceptionId)) {
                return route.continue();
            }

            const url = route.request().url();
            const shouldIntercept = endpoints.length === 0 || 
                endpoints.some(endpoint => url.includes(endpoint));

            if (shouldIntercept) {
                this.log('Intercepting request during network interruption', { url });
                
                if (onInterruption) {
                    await onInterruption(url);
                }

                // Simulate network failure
                await route.abort('failed');
                return;
            }

            route.continue();
        });

        // Wait for interruption duration
        await this.page.waitForTimeout(duration);

        // Restore network connectivity
        this.activeInterceptions.delete(interceptionId);
        this.log('Network interruption ended, restoring connectivity');

        if (onRecovery) {
            await onRecovery();
        }

        return interceptionId;
    }

    /**
     * Simulate packet loss with specified percentage
     */
    async simulatePacketLoss(lossPercentage = 10) {
        this.log(`Simulating ${lossPercentage}% packet loss`);

        const interceptionId = `packet_loss_${Date.now()}`;
        this.activeInterceptions.add(interceptionId);

        await this.page.route('**/*', async (route) => {
            if (!this.activeInterceptions.has(interceptionId)) {
                return route.continue();
            }

            // Randomly drop packets based on loss percentage
            if (Math.random() * 100 < lossPercentage) {
                this.log('Simulating packet loss', { url: route.request().url() });
                await route.abort('failed');
                return;
            }

            route.continue();
        });

        return interceptionId;
    }

    /**
     * Inject artificial latency into network requests
     */
    async injectLatency(latencyMs = 1000, endpoints = []) {
        this.log(`Injecting ${latencyMs}ms latency`, { endpoints });

        const interceptionId = `latency_${Date.now()}`;
        this.activeInterceptions.add(interceptionId);

        await this.page.route('**/*', async (route) => {
            if (!this.activeInterceptions.has(interceptionId)) {
                return route.continue();
            }

            const url = route.request().url();
            const shouldDelay = endpoints.length === 0 || 
                endpoints.some(endpoint => url.includes(endpoint));

            if (shouldDelay) {
                this.log('Injecting latency', { url, latencyMs });
                await this.page.waitForTimeout(latencyMs);
            }

            route.continue();
        });

        return interceptionId;
    }

    /**
     * Test timeout handling for specific operations
     */
    async testTimeoutHandling(operationType, operation, expectedTimeoutMs) {
        const maxTimeout = this.timeouts[operationType] || 5000;
        this.log(`Testing timeout for ${operationType}`, { maxTimeout, expectedTimeoutMs });

        const startTime = Date.now();
        let timedOut = false;
        let result = null;
        let error = null;

        try {
            // Set a slightly longer timeout to detect if operation exceeds expected timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    timedOut = true;
                    reject(new Error(`Operation timed out after ${maxTimeout}ms`));
                }, maxTimeout + 1000);
            });

            result = await Promise.race([
                operation(),
                timeoutPromise
            ]);
        } catch (err) {
            error = err;
        }

        const duration = Date.now() - startTime;

        this.log('Timeout test completed', {
            operationType,
            duration,
            timedOut,
            expectedTimeout: expectedTimeoutMs,
            actualTimeout: maxTimeout,
            success: !error && !timedOut
        });

        return {
            duration,
            timedOut,
            success: !error && !timedOut,
            error,
            result
        };
    }

    /**
     * Simulate connection recovery with exponential backoff
     */
    async simulateConnectionRecovery(options = {}) {
        const {
            initialDelay = 1000,
            maxDelay = 8000,
            multiplier = 2,
            maxAttempts = 5,
            endpoint = '/api/health/check'
        } = options;

        let delay = initialDelay;
        let attempts = 0;
        let recovered = false;

        this.log('Starting connection recovery simulation', options);

        while (attempts < maxAttempts && !recovered) {
            attempts++;
            
            try {
                this.log(`Recovery attempt ${attempts}`, { delay });
                
                // Wait for exponential backoff delay
                await this.page.waitForTimeout(delay);
                
                // Test connection
                const response = await this.page.request.get(endpoint);
                
                if (response.ok()) {
                    recovered = true;
                    this.log('Connection recovery successful', { attempts, totalTime: delay });
                } else {
                    throw new Error(`HTTP ${response.status()}`);
                }
            } catch (error) {
                this.log(`Recovery attempt ${attempts} failed`, { error: error.message });
                
                // Exponential backoff
                delay = Math.min(delay * multiplier, maxDelay);
            }
        }

        return {
            recovered,
            attempts,
            totalTime: attempts * initialDelay
        };
    }

    /**
     * Test graceful degradation during service outages
     */
    async testGracefulDegradation(servicesToDisable = [], fallbackTests = {}) {
        this.log('Testing graceful degradation', { servicesToDisable });

        const degradationResults = {};

        for (const service of servicesToDisable) {
            this.log(`Disabling service: ${service}`);
            
            // Mock service failure
            await this.page.route(`**/*${service}*`, async (route) => {
                await route.abort('failed');
            });

            // Test fallback behavior
            if (fallbackTests[service]) {
                try {
                    const result = await fallbackTests[service]();
                    degradationResults[service] = {
                        success: true,
                        result
                    };
                } catch (error) {
                    degradationResults[service] = {
                        success: false,
                        error: error.message
                    };
                }
            }
        }

        this.log('Graceful degradation test completed', degradationResults);
        return degradationResults;
    }

    /**
     * Monitor network requests and track retry attempts
     */
    async monitorNetworkRequests(options = {}) {
        const {
            trackRetries = true,
            logFailures = true,
            timeout = 30000
        } = options;

        this.log('Starting network request monitoring', options);

        this.page.on('request', (request) => {
            const url = request.url();
            this.log('Request started', { url, method: request.method() });
            
            if (trackRetries) {
                const count = this.retryAttempts.get(url) || 0;
                this.retryAttempts.set(url, count + 1);
            }
        });

        this.page.on('response', (response) => {
            const url = response.url();
            const status = response.status();
            
            this.networkLogs.push({
                url,
                status,
                timestamp: Date.now(),
                success: status >= 200 && status < 300
            });

            if (logFailures && status >= 400) {
                this.log('Request failed', { url, status });
            }
        });

        this.page.on('requestfailed', (request) => {
            if (logFailures) {
                this.log('Request failed', { 
                    url: request.url(), 
                    failure: request.failure()
                });
            }
        });

        // Return monitoring cleanup function
        return () => {
            this.page.removeAllListeners('request');
            this.page.removeAllListeners('response');
            this.page.removeAllListeners('requestfailed');
        };
    }

    /**
     * Test offline behavior and automatic retry mechanisms
     */
    async testOfflineBehavior(options = {}) {
        const {
            offlineDuration = 10000,
            testOperations = [],
            expectedOfflineIndicators = []
        } = options;

        this.log('Testing offline behavior', options);

        // Go offline
        await this.simulateNetworkCondition('offline');

        // Wait for offline indicators to appear
        for (const indicator of expectedOfflineIndicators) {
            try {
                await this.page.waitForSelector(indicator, { timeout: 5000 });
                this.log('Offline indicator found', { indicator });
            } catch (error) {
                this.log('Offline indicator not found', { indicator, error: error.message });
            }
        }

        // Test operations while offline
        const offlineResults = {};
        for (const operation of testOperations) {
            try {
                const result = await operation.test();
                offlineResults[operation.name] = {
                    success: true,
                    result
                };
            } catch (error) {
                offlineResults[operation.name] = {
                    success: false,
                    error: error.message
                };
            }
        }

        // Wait offline duration
        await this.page.waitForTimeout(offlineDuration);

        // Restore connectivity
        await this.simulateNetworkCondition('4g');

        // Test automatic recovery
        await this.page.waitForTimeout(2000); // Allow time for reconnection

        this.log('Offline behavior test completed', offlineResults);
        return offlineResults;
    }

    /**
     * Clear all network interceptions and restore normal connectivity
     */
    async clearAllInterceptions() {
        this.log('Clearing all network interceptions');
        
        this.activeInterceptions.clear();
        await this.page.unroute('**/*');
        await this.context.setNetworkConditions({
            offline: false,
            downloadThroughput: -1,
            uploadThroughput: -1,
            latency: 0
        });

        this.log('Network interceptions cleared, normal connectivity restored');
    }

    /**
     * Get network monitoring statistics
     */
    getNetworkStats() {
        const total = this.networkLogs.length;
        const successful = this.networkLogs.filter(log => log.success).length;
        const failed = total - successful;

        const retryStats = {};
        for (const [url, count] of this.retryAttempts) {
            if (count > 1) {
                retryStats[url] = count;
            }
        }

        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? (successful / total * 100).toFixed(2) : 0,
            retries: retryStats,
            logs: this.networkLogs.slice(-10) // Last 10 requests
        };
    }

    /**
     * Test network resilience during critical flows
     */
    async testNetworkResilience(criticalFlow, networkConditions = ['slow-3g', 'slow-4g', 'fast-3g']) {
        const resilienceResults = {};

        for (const condition of networkConditions) {
            this.log(`Testing resilience under ${condition} conditions`);
            
            try {
                await this.simulateNetworkCondition(condition);
                const result = await criticalFlow();
                
                resilienceResults[condition] = {
                    success: true,
                    result
                };
            } catch (error) {
                resilienceResults[condition] = {
                    success: false,
                    error: error.message
                };
            }
        }

        // Restore normal connectivity
        await this.clearAllInterceptions();

        this.log('Network resilience test completed', resilienceResults);
        return resilienceResults;
    }

    /**
     * Log network simulation events
     */
    log(message, data = {}) {
        const timestamp = new Date().toISOString();
        console.log(`[NetworkSimulation ${timestamp}] ${message}`, data);
        
        this.networkLogs.push({
            timestamp: Date.now(),
            type: 'simulation',
            message,
            data
        });
    }

    /**
     * Cleanup method to be called after tests
     */
    async cleanup() {
        this.log('Cleaning up network simulation');
        await this.clearAllInterceptions();
        this.networkLogs = [];
        this.retryAttempts.clear();
    }
}

/**
 * Utility function to create network simulation instance
 */
export async function createNetworkSimulation(page, context) {
    return new NetworkSimulation(page, context);
}

/**
 * Predefined test scenarios for common network failure patterns
 */
export const NetworkTestScenarios = {
    /**
     * Payment processing under network stress
     */
    paymentNetworkStress: async (networkSim, paymentFlow) => {
        const scenarios = [
            { name: 'slow-3g', condition: 'slow-3g' },
            { name: 'packet-loss', action: () => networkSim.simulatePacketLoss(15) },
            { name: 'high-latency', action: () => networkSim.injectLatency(3000) },
            { name: 'intermittent-connection', action: () => networkSim.simulateNetworkInterruption({ duration: 3000 }) }
        ];

        const results = {};

        for (const scenario of scenarios) {
            try {
                if (scenario.condition) {
                    await networkSim.simulateNetworkCondition(scenario.condition);
                } else if (scenario.action) {
                    await scenario.action();
                }

                const result = await paymentFlow();
                results[scenario.name] = { success: true, result };
            } catch (error) {
                results[scenario.name] = { success: false, error: error.message };
            }

            await networkSim.clearAllInterceptions();
            await networkSim.page.waitForTimeout(1000);
        }

        return results;
    },

    /**
     * Gallery loading under various network conditions
     */
    galleryNetworkConditions: async (networkSim, galleryFlow) => {
        const conditions = ['slow-3g', 'slow-4g', 'fast-3g'];
        const results = {};

        for (const condition of conditions) {
            try {
                await networkSim.simulateNetworkCondition(condition);
                
                const startTime = Date.now();
                const result = await galleryFlow();
                const duration = Date.now() - startTime;

                results[condition] = { 
                    success: true, 
                    result, 
                    loadTime: duration 
                };
            } catch (error) {
                results[condition] = { 
                    success: false, 
                    error: error.message 
                };
            }
        }

        await networkSim.clearAllInterceptions();
        return results;
    },

    /**
     * Admin operations with connection recovery
     */
    adminConnectionRecovery: async (networkSim, adminFlow) => {
        // Simulate network failure during admin operation
        const interruptionPromise = networkSim.simulateNetworkInterruption({ 
            duration: 5000,
            endpoints: ['/api/admin/']
        });

        // Start admin operation
        const operationPromise = adminFlow();

        // Wait for both to complete
        const [interruptionResult, operationResult] = await Promise.allSettled([
            interruptionPromise,
            operationPromise
        ]);

        // Test recovery
        const recoveryResult = await networkSim.simulateConnectionRecovery({
            endpoint: '/api/admin/dashboard'
        });

        return {
            interruption: interruptionResult,
            operation: operationResult,
            recovery: recoveryResult
        };
    }
};