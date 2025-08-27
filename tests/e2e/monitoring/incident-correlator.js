/**
 * Production Incident Correlation System
 * Links E2E test failures to production issues for proactive detection
 * and automated test expansion based on incident analysis.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Core incident correlation system
 */
class IncidentCorrelator {
  constructor(options = {}) {
    this.config = {
      alertThresholds: {
        failureRate: 0.3, // 30% failure rate triggers alert
        patternConfidence: 0.75, // 75% confidence for pattern detection
        businessImpactThreshold: 'medium', // Minimum impact level for alerts
        timeWindow: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      },
      dataRetention: {
        incidents: 90, // days
        testResults: 30, // days
        correlations: 60 // days
      },
      integrations: {
        incidentManagement: options.incidentManagement || 'datadog',
        alerting: options.alerting || 'slack',
        monitoring: options.monitoring || 'prometheus'
      },
      ...options
    };

    this.dataStore = new IncidentDataStore();
    this.patternAnalyzer = new PatternAnalyzer(this.config);
    this.alertManager = new AlertManager(this.config);
    this.testGenerator = new TestScenarioGenerator();
    this.mlPredictor = new MLPredictiveAnalyzer();
  }

  /**
   * Main correlation workflow
   */
  async correlateIncidents(testResults, productionIncidents) {
    console.log('= Starting incident correlation analysis...');
    
    try {
      // 1. Store and normalize data
      const normalizedTests = await this.normalizeTestData(testResults);
      const normalizedIncidents = await this.normalizeIncidentData(productionIncidents);
      
      // 2. Perform correlation analysis
      const correlations = await this.analyzeCorrelations(normalizedTests, normalizedIncidents);
      
      // 3. Detect risk patterns
      const riskPatterns = await this.patternAnalyzer.detectRiskPatterns(correlations);
      
      // 4. Generate alerts for high-risk patterns
      await this.processAlerts(riskPatterns);
      
      // 5. Generate new test scenarios from incidents
      const newTestScenarios = await this.generateTestScenarios(normalizedIncidents);
      
      // 6. Update ML models with new data
      await this.mlPredictor.updateModels(correlations, riskPatterns);
      
      // 7. Generate recommendations
      const recommendations = await this.generateRecommendations(correlations, newTestScenarios);
      
      const results = {
        correlations,
        riskPatterns,
        newTestScenarios,
        recommendations,
        summary: this.generateSummary(correlations, riskPatterns)
      };
      
      await this.dataStore.storeAnalysisResults(results);
      return results;
      
    } catch (error) {
      console.error('L Correlation analysis failed:', error);
      throw error;
    }
  }

  /**
   * Normalize test result data for analysis
   */
  async normalizeTestData(testResults) {
    return testResults.map(result => ({
      id: result.id || this.generateId(),
      timestamp: new Date(result.timestamp),
      testSuite: result.testSuite,
      testName: result.testName,
      status: result.status, // 'passed', 'failed', 'skipped'
      duration: result.duration,
      failureReason: result.failureReason,
      errorType: this.classifyErrorType(result.error),
      environment: result.environment,
      browser: result.browser,
      device: result.device,
      url: result.url,
      userFlow: this.extractUserFlow(result),
      businessFunction: this.mapToBusinessFunction(result),
      severity: this.calculateTestSeverity(result),
      tags: result.tags || [],
      metadata: {
        retryCount: result.retryCount || 0,
        flakyScore: result.flakyScore || 0,
        performanceMetrics: result.performanceMetrics || {}
      }
    }));
  }

  /**
   * Normalize incident data for analysis
   */
  async normalizeIncidentData(incidents) {
    return incidents.map(incident => ({
      id: incident.id,
      timestamp: new Date(incident.timestamp),
      title: incident.title,
      description: incident.description,
      severity: incident.severity, // 'critical', 'high', 'medium', 'low'
      status: incident.status, // 'open', 'investigating', 'resolved'
      affectedServices: incident.affectedServices || [],
      rootCause: incident.rootCause,
      resolution: incident.resolution,
      businessImpact: this.calculateBusinessImpact(incident),
      userFlow: this.extractIncidentUserFlow(incident),
      errorSignatures: this.extractErrorSignatures(incident),
      environment: incident.environment,
      duration: incident.resolvedAt ? 
        new Date(incident.resolvedAt) - new Date(incident.timestamp) : null,
      tags: incident.tags || [],
      postMortem: incident.postMortem,
      preventable: incident.preventable !== false, // Default to preventable
      metadata: {
        customerImpact: incident.customerImpact || 0,
        revenueImpact: incident.revenueImpact || 0,
        teamOwner: incident.teamOwner,
        escalationLevel: incident.escalationLevel || 1
      }
    }));
  }

  /**
   * Analyze correlations between test failures and production incidents
   */
  async analyzeCorrelations(tests, incidents) {
    const correlations = [];
    const timeWindow = this.config.alertThresholds.timeWindow;
    
    for (const incident of incidents) {
      // Find tests that failed before this incident
      const relevantTests = tests.filter(test => {
        const timeDiff = incident.timestamp - test.timestamp;
        return timeDiff > 0 && timeDiff <= timeWindow;
      });
      
      for (const test of relevantTests) {
        const correlation = await this.calculateCorrelation(test, incident);
        if (correlation.strength > 0.3) { // Minimum correlation threshold
          correlations.push(correlation);
        }
      }
    }
    
    return this.rankCorrelations(correlations);
  }

