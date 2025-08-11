/**
 * Mock Services
 *
 * Provides comprehensive mocking for external services (Stripe, Brevo, etc.)
 * Uses vitest mocking capabilities and manual interceptors where needed
 */

import { vi } from "vitest";

/**
 * Stripe Service Mock
 * Mocks Stripe API calls and webhook handling
 */
export class StripeMock {
  constructor() {
    this.paymentIntents = new Map();
    this.sessions = new Map();
    this.webhookEvents = [];
    this.customers = new Map();
    this.subscriptions = new Map();
    this.isConfigured = false;
  }

  /**
   * Configure Stripe mocks with default behavior
   */
  configure() {
    if (this.isConfigured) return;

    // Mock Stripe library
    vi.mock("stripe", () => {
      return {
        default: vi.fn(() => ({
          paymentIntents: {
            create: vi.fn(this.createPaymentIntent.bind(this)),
            retrieve: vi.fn(this.retrievePaymentIntent.bind(this)),
            confirm: vi.fn(this.confirmPaymentIntent.bind(this)),
            update: vi.fn(this.updatePaymentIntent.bind(this)),
          },
          checkout: {
            sessions: {
              create: vi.fn(this.createCheckoutSession.bind(this)),
              retrieve: vi.fn(this.retrieveCheckoutSession.bind(this)),
              listLineItems: vi.fn(this.listSessionLineItems.bind(this)),
            },
          },
          customers: {
            create: vi.fn(this.createCustomer.bind(this)),
            retrieve: vi.fn(this.retrieveCustomer.bind(this)),
            update: vi.fn(this.updateCustomer.bind(this)),
          },
          subscriptions: {
            create: vi.fn(this.createSubscription.bind(this)),
            retrieve: vi.fn(this.retrieveSubscription.bind(this)),
            update: vi.fn(this.updateSubscription.bind(this)),
            cancel: vi.fn(this.cancelSubscription.bind(this)),
          },
          webhooks: {
            constructEvent: vi.fn(this.constructWebhookEvent.bind(this)),
          },
        })),
      };
    });

    this.isConfigured = true;
  }

  /**
   * Create a mock payment intent
   */
  createPaymentIntent(params) {
    const id = `pi_${Math.random().toString(36).substr(2, 24)}`;
    const intent = {
      id,
      object: "payment_intent",
      amount: params.amount,
      currency: params.currency || "usd",
      status: "requires_payment_method",
      client_secret: `${id}_secret_${Math.random().toString(36).substr(2, 16)}`,
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.paymentIntents.set(id, intent);
    return Promise.resolve(intent);
  }

  /**
   * Retrieve a payment intent
   */
  retrievePaymentIntent(id) {
    const intent = this.paymentIntents.get(id);
    if (!intent) {
      const error = new Error("No such payment_intent");
      error.type = "StripeInvalidRequestError";
      error.code = "resource_missing";
      return Promise.reject(error);
    }
    return Promise.resolve(intent);
  }

  /**
   * Confirm a payment intent
   */
  confirmPaymentIntent(id, params = {}) {
    const intent = this.paymentIntents.get(id);
    if (!intent) {
      return Promise.reject(new Error("No such payment_intent"));
    }

    const updatedIntent = {
      ...intent,
      status: "succeeded",
      charges: {
        object: "list",
        data: [
          {
            id: `ch_${Math.random().toString(36).substr(2, 24)}`,
            amount: intent.amount,
            currency: intent.currency,
            status: "succeeded",
            payment_intent: id,
          },
        ],
      },
    };

    this.paymentIntents.set(id, updatedIntent);
    return Promise.resolve(updatedIntent);
  }

  /**
   * Update a payment intent
   */
  updatePaymentIntent(id, params) {
    const intent = this.paymentIntents.get(id);
    if (!intent) {
      return Promise.reject(new Error("No such payment_intent"));
    }

    const updatedIntent = { ...intent, ...params };
    this.paymentIntents.set(id, updatedIntent);
    return Promise.resolve(updatedIntent);
  }

  /**
   * Create a checkout session
   */
  createCheckoutSession(params) {
    const id = `cs_${Math.random().toString(36).substr(2, 24)}`;
    const session = {
      id,
      object: "checkout.session",
      mode: params.mode || "payment",
      status: "open",
      url: `https://checkout.stripe.com/c/pay/${id}`,
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      line_items: params.line_items,
      metadata: params.metadata || {},
      customer_email: params.customer_email,
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.sessions.set(id, session);
    return Promise.resolve(session);
  }

  /**
   * Retrieve a checkout session
   */
  retrieveCheckoutSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return Promise.reject(new Error("No such checkout.session"));
    }
    return Promise.resolve(session);
  }

