/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Cart Test Items Management', () => {
  let mockWindow;
  let mockLocalStorage;
  let CartManager;
  let cartManager;

  beforeEach(async () => {
    // Mock window and localStorage
    mockLocalStorage = {
      items: {},
      getItem: vi.fn((key) => mockLocalStorage.items[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage.items[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage.items[key];
      })
    };

    mockWindow = {
      location: {
        search: '',
        hostname: 'localhost',
        port: '3000'
      },
      localStorage: mockLocalStorage,
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    };

    global.window = mockWindow;
    global.localStorage = mockLocalStorage;
    global.document = {
      dispatchEvent: vi.fn()
    };

    // Mock analytics
    vi.doMock('../../../js/lib/analytics-tracker.js', () => ({
      getAnalyticsTracker: () => ({
        track: vi.fn(),
        trackCartEvent: vi.fn()
      })
    }));

    // Import after mocking
    const cartModule = await import('../../../js/lib/cart-manager.js');
    CartManager = cartModule.CartManager;
    cartManager = new CartManager();
    await cartManager.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete global.window;
    delete global.localStorage;
    delete global.document;
  });

  describe('Test Ticket Management', () => {
    it('should add test tickets without TEST prefix (test mode determined by event/ticket names)', async () => {
      const ticketData = {
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 2,
        isTestItem: true
      };

      await cartManager.addTicket(ticketData);
      const state = cartManager.getState();

      // No TEST- prefix - test mode is determined by event/ticket names
      expect(state.tickets['general']).toBeDefined();
      expect(state.tickets['general'].name).toBe('General Admission');
      expect(state.tickets['general'].isTestItem).toBe(true);
      expect(state.metadata.testMode).toBe(true);
    });

    it('should add regular tickets without TEST prefix when not in test mode', async () => {
      const ticketData = {
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 2,
        isTestItem: false
      };

      await cartManager.addTicket(ticketData);
      const state = cartManager.getState();

      expect(state.tickets['general']).toBeDefined();
      expect(state.tickets['general'].name).toBe('General Admission');
      expect(state.tickets['general'].isTestItem).toBe(false);
    });

    it('should force test mode when testMode is enabled globally', async () => {
      // Force test mode
      cartManager.testMode = true;

      const ticketData = {
        ticketType: 'vip',
        price: 100,
        name: 'VIP Access',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: false // Explicitly false, but should be overridden
      };

      await cartManager.addTicket(ticketData);
      const state = cartManager.getState();

      // No TEST- prefix - test mode is determined by event/ticket names
      expect(state.tickets['vip']).toBeDefined();
      expect(state.tickets['vip'].name).toBe('VIP Access');
      expect(state.tickets['vip'].isTestItem).toBe(true);
    });

    it('should handle upsert with test items', async () => {
      const ticketData = {
        ticketType: 'workshop',
        price: 75,
        name: 'Salsa Workshop',
        eventId: 'event-1',
        quantity: 3,
        isTestItem: true
      };

      await cartManager.upsertTicket(ticketData);
      const state = cartManager.getState();

      // No TEST- prefix - test mode is determined by event/ticket names
      expect(state.tickets['workshop']).toBeDefined();
      expect(state.tickets['workshop'].quantity).toBe(3);
      expect(state.tickets['workshop'].isTestItem).toBe(true);

      // Update quantity
      await cartManager.upsertTicket({
        ...ticketData,
        quantity: 5
      });

      const updatedState = cartManager.getState();
      expect(updatedState.tickets['workshop'].quantity).toBe(5);
    });

    it('should track analytics with test mode information', async () => {
      const mockAnalytics = {
        trackCartEvent: vi.fn()
      };
      cartManager.analytics = mockAnalytics;

      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      // No TEST- prefix in analytics - test mode is determined by event/ticket names
      expect(mockAnalytics.trackCartEvent).toHaveBeenCalledWith('ticket_added', {
        ticketType: 'general',
        originalTicketType: 'general',  // Same as ticketType since no TEST- prefix
        quantity: 1,
        price: 50,
        total: 50,
        isTestItem: true,
        testMode: expect.any(Boolean)
      });
    });
  });

  describe('Test Donation Management', () => {
    it('should add test donations without TEST prefix (test mode determined by event names)', async () => {
      await cartManager.addDonation(25, true);
      const state = cartManager.getState();

      const donation = state.donations[0];
      // No TEST - prefix - test mode is determined by event names
      expect(donation.name).toBe('Festival Support');
      expect(donation.isTestItem).toBe(true);
      expect(donation.id).toMatch(/^test_donation_/);
      expect(state.metadata.testMode).toBe(true);
    });

    it('should add regular donations without TEST prefix', async () => {
      await cartManager.addDonation(25, false);
      const state = cartManager.getState();

      const donation = state.donations[0];
      expect(donation.name).toBe('Festival Support');
      expect(donation.isTestItem).toBe(false);
      expect(donation.id).toMatch(/^donation_/);
    });

    it('should force test mode for donations when globally enabled', async () => {
      cartManager.testMode = true;

      await cartManager.addDonation(50, false); // Explicitly false
      const state = cartManager.getState();

      const donation = state.donations[0];
      // No TEST - prefix - test mode is determined by event names
      expect(donation.name).toBe('Festival Support');
      expect(donation.isTestItem).toBe(true);
      expect(donation.id).toMatch(/^test_donation_/);
    });

    it('should track analytics with test mode information for donations', async () => {
      const mockAnalytics = {
        trackCartEvent: vi.fn()
      };
      cartManager.analytics = mockAnalytics;

      await cartManager.addDonation(100, true);

      expect(mockAnalytics.trackCartEvent).toHaveBeenCalledWith('donation_added', {
        donationAmount: 100,
        donationId: expect.stringMatching(/^test_donation_/),
        isTestItem: true,
        testMode: expect.any(Boolean)
      });
    });
  });

  describe('Mixed Cart Operations', () => {
    it('should handle mixed test and production items', async () => {
      // Add production ticket
      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: false
      });

      // Add test ticket
      await cartManager.addTicket({
        ticketType: 'vip',
        price: 100,
        name: 'VIP Access',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      // Add production donation
      await cartManager.addDonation(25, false);

      // Add test donation
      await cartManager.addDonation(50, true);

      const state = cartManager.getState();

      // Check tickets - no TEST- prefix, test mode determined by event names
      expect(state.tickets['general']).toBeDefined();
      expect(state.tickets['general'].isTestItem).toBe(false);
      expect(state.tickets['vip']).toBeDefined();
      expect(state.tickets['vip'].isTestItem).toBe(true);

      // Check donations - no TEST - prefix
      expect(state.donations).toHaveLength(2);
      const productionDonation = state.donations.find(d => d.isTestItem === false);
      const testDonation = state.donations.find(d => d.isTestItem === true);

      expect(productionDonation.name).toBe('Festival Support');
      expect(testDonation.name).toBe('Festival Support');

      // Cart should be in test mode due to test items
      expect(state.metadata.testMode).toBe(true);
    });

    it('should calculate totals correctly for mixed items', async () => {
      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 2,
        isTestItem: false
      });

      await cartManager.addTicket({
        ticketType: 'vip',
        price: 100,
        name: 'VIP Access',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      await cartManager.addDonation(25, false);
      await cartManager.addDonation(75, true);

      const state = cartManager.getState();
      const totals = state.totals;

      expect(totals.tickets).toBe(200); // (50*2) + (100*1) in cents
      expect(totals.donations).toBe(10000); // (25 + 75) * 100 in cents
      expect(totals.total).toBe(10200); // 200 + 10000 in cents
      expect(totals.itemCount).toBe(3); // 2 + 1 tickets
      expect(totals.donationCount).toBe(2);
    });
  });

  describe('Test Mode State Management', () => {
    it('should update test mode state when test items are added', async () => {
      const initialState = cartManager.getState();
      expect(initialState.metadata.testMode).toBe(false);

      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      const updatedState = cartManager.getState();
      expect(updatedState.metadata.testMode).toBe(true);
    });

    it('should persist test mode state in storage', async () => {
      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      // Check that storage was called with test mode data
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'alocubano_cart_test',
        expect.stringContaining('"testMode":true')
      );
    });

    it('should emit events with test mode information', async () => {
      const mockDispatch = vi.fn();
      global.document.dispatchEvent = mockDispatch;

      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cart:ticket:added',
          detail: expect.objectContaining({
            isTestItem: true
          })
        })
      );
    });
  });

  describe('Data Isolation', () => {
    it('should track test items via isTestItem flag (no separate keys)', async () => {
      // Without TEST- prefix, same ticket type can only exist once
      // Test mode is tracked via isTestItem flag
      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      const state = cartManager.getState();

      // Only one item with general key
      expect(state.tickets['general']).toBeDefined();
      expect(state.tickets['general'].isTestItem).toBe(true);
      expect(state.tickets['general'].name).toBe('General Admission');
    });

    it('should handle removal of test items correctly', async () => {
      await cartManager.addTicket({
        ticketType: 'general',
        price: 50,
        name: 'General Admission',
        eventId: 'event-1',
        quantity: 1,
        isTestItem: true
      });

      let state = cartManager.getState();
      // No TEST- prefix - items stored under original ticketType
      expect(state.tickets['general']).toBeDefined();
      expect(state.tickets['general'].isTestItem).toBe(true);

      await cartManager.removeTicket('general');

      state = cartManager.getState();
      expect(state.tickets['general']).toBeUndefined();
    });
  });
});