  /**
   * Calculate correlation strength between a test failure and incident
   */
  async calculateCorrelation(test, incident) {
    let strength = 0;
    const factors = [];
    
    // Business function alignment
    if (test.businessFunction === incident.userFlow) {
      strength += 0.4;
      factors.push('business_function_match');
    }
    
    // Error type similarity
    const errorSimilarity = this.calculateErrorSimilarity(
      test.errorType, 
      incident.errorSignatures
    );
    strength += errorSimilarity * 0.3;
    if (errorSimilarity > 0.5) factors.push('error_similarity');
    
    // Environment match
    if (test.environment === incident.environment) {
      strength += 0.2;
      factors.push('environment_match');
    }
    
    // Temporal proximity (closer in time = higher correlation)
    const timeDiff = incident.timestamp - test.timestamp;
    const temporalWeight = Math.max(0, 1 - (timeDiff / this.config.alertThresholds.timeWindow));
    strength += temporalWeight * 0.1;
    
    return {
      id: `${test.id}-${incident.id}`,
      testId: test.id,
      incidentId: incident.id,
      strength,
      confidence: this.calculateConfidence(strength, factors.length),
      factors,
      timeDifference: timeDiff,
      predictivePower: this.calculatePredictivePower(test, incident),
      businessImpact: incident.businessImpact,
      timestamp: new Date(),
      metadata: {
        testSeverity: test.severity,
        incidentSeverity: incident.severity,
        preventable: incident.preventable
      }
    };
  }

