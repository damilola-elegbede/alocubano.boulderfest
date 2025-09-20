#!/usr/bin/env node

/**
 * Example usage of the Production Incident Correlation System
 * Demonstrates how to integrate the system with real E2E test results
 * and production incident data for proactive risk detection.
 */

import { CorrelatorHelpers, createIncidentCorrelator } from './incident-correlator.js';

async function demonstrateIncidentCorrelation() {
  console.log('Production Incident Correlation System Demo');
  console.log('='.repeat(50));

  try {
    // Run sample analysis with built-in data
    const results = await CorrelatorHelpers.runSampleAnalysis();

    console.log('\nDetailed Analysis:');
    console.log('='.repeat(25));

    // Show correlation details
    if (results.correlations.length > 0) {
      console.log('\nCorrelation Analysis:');
      results.correlations.forEach((correlation, index) => {
        console.log(`\n${index + 1}. Correlation ID: ${correlation.id}`);
        console.log(`   Strength: ${(correlation.strength * 100).toFixed(1)}%`);
        console.log(`   Confidence: ${(correlation.confidence * 100).toFixed(1)}%`);
        console.log(`   Factors: ${correlation.factors.join(', ')}`);
        console.log(`   Time Difference: ${Math.round(correlation.timeDifference / (1000 * 60))} minutes`);
        console.log(`   Business Impact: ${(correlation.businessImpact * 100).toFixed(1)}%`);
        console.log(`   Preventable: ${correlation.metadata.preventable ? 'Yes' : 'No'}`);
      });
    }

    // Show generated test scenarios
    if (results.newTestScenarios.length > 0) {
      console.log('\nGenerated Test Scenarios:');
      results.newTestScenarios.forEach((scenario, index) => {
        console.log(`\n${index + 1}. ${scenario.name}`);
        console.log(`   Description: ${scenario.description}`);
        console.log(`   Priority: ${scenario.priority.toUpperCase()}`);
        console.log(`   User Flow: ${scenario.userFlow}`);
        console.log(`   Effort: ${scenario.estimatedEffort}`);
        console.log(`   Expected Impact: ${(scenario.expectedImpact * 100).toFixed(1)}%`);
        console.log(`   Test Steps:`);
        scenario.testSteps.forEach((step, stepIndex) => {
          console.log(`     ${stepIndex + 1}. ${step.action}: ${step.description}`);
        });
        console.log(`   Assertions:`);
        scenario.assertions.forEach((assertion, assertIndex) => {
          console.log(`     - ${assertion}`);
        });
      });
    }

    // Show actionable recommendations
    if (results.recommendations.length > 0) {
      console.log('\nActionable Recommendations:');
      results.recommendations.forEach((rec, index) => {
        console.log(`\n${index + 1}. [${rec.priority.toUpperCase()}] ${rec.type.replace('_', ' ').toUpperCase()}`);
        console.log(`   Description: ${rec.description}`);
        console.log(`   Action: ${rec.action}`);
        console.log(`   Effort: ${rec.effort}`);
        console.log(`   Impact: ${(rec.impact * 100).toFixed(1)}%`);
      });
    }

    console.log('\nDemo completed successfully!');
    console.log('\nNext Steps:');
    console.log('1. Integrate with your CI/CD pipeline to collect test results');
    console.log('2. Connect to your incident management system (DataDog, PagerDuty, etc.)');
    console.log('3. Set up alerting channels (Slack, email, SMS)');
    console.log('4. Implement generated test scenarios');
    console.log('5. Monitor reduction in production incidents');

  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log('Starting Production Incident Correlation System Demo...\n');

  // Run the main demonstration
  await demonstrateIncidentCorrelation();

  console.log('\nAll demonstrations completed successfully!');
  console.log('\nFor more information, see:');
  console.log('   - incident-correlator.js: Full system implementation');
  console.log('   - Integration examples in this file');
  console.log('   - Documentation in the system comments');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  demonstrateIncidentCorrelation
};