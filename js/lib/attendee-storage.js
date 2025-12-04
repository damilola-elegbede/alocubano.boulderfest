/**
 * Attendee Storage - Encrypted localStorage wrapper for attendee PII
 *
 * Provides a secure way to persist attendee registration data (names, emails)
 * in localStorage while protecting PII with encryption.
 *
 * Features:
 * - AES-256-GCM encryption via Web Crypto API
 * - Automatic expiration (1 hour default)
 * - Graceful degradation if encryption unavailable
 * - Cart session association
 *
 * @module js/lib/attendee-storage
 */

import {
    encryptAttendeeData,
    decryptAttendeeData,
    isEncryptionSupported
} from './attendee-encryption.js';

/** localStorage key for encrypted attendee data */
const STORAGE_KEY = 'alocubano_attendee_encrypted';

/** localStorage key for test mode attendee data */
const STORAGE_KEY_TEST = 'alocubano_attendee_encrypted_test';

/** Default expiration time in milliseconds (1 hour) */
const DEFAULT_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Get the appropriate storage key based on test mode
 * @param {boolean} testMode - Whether test mode is active
 * @returns {string}
 */
function getStorageKey(testMode = false) {
    return testMode ? STORAGE_KEY_TEST : STORAGE_KEY;
}

/**
 * Check if we're in test mode (matches cart-manager pattern)
 * @returns {boolean}
 */
function isTestMode() {
    if (typeof localStorage === 'undefined') {
        return false;
    }
    return (
        localStorage.getItem('cart_test_mode') === 'true' ||
        localStorage.getItem('admin_test_session') === 'true'
    );
}

/**
 * Save attendee data to encrypted localStorage
 *
 * @param {Object} attendeeData - Attendee data keyed by ticket identifier
 * @param {string} encryptionKey - Base64-encoded encryption key from server
 * @param {Object} options - Optional settings
 * @param {string} options.cartSessionId - Cart session ID for association
 * @param {number} options.expirationMs - Custom expiration time in ms
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveAttendeeData(attendeeData, encryptionKey, options = {}) {
    if (!attendeeData || Object.keys(attendeeData).length === 0) {
        // Nothing to save, clear any existing data
        clearAttendeeData();
        return true;
    }

    if (!encryptionKey) {
        console.warn('No encryption key provided, attendee data will not be persisted');
        return false;
    }

    if (!isEncryptionSupported()) {
        console.warn('Web Crypto API not supported, attendee data will not be persisted');
        return false;
    }

    try {
        const encrypted = await encryptAttendeeData(attendeeData, encryptionKey);

        const storageData = {
            ...encrypted,
            savedAt: Date.now(),
            cartSessionId: options.cartSessionId || null,
            expiresAt: Date.now() + (options.expirationMs || DEFAULT_EXPIRATION_MS)
        };

        const storageKey = getStorageKey(isTestMode());
        localStorage.setItem(storageKey, JSON.stringify(storageData));

        return true;
    } catch (error) {
        console.error('Failed to save attendee data:', error.message);
        return false;
    }
}

/**
 * Load attendee data from encrypted localStorage
 *
 * @param {string} encryptionKey - Base64-encoded encryption key from server
 * @param {Object} options - Optional settings
 * @param {string} options.cartSessionId - Only load if cart session matches
 * @returns {Promise<Object|null>} Decrypted attendee data or null
 */
export async function loadAttendeeData(encryptionKey, options = {}) {
    if (!encryptionKey) {
        console.warn('No encryption key provided, cannot load attendee data');
        return null;
    }

    if (!isEncryptionSupported()) {
        console.warn('Web Crypto API not supported, cannot load attendee data');
        return null;
    }

    try {
        const storageKey = getStorageKey(isTestMode());
        const stored = localStorage.getItem(storageKey);

        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored);

        // Check expiration
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
            console.log('Attendee data expired, clearing');
            clearAttendeeData();
            return null;
        }

        // Check cart session association (if provided)
        if (options.cartSessionId && parsed.cartSessionId) {
            if (parsed.cartSessionId !== options.cartSessionId) {
                console.log('Cart session mismatch, attendee data belongs to different session');
                // Don't clear - might be valid for another session
                return null;
            }
        }

        // Decrypt the data
        const decrypted = await decryptAttendeeData(parsed, encryptionKey);
        return decrypted;
    } catch (error) {
        console.error('Failed to load attendee data:', error.message);
        // Clear corrupted data
        clearAttendeeData();
        return null;
    }
}

/**
 * Clear attendee data from localStorage
 * Clears both production and test mode data
 */
export function clearAttendeeData() {
    if (typeof localStorage === 'undefined') {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_TEST);
}

/**
 * Check if there is stored attendee data (without decrypting)
 * Useful for UI hints about data recovery
 *
 * @returns {boolean}
 */
export function hasStoredAttendeeData() {
    if (typeof localStorage === 'undefined') {
        return false;
    }

    const storageKey = getStorageKey(isTestMode());
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
        return false;
    }

    try {
        const parsed = JSON.parse(stored);
        // Check if not expired
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Get metadata about stored attendee data (without decrypting)
 *
 * @returns {Object|null} Metadata or null if no data
 */
export function getStoredAttendeeMetadata() {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    const storageKey = getStorageKey(isTestMode());
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
        return null;
    }

    try {
        const parsed = JSON.parse(stored);
        return {
            savedAt: parsed.savedAt,
            expiresAt: parsed.expiresAt,
            cartSessionId: parsed.cartSessionId,
            isExpired: parsed.expiresAt ? Date.now() > parsed.expiresAt : false
        };
    } catch {
        return null;
    }
}

export default {
    saveAttendeeData,
    loadAttendeeData,
    clearAttendeeData,
    hasStoredAttendeeData,
    getStoredAttendeeMetadata
};