  /**
   * List checkout session line items
   */
  listSessionLineItems(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error("No such checkout.session"));
    }

    return Promise.resolve({
      object: "list",
      data: session.line_items?.data || [],
    });
  }

  /**
   * Create a customer
   */
  createCustomer(params) {
    const id = `cus_${Math.random().toString(36).substr(2, 14)}`;
    const customer = {
      id,
      object: "customer",
      email: params.email,
      name: params.name,
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.customers.set(id, customer);
    return Promise.resolve(customer);
  }

  /**
   * Retrieve a customer
   */
  retrieveCustomer(id) {
    const customer = this.customers.get(id);
    if (!customer) {
      return Promise.reject(new Error("No such customer"));
    }
    return Promise.resolve(customer);
  }

  /**
   * Update a customer
   */
  updateCustomer(id, params) {
    const customer = this.customers.get(id);
    if (!customer) {
      return Promise.reject(new Error("No such customer"));
    }

    const updatedCustomer = { ...customer, ...params };
    this.customers.set(id, updatedCustomer);
    return Promise.resolve(updatedCustomer);
  }

  /**
   * Create a subscription
   */
  createSubscription(params) {
    const id = `sub_${Math.random().toString(36).substr(2, 14)}`;
    const subscription = {
      id,
      object: "subscription",
      status: "active",
      customer: params.customer,
      items: params.items,
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000,
      ),
      ...params,
    };

    this.subscriptions.set(id, subscription);
    return Promise.resolve(subscription);
  }

  /**
   * Retrieve a subscription
   */
  retrieveSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return Promise.reject(new Error("No such subscription"));
    }
    return Promise.resolve(subscription);
  }

  /**
   * Update a subscription
   */
  updateSubscription(id, params) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return Promise.reject(new Error("No such subscription"));
    }

    const updatedSubscription = { ...subscription, ...params };
    this.subscriptions.set(id, updatedSubscription);
    return Promise.resolve(updatedSubscription);
  }

  /**
   * Cancel a subscription
   */
  cancelSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return Promise.reject(new Error("No such subscription"));
    }

    const cancelledSubscription = {
      ...subscription,
      status: "canceled",
      canceled_at: Math.floor(Date.now() / 1000),
    };

    this.subscriptions.set(id, cancelledSubscription);
    return Promise.resolve(cancelledSubscription);
  }

  /**
   * Construct webhook event for testing
   */
  constructWebhookEvent(payload, signature, secret) {
    // Simulate webhook signature validation
    if (!signature || !secret) {
      const error = new Error("Invalid signature");
      error.type = "StripeSignatureVerificationError";
      throw error;
    }

    try {
      const event = JSON.parse(payload);
      this.webhookEvents.push(event);
      return event;
    } catch (err) {
      const error = new Error("Invalid payload");
      error.type = "StripeInvalidRequestError";
      throw error;
    }
  }

  /**
   * Simulate a webhook event
   */
  createWebhookEvent(type, data) {
    const event = {
      id: `evt_${Math.random().toString(36).substr(2, 24)}`,
      object: "event",
      type,
      data: { object: data },
      created: Math.floor(Date.now() / 1000),
      api_version: "2023-10-16",
      livemode: false,
      pending_webhooks: 0,
      request: {
        id: `req_${Math.random().toString(36).substr(2, 14)}`,
      },
    };

    this.webhookEvents.push(event);
    return event;
  }

  /**
   * Reset all mock data
   */
  reset() {
    this.paymentIntents.clear();
    this.sessions.clear();
    this.customers.clear();
    this.subscriptions.clear();
    this.webhookEvents = [];
    vi.clearAllMocks();
  }

  /**
   * Get all stored data for inspection
   */
  getState() {
    return {
      paymentIntents: Array.from(this.paymentIntents.values()),
      sessions: Array.from(this.sessions.values()),
      customers: Array.from(this.customers.values()),
      subscriptions: Array.from(this.subscriptions.values()),
      webhookEvents: this.webhookEvents,
    };
  }
}

