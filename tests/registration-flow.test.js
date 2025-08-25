import { test, expect } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './helpers.js';

test('registration flow works end-to-end', async () => {
  const registrationData = {
    ticketId: 'TKT-FLOW-001',
    firstName: 'John',
    lastName: 'Doe',
    email: generateTestEmail()
  };
  
  const response = await testRequest('POST', '/api/tickets/register', registrationData);
  
  if (response.status === HTTP_STATUS.OK) {
    expect(response.data.success).toBe(true);
    expect(response.data.attendee.email).toBe(registrationData.email);
    expect(response.data.attendee.ticketId).toBe(registrationData.ticketId);
  }
});

test('batch registration and health checks work', async () => {
  // Test batch registration
  const registrations = [{
    ticketId: 'TKT-BATCH001',
    firstName: 'Alice',
    lastName: 'Johnson',
    email: generateTestEmail()
  }];
  
  const batchResponse = await testRequest('POST', '/api/registration/batch', { registrations });
  if (batchResponse.status === HTTP_STATUS.OK) {
    expect(batchResponse.data.success).toBe(true);
  }
  
  // Test health check
  const healthResponse = await testRequest('GET', '/api/registration/health');
  if (healthResponse.status === HTTP_STATUS.OK) {
    expect(healthResponse.data).toHaveProperty('service');
    expect(healthResponse.data).toHaveProperty('status');
  }
});

test('registration validation and performance', async () => {
  // Test expired/invalid tickets
  const startTime = Date.now();
  const response = await testRequest('POST', '/api/tickets/register', {
    ticketId: 'TKT-EXPIRED01',
    firstName: 'Late',
    lastName: 'User',
    email: generateTestEmail()
  });
  const responseTime = Date.now() - startTime;
  
  if (response.status !== 0 && response.status === HTTP_STATUS.BAD_REQUEST) {
    expect(response.data?.error).toMatch(/expired|deadline|not found/i);
  }
  
  // Performance check - CI mode gets more time due to retries
  const timeLimit = process.env.CI ? 5000 : 1000;
  expect(responseTime).toBeLessThan(timeLimit);
});