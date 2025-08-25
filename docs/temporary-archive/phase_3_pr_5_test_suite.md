# Phase 3 PR 5: Comprehensive Test Suite

## Overview
- **PRD Reference**: [prd.md](./prd.md) Section: Testing Requirements
- **Requirements**: REQ-TEST-001, REQ-TEST-002, REQ-TEST-003, REQ-TEST-004, REQ-TEST-005
- **Dependencies**: Phase 1 and Phase 2 complete
- **Duration**: 2 days

## Tasks

### Task_3_5_01: Create Registration Flow Tests
- **Assignee**: test-engineer
- **Execution**: Independent
- **Duration**: 4 hours
- **PRD Requirements**: REQ-TEST-003, REQ-TEST-005
- **Technical Details**:
  - Create `/tests/registration-flow.test.js`
  - Test universal registration requirement
  - Test token validation and expiration
  - Test attendee confirmation emails
  - Test reminder scheduling
  - Use direct API calls (no abstractions)
  - Maintain readable test structure
- **Acceptance Criteria**:
  - All registration paths tested
  - Tests complete in <100ms
  - Zero test abstractions
  - Clear test descriptions
- **Testing**:
  - Single ticket registration
  - Multiple ticket registration
  - Expired ticket handling
  - Email delivery verification
- **PRD Validation**: Comprehensive flow testing per REQ-TEST-003

```javascript
// tests/registration-flow.test.js
import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

test('all ticket purchases require registration', async () => {
  // Test that both single and multiple tickets need registration
  const singleTicket = await testRequest('GET', '/api/registration/status/SINGLE-TXN');
  const multiTicket = await testRequest('GET', '/api/registration/status/MULTI-TXN');
  
  if (singleTicket.status === HTTP_STATUS.OK) {
    expect(singleTicket.data.registrationRequired).toBe(true);
    expect(singleTicket.data.tickets).toHaveLength(1);
    expect(singleTicket.data.tickets[0].registration_status).toBe('pending');
  }
  
  if (multiTicket.status === HTTP_STATUS.OK) {
    expect(multiTicket.data.registrationRequired).toBe(true);
    expect(multiTicket.data.tickets.length).toBeGreaterThan(1);
    expect(multiTicket.data.tickets.every(t => t.registration_status === 'pending')).toBe(true);
  }
});

test('registration updates ticket attendee fields', async () => {
  const registrationData = {
    ticketId: 'TKT-TEST12345',
    firstName: 'John',
    lastName: 'Doe',
    email: generateTestEmail()
  };
  
  const response = await testRequest('POST', '/api/tickets/register', registrationData);
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data.success).toBe(true);
    expect(response.data.confirmationSentTo).toBe(registrationData.email);
    
    // Verify ticket was updated
    const ticket = await testRequest('GET', `/api/tickets/${registrationData.ticketId}`);
    if (ticket.status === HTTP_STATUS.OK) {
      expect(ticket.data.attendee_first_name).toBe('John');
      expect(ticket.data.attendee_last_name).toBe('Doe');
      expect(ticket.data.attendee_email).toBe(registrationData.email);
      expect(ticket.data.registration_status).toBe('completed');
    }
  }
});

test('expired tickets cannot be registered', async () => {
  const expiredData = {
    ticketId: 'TKT-EXPIRED01',
    firstName: 'Late',
    lastName: 'User',
    email: generateTestEmail()
  };
  
  const response = await testRequest('POST', '/api/tickets/register', expiredData);
  
  if (response.status !== 0) {
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data.error).toMatch(/expired|deadline/i);
  }
});

test('attendee receives confirmation email upon registration', async () => {
  const registrationData = {
    ticketId: 'TKT-EMAIL001',
    firstName: 'Jane',
    lastName: 'Smith',
    email: generateTestEmail()
  };
  
  const response = await testRequest('POST', '/api/tickets/register', registrationData);
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data.confirmationSentTo).toBe(registrationData.email);
    
    // Verify email was logged
    const emailLog = await testRequest('GET', `/api/admin/ticket-emails/${registrationData.ticketId}`);
    if (emailLog.status === HTTP_STATUS.OK) {
      const confirmation = emailLog.data.find(e => e.email_type === 'attendee_confirmation');
      expect(confirmation).toBeTruthy();
      expect(confirmation.recipient_email).toBe(registrationData.email);
    }
  }
});

test('reminders are scheduled correctly for each ticket', async () => {
  const ticketId = 'TKT-REMIND01';
  const reminders = await testRequest('GET', `/api/admin/ticket-reminders/${ticketId}`);
  
  if (reminders.status === HTTP_STATUS.OK) {
    expect(reminders.data.reminders).toHaveLength(4);
    const types = reminders.data.reminders.map(r => r.reminder_type);
    expect(types).toEqual(['72hr', '48hr', '24hr', 'final']);
    
    // Verify scheduled times are correct
    reminders.data.reminders.forEach(reminder => {
      expect(reminder.status).toBe('scheduled');
      expect(new Date(reminder.scheduled_at)).toBeInstanceOf(Date);
    });
  }
});

test('registration completes entire transaction when all tickets done', async () => {
  // Register multiple tickets for same transaction
  const tickets = ['TKT-COMP001', 'TKT-COMP002', 'TKT-COMP003'];
  
  for (const ticketId of tickets) {
    await testRequest('POST', '/api/tickets/register', {
      ticketId,
      firstName: 'Test',
      lastName: `User${ticketId}`,
      email: generateTestEmail()
    });
  }
  
  // Check transaction status
  const txStatus = await testRequest('GET', '/api/registration/status/TXN-COMPLETE');
  if (txStatus.status === HTTP_STATUS.OK) {
    expect(txStatus.data.allTicketsRegistered).toBe(true);
    expect(txStatus.data.registrationCompleted).toBe(true);
  }
});
```