/**
 * Brevo Service Mock
 * Mocks Brevo (SendinBlue) API calls for email marketing
 */
export class BrevoMock {
  constructor() {
    this.contacts = new Map();
    this.lists = new Map();
    this.campaigns = new Map();
    this.templates = new Map();
    this.webhooks = [];
    this.isConfigured = false;

    // Setup default lists and templates
    this.setupDefaults();
  }

  /**
   * Setup default lists and templates
   */
  setupDefaults() {
    // Default newsletter list
    this.lists.set("1", {
      id: 1,
      name: "Newsletter Subscribers",
      totalSubscribers: 0,
      totalBlacklisted: 0,
      folderId: 1,
    });

    // Default welcome template
    this.templates.set("1", {
      id: 1,
      name: "Welcome Email",
      subject: "Welcome to A Lo Cubano Boulder Fest!",
      htmlContent: "<p>Welcome to our community!</p>",
      isActive: true,
    });
  }

  /**
   * Configure Brevo mocks
   */
  configure() {
    if (this.isConfigured) return;

    // Mock fetch for Brevo API calls
    global.fetch = vi.fn((url, options) => {
      return this.handleApiCall(url, options);
    });

    this.isConfigured = true;
  }

  /**
   * Handle API calls to Brevo endpoints
   */
  async handleApiCall(url, options = {}) {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : {};
    const headers = options.headers || {};

    // Check API key
    if (!headers["api-key"] && !headers["Api-Key"]) {
      return this.createErrorResponse(401, "Unauthorized");
    }

    // Route to appropriate handler
    if (url.includes("/contacts")) {
      return this.handleContactsApi(url, method, body);
    } else if (url.includes("/contacts/lists")) {
      return this.handleListsApi(url, method, body);
    } else if (url.includes("/smtp/templates")) {
      return this.handleTemplatesApi(url, method, body);
    } else if (url.includes("/smtp/email")) {
      return this.handleEmailApi(url, method, body);
    } else if (url.includes("/webhooks")) {
      return this.handleWebhooksApi(url, method, body);
    }

    return this.createErrorResponse(404, "Not Found");
  }

  /**
   * Handle contacts API endpoints
   */
  handleContactsApi(url, method, body) {
    if (method === "POST" && url.endsWith("/contacts")) {
      return this.createContact(body);
    } else if (method === "GET" && url.includes("/contacts/")) {
      const email = url.split("/contacts/")[1];
      return this.getContactByEmail(email);
    } else if (method === "PUT" && url.includes("/contacts/")) {
      const email = url.split("/contacts/")[1];
      return this.updateContact(email, body);
    } else if (method === "DELETE" && url.includes("/contacts/")) {
      const email = url.split("/contacts/")[1];
      return this.deleteContact(email);
    }

    return this.createErrorResponse(404, "Contact endpoint not found");
  }

  /**
   * Handle lists API endpoints
   */
  handleListsApi(url, method, body) {
    if (method === "GET" && url.includes("/contacts/lists")) {
      return this.getLists();
    } else if (method === "POST" && url.includes("/contacts/lists/")) {
      const listId = url.split("/contacts/lists/")[1].split("/")[0];
      return this.addContactToList(listId, body);
    } else if (method === "DELETE" && url.includes("/contacts/lists/")) {
      const listId = url.split("/contacts/lists/")[1].split("/")[0];
      return this.removeContactFromList(listId, body);
    }

    return this.createErrorResponse(404, "List endpoint not found");
  }

  /**
   * Handle templates API endpoints
   */
  handleTemplatesApi(url, method, body) {
    if (method === "GET" && url.includes("/smtp/templates/")) {
      const templateId = url.split("/smtp/templates/")[1];
      return this.getTemplate(templateId);
    }

    return this.createErrorResponse(404, "Template endpoint not found");
  }

  /**
   * Handle email API endpoints
   */
  handleEmailApi(url, method, body) {
    if (method === "POST" && url.endsWith("/smtp/email")) {
      return this.sendTransactionalEmail(body);
    }

    return this.createErrorResponse(404, "Email endpoint not found");
  }

  /**
   * Handle webhooks API endpoints
   */
  handleWebhooksApi(url, method, body) {
    if (method === "POST") {
      return this.processWebhook(body);
    }

    return this.createErrorResponse(404, "Webhook endpoint not found");
  }