  /**
   * Process alerts for high-risk patterns
   */
  async processAlerts(riskPatterns) {
    for (const pattern of riskPatterns) {
      if (pattern.riskLevel >= this.config.alertThresholds.patternConfidence) {
        await this.alertManager.sendAlert({
          type: 'risk_pattern_detected',
          severity: this.mapRiskToSeverity(pattern.riskLevel),
          pattern,
          message: `High-risk pattern detected: ${pattern.description}`,
          recommendations: pattern.recommendations,
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Generate new test scenarios from production incidents
   */
  async generateTestScenarios(incidents) {
    const scenarios = [];
    
    for (const incident of incidents) {
      if (incident.preventable && !this.hasExistingTestCoverage(incident)) {
        const scenario = await this.testGenerator.generateFromIncident(incident);
        if (scenario) {
          scenarios.push(scenario);
        }
      }
    }
    
    return this.prioritizeScenarios(scenarios);
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(correlations, newScenarios) {
    const recommendations = [];
    
    // Test coverage gaps
    const coverageGaps = this.identifyTestCoverageGaps(correlations);
    recommendations.push(...coverageGaps.map(gap => ({
      type: 'coverage_gap',
      priority: gap.businessImpact,
      description: `Missing test coverage for ${gap.area}`,
      action: `Implement E2E tests for ${gap.userFlow}`,
      effort: this.estimateEffort(gap),
      impact: gap.businessImpact
    })));
    
    // Test improvement opportunities
    const improvements = this.identifyTestImprovements(correlations);
    recommendations.push(...improvements);
    
    // New test scenarios
    recommendations.push(...newScenarios.map(scenario => ({
      type: 'new_scenario',
      priority: scenario.priority,
      description: scenario.description,
      action: `Implement test: ${scenario.name}`,
      effort: scenario.estimatedEffort,
      impact: scenario.expectedImpact
    })));
    
    return this.prioritizeRecommendations(recommendations);
  }

  /**
   * Generate executive summary
   */
  generateSummary(correlations, riskPatterns) {
    const highRiskPatterns = riskPatterns.filter(p => p.riskLevel >= 0.8);
    const preventableIncidents = correlations.filter(c => c.metadata.preventable);
    
    return {
      totalCorrelations: correlations.length,
      highRiskPatterns: highRiskPatterns.length,
      preventableIncidents: preventableIncidents.length,
      potentialImpactReduction: this.calculatePotentialImpactReduction(correlations),
      recommendedActions: this.getTopRecommendedActions(correlations),
      nextAnalysisDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      confidence: this.calculateOverallConfidence(correlations, riskPatterns)
    };
  }

  // Utility methods
  classifyErrorType(error) {
    if (!error) return 'unknown';
    
    const errorPatterns = {
      network: /network|timeout|connection|fetch/i,
      authentication: /auth|login|permission|unauthorized/i,
      database: /database|sql|query|connection/i,
      ui: /element|selector|click|scroll/i,
      performance: /performance|slow|memory|cpu/i,
      validation: /validation|required|invalid/i
    };
    
    for (const [type, pattern] of Object.entries(errorPatterns)) {
      if (pattern.test(error.toString())) {
        return type;
      }
    }
    
    return 'application';
  }

  extractUserFlow(testResult) {
    // Extract user flow from test path and metadata
    const flowPatterns = {
      registration: /registration|signup|register/i,
      authentication: /auth|login|signin/i,
      payment: /payment|checkout|stripe/i,
      gallery: /gallery|photos|images/i,
      admin: /admin|dashboard|management/i,
      newsletter: /newsletter|subscribe|email/i
    };
    
    const testPath = testResult.testName || testResult.testSuite || '';
    for (const [flow, pattern] of Object.entries(flowPatterns)) {
      if (pattern.test(testPath)) {
        return flow;
      }
    }
    
    return 'general';
  }

  mapToBusinessFunction(testResult) {
    const businessFunctions = {
      'revenue_generation': ['payment', 'checkout', 'tickets'],
      'user_acquisition': ['registration', 'signup', 'newsletter'],
      'user_engagement': ['gallery', 'schedule', 'artists'],
      'administration': ['admin', 'dashboard', 'management'],
      'core_functionality': ['authentication', 'validation', 'api']
    };
    
    const flow = this.extractUserFlow(testResult);
    for (const [business, flows] of Object.entries(businessFunctions)) {
      if (flows.includes(flow)) {
        return business;
      }
    }
    
    return 'core_functionality';
  }

  calculateBusinessImpact(incident) {
    const impactFactors = {
      severity: {
        critical: 1.0,
        high: 0.8,
        medium: 0.5,
        low: 0.2
      },
      customerImpact: incident.metadata?.customerImpact || 0,
      revenueImpact: incident.metadata?.revenueImpact || 0,
      duration: incident.duration ? Math.min(incident.duration / (60 * 60 * 1000), 24) / 24 : 0.5
    };
    
    const severityScore = impactFactors.severity[incident.severity] || 0.5;
    const customerScore = Math.min(impactFactors.customerImpact / 1000, 1); // Normalize to 0-1
    const revenueScore = Math.min(impactFactors.revenueImpact / 10000, 1); // Normalize to 0-1
    const durationScore = impactFactors.duration;
    
    return (severityScore * 0.4) + (customerScore * 0.3) + (revenueScore * 0.2) + (durationScore * 0.1);
  }

  extractIncidentUserFlow(incident) {
    const flowPatterns = {
      payment: /payment|checkout|stripe|billing/i,
      registration: /registration|signup|register|account/i,
      authentication: /auth|login|signin|session/i,
      gallery: /gallery|photos|images|media/i,
      admin: /admin|dashboard|management/i,
      newsletter: /newsletter|subscribe|email|marketing/i
    };
    
    const text = `${incident.title} ${incident.description}`.toLowerCase();
    for (const [flow, pattern] of Object.entries(flowPatterns)) {
      if (pattern.test(text)) {
        return flow;
      }
    }
    
    return 'general';
  }

  extractErrorSignatures(incident) {
    const signatures = [];
    const text = `${incident.title} ${incident.description} ${incident.rootCause || ''}`;
    
    // Common error patterns
    const patterns = {
      timeout: /timeout|timed out|connection timeout/i,
      rateLimit: /rate limit|too many requests|429/i,
      database: /database|sql|query|connection pool/i,
      memory: /memory|out of memory|oom/i,
      network: /network|connection|unreachable/i,
      authentication: /authentication|unauthorized|403|401/i,
      validation: /validation|invalid|malformed/i
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        signatures.push(type);
      }
    }
    
    return signatures;
  }

  calculateErrorSimilarity(testError, incidentSignatures) {
    if (!testError || !incidentSignatures.length) return 0;
    
    // Check if test error type matches any incident signatures
    return incidentSignatures.includes(testError) ? 1 : 0;
  }

  calculateConfidence(strength, factorCount) {
    // Confidence based on correlation strength and number of matching factors
    const baseConfidence = Math.min(strength, 1);
    const factorBonus = Math.min(factorCount * 0.1, 0.3);
    return Math.min(baseConfidence + factorBonus, 1);
  }

  calculatePredictivePower(test, incident) {
    // How well this test failure predicts this type of incident
    let power = 0.5; // Base prediction power
    
    if (test.businessFunction === this.mapIncidentToBusinessFunction(incident)) {
      power += 0.3;
    }
    
    if (test.errorType && incident.errorSignatures.includes(test.errorType)) {
      power += 0.2;
    }
    
    return Math.min(power, 1);
  }

  mapIncidentToBusinessFunction(incident) {
    const businessFunctions = {
      'revenue_generation': ['payment', 'checkout', 'billing'],
      'user_acquisition': ['registration', 'signup', 'newsletter'],
      'user_engagement': ['gallery', 'schedule', 'artists'],
      'administration': ['admin', 'dashboard', 'management'],
      'core_functionality': ['authentication', 'validation', 'api']
    };
    
    const flow = this.extractIncidentUserFlow(incident);
    for (const [business, flows] of Object.entries(businessFunctions)) {
      if (flows.includes(flow)) {
        return business;
      }
    }
    
    return 'core_functionality';
  }

  rankCorrelations(correlations) {
    return correlations
      .sort((a, b) => b.strength - a.strength)
      .map((correlation, index) => ({ ...correlation, rank: index + 1 }));
  }

  mapRiskToSeverity(riskLevel) {
    if (riskLevel >= 0.9) return 'critical';
    if (riskLevel >= 0.7) return 'high';
    if (riskLevel >= 0.5) return 'medium';
    return 'low';
  }

  hasExistingTestCoverage(incident) {
    // In a real implementation, this would check existing test suites
    // For now, assume basic coverage exists for common flows
    const commonFlows = ['authentication', 'payment'];
    return commonFlows.includes(incident.userFlow);
  }

  prioritizeScenarios(scenarios) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return scenarios.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.expectedImpact - a.expectedImpact;
    });
  }

  identifyTestCoverageGaps(correlations) {
    const gaps = [];
    const coverageByFlow = {};
    
    // Analyze correlations to find coverage gaps
    for (const correlation of correlations) {
      const flow = correlation.metadata.incidentUserFlow;
      if (!coverageByFlow[flow]) {
        coverageByFlow[flow] = { tests: 0, incidents: 0 };
      }
      coverageByFlow[flow].incidents++;
    }
    
    // Identify flows with high incident rates but low test coverage
    for (const [flow, stats] of Object.entries(coverageByFlow)) {
      if (stats.incidents > 2 && stats.tests < stats.incidents * 0.5) {
        gaps.push({
          area: flow,
          userFlow: flow,
          businessImpact: this.calculateFlowBusinessImpact(flow, stats),
          incidentCount: stats.incidents,
          testCount: stats.tests
        });
      }
    }
    
    return gaps;
  }

  calculateFlowBusinessImpact(flow, stats) {
    const flowImpact = {
      payment: 0.9,
      registration: 0.7,
      authentication: 0.8,
      gallery: 0.4,
      admin: 0.6,
      newsletter: 0.3
    };
    
    const baseImpact = flowImpact[flow] || 0.5;
    const volumeMultiplier = Math.min(stats.incidents / 10, 2); // Scale by incident volume
    
    return Math.min(baseImpact * volumeMultiplier, 1);
  }

  identifyTestImprovements(correlations) {
    const improvements = [];
    
    // Find flaky tests with high correlation to incidents
    const flakyHighCorrelation = correlations.filter(c => 
      c.metadata.testFlakyScore > 0.5 && c.strength > 0.6
    );
    
    for (const correlation of flakyHighCorrelation) {
      improvements.push({
        type: 'flaky_test_fix',
        priority: 'high',
        description: `Fix flaky test with high incident correlation`,
        action: `Stabilize test: ${correlation.testId}`,
        effort: 'medium',
        impact: correlation.businessImpact
      });
    }
    
    return improvements;
  }

  prioritizeRecommendations(recommendations) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recommendations.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return (b.impact || 0) - (a.impact || 0);
    });
  }

  estimateEffort(gap) {
    const effortMap = {
      payment: 'high',
      authentication: 'medium',
      registration: 'medium',
      gallery: 'low',
      admin: 'medium',
      newsletter: 'low'
    };
    
    return effortMap[gap.userFlow] || 'medium';
  }

  calculatePotentialImpactReduction(correlations) {
    // Calculate potential reduction in production incidents
    const preventableCorrelations = correlations.filter(c => c.metadata.preventable);
    const totalBusinessImpact = correlations.reduce((sum, c) => sum + c.businessImpact, 0);
    const preventableImpact = preventableCorrelations.reduce((sum, c) => sum + c.businessImpact, 0);
    
    return totalBusinessImpact > 0 ? (preventableImpact / totalBusinessImpact) * 0.8 : 0; // 80% prevention rate
  }

  getTopRecommendedActions(correlations) {
    // Generate top 3 recommended actions based on correlations
    const actions = [];
    
    if (correlations.length > 0) {
      const highImpactCorrelations = correlations.filter(c => c.businessImpact > 0.7);
      if (highImpactCorrelations.length > 0) {
        actions.push('Implement high-impact test scenarios for revenue-critical flows');
      }
      
      const recurringErrors = this.findRecurringErrorTypes(correlations);
      if (recurringErrors.length > 0) {
        actions.push(`Address recurring ${recurringErrors[0]} errors with targeted tests`);
      }
      
      actions.push('Expand E2E test coverage for identified blind spots');
    }
    
    return actions.slice(0, 3);
  }

  findRecurringErrorTypes(correlations) {
    const errorCounts = {};
    
    correlations.forEach(c => {
      const errorType = c.metadata.testErrorType || 'unknown';
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    });
    
    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([type]) => type);
  }

  calculateOverallConfidence(correlations, riskPatterns) {
    if (correlations.length === 0) return 0;
    
    const avgCorrelationConfidence = correlations.reduce((sum, c) => sum + c.confidence, 0) / correlations.length;
    const patternConfidence = riskPatterns.length > 0 ? 
      riskPatterns.reduce((sum, p) => sum + p.riskLevel, 0) / riskPatterns.length : 0.5;
    
    return (avgCorrelationConfidence * 0.7) + (patternConfidence * 0.3);
  }

  calculateTestSeverity(testResult) {
    if (testResult.status !== 'failed') return 'low';
    
    // Map business function to severity
    const severityMap = {
      'revenue_generation': 'high',
      'user_acquisition': 'medium',
      'core_functionality': 'medium',
      'user_engagement': 'low',
      'administration': 'medium'
    };
    
    return severityMap[testResult.businessFunction] || 'medium';
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

/**
 * Pattern analysis for risk detection
 */
class PatternAnalyzer {
  constructor(config) {
    this.config = config;
  }

  async detectRiskPatterns(correlations) {
    const patterns = [];
    
    // Failure cascade patterns
    const cascadePatterns = this.detectFailureCascades(correlations);
    patterns.push(...cascadePatterns);
    
    // Recurring failure patterns
    const recurringPatterns = this.detectRecurringFailures(correlations);
    patterns.push(...recurringPatterns);
    
    // Silent failure patterns
    const silentPatterns = this.detectSilentFailures(correlations);
    patterns.push(...silentPatterns);
    
    // Performance degradation patterns
    const performancePatterns = this.detectPerformanceDegradation(correlations);
    patterns.push(...performancePatterns);
    
    return this.rankPatterns(patterns);
  }

  detectFailureCascades(correlations) {
    // Group correlations by time windows and detect cascading failures
    const timeWindows = this.groupByTimeWindows(correlations, 3600000); // 1 hour windows
    const cascades = [];
    
    for (const window of timeWindows) {
      if (window.correlations.length >= 3) { // Multiple failures in short time
        const cascade = {
          type: 'failure_cascade',
          riskLevel: Math.min(window.correlations.length / 10, 1),
          description: `Cascade of ${window.correlations.length} related failures detected`,
          timeWindow: window.timeRange,
          affectedServices: this.extractAffectedServices(window.correlations),
          recommendations: [
            'Implement circuit breaker patterns',
            'Add service dependency health checks',
            'Review service failure propagation'
          ]
        };
        cascades.push(cascade);
      }
    }
    
    return cascades;
  }

  detectRecurringFailures(correlations) {
    // Group by error signatures and detect recurring patterns
    const errorGroups = this.groupByErrorSignature(correlations);
    const recurring = [];
    
    for (const [signature, group] of Object.entries(errorGroups)) {
      if (group.length >= 3) { // Recurring failure threshold
        recurring.push({
          type: 'recurring_failure',
          riskLevel: Math.min(group.length / 20, 1),
          description: `Recurring failure pattern: ${signature}`,
          occurrences: group.length,
          errorSignature: signature,
          recommendations: [
            'Implement permanent fix for root cause',
            'Add specific E2E test for this scenario',
            'Consider adding monitoring alert'
          ]
        });
      }
    }
    
    return recurring;
  }

  detectSilentFailures(correlations) {
    // Detect incidents with no corresponding test failures (blind spots)
    const silent = correlations.filter(c => c.strength < 0.2);
    
    if (silent.length > correlations.length * 0.3) { // >30% silent failures
      return [{
        type: 'silent_failures',
        riskLevel: silent.length / correlations.length,
        description: 'High percentage of production incidents with no test coverage',
        blindSpots: silent.map(s => s.incidentId),
        recommendations: [
          'Expand E2E test coverage for identified blind spots',
          'Review test scenario completeness',
          'Implement synthetic monitoring for uncovered paths'
        ]
      }];
    }
    
    return [];
  }

  detectPerformanceDegradation(correlations) {
    // Detect patterns indicating performance issues
    const performanceCorrelations = correlations.filter(c => 
      c.factors.includes('performance') || 
      (c.metadata.testPerformanceMetrics && 
       c.metadata.testPerformanceMetrics.duration > 30000) // >30s tests
    );
    
    if (performanceCorrelations.length > 2) {
      return [{
        type: 'performance_degradation',
        riskLevel: Math.min(performanceCorrelations.length / 10, 1),
        description: 'Performance degradation pattern detected',
        affectedTests: performanceCorrelations.map(c => c.testId),
        recommendations: [
          'Implement performance regression tests',
          'Add performance monitoring to CI/CD',
          'Review resource allocation and scaling'
        ]
      }];
    }
    
    return [];
  }

  groupByTimeWindows(correlations, windowSize) {
    const windows = [];
    const sorted = correlations.sort((a, b) => a.timestamp - b.timestamp);
    
    let currentWindow = null;
    
    for (const correlation of sorted) {
      if (!currentWindow || 
          correlation.timestamp - currentWindow.startTime > windowSize) {
        if (currentWindow) windows.push(currentWindow);
        currentWindow = {
          startTime: correlation.timestamp,
          endTime: correlation.timestamp,
          correlations: [correlation],
          timeRange: { 
            start: correlation.timestamp, 
            end: correlation.timestamp 
          }
        };
      } else {
        currentWindow.correlations.push(correlation);
        currentWindow.endTime = correlation.timestamp;
        currentWindow.timeRange.end = correlation.timestamp;
      }
    }
    
    if (currentWindow) windows.push(currentWindow);
    return windows;
  }

  groupByErrorSignature(correlations) {
    const groups = {};
    
    for (const correlation of correlations) {
      const signature = correlation.metadata.testErrorType || 'unknown';
      if (!groups[signature]) {
        groups[signature] = [];
      }
      groups[signature].push(correlation);
    }
    
    return groups;
  }

  extractAffectedServices(correlations) {
    const services = new Set();
    
    for (const correlation of correlations) {
      if (correlation.metadata.affectedServices) {
        correlation.metadata.affectedServices.forEach(service => 
          services.add(service)
        );
      }
    }
    
    return Array.from(services);
  }

  rankPatterns(patterns) {
    return patterns
      .sort((a, b) => b.riskLevel - a.riskLevel)
      .map((pattern, index) => ({ ...pattern, rank: index + 1 }));
  }
}

/**
 * Alert management system
 */
class AlertManager {
  constructor(config) {
    this.config = config;
  }

  async sendAlert(alert) {
    console.log(`=� ALERT [${alert.severity}]: ${alert.message}`);
    
    // Store alert for tracking
    await this.storeAlert(alert);
    
    // Send to configured channels based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    } else if (alert.severity === 'high') {
      await this.sendHighPriorityAlert(alert);
    } else {
      await this.sendStandardAlert(alert);
    }
  }

  async sendCriticalAlert(alert) {
    // Critical alerts go to all channels immediately
    console.log('=� CRITICAL ALERT sent to all channels');
    await this.notifyOnCall(alert);
    await this.notifySlack(alert, '#incidents');
    await this.notifyEmail(alert, 'ops-team@company.com');
  }

  async sendHighPriorityAlert(alert) {
    // High priority alerts go to primary channels
    console.log('�  HIGH PRIORITY ALERT sent to primary channels');
    await this.notifySlack(alert, '#alerts');
    await this.notifyEmail(alert, 'dev-team@company.com');
  }

  async sendStandardAlert(alert) {
    // Standard alerts go to monitoring channels
    console.log('9  STANDARD ALERT sent to monitoring channels');
    await this.notifySlack(alert, '#monitoring');
  }

  async notifyOnCall(alert) {
    // In production, integrate with PagerDuty, OpsGenie, etc.
    console.log('=� On-call notification sent');
  }

  async notifySlack(alert, channel) {
    // In production, integrate with Slack API
    console.log(`=� Slack notification sent to ${channel}`);
  }

  async notifyEmail(alert, recipient) {
    // In production, integrate with email service
    console.log(`=� Email notification sent to ${recipient}`);
  }

  async storeAlert(alert) {
    // Store in monitoring system for tracking and analysis
    const alertData = {
      ...alert,
      id: this.generateAlertId(),
      acknowledged: false,
      createdAt: new Date()
    };
    
    // In production, this would integrate with your monitoring system
    console.log('=� Alert stored for tracking:', alertData.id);
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Test scenario generation from incidents
 */
class TestScenarioGenerator {
  async generateFromIncident(incident) {
    const scenario = {
      id: this.generateScenarioId(),
      name: this.generateTestName(incident),
      description: `E2E test generated from incident: ${incident.title}`,
      priority: this.calculatePriority(incident),
      userFlow: incident.userFlow,
      testSteps: await this.generateTestSteps(incident),
      expectedBehavior: this.extractExpectedBehavior(incident),
      assertions: this.generateAssertions(incident),
      environment: incident.environment,
      tags: ['generated', 'incident-derived', ...incident.tags],
      estimatedEffort: this.estimateImplementationEffort(incident),
      expectedImpact: incident.businessImpact,
      sourceIncident: incident.id,
      createdAt: new Date()
    };
    
    return scenario;
  }

  generateTestName(incident) {
    const userFlow = incident.userFlow || 'general';
    const errorType = this.extractPrimaryErrorType(incident);
    return `test_${userFlow}_${errorType}_failure_prevention`;
  }

  async generateTestSteps(incident) {
    // Generate test steps based on incident description and root cause
    const steps = [
      {
        action: 'navigate',
        target: this.extractAffectedURL(incident),
        description: 'Navigate to affected page/feature'
      }
    ];
    
    // Add steps based on user flow
    if (incident.userFlow === 'registration') {
      steps.push(
        { action: 'fill', target: 'registration form', description: 'Fill registration form' },
        { action: 'submit', target: 'form', description: 'Submit registration' }
      );
    } else if (incident.userFlow === 'payment') {
      steps.push(
        { action: 'add_to_cart', target: 'ticket', description: 'Add ticket to cart' },
        { action: 'checkout', target: 'payment form', description: 'Process payment' }
      );
    } else if (incident.userFlow === 'gallery') {
      steps.push(
        { action: 'load_gallery', target: 'gallery page', description: 'Load gallery images' },
        { action: 'scroll', target: 'gallery', description: 'Test lazy loading' }
      );
    } else if (incident.userFlow === 'admin') {
      steps.push(
        { action: 'login', target: 'admin panel', description: 'Admin authentication' },
        { action: 'navigate', target: 'dashboard', description: 'Access dashboard' }
      );
    }
    
    // Add error condition simulation
    steps.push({
      action: 'simulate_error',
      target: incident.rootCause || 'system',
      description: `Simulate condition that caused: ${incident.title}`
    });
    
    return steps;
  }

  extractExpectedBehavior(incident) {
    return `System should handle ${incident.userFlow} errors gracefully without user impact`;
  }

  generateAssertions(incident) {
    const assertions = [
      'Page should remain responsive',
      'Error messages should be user-friendly',
      'System should degrade gracefully'
    ];
    
    if (incident.userFlow === 'payment') {
      assertions.push('Payment should not be charged on error');
      assertions.push('Transaction state should be consistent');
    }
    
    if (incident.userFlow === 'registration') {
      assertions.push('User data should not be lost');
      assertions.push('Registration should be retryable');
    }
    
    if (incident.userFlow === 'gallery') {
      assertions.push('Images should load with fallback');
      assertions.push('Performance should remain acceptable');
    }
    
    if (incident.userFlow === 'admin') {
      assertions.push('Admin session should remain secure');
      assertions.push('Data integrity should be maintained');
    }
    
    return assertions;
  }

  extractPrimaryErrorType(incident) {
    const errorTypes = incident.errorSignatures || [];
    return errorTypes[0] || 'unknown';
  }

  extractAffectedURL(incident) {
    // Extract URL from incident description or infer from user flow
    const urlPatterns = {
      payment: '/tickets',
      registration: '/register',
      gallery: '/gallery',
      admin: '/admin',
      newsletter: '/newsletter'
    };
    
    return urlPatterns[incident.userFlow] || '/';
  }

  calculatePriority(incident) {
    const priorityMap = {
      critical: 'high',
      high: 'high',
      medium: 'medium',
      low: 'low'
    };
    
    return priorityMap[incident.severity] || 'medium';
  }

  estimateImplementationEffort(incident) {
    const effortMap = {
      payment: 'high',
      authentication: 'medium',
      registration: 'medium',
      gallery: 'medium',
      admin: 'high',
      newsletter: 'low'
    };
    
    return effortMap[incident.userFlow] || 'medium';
  }

  generateScenarioId() {
    return `scenario_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * ML-ready predictive analysis
 */
class MLPredictiveAnalyzer {
  constructor() {
    this.features = [];
    this.models = new Map();
  }

  async updateModels(correlations, patterns) {
    // Prepare features for ML training
    const features = this.extractFeatures(correlations, patterns);
    this.features.push(...features);
    
    // In production, this would train/update ML models
    console.log(`=� ML models updated with ${features.length} new features`);
    
    // Store features for external ML training
    await this.storeFeatures(features);
  }

  extractFeatures(correlations, patterns) {
    return correlations.map(correlation => ({
      // Temporal features
      timeToIncident: correlation.timeDifference,
      dayOfWeek: new Date(correlation.timestamp).getDay(),
      hourOfDay: new Date(correlation.timestamp).getHours(),
      
      // Test features
      testSeverity: this.encodeSeverity(correlation.metadata.testSeverity),
      testRetryCount: correlation.metadata.retryCount || 0,
      testFlakyScore: correlation.metadata.flakyScore || 0,
      testDuration: correlation.metadata.testDuration || 0,
      
      // Incident features
      incidentSeverity: this.encodeSeverity(correlation.metadata.incidentSeverity),
      businessImpact: correlation.businessImpact,
      preventable: correlation.metadata.preventable ? 1 : 0,
      customerImpact: correlation.metadata.customerImpact || 0,
      revenueImpact: correlation.metadata.revenueImpact || 0,
      
      // Correlation features
      correlationStrength: correlation.strength,
      confidence: correlation.confidence,
      predictivePower: correlation.predictivePower,
      factorCount: correlation.factors.length,
      
      // Pattern features
      cascadeRisk: this.calculateCascadeRisk(patterns, correlation),
      recurringRisk: this.calculateRecurringRisk(patterns, correlation),
      silentFailureRisk: this.calculateSilentFailureRisk(patterns, correlation),
      
      // Environment features
      environment: this.encodeEnvironment(correlation.metadata.environment),
      userFlow: this.encodeUserFlow(correlation.metadata.userFlow),
      errorType: this.encodeErrorType(correlation.metadata.testErrorType),
      
      // Target variable (what we want to predict)
      willCauseIncident: correlation.strength > 0.7 ? 1 : 0,
      
      // Metadata
      timestamp: correlation.timestamp,
      correlationId: correlation.id
    }));
  }

  async storeFeatures(features) {
    // Store features in format suitable for ML training
    const featureData = {
      features,
      timestamp: new Date(),
      version: '1.0',
      schema: this.getFeatureSchema()
    };
    
    try {
      const dataDir = path.join(__dirname, '..', 'data', 'ml');
      await fs.mkdir(dataDir, { recursive: true });
      
      const filename = `features_${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(dataDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(featureData, null, 2));
      console.log(`> ML features stored: ${filepath}`);
    } catch (error) {
      console.warn('Could not store ML features:', error.message);
    }
  }

  getFeatureSchema() {
    return {
      temporal: ['timeToIncident', 'dayOfWeek', 'hourOfDay'],
      test: ['testSeverity', 'testRetryCount', 'testFlakyScore', 'testDuration'],
      incident: ['incidentSeverity', 'businessImpact', 'preventable', 'customerImpact', 'revenueImpact'],
      correlation: ['correlationStrength', 'confidence', 'predictivePower', 'factorCount'],
      pattern: ['cascadeRisk', 'recurringRisk', 'silentFailureRisk'],
      environment: ['environment', 'userFlow', 'errorType'],
      target: ['willCauseIncident']
    };
  }

  encodeSeverity(severity) {
    const severityMap = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityMap[severity] || 1;
  }

  encodeEnvironment(environment) {
    const envMap = { production: 3, staging: 2, development: 1 };
    return envMap[environment] || 1;
  }

  encodeUserFlow(userFlow) {
    const flowMap = { 
      payment: 6, admin: 5, authentication: 4, 
      registration: 3, gallery: 2, newsletter: 1, general: 0 
    };
    return flowMap[userFlow] || 0;
  }

  encodeErrorType(errorType) {
    const errorMap = { 
      database: 6, network: 5, authentication: 4, 
      performance: 3, validation: 2, ui: 1, unknown: 0 
    };
    return errorMap[errorType] || 0;
  }

  calculateCascadeRisk(patterns, correlation) {
    const cascadePatterns = patterns.filter(p => p.type === 'failure_cascade');
    return cascadePatterns.length > 0 ? 
      cascadePatterns.reduce((sum, p) => sum + p.riskLevel, 0) / cascadePatterns.length : 0;
  }

  calculateRecurringRisk(patterns, correlation) {
    const recurringPatterns = patterns.filter(p => p.type === 'recurring_failure');
    return recurringPatterns.length > 0 ? 
      recurringPatterns.reduce((sum, p) => sum + p.riskLevel, 0) / recurringPatterns.length : 0;
  }

  calculateSilentFailureRisk(patterns, correlation) {
    const silentPatterns = patterns.filter(p => p.type === 'silent_failures');
    return silentPatterns.length > 0 ? silentPatterns[0].riskLevel : 0;
  }
}

/**
 * Data storage and retrieval
 */
class IncidentDataStore {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'incidents');
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create data directory:', error.message);
    }
  }

  async storeAnalysisResults(results) {
    const filename = `analysis_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(results, null, 2));
      console.log(`=� Analysis results stored: ${filepath}`);
    } catch (error) {
      console.warn('Could not store analysis results:', error.message);
    }
  }

  async loadHistoricalData(days = 30) {
    try {
      const files = await fs.readdir(this.dataDir);
      const recentFiles = files
        .filter(f => f.startsWith('analysis_') && f.endsWith('.json'))
        .sort()
        .slice(-days);
      
      const data = [];
      for (const file of recentFiles) {
        const content = await fs.readFile(path.join(this.dataDir, file), 'utf8');
        data.push(JSON.parse(content));
      }
      
      return data;
    } catch (error) {
      console.warn('Could not load historical data:', error.message);
      return [];
    }
  }

  async storeIncidentData(incidents) {
    const filename = `incidents_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(incidents, null, 2));
      console.log(`=� Incident data stored: ${filepath}`);
    } catch (error) {
      console.warn('Could not store incident data:', error.message);
    }
  }

  async storeTestResults(testResults) {
    const filename = `test_results_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(testResults, null, 2));
      console.log(`>� Test results stored: ${filepath}`);
    } catch (error) {
      console.warn('Could not store test results:', error.message);
    }
  }
}

// Export factory function for easy integration
export function createIncidentCorrelator(options = {}) {
  return new IncidentCorrelator(options);
}

// Export individual classes for advanced usage
export {
  IncidentCorrelator,
  PatternAnalyzer,
  AlertManager,
  TestScenarioGenerator,
  MLPredictiveAnalyzer,
  IncidentDataStore
};

// Example usage and integration helpers
export const CorrelatorHelpers = {
  /**
   * Quick setup for production environment
   */
  async setupForProduction(config = {}) {
    const correlator = new IncidentCorrelator({
      integrations: {
        incidentManagement: 'datadog',
        alerting: 'slack',
        monitoring: 'prometheus'
      },
      alertThresholds: {
        failureRate: 0.25,
        patternConfidence: 0.8,
        businessImpactThreshold: 'medium'
      },
      ...config
    });
    
    return correlator;
  },

  /**
   * Integration with Playwright test results
   */
  async integrateWithPlaywright(testResults) {
    const correlator = await this.setupForProduction();
    
    // Transform Playwright results to our format
    const normalizedResults = testResults.map(result => ({
      id: `playwright_${result.testId}`,
      timestamp: result.startTime,
      testSuite: result.project?.name || 'default',
      testName: result.title,
      status: result.status, // passed/failed/skipped
      duration: result.duration,
      error: result.error,
      browser: result.project?.use?.browserName,
      environment: process.env.NODE_ENV || 'development',
      metadata: {
        retryCount: result.retry || 0,
        annotations: result.annotations || [],
        performanceMetrics: result.timing || {}
      }
    }));
    
    return normalizedResults;
  },

  /**
   * Sample incident data for testing and demonstration
   */
  generateSampleIncidents() {
    return [
      {
        id: 'INC-2024-001',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        title: 'Payment processing failures during high traffic',
        description: 'Stripe webhook timeouts causing payment confirmation delays',
        severity: 'high',
        status: 'resolved',
        affectedServices: ['payment-api', 'stripe-integration'],
        rootCause: 'webhook timeout configuration insufficient for traffic load',
        environment: 'production',
        tags: ['payment', 'webhook', 'timeout'],
        metadata: {
          customerImpact: 150,
          revenueImpact: 5000,
          teamOwner: 'backend-team',
          escalationLevel: 2
        }
      },
      {
        id: 'INC-2024-002',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        title: 'Gallery loading performance degradation',
        description: 'Google Drive API rate limiting causing image load failures',
        severity: 'medium',
        status: 'resolved',
        affectedServices: ['gallery-api', 'google-drive-integration'],
        rootCause: 'API rate limit exceeded during peak usage',
        environment: 'production',
        tags: ['gallery', 'performance', 'api-limit'],
        metadata: {
          customerImpact: 80,
          revenueImpact: 0,
          teamOwner: 'frontend-team',
          escalationLevel: 1
        }
      },
      {
        id: 'INC-2024-003',
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        title: 'Admin authentication failures',
        description: 'JWT token validation errors causing admin login failures',
        severity: 'medium',
        status: 'resolved',
        affectedServices: ['auth-service', 'admin-panel'],
        rootCause: 'JWT secret rotation without proper deployment coordination',
        environment: 'production',
        tags: ['authentication', 'admin', 'jwt'],
        metadata: {
          customerImpact: 5,
          revenueImpact: 0,
          teamOwner: 'security-team',
          escalationLevel: 1
        }
      }
    ];
  },

  /**
   * Sample test results for correlation testing
   */
  generateSampleTestResults() {
    return [
      {
        id: 'test-payment-001',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        testSuite: 'payment-flow',
        testName: 'should process payment successfully',
        status: 'failed',
        duration: 15000,
        error: new Error('Payment webhook timeout'),
        browser: 'chromium',
        environment: 'staging',
        metadata: {
          retryCount: 2,
          flakyScore: 0.3
        }
      },
      {
        id: 'test-gallery-001',
        timestamp: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 hours ago
        testSuite: 'gallery-performance',
        testName: 'should load gallery images within 5 seconds',
        status: 'failed',
        duration: 8000,
        error: new Error('Network timeout'),
        browser: 'chromium',
        environment: 'staging',
        metadata: {
          retryCount: 1,
          flakyScore: 0.1,
          performanceMetrics: { loadTime: 8000 }
        }
      },
      {
        id: 'test-admin-001',
        timestamp: new Date(Date.now() - 13 * 60 * 60 * 1000), // 13 hours ago
        testSuite: 'admin-authentication',
        testName: 'should authenticate admin user',
        status: 'failed',
        duration: 2000,
        error: new Error('Authentication failed'),
        browser: 'chromium',
        environment: 'staging',
        metadata: {
          retryCount: 0,
          flakyScore: 0.0
        }
      }
    ];
  },

  /**
   * Run a complete correlation analysis with sample data
   */
  async runSampleAnalysis() {
    console.log('=� Running sample incident correlation analysis...\n');
    
    const correlator = await this.setupForProduction();
    const incidents = this.generateSampleIncidents();
    const testResults = this.generateSampleTestResults();
    
    const results = await correlator.correlateIncidents(testResults, incidents);
    
    console.log('\n=� Analysis Results:');
    console.log('====================');
    console.log(`Total Correlations: ${results.correlations.length}`);
    console.log(`Risk Patterns Detected: ${results.riskPatterns.length}`);
    console.log(`New Test Scenarios: ${results.newTestScenarios.length}`);
    console.log(`Recommendations: ${results.recommendations.length}`);
    console.log(`Potential Impact Reduction: ${(results.summary.potentialImpactReduction * 100).toFixed(1)}%`);
    
    if (results.correlations.length > 0) {
      console.log('\n= Top Correlations:');
      results.correlations.slice(0, 3).forEach((correlation, index) => {
        console.log(`${index + 1}. Strength: ${(correlation.strength * 100).toFixed(1)}% - ${correlation.factors.join(', ')}`);
      });
    }
    
    if (results.riskPatterns.length > 0) {
      console.log('\n�  Risk Patterns:');
      results.riskPatterns.forEach((pattern, index) => {
        console.log(`${index + 1}. ${pattern.type}: ${pattern.description} (Risk: ${(pattern.riskLevel * 100).toFixed(1)}%)`);
      });
    }
    
    if (results.recommendations.length > 0) {
      console.log('\n=� Top Recommendations:');
      results.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.description}`);
      });
    }
    
    return results;
  }
};