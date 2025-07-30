/**
 * Inventory Management System
 * Handles ticket availability, reservations, and concurrency control
 */

import { PAYMENT_CONFIG, ERROR_MESSAGES, TICKET_TYPES } from '../payment/config.js';
import { ValidationError } from '../payment/validation.js';

// Simple in-memory inventory store
// In production, use Redis or database with proper distributed locking
class InventoryStore {
  constructor() {
    this.inventory = new Map();
    this.reservations = new Map();
    this.locks = new Map();
    
    // Initialize inventory from config
    this.initializeInventory();
  }

  initializeInventory() {
    Object.entries(PAYMENT_CONFIG.tickets).forEach(([ticketId, config]) => {
      this.inventory.set(ticketId, {
        available: config.available,
        reserved: 0,
        sold: 0,
        lastUpdated: new Date()
      });
    });
  }

  getInventory(ticketId) {
    return this.inventory.get(ticketId) || null;
  }

  setInventory(ticketId, data) {
    this.inventory.set(ticketId, {
      ...data,
      lastUpdated: new Date()
    });
  }

  getReservation(reservationId) {
    return this.reservations.get(reservationId) || null;
  }

  setReservation(reservationId, data) {
    this.reservations.set(reservationId, {
      ...data,
      createdAt: new Date()
    });
  }

  deleteReservation(reservationId) {
    return this.reservations.delete(reservationId);
  }

  getLock(key) {
    return this.locks.get(key) || null;
  }

  setLock(key, data) {
    this.locks.set(key, data);
  }

  deleteLock(key) {
    return this.locks.delete(key);
  }

  // Cleanup expired locks and reservations
  cleanup() {
    const now = Date.now();
    
    // Cleanup expired locks (5 seconds timeout)
    for (const [key, lock] of this.locks.entries()) {
      if (now - lock.timestamp > 5000) {
        this.locks.delete(key);
      }
    }
    
    // Cleanup expired reservations
    for (const [reservationId, reservation] of this.reservations.entries()) {
      if (now - reservation.createdAt.getTime() > PAYMENT_CONFIG.orders.reservationTimeout * 1000) {
        this.releaseReservation(reservationId);
      }
    }
  }

  releaseReservation(reservationId) {
    const reservation = this.getReservation(reservationId);
    if (!reservation) return false;

    // Return reserved tickets to available inventory
    reservation.items.forEach(item => {
      const inventory = this.getInventory(item.ticketId);
      if (inventory) {
        inventory.available += item.quantity;
        inventory.reserved -= item.quantity;
        this.setInventory(item.ticketId, inventory);
      }
    });

    this.deleteReservation(reservationId);
    return true;
  }
}

// Global inventory store instance
const inventoryStore = new InventoryStore();

// Cleanup task - run every minute
setInterval(() => {
  inventoryStore.cleanup();
}, 60000);

/**
 * Inventory Manager Class
 */
export class InventoryManager {
  constructor() {
    this.store = inventoryStore;
    this.lockTimeout = 5000; // 5 seconds
  }

  /**
   * Check availability of tickets
   */
  async checkAvailability(items) {
    const availability = {
      available: true,
      items: [],
      unavailable: []
    };

    for (const item of items) {
      const { id: ticketId, quantity } = item;
      const inventory = this.store.getInventory(ticketId);
      
      if (!inventory) {
        availability.available = false;
        availability.unavailable.push({
          ticketId,
          reason: 'Invalid ticket type',
          requested: quantity,
          available: 0
        });
        continue;
      }

      const actualAvailable = inventory.available;
      const isAvailable = actualAvailable >= quantity;

      availability.items.push({
        ticketId,
        requested: quantity,
        available: actualAvailable,
        isAvailable
      });

      if (!isAvailable) {
        availability.available = false;
        availability.unavailable.push({
          ticketId,
          reason: 'Insufficient inventory',
          requested: quantity,
          available: actualAvailable
        });
      }
    }

    return availability;
  }

  /**
   * Reserve tickets for a limited time
   */
  async reserveTickets(items, customerEmail, ttl = PAYMENT_CONFIG.orders.reservationTimeout) {
    const reservationId = this.generateReservationId();
    const lockKey = `reservation_lock_${Date.now()}`;
    
    // Acquire distributed lock
    const lock = await this.acquireLock(lockKey);
    if (!lock) {
      throw new ValidationError(ERROR_MESSAGES.INVENTORY_LOCK_FAILED);
    }

    try {
      // Check availability again under lock
      const availability = await this.checkAvailability(items);
      if (!availability.available) {
        throw new ValidationError(ERROR_MESSAGES.INSUFFICIENT_INVENTORY, null, 'INSUFFICIENT_INVENTORY');
      }

      // Reserve the tickets
      const reservationItems = [];
      for (const item of items) {
        const { id: ticketId, quantity } = item;
        const inventory = this.store.getInventory(ticketId);
        
        // Deduct from available and add to reserved
        inventory.available -= quantity;
        inventory.reserved += quantity;
        this.store.setInventory(ticketId, inventory);

        reservationItems.push({
          ticketId,
          quantity,
          unitPrice: PAYMENT_CONFIG.tickets[ticketId]?.price || item.price
        });
      }

      // Create reservation record
      const reservation = {
        id: reservationId,
        customerEmail,
        items: reservationItems,
        expiresAt: new Date(Date.now() + ttl * 1000),
        status: 'active'
      };

      this.store.setReservation(reservationId, reservation);

      return {
        id: reservationId,
        expiresAt: reservation.expiresAt,
        items: reservationItems
      };

    } finally {
      await this.releaseLock(lockKey, lock);
    }
  }