  /**
   * Create a contact
   */
  createContact(data) {
    const contact = {
      id: Math.floor(Math.random() * 1000000),
      email: data.email,
      attributes: data.attributes || {},
      listIds: data.listIds || [],
      updateEnabled: data.updateEnabled !== false,
      emailBlacklisted: false,
      smsBlacklisted: false,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };

    this.contacts.set(data.email, contact);

    // Add to lists
    if (data.listIds) {
      data.listIds.forEach((listId) => {
        const list = this.lists.get(listId.toString());
        if (list) {
          list.totalSubscribers++;
        }
      });
    }

    return this.createSuccessResponse({ id: contact.id });
  }

  /**
   * Get contact by email
   */
  getContactByEmail(email) {
    const contact = this.contacts.get(decodeURIComponent(email));
    if (!contact) {
      return this.createErrorResponse(404, "Contact not found");
    }
    return this.createSuccessResponse(contact);
  }

  /**
   * Update contact
   */
  updateContact(email, data) {
    const contact = this.contacts.get(decodeURIComponent(email));
    if (!contact) {
      return this.createErrorResponse(404, "Contact not found");
    }

    const updatedContact = {
      ...contact,
      attributes: { ...contact.attributes, ...data.attributes },
      listIds: data.listIds !== undefined ? data.listIds : contact.listIds,
      modifiedAt: new Date().toISOString(),
    };

    this.contacts.set(email, updatedContact);
    return this.createSuccessResponse();
  }

  /**
   * Delete contact
   */
  deleteContact(email) {
    const contact = this.contacts.get(decodeURIComponent(email));
    if (!contact) {
      return this.createErrorResponse(404, "Contact not found");
    }

    // Remove from lists
    contact.listIds.forEach((listId) => {
      const list = this.lists.get(listId.toString());
      if (list) {
        list.totalSubscribers = Math.max(0, list.totalSubscribers - 1);
      }
    });

    this.contacts.delete(email);
    return this.createSuccessResponse();
  }

  /**
   * Get all lists
   */
  getLists() {
    return this.createSuccessResponse({
      lists: Array.from(this.lists.values()),
      count: this.lists.size,
    });
  }

  /**
   * Add contact to list
   */
  addContactToList(listId, data) {
    const emails = data.emails || [];
    emails.forEach((email) => {
      const contact = this.contacts.get(email);
      if (contact && !contact.listIds.includes(parseInt(listId))) {
        contact.listIds.push(parseInt(listId));
        const list = this.lists.get(listId);
        if (list) {
          list.totalSubscribers++;
        }
      }
    });

    return this.createSuccessResponse({
      contacts: { success: emails, failure: [] },
    });
  }

  /**
   * Remove contact from list
   */
  removeContactFromList(listId, data) {
    const emails = data.emails || [];
    emails.forEach((email) => {
      const contact = this.contacts.get(email);
      if (contact) {
        contact.listIds = contact.listIds.filter(
          (id) => id !== parseInt(listId),
        );
        const list = this.lists.get(listId);
        if (list) {
          list.totalSubscribers = Math.max(0, list.totalSubscribers - 1);
        }
      }
    });

    return this.createSuccessResponse({
      contacts: { success: emails, failure: [] },
    });
  }

  /**
   * Get template
   */
  getTemplate(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      return this.createErrorResponse(404, "Template not found");
    }
    return this.createSuccessResponse(template);
  }

  /**
   * Send transactional email
   */
  sendTransactionalEmail(data) {
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

    // Store email for inspection
    const email = {
      messageId,
      to: data.to,
      subject: data.subject,
      htmlContent: data.htmlContent,
      textContent: data.textContent,
      templateId: data.templateId,
      params: data.params,
      sentAt: new Date().toISOString(),
    };

    if (!this.sentEmails) this.sentEmails = [];
    this.sentEmails.push(email);

    return this.createSuccessResponse({ messageId });
  }

  /**
   * Process webhook
   */
  processWebhook(data) {
    this.webhooks.push({
      ...data,
      receivedAt: new Date().toISOString(),
    });

    return this.createSuccessResponse();
  }

  /**
   * Create success response
   */
  createSuccessResponse(data = {}) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  }

  /**
   * Create error response
   */
  createErrorResponse(status, message) {
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ message }),
      text: () => Promise.resolve(JSON.stringify({ message })),
    });
  }

  /**
   * Reset all mock data
   */
  reset() {
    this.contacts.clear();
    this.lists.clear();
    this.campaigns.clear();
    this.templates.clear();
    this.webhooks = [];
    this.sentEmails = [];

    // Restore defaults
    this.setupDefaults();
    vi.clearAllMocks();
  }

  /**
   * Get all stored data for inspection
   */
  getState() {
    return {
      contacts: Array.from(this.contacts.values()),
      lists: Array.from(this.lists.values()),
      campaigns: Array.from(this.campaigns.values()),
      templates: Array.from(this.templates.values()),
      webhooks: this.webhooks,
      sentEmails: this.sentEmails || [],
    };
  }
}

