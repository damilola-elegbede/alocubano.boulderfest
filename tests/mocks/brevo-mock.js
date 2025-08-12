/**
 * Simple Brevo API Mock for Testing
 * Provides predictable responses without external dependencies
 */

class BrevoMock {
  constructor() {
    this.subscribers = new Map();
    this.nextId = 1;
  }

  // Mock contact creation
  async createContact(contactData) {
    const { email, attributes = {}, listIds = [] } = contactData;
    
    // Simulate duplicate email error
    if (this.subscribers.has(email)) {
      const error = new Error('Contact already exists');
      error.response = { status: 400 };
      throw error;
    }

    const contact = {
      id: this.nextId++,
      email,
      attributes,
      listIds,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };

    this.subscribers.set(email, contact);
    
    return {
      id: contact.id,
      email: contact.email
    };
  }

  // Mock contact retrieval
  async getContact(email) {
    const contact = this.subscribers.get(email);
    
    if (!contact) {
      const error = new Error('Contact not found');
      error.response = { status: 404 };
      throw error;
    }

    return contact;
  }

  // Mock contact update
  async updateContact(email, updateData) {
    const contact = this.subscribers.get(email);
    
    if (!contact) {
      const error = new Error('Contact not found');
      error.response = { status: 404 };
      throw error;
    }

    Object.assign(contact, updateData, {
      modifiedAt: new Date().toISOString()
    });

    this.subscribers.set(email, contact);
    return contact;
  }

  // Mock contact deletion
  async deleteContact(email) {
    if (!this.subscribers.has(email)) {
      const error = new Error('Contact not found');
      error.response = { status: 404 };
      throw error;
    }

    this.subscribers.delete(email);
    return { success: true };
  }

  // Mock email sending
  async sendTransactionalEmail(emailData) {
    return {
      messageId: `mock-msg-${Date.now()}`,
      status: 'sent'
    };
  }

  // Helper methods for testing
  reset() {
    this.subscribers.clear();
    this.nextId = 1;
  }

  getSubscriberCount() {
    return this.subscribers.size;
  }

  hasSubscriber(email) {
    return this.subscribers.has(email);
  }
}

// Factory function for creating mock instances
export function createBrevoMock() {
  return new BrevoMock();
}

// Pre-configured mock for common test scenarios
export function createBrevoMockWithData() {
  const mock = new BrevoMock();
  
  // Pre-populate with test data
  mock.subscribers.set('existing@example.com', {
    id: 1,
    email: 'existing@example.com',
    attributes: { firstName: 'Existing', lastName: 'User' },
    listIds: [1],
    createdAt: '2023-01-01T00:00:00Z',
    modifiedAt: '2023-01-01T00:00:00Z'
  });

  return mock;
}

export default BrevoMock;