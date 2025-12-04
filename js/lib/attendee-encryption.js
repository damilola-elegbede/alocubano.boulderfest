/**
 * Attendee Encryption - Client-side encryption for PII using Web Crypto API
 *
 * Encrypts attendee data (names, emails) before storing in localStorage.
 * Uses AES-256-GCM for authenticated encryption, matching the backend pattern.
 *
 * Security:
 * - AES-256-GCM provides both confidentiality and integrity
 * - Random IV per encryption prevents pattern analysis
 * - Authentication tag prevents tampering
 *
 * @module js/lib/attendee-encryption
 */

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Import a Base64-encoded key for use with Web Crypto API
 * @param {string} keyBase64 - Base64-encoded key from server
 * @returns {Promise<CryptoKey>}
 */
async function importKey(keyBase64) {
    const keyData = base64ToBuffer(keyBase64);

    // AES-256 requires exactly 32 bytes (256 bits)
    // Take first 32 bytes if key is longer
    const keyBytes = new Uint8Array(keyData).slice(0, 32);

    return await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false, // not extractable
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt attendee data using AES-256-GCM
 *
 * @param {Object} data - Attendee data object to encrypt
 * @param {string} keyBase64 - Base64-encoded encryption key from server
 * @returns {Promise<{encrypted: string, iv: string}>} Encrypted data with IV
 * @throws {Error} If encryption fails
 */
export async function encryptAttendeeData(data, keyBase64) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid data: must be an object');
    }

    if (!keyBase64 || typeof keyBase64 !== 'string') {
        throw new Error('Invalid key: must be a base64 string');
    }

    try {
        const key = await importKey(keyBase64);

        // Generate random 12-byte IV (96 bits, recommended for GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encode data as UTF-8 JSON
        const encoded = new TextEncoder().encode(JSON.stringify(data));

        // Encrypt with AES-GCM
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128 // 128-bit auth tag (default)
            },
            key,
            encoded
        );

        return {
            encrypted: bufferToBase64(encrypted),
            iv: bufferToBase64(iv)
        };
    } catch (error) {
        console.error('Encryption failed:', error.message);
        throw new Error('Failed to encrypt attendee data');
    }
}

/**
 * Decrypt attendee data using AES-256-GCM
 *
 * @param {Object} encryptedData - Object with encrypted data and IV
 * @param {string} encryptedData.encrypted - Base64-encoded ciphertext
 * @param {string} encryptedData.iv - Base64-encoded initialization vector
 * @param {string} keyBase64 - Base64-encoded encryption key from server
 * @returns {Promise<Object>} Decrypted attendee data object
 * @throws {Error} If decryption fails (wrong key, tampered data, etc.)
 */
export async function decryptAttendeeData(encryptedData, keyBase64) {
    if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv) {
        throw new Error('Invalid encrypted data: missing required fields');
    }

    if (!keyBase64 || typeof keyBase64 !== 'string') {
        throw new Error('Invalid key: must be a base64 string');
    }

    try {
        const key = await importKey(keyBase64);
        const iv = new Uint8Array(base64ToBuffer(encryptedData.iv));
        const ciphertext = base64ToBuffer(encryptedData.encrypted);

        // Decrypt with AES-GCM (includes authentication)
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128
            },
            key,
            ciphertext
        );

        // Decode UTF-8 JSON
        const decoded = new TextDecoder().decode(decrypted);
        return JSON.parse(decoded);
    } catch (error) {
        // GCM authentication failure or other decryption error
        console.error('Decryption failed:', error.message);
        throw new Error('Failed to decrypt attendee data - data may be corrupted or key invalid');
    }
}

/**
 * Check if Web Crypto API is available
 * @returns {boolean}
 */
export function isEncryptionSupported() {
    return (
        typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof crypto.subtle.encrypt === 'function' &&
        typeof crypto.subtle.decrypt === 'function'
    );
}

export default {
    encryptAttendeeData,
    decryptAttendeeData,
    isEncryptionSupported
};