/**
 * Google Drive Mock
 * Mocks Google Drive API for gallery image fetching
 */
export class GoogleDriveMock {
  constructor() {
    this.files = new Map();
    this.folders = new Map();
    this.isConfigured = false;
    this.setupDefaults();
  }

  setupDefaults() {
    // Create default folders
    this.folders.set("workshops-folder-id", {
      id: "workshops-folder-id",
      name: "Workshops 2026",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    });

    this.folders.set("socials-folder-id", {
      id: "socials-folder-id",
      name: "Social Events 2026",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    });

    // Create sample images
    for (let i = 1; i <= 20; i++) {
      this.files.set(`workshop-img-${i}`, {
        id: `workshop-img-${i}`,
        name: `Workshop Photo ${i}.jpg`,
        mimeType: "image/jpeg",
        parents: ["workshops-folder-id"],
        size: Math.floor(Math.random() * 5000000) + 500000,
        createdTime: new Date(Date.now() - i * 3600000).toISOString(),
        webViewLink: `https://drive.google.com/file/d/workshop-img-${i}/view`,
        webContentLink: `https://drive.google.com/uc?export=download&id=workshop-img-${i}`,
        thumbnailLink: `https://lh3.googleusercontent.com/d/workshop-img-${i}=s220`,
      });
    }

    for (let i = 1; i <= 15; i++) {
      this.files.set(`social-img-${i}`, {
        id: `social-img-${i}`,
        name: `Social Event ${i}.jpg`,
        mimeType: "image/jpeg",
        parents: ["socials-folder-id"],
        size: Math.floor(Math.random() * 5000000) + 500000,
        createdTime: new Date(Date.now() - (20 + i) * 3600000).toISOString(),
        webViewLink: `https://drive.google.com/file/d/social-img-${i}/view`,
        webContentLink: `https://drive.google.com/uc?export=download&id=social-img-${i}`,
        thumbnailLink: `https://lh3.googleusercontent.com/d/social-img-${i}=s220`,
      });
    }
  }

  configure() {
    if (this.isConfigured) return;

    // Mock Google Drive API calls
    global.fetch = vi.fn((url) => {
      if (url.includes("googleapis.com/drive/v3")) {
        return this.handleDriveApiCall(url);
      }
      // Pass through other fetch calls
      return vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })();
    });

    this.isConfigured = true;
  }

  async handleDriveApiCall(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    if (pathname.includes("/files")) {
      if (urlObj.searchParams.get("q")) {
        return this.listFiles(urlObj.searchParams);
      } else {
        const fileId = pathname.split("/files/")[1];
        return this.getFile(fileId);
      }
    }

    return {
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Not found" }),
    };
  }

  listFiles(searchParams) {
    const query = searchParams.get("q") || "";
    const pageSize = parseInt(searchParams.get("pageSize")) || 100;
    const fields = searchParams.get("fields") || "";

    let files = Array.from(this.files.values());

    // Apply query filters
    if (query.includes("parents")) {
      const parentMatch = query.match(/parents\s*in\s*'([^']+)'/);
      if (parentMatch) {
        const parentId = parentMatch[1];
        files = files.filter((file) => file.parents.includes(parentId));
      }
    }

    if (query.includes("mimeType")) {
      const mimeMatch = query.match(/mimeType\s*=\s*'([^']+)'/);
      if (mimeMatch) {
        const mimeType = mimeMatch[1];
        files = files.filter((file) => file.mimeType === mimeType);
      }
    }

    // Apply pagination
    files = files.slice(0, pageSize);

    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          files: files,
          nextPageToken: files.length === pageSize ? "next-page-token" : null,
        }),
    });
  }

  getFile(fileId) {
    const file = this.files.get(fileId) || this.folders.get(fileId);

    if (!file) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "File not found" }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(file),
    });
  }

  addFile(file) {
    this.files.set(file.id, file);
  }

  addFolder(folder) {
    this.folders.set(folder.id, folder);
  }

  reset() {
    this.files.clear();
    this.folders.clear();
    this.setupDefaults();
    vi.clearAllMocks();
  }

  getState() {
    return {
      files: Array.from(this.files.values()),
      folders: Array.from(this.folders.values()),
    };
  }
}

