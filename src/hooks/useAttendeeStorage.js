/**
 * useAttendeeStorage - React hook for encrypted attendee data persistence
 *
 * Manages encryption key fetching and provides methods to save/load/clear
 * attendee data from encrypted localStorage.
 *
 * Usage:
 * ```jsx
 * const { saveAttendees, loadAttendees, clearAttendees, isReady, hasStoredData } = useAttendeeStorage(cartSessionId);
 *
 * // On mount, restore saved data
 * useEffect(() => {
 *   if (isReady && hasStoredData) {
 *     loadAttendees().then(data => setAttendeeData(data));
 *   }
 * }, [isReady, hasStoredData]);
 *
 * // Auto-save on change
 * useEffect(() => {
 *   if (isReady) saveAttendees(attendeeData);
 * }, [attendeeData, isReady]);
 * ```
 *
 * @module src/hooks/useAttendeeStorage
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    saveAttendeeData,
    loadAttendeeData,
    clearAttendeeData,
    hasStoredAttendeeData,
} from '../../js/lib/attendee-storage.js';
import { isEncryptionSupported } from '../../js/lib/attendee-encryption.js';

/**
 * Hook for managing encrypted attendee data in localStorage
 *
 * @param {string} cartSessionId - Cart session identifier for key derivation
 * @returns {Object} Storage methods and state
 */
export function useAttendeeStorage(cartSessionId) {
    const [encryptionKey, setEncryptionKey] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasStoredData, setHasStoredData] = useState(false);

    // Track if component is mounted to prevent state updates after unmount
    const isMountedRef = useRef(true);

    // Fetch encryption key on mount or when session changes
    useEffect(() => {
        isMountedRef.current = true;

        // Check for stored data immediately
        setHasStoredData(hasStoredAttendeeData());

        // Skip if encryption not supported
        if (!isEncryptionSupported()) {
            console.warn('Encryption not supported, attendee persistence disabled');
            setIsLoading(false);
            return;
        }

        // Skip if no session ID
        if (!cartSessionId) {
            setIsLoading(false);
            return;
        }

        // Fetch encryption key from server
        async function fetchEncryptionKey() {
            try {
                const response = await fetch(
                    `/api/checkout/encryption-key?sessionId=${encodeURIComponent(cartSessionId)}`
                );

                if (!response.ok) {
                    throw new Error(`Failed to fetch encryption key: ${response.status}`);
                }

                const data = await response.json();

                if (isMountedRef.current) {
                    setEncryptionKey(data.key);
                    setError(null);
                }
            } catch (err) {
                console.error('Failed to fetch encryption key:', err);
                if (isMountedRef.current) {
                    setError(err.message);
                }
            } finally {
                if (isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        }

        fetchEncryptionKey();

        return () => {
            isMountedRef.current = false;
        };
    }, [cartSessionId]);

    /**
     * Save attendee data to encrypted localStorage
     * @param {Object} data - Attendee data keyed by ticket identifier
     * @returns {Promise<boolean>} Success status
     */
    const saveAttendees = useCallback(
        async (data) => {
            if (!encryptionKey) {
                // Silently skip if no key (not an error, just not ready)
                return false;
            }

            try {
                const success = await saveAttendeeData(data, encryptionKey, {
                    cartSessionId,
                });
                if (success) {
                    setHasStoredData(Object.keys(data || {}).length > 0);
                }
                return success;
            } catch (err) {
                console.error('Failed to save attendees:', err);
                return false;
            }
        },
        [encryptionKey, cartSessionId]
    );

    /**
     * Load attendee data from encrypted localStorage
     * @returns {Promise<Object|null>} Decrypted attendee data or null
     */
    const loadAttendees = useCallback(async () => {
        if (!encryptionKey) {
            return null;
        }

        try {
            const data = await loadAttendeeData(encryptionKey, {
                cartSessionId,
            });
            return data;
        } catch (err) {
            console.error('Failed to load attendees:', err);
            return null;
        }
    }, [encryptionKey, cartSessionId]);

    /**
     * Clear attendee data from localStorage
     */
    const clearAttendees = useCallback(() => {
        clearAttendeeData();
        setHasStoredData(false);
    }, []);

    return {
        /** Save attendee data to encrypted storage */
        saveAttendees,
        /** Load attendee data from encrypted storage */
        loadAttendees,
        /** Clear all stored attendee data */
        clearAttendees,
        /** Whether the hook is ready (key fetched) */
        isReady: !isLoading && !!encryptionKey,
        /** Whether the hook is still loading */
        isLoading,
        /** Whether there's stored data available */
        hasStoredData,
        /** Any error that occurred during initialization */
        error,
        /** Whether encryption is supported in this browser */
        isSupported: isEncryptionSupported(),
    };
}

export default useAttendeeStorage;
