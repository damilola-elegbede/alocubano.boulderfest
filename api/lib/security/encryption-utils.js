import crypto from "crypto";

/**
 * Shared encryption utilities for MFA secrets and sensitive data
 * Used by both mfa-setup.js and mfa-middleware.js
 */

/**
 * Encrypt TOTP secret for storage
 * @param {string} secret - The plain text secret to encrypt
 * @returns {string} - JSON string containing encrypted data with metadata
 */
export function encryptSecret(secret) {
  const algorithm = "aes-256-gcm";
  const key = crypto.scryptSync(process.env.ADMIN_SECRET, "mfa-salt", 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from("mfa-secret"));

  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  });
}

/**
 * Decrypt TOTP secret from storage
 * @param {string} encryptedData - JSON string containing encrypted data
 * @returns {string} - The decrypted secret
 */
export function decryptSecret(encryptedData) {
  try {
    const algorithm = "aes-256-gcm";
    const key = crypto.scryptSync(process.env.ADMIN_SECRET, "mfa-salt", 32);

    const { encrypted, iv, authTag } = JSON.parse(encryptedData);

    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, "hex"),
    );
    decipher.setAAD(Buffer.from("mfa-secret"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Error decrypting MFA secret:", error);
    throw new Error("Failed to decrypt MFA secret");
  }
}