/**
 * Mock Service Manager
 * Centralized management of all mock services
 */
export class MockServiceManager {
  constructor() {
    this.stripe = new StripeMock();
    this.brevo = new BrevoMock();
    this.googleDrive = new GoogleDriveMock();
    this.isInitialized = false;
  }

  /**
   * Initialize all mock services
   */
  initialize() {
    if (this.isInitialized) return;

    this.stripe.configure();
    this.brevo.configure();
    this.googleDrive.configure();

    this.isInitialized = true;
  }

  /**
   * Reset all mock services
   */
  resetAll() {
    this.stripe.reset();
    this.brevo.reset();
    this.googleDrive.reset();
  }

  /**
   * Get all service states for debugging
   */
  getAllStates() {
    return {
      stripe: this.stripe.getState(),
      brevo: this.brevo.getState(),
      googleDrive: this.googleDrive.getState(),
    };
  }
}

// Export singleton instance
export const mockServices = new MockServiceManager();

// Export individual mocks for direct access
export { StripeMock, BrevoMock, GoogleDriveMock };

/**
 * Utility functions for common mock scenarios
 */
export const MockScenarios = {
  /**
   * Setup successful payment flow
   */
  successfulPayment() {
    const paymentIntent = mockServices.stripe.createPaymentIntent({
      amount: 19500,
      currency: "usd",
      metadata: { eventId: "alocubano-boulderfest-2026" },
    });

    return paymentIntent.then((intent) => {
      return mockServices.stripe.confirmPaymentIntent(intent.id);
    });
  },

  /**
   * Setup failed payment flow
   */
  failedPayment() {
    const paymentIntent = mockServices.stripe.createPaymentIntent({
      amount: 19500,
      currency: "usd",
    });

    return paymentIntent.then((intent) => {
      const updatedIntent = {
        ...intent,
        status: "requires_payment_method",
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Your card was declined.",
        },
      };
      mockServices.stripe.paymentIntents.set(intent.id, updatedIntent);
      return updatedIntent;
    });
  },

  /**
   * Setup successful email subscription
   */
  successfulEmailSubscription() {
    return mockServices.brevo.createContact({
      email: "test@example.com",
      attributes: {
        FIRSTNAME: "Test",
        LASTNAME: "User",
      },
      listIds: [1],
    });
  },

  /**
   * Setup gallery images
   */
  galleryWithImages(workshopCount = 10, socialCount = 5) {
    mockServices.googleDrive.reset();

    // Add workshop images
    for (let i = 1; i <= workshopCount; i++) {
      mockServices.googleDrive.addFile({
        id: `workshop-${i}`,
        name: `Workshop ${i}.jpg`,
        mimeType: "image/jpeg",
        parents: ["workshops-folder-id"],
        size: 1024 * 1024 * 2, // 2MB
        createdTime: new Date(Date.now() - i * 3600000).toISOString(),
        webViewLink: `https://drive.google.com/file/d/workshop-${i}/view`,
        thumbnailLink: `https://lh3.googleusercontent.com/d/workshop-${i}=s220`,
      });
    }

    // Add social images
    for (let i = 1; i <= socialCount; i++) {
      mockServices.googleDrive.addFile({
        id: `social-${i}`,
        name: `Social ${i}.jpg`,
        mimeType: "image/jpeg",
        parents: ["socials-folder-id"],
        size: 1024 * 1024 * 3, // 3MB
        createdTime: new Date(
          Date.now() - (workshopCount + i) * 3600000,
        ).toISOString(),
        webViewLink: `https://drive.google.com/file/d/social-${i}/view`,
        thumbnailLink: `https://lh3.googleusercontent.com/d/social-${i}=s220`,
      });
    }
  },
};