  /**
   * Confirm reservation (convert to sold)
   */
  async confirmReservation(reservationId) {
    const reservation = this.store.getReservation(reservationId);
    if (!reservation) {
      throw new ValidationError('Reservation not found');
    }

    if (reservation.status !== 'active') {
      throw new ValidationError('Reservation is not active');
    }

    if (new Date() > reservation.expiresAt) {
      throw new ValidationError('Reservation has expired');
    }

    const lockKey = `confirm_lock_${reservationId}`;
    const lock = await this.acquireLock(lockKey);
    if (!lock) {
      throw new ValidationError(ERROR_MESSAGES.INVENTORY_LOCK_FAILED);
    }

    try {
      // Convert reserved to sold
      reservation.items.forEach(item => {
        const inventory = this.store.getInventory(item.ticketId);
        if (inventory) {
          inventory.reserved -= item.quantity;
          inventory.sold += item.quantity;
          this.store.setInventory(item.ticketId, inventory);
        }
      });

      // Mark reservation as confirmed
      reservation.status = 'confirmed';
      this.store.setReservation(reservationId, reservation);

      return reservation;

    } finally {
      await this.releaseLock(lockKey, lock);
    }
  }

  /**
   * Release reservation (return tickets to available)
   */
  async releaseReservation(reservationId) {
    return this.store.releaseReservation(reservationId);
  }

  /**
   * Get current inventory levels
   */
  async getInventoryLevels() {
    const levels = {};
    
    for (const [ticketId, inventory] of this.store.inventory.entries()) {
      levels[ticketId] = {
        ...inventory,
        total: inventory.available + inventory.reserved + inventory.sold
      };
    }

    return levels;
  }

  /**
   * Update inventory levels (admin function)
   */
  async updateInventory(ticketId, changes) {
    const inventory = this.store.getInventory(ticketId);
    if (!inventory) {
      throw new ValidationError(`Invalid ticket type: ${ticketId}`);
    }

    const lockKey = `update_lock_${ticketId}`;
    const lock = await this.acquireLock(lockKey);
    if (!lock) {
      throw new ValidationError(ERROR_MESSAGES.INVENTORY_LOCK_FAILED);
    }

    try {
      const updated = { ...inventory, ...changes };
      
      // Validate the changes
      if (updated.available < 0 || updated.reserved < 0 || updated.sold < 0) {
        throw new ValidationError('Invalid inventory values');
      }

      this.store.setInventory(ticketId, updated);
      return updated;

    } finally {
      await this.releaseLock(lockKey, lock);
    }
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(key, timeout = this.lockTimeout) {
    const token = this.generateToken();
    const now = Date.now();
    
    // Check if lock exists and is not expired
    const existingLock = this.store.getLock(key);
    if (existingLock && (now - existingLock.timestamp) < timeout) {
      return null; // Lock is held by another process
    }

    // Acquire lock
    this.store.setLock(key, {
      token,
      timestamp: now,
      timeout
    });

    return token;
  }

  /**
   * Release distributed lock
   */
  async releaseLock(key, token) {
    const lock = this.store.getLock(key);
    if (lock && lock.token === token) {
      this.store.deleteLock(key);
      return true;
    }
    return false;
  }

  /**
   * Generate unique reservation ID
   */
  generateReservationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `res_${timestamp}_${random}`;
  }

  /**
   * Generate unique token
   */
  generateToken() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Clean up expired items
   */
  async cleanup() {
    this.store.cleanup();
  }

  /**
   * Get reservation details
   */
  async getReservation(reservationId) {
    return this.store.getReservation(reservationId);
  }

  /**
   * Get inventory statistics
   */
  async getInventoryStats() {
    const stats = {
      totalTickets: 0,
      totalAvailable: 0,
      totalReserved: 0,
      totalSold: 0,
      byType: {}
    };

    for (const [ticketId, inventory] of this.store.inventory.entries()) {
      const total = inventory.available + inventory.reserved + inventory.sold;
      
      stats.totalTickets += total;
      stats.totalAvailable += inventory.available;
      stats.totalReserved += inventory.reserved;
      stats.totalSold += inventory.sold;
      
      stats.byType[ticketId] = {
        ...inventory,
        total,
        soldPercentage: total > 0 ? Math.round((inventory.sold / total) * 100) : 0
      };
    }

    return stats;
  }
}

// Export singleton instance
export const inventoryManager = new InventoryManager();