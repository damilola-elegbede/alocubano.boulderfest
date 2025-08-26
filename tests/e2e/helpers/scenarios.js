/**
 * Test Scenario Definitions
 * Predefined test scenarios for common user journeys
 */

import { TestDataFactory } from './test-data-factory.js';
import { DatabaseCleanup } from './database-cleanup.js';

/**
 * Test Scenarios Manager
 */
export class TestScenarios {
  constructor(options = {}) {
    this.factory = options.factory || new TestDataFactory();
    this.cleanup = options.cleanup || new DatabaseCleanup();
  }

  /**
   * VIP Purchase Journey
   * High-value customer purchasing VIP passes with dietary requirements
   */
  async vipPurchaseJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      ticketType: 'vip-pass',
      customer: {
        name: 'Victoria Important-Person',
        dietaryRestrictions: 'Gluten-free, Dairy-free',
        emergencyContact: 'Personal Assistant - 555-VIP-0001'
      },
      registration: {
        status: 'confirmed',
        paymentStatus: 'paid',
        checkInStatus: false
      },
      transaction: {
        status: 'completed',
        amount: 30000, // $300 in cents
        paymentMethod: 'card',
        brand: 'amex',
        last4: '0005'
      }
    });

    return {
      ...scenario,
      scenarioType: 'vip-purchase',
      expectedOutcomes: {
        ticketGenerated: true,
        emailSent: true,
        walletPassAvailable: true,
        adminNotification: true
      }
    };
  }

  /**
   * Student Registration Journey
   * Student discount ticket purchase with verification
   */
  async studentRegistrationJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      ticketType: 'student-pass',
      customer: {
        name: 'Sarah Student',
        email: `student_${this.factory.getTestRunId()}@university.edu`,
        dietaryRestrictions: 'Vegetarian'
      },
      registration: {
        status: 'pending-verification',
        paymentStatus: 'pending',
        metadata: {
          studentId: 'STU123456',
          university: 'CU Boulder',
          verificationRequired: true
        }
      }
    });

    return {
      ...scenario,
      scenarioType: 'student-registration',
      expectedOutcomes: {
        verificationRequired: true,
        discountApplied: true,
        manualApproval: true
      }
    };
  }

  /**
   * Group Purchase Journey
   * Multiple tickets in single transaction
   */
  async groupPurchaseJourney(groupSize = 5) {
    const customers = [];
    const tickets = [];
    const registrations = [];
    
    // Generate lead customer
    const leadCustomer = this.factory.generateCustomer({
      name: 'Group Leader',
      email: `group_leader_${this.factory.getTestRunId()}@e2e-test.com`
    });

    // Generate group members
    for (let i = 0; i < groupSize; i++) {
      const customer = i === 0 ? leadCustomer : this.factory.generateCustomer({
        name: `Group Member ${i}`,
        email: `group_member_${i}_${this.factory.getTestRunId()}@e2e-test.com`
      });
      
      const ticket = this.factory.generateTicket('full-pass');
      const registration = this.factory.generateRegistration(customer, ticket, {
        status: 'confirmed',
        paymentStatus: 'paid',
        groupId: `GROUP_${this.factory.getTestRunId()}`,
        leadCustomerId: leadCustomer.id
      });
      
      customers.push(customer);
      tickets.push(ticket);
      registrations.push(registration);
    }

    // Single transaction for all tickets
    const transaction = this.factory.generateTransaction(registrations[0], {
      status: 'completed',
      amount: 150 * groupSize * 100, // Total in cents
      metadata: {
        groupSize,
        registrationIds: registrations.map(r => r.id)
      }
    });

    return {
      leadCustomer,
      customers,
      tickets,
      registrations,
      transaction,
      testRunId: this.factory.getTestRunId(),
      scenarioType: 'group-purchase',
      expectedOutcomes: {
        groupDiscount: groupSize >= 5,
        bulkEmailSent: true,
        groupCoordination: true
      }
    };
  }

  /**
   * Failed Payment Recovery Journey
   * Payment fails then succeeds on retry
   */
  async failedPaymentRecovery() {
    const customer = this.factory.generateCustomer();
    const ticket = this.factory.generateTicket('day-pass');
    const registration = this.factory.generateRegistration(customer, ticket, {
      status: 'payment-failed',
      paymentStatus: 'failed'
    });
    
    // Failed transaction
    const failedTransaction = this.factory.generateTransaction(registration, {
      status: 'failed',
      error: 'card_declined',
      errorMessage: 'Your card was declined'
    });

    // Successful retry transaction
    const successTransaction = this.factory.generateTransaction(registration, {
      status: 'completed',
      previousAttemptId: failedTransaction.id
    });

    return {
      customer,
      ticket,
      registration,
      failedTransaction,
      successTransaction,
      testRunId: this.factory.getTestRunId(),
      scenarioType: 'payment-recovery',
      expectedOutcomes: {
        retryAllowed: true,
        cartPreserved: true,
        emailNotification: true
      }
    };
  }

  /**
   * Newsletter Subscription Journey
   * Complete newsletter signup and management flow
   */
  async newsletterJourney() {
    const scenario = this.factory.generateScenario('newsletter-flow', {
      count: 5
    });

    // Add specific subscriber states
    scenario.subscribers[0].status = 'active';
    scenario.subscribers[1].status = 'unsubscribed';
    scenario.subscribers[2].status = 'bounced';
    scenario.subscribers[3].status = 'active';
    scenario.subscribers[4].status = 'pending';

    return {
      ...scenario,
      scenarioType: 'newsletter-management',
      expectedOutcomes: {
        doubleOptIn: true,
        unsubscribeLink: true,
        preferencesManagement: true
      }
    };
  }

  /**
   * Check-in Flow Journey
   * Event day check-in process
   */
  async checkInJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      registration: {
        status: 'confirmed',
        paymentStatus: 'paid',
        checkInStatus: false
      }
    });

    // Simulate check-in
    const checkInData = {
      checkInTime: new Date().toISOString(),
      checkInMethod: 'qr-code',
      checkInBy: 'staff@festival.com',
      deviceId: 'DEVICE_001'
    };

    return {
      ...scenario,
      checkInData,
      scenarioType: 'event-checkin',
      expectedOutcomes: {
        qrCodeValid: true,
        duplicateCheckInPrevented: true,
        realTimeUpdate: true
      }
    };
  }

  /**
   * Admin Dashboard Journey
   * Admin viewing and managing registrations
   */
  async adminDashboardJourney() {
    // Generate multiple registrations for dashboard
    const registrations = [];
    const statuses = ['confirmed', 'pending', 'cancelled', 'confirmed', 'confirmed'];
    
    for (let i = 0; i < 5; i++) {
      const customer = this.factory.generateCustomer();
      const ticket = this.factory.generateTicket(
        i === 0 ? 'vip-pass' : i === 4 ? 'student-pass' : 'full-pass'
      );
      const registration = this.factory.generateRegistration(customer, ticket, {
        status: statuses[i],
        paymentStatus: statuses[i] === 'confirmed' ? 'paid' : 'pending',
        checkInStatus: i < 2
      });
      registrations.push({ customer, ticket, registration });
    }

    const adminScenario = this.factory.generateScenario('admin-flow');

    return {
      registrations,
      admin: adminScenario.adminUser,
      testRunId: this.factory.getTestRunId(),
      scenarioType: 'admin-dashboard',
      expectedOutcomes: {
        authenticationRequired: true,
        dataFiltering: true,
        exportCapability: true,
        bulkActions: true
      }
    };
  }

  /**
   * Refund Journey
   * Customer requesting and receiving refund
   */
  async refundJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      registration: {
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancelledAt: new Date().toISOString(),
        cancelReason: 'Customer request'
      },
      transaction: {
        status: 'refunded',
        refundAmount: 15000, // Full refund
        refundedAt: new Date().toISOString(),
        refundId: `re_${this.factory.getTestRunId()}`
      }
    });

    return {
      ...scenario,
      scenarioType: 'refund-process',
      expectedOutcomes: {
        ticketCancelled: true,
        emailNotification: true,
        stripeRefund: true,
        adminLog: true
      }
    };
  }

  /**
   * Mobile Experience Journey
   * Complete flow on mobile device
   */
  async mobileJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      customer: {
        metadata: {
          deviceType: 'mobile',
          userAgent: 'iPhone',
          viewport: '375x667'
        }
      }
    });

    return {
      ...scenario,
      scenarioType: 'mobile-experience',
      device: {
        type: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        viewport: { width: 375, height: 667 }
      },
      expectedOutcomes: {
        responsiveLayout: true,
        touchOptimized: true,
        walletIntegration: true
      }
    };
  }

  /**
   * Accessibility Journey
   * User with accessibility needs
   */
  async accessibilityJourney() {
    const scenario = this.factory.generateScenario('purchase-flow', {
      customer: {
        metadata: {
          accessibilityNeeds: ['screen-reader', 'keyboard-navigation'],
          preferences: {
            fontSize: 'large',
            contrast: 'high'
          }
        },
        emergencyContact: 'Care Assistant - 555-HELP-001',
        dietaryRestrictions: 'Multiple allergies - see notes'
      }
    });

    return {
      ...scenario,
      scenarioType: 'accessibility-flow',
      expectedOutcomes: {
        screenReaderCompatible: true,
        keyboardNavigable: true,
        ariaLabels: true,
        altTexts: true
      }
    };
  }

  /**
   * Clean up all data from a scenario
   */
  async cleanupScenario(scenario) {
    const testRunId = scenario.testRunId || scenario.factory?.getTestRunId();
    if (!testRunId) {
      throw new Error('No testRunId found in scenario');
    }
    
    return await this.cleanup.cleanupByTestRunId(testRunId);
  }

  /**
   * Verify scenario data was created
   */
  async verifyScenarioData(scenario) {
    // This would connect to database and verify records exist
    // For now, return mock verification
    return {
      verified: true,
      testRunId: scenario.testRunId,
      recordsFound: {
        customers: scenario.customers?.length || 1,
        tickets: scenario.tickets?.length || 1,
        registrations: scenario.registrations?.length || 1,
        transactions: scenario.transaction ? 1 : 0
      }
    };
  }
}

// Export singleton instance
export const testScenarios = new TestScenarios();

// Export helper functions
export async function runScenario(scenarioName) {
  const scenarios = new TestScenarios();
  const scenarioMap = {
    'vip': scenarios.vipPurchaseJourney.bind(scenarios),
    'student': scenarios.studentRegistrationJourney.bind(scenarios),
    'group': scenarios.groupPurchaseJourney.bind(scenarios),
    'payment-recovery': scenarios.failedPaymentRecovery.bind(scenarios),
    'newsletter': scenarios.newsletterJourney.bind(scenarios),
    'checkin': scenarios.checkInJourney.bind(scenarios),
    'admin': scenarios.adminDashboardJourney.bind(scenarios),
    'refund': scenarios.refundJourney.bind(scenarios),
    'mobile': scenarios.mobileJourney.bind(scenarios),
    'accessibility': scenarios.accessibilityJourney.bind(scenarios)
  };
  
  const scenarioFunction = scenarioMap[scenarioName];
  if (!scenarioFunction) {
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }
  
  return await scenarioFunction();
}

export default TestScenarios;