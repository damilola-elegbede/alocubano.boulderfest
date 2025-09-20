/**
 * Subscriber Builder Domain Service
 * Handles building and normalizing subscriber data objects
 */

export class SubscriberBuilder {
  /**
   * Build complete subscriber data from request
   * @param {Object} requestData - Raw request data
   * @param {Object} options - Build options
   * @returns {Object} Complete subscriber data
   */
  static buildSubscriberData(requestData, options = {}) {
    const {
      requireVerification = false,
      defaultListId = 1,
      defaultStatus = 'active',
      consentIp = null,
      userAgent = null
    } = options;

    if (!requestData || typeof requestData !== 'object') {
      throw new Error('Request data is required');
    }

    if (!requestData.email) {
      throw new Error('Email is required');
    }

    return {
      email: this.normalizeEmail(requestData.email),
      firstName: this.normalizeName(requestData.firstName),
      lastName: this.normalizeName(requestData.lastName),
      phone: this.normalizePhone(requestData.phone),
      status: this.determineInitialStatus(requireVerification, defaultStatus),
      listIds: this.normalizeListIds(requestData.lists, defaultListId),
      attributes: this.buildAttributes(requestData, options),
      consentSource: this.normalizeSource(requestData.source),
      consentIp: consentIp,
      consentUserAgent: userAgent,
      verificationToken: requireVerification ? this.generateVerificationToken() : null,
      consentDate: new Date().toISOString()
    };
  }