### Task_3_5_02: Add Registration Contract Tests
- **Assignee**: test-engineer
- **Execution**: Independent
- **Duration**: 2 hours
- **PRD Requirements**: REQ-TEST-001, REQ-TEST-005
- **Technical Details**:
  - Update `/tests/api-contracts.test.js`
  - Add registration endpoint contracts
  - Verify response structures
  - Test error response formats
  - Maintain existing test style
- **Acceptance Criteria**:
  - Contract validation complete
  - Response structures verified
  - Error formats consistent
  - Tests remain readable
- **Testing**:
  - Registration status structure
  - Registration response format
  - Error response structure
- **PRD Validation**: API contracts validated per REQ-TEST-001

```javascript
// Add to tests/api-contracts.test.js
test('registration API returns proper status structure', async () => {
  const response = await testRequest('GET', '/api/registration/TEST-TOKEN');
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('transactionId');
    expect(response.data).toHaveProperty('tickets');
    expect(response.data).toHaveProperty('registrationDeadline');
    expect(response.data).toHaveProperty('timeRemaining');
    expect(Array.isArray(response.data.tickets)).toBe(true);
    
    // Verify ticket structure
    if (response.data.tickets.length > 0) {
      const ticket = response.data.tickets[0];
      expect(ticket).toHaveProperty('ticketId');
      expect(ticket).toHaveProperty('ticketType');
      expect(ticket).toHaveProperty('registration_status');
      expect(ticket).toHaveProperty('attendee_first_name');
      expect(ticket).toHaveProperty('attendee_last_name');
      expect(ticket).toHaveProperty('attendee_email');
    }
  } else if (response.status === HTTP_STATUS.UNAUTHORIZED) {
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
  }
});

test('registration submission returns confirmation structure', async () => {
  const registrationData = {
    ticketId: 'TKT-CONTRACT1',
    firstName: 'Contract',
    lastName: 'Test',
    email: generateTestEmail()
  };
  
  const response = await testRequest('POST', '/api/tickets/register', registrationData);
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data).toHaveProperty('success');
    expect(response.data).toHaveProperty('message');
    expect(response.data).toHaveProperty('confirmationSentTo');
    expect(response.data).toHaveProperty('ticketId');
    expect(response.data.success).toBe(true);
    expect(response.data.confirmationSentTo).toBe(registrationData.email);
  } else if (response.status === HTTP_STATUS.BAD_REQUEST) {
    expect(response.data).toHaveProperty('error');
    expect(typeof response.data.error).toBe('string');
  }
});
```

### Task_3_5_03: Add Registration Validation Tests
- **Assignee**: test-engineer
- **Execution**: Depends on Task_3_5_01
- **Duration**: 3 hours
- **PRD Requirements**: REQ-TEST-002, REQ-SEC-002
- **Technical Details**:
  - Update `/tests/basic-validation.test.js`
  - Test name validation rules
  - Test email validation
  - Test XSS prevention
  - Test SQL injection prevention
- **Acceptance Criteria**:
  - All validation rules tested
  - Security vectors blocked
  - Valid inputs accepted
  - Clear error messages
