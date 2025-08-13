/**
 * Test Data Builder
 *
 * Generates realistic test data using faker.js patterns for comprehensive testing
 * Provides fluent builder interface for creating test entities
 */

/**
 * Generate fake data using deterministic patterns (avoiding external dependencies)
 * This provides faker-like functionality without additional dependencies
 */
class TestDataGenerator {
  constructor(seed = 12345) {
    this.seed = seed;
    this.counter = 0;
  }

  /**
   * Simple seeded random number generator for consistent test data
   */
  random() {
    const x = Math.sin(this.seed + this.counter++) * 10000;
    return x - Math.floor(x);
  }

  firstName() {
    const names = [
      "Alexander",
      "Maria",
      "Carlos",
      "Isabella",
      "Diego",
      "Sofia",
      "Miguel",
      "Elena",
      "Rafael",
      "Carmen",
      "Luis",
      "Ana",
      "Jorge",
      "Lucia",
      "Manuel",
      "Patricia",
      "Ricardo",
      "Beatriz",
    ];
    return names[Math.floor(this.random() * names.length)];
  }

  lastName() {
    const names = [
      "Rodriguez",
      "Garcia",
      "Martinez",
      "Lopez",
      "Hernandez",
      "Gonzalez",
      "Perez",
      "Sanchez",
      "Ramirez",
      "Torres",
      "Flores",
      "Rivera",
      "Gomez",
      "Diaz",
      "Reyes",
      "Morales",
      "Jimenez",
      "Herrera",
    ];
    return names[Math.floor(this.random() * names.length)];
  }