  /**
   * Normalize email address
   * @param {string} email - Raw email
   * @returns {string} Normalized email
   */
  static normalizeEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email is required');
    }

    return email.toLowerCase().trim();
  }

  /**
   * Normalize name fields
   * @param {string} name - Raw name
   * @returns {string|null} Normalized name or null
   */
  static normalizeName(name) {
    if (!name || typeof name !== 'string') {
      return null;
    }

    const normalized = name.trim();
    if (normalized.length === 0) {
      return null;
    }

    // Capitalize first letter of each word
    return normalized
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .slice(0, 100); // Truncate if too long
  }

  /**
   * Normalize phone number
   * @param {string} phone - Raw phone
   * @returns {string|null} Normalized phone or null
   */
  static normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return null;
    }

    const normalized = phone.trim();
    if (normalized.length === 0) {
      return null;
    }

    return normalized.slice(0, 50); // Truncate if too long
  }

  /**
   * Determine initial subscriber status
   * @param {boolean} requireVerification - Whether verification is required
   * @param {string} defaultStatus - Default status if no verification
   * @returns {string} Initial status
   */
  static determineInitialStatus(requireVerification, defaultStatus = 'active') {
    if (requireVerification) {
      return 'pending';
    }

    const validStatuses = ['active', 'pending', 'unsubscribed', 'bounced'];
    if (!validStatuses.includes(defaultStatus)) {
      return 'active';
    }

    return defaultStatus;
  }

  /**
   * Normalize list IDs
   * @param {Array} listIds - Raw list IDs
   * @param {number} defaultListId - Default list ID
   * @returns {Array} Normalized list IDs
   */
  static normalizeListIds(listIds, defaultListId = 1) {
    if (!listIds || !Array.isArray(listIds) || listIds.length === 0) {
      return [defaultListId];
    }

    // Filter out invalid IDs and ensure they're integers
    const validIds = listIds
      .filter(id => Number.isInteger(id) && id > 0)
      .slice(0, 10); // Limit to 10 lists

    return validIds.length > 0 ? validIds : [defaultListId];
  }

  /**
   * Build subscriber attributes
   * @param {Object} requestData - Request data
   * @param {Object} options - Build options
   * @returns {Object} Subscriber attributes
   */
  static buildAttributes(requestData, options = {}) {
    const attributes = {
      SIGNUP_DATE: new Date().toISOString(),
      CONSENT_DATE: new Date().toISOString(),
      SIGNUP_PAGE: this.normalizeSource(requestData.source || 'website')
    };

    // Add IP address if available
    if (options.consentIp) {
      attributes.CONSENT_IP = options.consentIp;
    }

    // Add user agent if available
    if (options.userAgent) {
      attributes.USER_AGENT = this.normalizeUserAgent(options.userAgent);
    }

    // Add signup method
    attributes.SIGNUP_METHOD = options.signupMethod || 'web_form';

    // Add language preference if available
    if (requestData.language) {
      attributes.PREFERRED_LANGUAGE = this.normalizeLanguage(requestData.language);
    }

    // Add timezone if available
    if (requestData.timezone) {
      attributes.TIMEZONE = this.normalizeTimezone(requestData.timezone);
    }

    // Add interests if provided
    if (requestData.interests && Array.isArray(requestData.interests)) {
      attributes.INTERESTS = this.normalizeInterests(requestData.interests);
    }

    // Add custom attributes from request
    if (requestData.attributes && typeof requestData.attributes === 'object') {
      const customAttributes = this.normalizeCustomAttributes(requestData.attributes);
      Object.assign(attributes, customAttributes);
    }

    return attributes;
  }

  /**
   * Normalize source/origin
   * @param {string} source - Raw source
   * @returns {string} Normalized source
   */
  static normalizeSource(source) {
    if (!source || typeof source !== 'string') {
      return 'website';
    }

    const normalized = source.trim().toLowerCase().slice(0, 100);

    // Map common sources
    const sourceMapping = {
      'web': 'website',
      'site': 'website',
      'homepage': 'website',
      'form': 'website',
      'social': 'social_media',
      'fb': 'facebook',
      'ig': 'instagram',
      'tw': 'twitter'
    };

    return sourceMapping[normalized] || normalized || 'website';
  }

  /**
   * Normalize user agent
   * @param {string} userAgent - Raw user agent
   * @returns {string} Normalized user agent
   */
  static normalizeUserAgent(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') {
      return 'unknown';
    }

    // Extract basic browser info and truncate
    const normalized = userAgent.trim().slice(0, 200);

    // Simple browser detection
    if (normalized.includes('Chrome')) return 'Chrome';
    if (normalized.includes('Firefox')) return 'Firefox';
    if (normalized.includes('Safari') && !normalized.includes('Chrome')) return 'Safari';
    if (normalized.includes('Edge')) return 'Edge';

    return normalized;
  }

  /**
   * Normalize language preference
   * @param {string} language - Raw language
   * @returns {string} Normalized language code
   */
  static normalizeLanguage(language) {
    if (!language || typeof language !== 'string') {
      return 'en';
    }

    const normalized = language.toLowerCase().trim();

    // Extract language code (first 2 characters)
    const langCode = normalized.split('-')[0].slice(0, 2);

    // Validate against common language codes
    const validLangs = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];

    return validLangs.includes(langCode) ? langCode : 'en';
  }

  /**
   * Normalize timezone
   * @param {string} timezone - Raw timezone
   * @returns {string} Normalized timezone
   */
  static normalizeTimezone(timezone) {
    if (!timezone || typeof timezone !== 'string') {
      return 'UTC';
    }

    const normalized = timezone.trim();

    // Basic timezone validation
    if (normalized.includes('/') && normalized.length > 3) {
      const parts = normalized.split('/');
      // Simple validation: should have 2 parts, each reasonable length
      if (parts.length === 2 && parts[0].length >= 2 && parts[1].length >= 2) {
        return normalized.slice(0, 50);
      }
    }

    return 'UTC';
  }

  /**
   * Normalize interests array
   * @param {Array} interests - Raw interests
   * @returns {string} Comma-separated interests
   */
  static normalizeInterests(interests) {
    if (!Array.isArray(interests)) {
      return '';
    }

    return interests
      .filter(interest => typeof interest === 'string' && interest.trim().length > 0)
      .map(interest => interest.trim().slice(0, 50))
      .slice(0, 10) // Limit to 10 interests
      .join(', ');
  }

  /**
   * Normalize custom attributes
   * @param {Object} attributes - Raw custom attributes
   * @returns {Object} Normalized custom attributes
   */
  static normalizeCustomAttributes(attributes) {
    const normalized = {};

    if (!attributes || typeof attributes !== 'object') {
      return normalized;
    }

    Object.keys(attributes).forEach(key => {
      if (typeof key !== 'string' || key.length > 50) {
        return; // Skip invalid keys
      }

      const value = attributes[key];
      const normalizedKey = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      if (typeof value === 'string') {
        const normalizedValue = value.trim().slice(0, 500);
        if (normalizedValue.length > 0) {
          normalized[`CUSTOM_${normalizedKey}`] = normalizedValue;
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        normalized[`CUSTOM_${normalizedKey}`] = value.toString();
      }
    });

    return normalized;
  }

  /**
   * Build Brevo contact data
   * @param {Object} subscriberData - Subscriber data
   * @returns {Object} Brevo contact data
   */
  static buildBrevoContactData(subscriberData) {
    const brevoData = {
      email: subscriberData.email,
      attributes: {},
      listIds: subscriberData.listIds || [1]
    };

    // Map name fields
    if (subscriberData.firstName) {
      brevoData.attributes.FIRSTNAME = subscriberData.firstName;
    }

    if (subscriberData.lastName) {
      brevoData.attributes.LASTNAME = subscriberData.lastName;
    }

    // Map phone
    if (subscriberData.phone) {
      brevoData.attributes.SMS = subscriberData.phone;
    }

    // Map all other attributes
    if (subscriberData.attributes) {
      Object.assign(brevoData.attributes, subscriberData.attributes);
    }

    return brevoData;
  }

  /**
   * Generate verification token
   * @returns {string} Random verification token
   */
  static generateVerificationToken() {
    // Generate cryptographically secure random token
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';

    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return token;
  }

  /**
   * Build subscriber response data
   * @param {Object} subscriberData - Subscriber data from database
   * @param {boolean} includePrivate - Whether to include private fields
   * @returns {Object} Response-safe subscriber data
   */
  static buildSubscriberResponse(subscriberData, includePrivate = false) {
    if (!subscriberData) {
      return null;
    }

    const response = {
      email: subscriberData.email,
      status: subscriberData.status,
      firstName: subscriberData.first_name,
      lastName: subscriberData.last_name,
      subscribedAt: subscriberData.created_at,
      updatedAt: subscriberData.updated_at
    };

    if (includePrivate) {
      response.id = subscriberData.id;
      response.phone = subscriberData.phone;
      response.listIds = subscriberData.list_ids;
      response.attributes = subscriberData.attributes;
      response.consentSource = subscriberData.consent_source;
      response.consentDate = subscriberData.consent_date;
      response.verifiedAt = subscriberData.verified_at;
      response.unsubscribedAt = subscriberData.unsubscribed_at;
    }

    return response;
  }

  /**
   * Validate built subscriber data
   * @param {Object} subscriberData - Built subscriber data
   * @returns {Object} Validation result
   */
  static validateBuiltSubscriber(subscriberData) {
    const errors = [];

    if (!subscriberData || typeof subscriberData !== 'object') {
      errors.push('Subscriber data must be an object');
      return { valid: false, errors };
    }

    if (!subscriberData.email) {
      errors.push('Email is required');
    }

    if (!subscriberData.status || !['active', 'pending', 'unsubscribed', 'bounced'].includes(subscriberData.status)) {
      errors.push('Valid status is required');
    }

    if (!Array.isArray(subscriberData.listIds) || subscriberData.listIds.length === 0) {
      errors.push('At least one list ID is required');
    }

    if (!subscriberData.consentDate) {
      errors.push('Consent date is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}