- **Testing**:
  - Invalid character rejection
  - Length validation
  - XSS pattern blocking
  - SQL injection prevention
- **PRD Validation**: Validation testing per REQ-TEST-002

```javascript
// Add to tests/basic-validation.test.js
test('registration validates name fields correctly', async () => {
  const invalidNames = [
    { firstName: '', lastName: 'Valid' }, // Empty first name
    { firstName: 'A', lastName: 'Valid' }, // Too short
    { firstName: 'A'.repeat(51), lastName: 'Valid' }, // Too long
    { firstName: '<script>', lastName: 'XSS' }, // XSS attempt
    { firstName: "Robert'; DROP TABLE", lastName: 'Tables' }, // SQL injection
    { firstName: '123456', lastName: 'Numbers' }, // Numbers only
    { firstName: 'Test@#$', lastName: 'Special' } // Invalid characters
  ];
  
  for (const invalidName of invalidNames) {
    const response = await testRequest('POST', '/api/tickets/register', {
      ticketId: 'TKT-VALIDATE',
      ...invalidName,
      email: generateTestEmail()
    });
    
    if (response.status !== 0) {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data.error).toMatch(/invalid|prohibited|required|characters/i);
    }
  }
  
  // Test valid names are accepted
  const validNames = [
    { firstName: 'John', lastName: 'Doe' },
    { firstName: 'Mary-Jane', lastName: "O'Brien" },
    { firstName: 'José', lastName: 'González' },
    { firstName: 'François', lastName: 'Müller' }
  ];
  
  for (const validName of validNames) {
    const response = await testRequest('POST', '/api/tickets/register', {
      ticketId: `TKT-VALID${Math.random()}`,
      ...validName,
      email: generateTestEmail()
    });
    
    if (response.status !== 0) {
      // Valid names should not return 400
      expect(response.status).not.toBe(HTTP_STATUS.BAD_REQUEST);
    }
  }
});

test('registration validates email correctly', async () => {
  const invalidEmails = [
    'notanemail',
    '@example.com',
    'user@',
    'user@.com',
    'user@example',
    'user @example.com',
    'user@exam ple.com',
    '<script>@example.com'
  ];
  
  for (const email of invalidEmails) {
    const response = await testRequest('POST', '/api/tickets/register', {
      ticketId: 'TKT-EMAIL',
      firstName: 'Test',
      lastName: 'User',
      email
    });
    
    if (response.status !== 0) {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data.error).toMatch(/email|invalid|format/i);
    }
  }
});

test('registration prevents XSS in all fields', async () => {
  const xssVectors = [
    '<script>alert("xss")</script>',
    'javascript:alert(1)',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)">',
    '"><script>alert(1)</script>'
  ];
  
  for (const vector of xssVectors) {
    const response = await testRequest('POST', '/api/tickets/register', {
      ticketId: 'TKT-XSS',
      firstName: vector,
      lastName: 'Safe',
      email: generateTestEmail()
    });
    
    if (response.status !== 0) {
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data.error).toMatch(/prohibited|invalid|characters/i);
    }
  }
});
```

### Task_3_5_04: Add Performance Benchmarks
- **Assignee**: performance-engineer
- **Execution**: Depends on all other tasks
- **Duration**: 2 hours
- **PRD Requirements**: REQ-TEST-004, REQ-PERF-002
- **Technical Details**:
  - Create performance benchmarks
  - Measure test execution time
  - Verify <500ms total execution
  - Monitor API response times
  - Check database query performance
- **Acceptance Criteria**:
  - Tests complete in <500ms
  - API responses <100ms
  - Database queries <50ms
  - No performance regression
- **Testing**:
  - Measure test suite time
  - Benchmark API endpoints
  - Profile database queries
- **PRD Validation**: Performance maintained per REQ-TEST-004

## Success Criteria
- All registration flows tested
- API contracts validated
- Security validation complete
- Performance benchmarks met
- Test execution <500ms
- Zero test abstractions
- All PRD testing requirements satisfied

## Testing Checklist
- [ ] Universal registration tested
- [ ] Token validation tested
- [ ] Email confirmation tested
- [ ] Reminder scheduling tested
- [ ] API contracts validated
- [ ] Input validation tested
- [ ] XSS prevention verified
- [ ] SQL injection blocked
- [ ] Performance benchmarks met
- [ ] Tests remain readable

## Notes
- Maintain existing test patterns
- Use direct API calls only
- Keep tests simple and readable
- Monitor test execution time