  email(firstName = this.firstName(), lastName = this.lastName()) {
    const domains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "icloud.com",
    ];
    const domain = domains[Math.floor(this.random() * domains.length)];
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(this.random() * 1000)}`;
    return `${username}@${domain}`;
  }

  phoneNumber() {
    const area = Math.floor(this.random() * 800) + 200;
    const exchange = Math.floor(this.random() * 800) + 200;
    const number = Math.floor(this.random() * 10000);
    return `+1${area}${exchange}${number.toString().padStart(4, "0")}`;
  }

  streetAddress() {
    const streets = [
      "Pearl Street",
      "Broadway",
      "Canyon Boulevard",
      "Baseline Road",
      "Folsom Street",
      "Arapahoe Avenue",
      "28th Street",
      "Valmont Road",
      "Iris Avenue",
      "Jay Road",
      "Nelson Road",
      "Mineral Road",
    ];
    const number = Math.floor(this.random() * 9999) + 1;
    const street = streets[Math.floor(this.random() * streets.length)];
    return `${number} ${street}`;
  }

  city() {
    const cities = [
      "Boulder",
      "Denver",
      "Louisville",
      "Lafayette",
      "Longmont",
      "Broomfield",
      "Westminster",
      "Thornton",
      "Arvada",
      "Golden",
    ];
    return cities[Math.floor(this.random() * cities.length)];
  }

  zipCode() {
    return `${Math.floor(this.random() * 90000) + 10000}`;
  }

  uuid() {
    // Simple UUID v4 generator for testing
    const chars = "0123456789abcdef";
    let uuid = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += "-";
      } else if (i === 14) {
        uuid += "4";
      } else if (i === 19) {
        uuid += chars[Math.floor(this.random() * 4) + 8];
      } else {
        uuid += chars[Math.floor(this.random() * 16)];
      }
    }
    return uuid;
  }

  futureDate(days = 30) {
    const now = new Date();
    const futureTime =
      now.getTime() + this.random() * days * 24 * 60 * 60 * 1000;
    return new Date(futureTime);
  }

  pastDate(days = 30) {
    const now = new Date();
    const pastTime = now.getTime() - this.random() * days * 24 * 60 * 60 * 1000;
    return new Date(pastTime);
  }

  price(min = 10, max = 200) {
    const price = min + this.random() * (max - min);
    return Math.round(price * 100) / 100; // Round to 2 decimal places
  }

  paragraphs(count = 3) {
    const sentences = [
      "Join us for an unforgettable Cuban salsa experience in the heart of Boulder.",
      "Learn from world-class instructors who bring authentic Havana style to Colorado.",
      "Experience the passion and energy of traditional Cuban music and dance.",
      "Connect with fellow dancers in a welcoming and inclusive community environment.",
      "Discover the rich cultural heritage behind every step and rhythm.",
      "From beginners to advanced dancers, everyone finds their perfect fit.",
      "The festival celebrates the joy and spirit of Cuban salsa culture.",
      "Professional instructors guide you through traditional and modern techniques.",
    ];

    const result = [];
    for (let i = 0; i < count; i++) {
      const sentenceCount = Math.floor(this.random() * 3) + 2; // 2-4 sentences per paragraph
      const paragraph = [];
      for (let j = 0; j < sentenceCount; j++) {
        const sentence =
          sentences[Math.floor(this.random() * sentences.length)];
        paragraph.push(sentence);
      }
      result.push(paragraph.join(" "));
    }
    return result.join("\n\n");
  }
}

/**
 * User Data Builder
 */
export class UserBuilder {
  constructor() {
    this.faker = new TestDataGenerator();
    this.data = {
      id: null,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      address: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferences: {},
      metadata: {},
    };
  }

  withId(id = null) {
    this.data.id = id || this.faker.uuid();
    return this;
  }

  withName(firstName = null, lastName = null) {
    this.data.firstName = firstName || this.faker.firstName();
    this.data.lastName = lastName || this.faker.lastName();
    return this;
  }

  withEmail(email = null) {
    this.data.email =
      email || this.faker.email(this.data.firstName, this.data.lastName);
    return this;
  }

  withPhone(phone = null) {
    this.data.phone = phone || this.faker.phoneNumber();
    return this;
  }

  withAddress(address = null) {
    this.data.address = address || {
      street: this.faker.streetAddress(),
      city: this.faker.city(),
      state: "CO",
      zipCode: this.faker.zipCode(),
      country: "USA",
    };
    return this;
  }

  withPreferences(preferences = {}) {
    this.data.preferences = {
      emailNotifications: true,
      smsNotifications: false,
      language: "en",
      danceLevel: "beginner",
      ...preferences,
    };
    return this;
  }

  withMetadata(metadata = {}) {
    this.data.metadata = {
      source: "test",
      userAgent: "TestAgent/1.0",
      ipAddress: "192.168.1.1",
      ...metadata,
    };
    return this;
  }

  withTimestamps(createdAt = null, updatedAt = null) {
    this.data.createdAt = createdAt || this.faker.pastDate(30);
    this.data.updatedAt = updatedAt || new Date();
    return this;
  }

  build() {
    // Ensure required fields have default values
    if (!this.data.firstName) this.data.firstName = this.faker.firstName();
    if (!this.data.lastName) this.data.lastName = this.faker.lastName();
    if (!this.data.email)
      this.data.email = this.faker.email(
        this.data.firstName,
        this.data.lastName,
      );
    if (!this.data.id) this.data.id = this.faker.uuid();

    return { ...this.data };
  }

  buildMany(count = 5) {
    const users = [];
    for (let i = 0; i < count; i++) {
      // Reset for each user but maintain configuration
      const originalData = { ...this.data };
      this.data = {
        ...originalData,
        id: null,
        firstName: null,
        lastName: null,
        email: null,
      };
      users.push(this.build());
    }
    return users;
  }
}

/**
 * Ticket Data Builder
 */
export class TicketBuilder {
  constructor() {
    this.faker = new TestDataGenerator();
    this.data = {
      id: null,
      ticketId: null,
      userId: null,
      eventId: "alocubano-boulderfest-2026",
      type: "full-pass",
      price: null,
      currency: "USD",
      status: "active",
      purchaseDate: new Date(),
      validFrom: new Date("2026-05-15"),
      validTo: new Date("2026-05-17"),
      metadata: {},
      qrCode: null,
      walletPassUrls: {},
    };
  }

  withId(id = null) {
    this.data.id = id || this.faker.uuid();
    return this;
  }

  withTicketId(ticketId = null) {
    this.data.ticketId =
      ticketId ||
      `ALO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    return this;
  }

  withUser(userId = null) {
    this.data.userId = userId || this.faker.uuid();
    return this;
  }

  withEvent(eventId = null) {
    this.data.eventId = eventId || "alocubano-boulderfest-2026";
    return this;
  }

  withType(type = "full-pass") {
    const types = {
      "full-pass": { price: 195, description: "Full Festival Pass" },
      "single-day": { price: 75, description: "Single Day Pass" },
      "workshops-only": { price: 125, description: "Workshops Only" },
      "socials-only": { price: 85, description: "Social Events Only" },
      vip: { price: 295, description: "VIP Experience" },
    };

    this.data.type = type;
    if (types[type] && !this.data.price) {
      this.data.price = types[type].price;
    }
    return this;
  }

  withPrice(price = null) {
    this.data.price = price || this.faker.price(50, 300);
    return this;
  }

  withStatus(status = "active") {
    this.data.status = status; // active, used, expired, refunded, cancelled
    return this;
  }

  withDates(purchaseDate = null, validFrom = null, validTo = null) {
    this.data.purchaseDate = purchaseDate || this.faker.pastDate(60);
    this.data.validFrom = validFrom || new Date("2026-05-15");
    this.data.validTo = validTo || new Date("2026-05-17");
    return this;
  }

  withQRCode(qrCode = null) {
    this.data.qrCode =
      qrCode || `QR-${this.data.ticketId || "TICKET"}-${Date.now()}`;
    return this;
  }

  withWalletPasses(appleUrl = null, googleUrl = null) {
    this.data.walletPassUrls = {
      apple:
        appleUrl || `/api/tickets/apple-wallet/${this.data.id || "test-id"}`,
      google:
        googleUrl || `/api/tickets/google-wallet/${this.data.id || "test-id"}`,
    };
    return this;
  }

  withMetadata(metadata = {}) {
    this.data.metadata = {
      purchaseMethod: "stripe",
      paymentIntentId: `pi_${Math.random().toString(36).substr(2, 24)}`,
      userAgent: "TestAgent/1.0",
      ipAddress: "192.168.1.1",
      ...metadata,
    };
    return this;
  }

  build() {
    // Ensure required fields have default values
    if (!this.data.id) this.data.id = this.faker.uuid();
    if (!this.data.ticketId)
      this.data.ticketId = `ALO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    if (!this.data.price) this.data.price = this.faker.price(50, 300);
    if (!this.data.qrCode)
      this.data.qrCode = `QR-${this.data.ticketId}-${Date.now()}`;

    return { ...this.data };
  }

  buildMany(count = 5) {
    const tickets = [];
    for (let i = 0; i < count; i++) {
      // Reset for each ticket but maintain configuration
      const originalData = { ...this.data };
      this.data = { ...originalData, id: null, ticketId: null, qrCode: null };
      tickets.push(this.build());
    }
    return tickets;
  }
}

/**
 * Email Subscription Data Builder
 */
export class EmailSubscriptionBuilder {
  constructor() {
    this.faker = new TestDataGenerator();
    this.data = {
      id: null,
      email: null,
      firstName: null,
      lastName: null,
      status: "subscribed",
      source: "website",
      subscriptionDate: new Date(),
      preferences: {},
      metadata: {},
    };
  }

  withId(id = null) {
    this.data.id = id || this.faker.uuid();
    return this;
  }

  withEmail(email = null) {
    this.data.email = email || this.faker.email();
    return this;
  }

  withName(firstName = null, lastName = null) {
    this.data.firstName = firstName || this.faker.firstName();
    this.data.lastName = lastName || this.faker.lastName();
    return this;
  }

  withStatus(status = "subscribed") {
    this.data.status = status; // subscribed, unsubscribed, bounced, complained
    return this;
  }

  withSource(source = "website") {
    this.data.source = source; // website, social, referral, event, import
    return this;
  }

  withPreferences(preferences = {}) {
    this.data.preferences = {
      frequency: "weekly",
      contentTypes: ["workshops", "events", "news"],
      language: "en",
      ...preferences,
    };
    return this;
  }

  withMetadata(metadata = {}) {
    this.data.metadata = {
      userAgent: "TestAgent/1.0",
      ipAddress: "192.168.1.1",
      referrer: "https://example.com",
      utmSource: "test",
      utmMedium: "email",
      utmCampaign: "test-campaign",
      ...metadata,
    };
    return this;
  }

  withSubscriptionDate(date = null) {
    this.data.subscriptionDate = date || this.faker.pastDate(90);
    return this;
  }

  build() {
    // Ensure required fields have default values
    if (!this.data.id) this.data.id = this.faker.uuid();
    if (!this.data.email) this.data.email = this.faker.email();

    return { ...this.data };
  }

  buildMany(count = 5) {
    const subscriptions = [];
    for (let i = 0; i < count; i++) {
      // Reset for each subscription but maintain configuration
      const originalData = { ...this.data };
      this.data = { ...originalData, id: null, email: null };
      subscriptions.push(this.build());
    }
    return subscriptions;
  }
}

/**
 * Payment Data Builder
 */
export class PaymentBuilder {
  constructor() {
    this.faker = new TestDataGenerator();
    this.data = {
      id: null,
      paymentIntentId: null,
      sessionId: null,
      amount: null,
      currency: "USD",
      status: "succeeded",
      paymentMethod: "card",
      customerEmail: null,
      customerName: null,
      billingAddress: null,
      items: [],
      metadata: {},
      createdAt: new Date(),
      completedAt: new Date(),
    };
  }

  withId(id = null) {
    this.data.id = id || this.faker.uuid();
    return this;
  }

  withStripeIds(paymentIntentId = null, sessionId = null) {
    this.data.paymentIntentId =
      paymentIntentId || `pi_${Math.random().toString(36).substr(2, 24)}`;
    this.data.sessionId =
      sessionId || `cs_${Math.random().toString(36).substr(2, 24)}`;
    return this;
  }

  withAmount(amount = null, currency = "USD") {
    this.data.amount = amount || this.faker.price(50, 300);
    this.data.currency = currency;
    return this;
  }

  withStatus(status = "succeeded") {
    this.data.status = status; // succeeded, pending, failed, canceled, refunded
    return this;
  }

  withCustomer(email = null, name = null) {
    this.data.customerEmail = email || this.faker.email();
    this.data.customerName =
      name || `${this.faker.firstName()} ${this.faker.lastName()}`;
    return this;
  }

  withBillingAddress(address = null) {
    this.data.billingAddress = address || {
      line1: this.faker.streetAddress(),
      city: this.faker.city(),
      state: "CO",
      postal_code: this.faker.zipCode(),
      country: "US",
    };
    return this;
  }

  withItems(items = []) {
    this.data.items =
      items.length > 0
        ? items
        : [
            {
              id: "full-pass",
              description: "Full Festival Pass",
              quantity: 1,
              amount: 19500, // $195.00 in cents
            },
          ];
    return this;
  }

  withMetadata(metadata = {}) {
    this.data.metadata = {
      eventId: "alocubano-boulderfest-2026",
      source: "website",
      userAgent: "TestAgent/1.0",
      ...metadata,
    };
    return this;
  }

  withTimestamps(createdAt = null, completedAt = null) {
    this.data.createdAt = createdAt || this.faker.pastDate(30);
    this.data.completedAt = completedAt || this.data.createdAt;
    return this;
  }

  build() {
    // Ensure required fields have default values
    if (!this.data.id) this.data.id = this.faker.uuid();
    if (!this.data.paymentIntentId)
      this.data.paymentIntentId = `pi_${Math.random().toString(36).substr(2, 24)}`;
    if (!this.data.sessionId)
      this.data.sessionId = `cs_${Math.random().toString(36).substr(2, 24)}`;
    if (!this.data.amount) this.data.amount = this.faker.price(50, 300);
    if (!this.data.customerEmail) this.data.customerEmail = this.faker.email();

    return { ...this.data };
  }

  buildMany(count = 5) {
    const payments = [];
    for (let i = 0; i < count; i++) {
      // Reset for each payment but maintain configuration
      const originalData = { ...this.data };
      this.data = {
        ...originalData,
        id: null,
        paymentIntentId: null,
        sessionId: null,
        customerEmail: null,
      };
      payments.push(this.build());
    }
    return payments;
  }
}

/**
 * Gallery Item Data Builder
 */
export class GalleryItemBuilder {
  constructor() {
    this.faker = new TestDataGenerator();
    this.data = {
      id: null,
      name: null,
      category: "workshops",
      type: "image",
      mimeType: "image/jpeg",
      size: null,
      thumbnailUrl: null,
      viewUrl: null,
      downloadUrl: null,
      createdAt: new Date(),
      metadata: {},
    };
  }

  withId(id = null) {
    this.data.id = id || `img_${Math.random().toString(36).substr(2, 8)}`;
    return this;
  }

  withName(name = null) {
    const activities = [
      "Partner Work Session",
      "Solo Technique Practice",
      "Group Formation",
      "Musicality Workshop",
      "Styling Session",
      "Advanced Turns",
      "Basic Steps Review",
      "Social Dancing",
      "Performance Prep",
      "Footwork Drills",
      "Lead Follow Practice",
      "Rhythm Training",
    ];
    this.data.name =
      name || activities[Math.floor(this.faker.random() * activities.length)];
    return this;
  }

  withCategory(category = "workshops") {
    this.data.category = category; // workshops, socials, performances, candid
    return this;
  }

  withType(type = "image", mimeType = "image/jpeg") {
    this.data.type = type;
    this.data.mimeType = mimeType;
    return this;
  }

  withSize(size = null) {
    this.data.size = size || Math.floor(this.faker.random() * 5000000) + 500000; // 0.5MB to 5.5MB
    return this;
  }

  withUrls(baseUrl = null) {
    const base = baseUrl || `/api/image-proxy/${this.data.id || "test"}`;
    this.data.thumbnailUrl = `${base}?size=thumb`;
    this.data.viewUrl = `${base}?size=view`;
    this.data.downloadUrl = `${base}?size=original`;
    return this;
  }

  withMetadata(metadata = {}) {
    this.data.metadata = {
      photographer: `${this.faker.firstName()} ${this.faker.lastName()}`,
      location: "Avalon Ballroom, Boulder, CO",
      event: "A Lo Cubano Boulder Fest 2026",
      tags: ["salsa", "dance", "workshop"],
      camera: "Canon EOS R5",
      lens: "24-70mm f/2.8",
      settings: {
        aperture: "f/2.8",
        shutter: "1/125",
        iso: 800,
      },
      ...metadata,
    };
    return this;
  }

  withTimestamp(createdAt = null) {
    this.data.createdAt = createdAt || this.faker.pastDate(7);
    return this;
  }

  build() {
    // Ensure required fields have default values
    if (!this.data.id)
      this.data.id = `img_${Math.random().toString(36).substr(2, 8)}`;
    if (!this.data.name) this.withName();
    if (!this.data.thumbnailUrl) this.withUrls();
    if (!this.data.size) this.withSize();

    return { ...this.data };
  }

  buildMany(count = 10) {
    const items = [];
    for (let i = 0; i < count; i++) {
      // Reset for each item but maintain configuration
      const originalData = { ...this.data };
      this.data = {
        ...originalData,
        id: null,
        name: null,
        thumbnailUrl: null,
        viewUrl: null,
        downloadUrl: null,
        size: null,
      };
      items.push(this.build());
    }
    return items;
  }
}

/**
 * Factory methods for quick data generation
 */
export const TestDataFactory = {
  user: () => new UserBuilder(),
  ticket: () => new TicketBuilder(),
  emailSubscription: () => new EmailSubscriptionBuilder(),
  payment: () => new PaymentBuilder(),
  galleryItem: () => new GalleryItemBuilder(),

  // Quick generation methods
  createUser: (overrides = {}) => new UserBuilder().build({ ...overrides }),
  createUsers: (count = 5, overrides = {}) =>
    new UserBuilder().withPreferences(overrides).buildMany(count),

  createTicket: (overrides = {}) => new TicketBuilder().build({ ...overrides }),
  createTickets: (count = 5, overrides = {}) =>
    new TicketBuilder().withType(overrides.type).buildMany(count),

  createEmailSubscription: (overrides = {}) =>
    new EmailSubscriptionBuilder().build({ ...overrides }),
  createEmailSubscriptions: (count = 5, overrides = {}) =>
    new EmailSubscriptionBuilder()
      .withSource(overrides.source)
      .buildMany(count),

  createPayment: (overrides = {}) =>
    new PaymentBuilder().build({ ...overrides }),
  createPayments: (count = 5, overrides = {}) =>
    new PaymentBuilder().withStatus(overrides.status).buildMany(count),

  createGalleryItem: (overrides = {}) =>
    new GalleryItemBuilder().build({ ...overrides }),
  createGalleryItems: (count = 10, overrides = {}) =>
    new GalleryItemBuilder().withCategory(overrides.category).buildMany(count),
};

/**
 * Cleanup utilities for test data
 */
export const TestDataCleanup = {
  /**
   * Reset all builders to default state
   */
  resetAll() {
    // This would reset any global state if we had any
    // Currently builders are stateless between tests
  },

  /**
   * Generate consistent test data for a specific test suite
   * @param {string} suiteName - Name of the test suite for seeding
   * @returns {Object} Test data generators with consistent seeds
   */
  forTestSuite(suiteName) {
    const seed = suiteName
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const generator = new TestDataGenerator(seed);

    return {
      generator,
      user: () => new UserBuilder(),
      ticket: () => new TicketBuilder(),
      emailSubscription: () => new EmailSubscriptionBuilder(),
      payment: () => new PaymentBuilder(),
      galleryItem: () => new GalleryItemBuilder(),
    };
  },
};
