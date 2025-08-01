/**
 * Google Analytics 4 Enhanced Ecommerce Integration
 * Comprehensive payment and conversion tracking
 */

// GA4 Measurement ID (should be set in environment variables)
const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || 'G-XXXXXXXXXX';

/**
 * Initialize Google Analytics 4
 */
export function initializeGA4() {
  // Load gtag script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };

  gtag('js', new Date());
  gtag('config', GA4_MEASUREMENT_ID, {
    // Enhanced ecommerce settings
    enhanced_ecommerce: true,
    send_page_view: true,
    
    // Custom dimensions for festival tracking
    custom_map: {
      custom_dimension_1: 'festival_year',
      custom_dimension_2: 'ticket_type',
      custom_dimension_3: 'customer_type',
      custom_dimension_4: 'payment_method',
      custom_dimension_5: 'referral_source'
    },
    
    // Privacy settings
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  console.log('GA4 initialized for payment tracking');
}

/**
 * Enhanced Ecommerce Events
 */
export const ECOMMERCE_EVENTS = {
  // Purchase funnel
  VIEW_ITEM: 'view_item',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  BEGIN_CHECKOUT: 'begin_checkout',
  ADD_PAYMENT_INFO: 'add_payment_info',
  PURCHASE: 'purchase',
  
  // Custom payment events
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_RETRY: 'payment_retry',
  REFUND: 'refund',
  
  // Festival-specific events
  TICKET_SELECTION: 'ticket_selection',
  WORKSHOP_SELECTION: 'workshop_selection',
  EARLY_BIRD_CONVERSION: 'early_bird_conversion'
};

/**
 * Track ticket viewing
 */
export function trackViewItem(item) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', ECOMMERCE_EVENTS.VIEW_ITEM, {
    currency: 'USD',
    value: item.price,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_category: item.category || 'festival_ticket',
      item_category2: item.type || 'general',
      item_brand: 'A Lo Cubano Boulder Fest',
      price: item.price,
      quantity: 1,
      // Custom parameters
      festival_year: '2026',
      ticket_type: item.type,
      early_bird: item.isEarlyBird || false,
      workshop_included: item.includesWorkshops || false
    }]
  });
}

/**
 * Track adding item to cart
 */
export function trackAddToCart(item, quantity = 1) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', ECOMMERCE_EVENTS.ADD_TO_CART, {
    currency: 'USD',
    value: item.price * quantity,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_category: item.category || 'festival_ticket',
      item_category2: item.type || 'general',
      item_brand: 'A Lo Cubano Boulder Fest',
      price: item.price,
      quantity: quantity,
      // Custom parameters
      festival_year: '2026',
      ticket_type: item.type,
      early_bird: item.isEarlyBird || false
    }]
  });
}

/**
 * Track removing item from cart
 */
export function trackRemoveFromCart(item, quantity = 1) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', ECOMMERCE_EVENTS.REMOVE_FROM_CART, {
    currency: 'USD',
    value: item.price * quantity,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_category: item.category || 'festival_ticket',
      price: item.price,
      quantity: quantity
    }]
  });
}

/**
 * Track beginning of checkout process
 */
export function trackBeginCheckout(items, totalValue) {
  if (typeof gtag === 'undefined') return;
  
  const formattedItems = items.map(item => ({
    item_id: item.id,
    item_name: item.name,
    item_category: item.category || 'festival_ticket',
    item_category2: item.type || 'general',
    item_brand: 'A Lo Cubano Boulder Fest',
    price: item.price,
    quantity: item.quantity || 1,
    // Custom parameters
    festival_year: '2026',
    ticket_type: item.type,
    early_bird: item.isEarlyBird || false
  }));
  
  gtag('event', ECOMMERCE_EVENTS.BEGIN_CHECKOUT, {
    currency: 'USD',
    value: totalValue,
    items: formattedItems,
    // Custom parameters
    checkout_step: 1,
    checkout_option: 'stripe_checkout'
  });
}

/**
 * Track payment information addition
 */
export function trackAddPaymentInfo(items, totalValue, paymentMethod) {
  if (typeof gtag === 'undefined') return;
  
  const formattedItems = items.map(item => ({
    item_id: item.id,
    item_name: item.name,
    item_category: item.category || 'festival_ticket',
    price: item.price,
    quantity: item.quantity || 1
  }));
  
  gtag('event', ECOMMERCE_EVENTS.ADD_PAYMENT_INFO, {
    currency: 'USD',
    value: totalValue,
    items: formattedItems,
    // Custom parameters
    payment_type: paymentMethod,
    checkout_step: 2
  });
}

/**
 * Track successful purchase
 */
export function trackPurchase(orderData) {
  if (typeof gtag === 'undefined') return;
  
  const formattedItems = orderData.items.map(item => ({
    item_id: item.id,
    item_name: item.name,
    item_category: item.category || 'festival_ticket',
    item_category2: item.type || 'general',
    item_brand: 'A Lo Cubano Boulder Fest',
    price: item.price,
    quantity: item.quantity || 1,
    // Custom parameters
    festival_year: '2026',
    ticket_type: item.type,
    early_bird: item.isEarlyBird || false
  }));
  
  gtag('event', ECOMMERCE_EVENTS.PURCHASE, {
    transaction_id: orderData.orderNumber,
    value: orderData.totalAmount,
    currency: 'USD',
    items: formattedItems,
    // Custom parameters
    payment_method: orderData.paymentMethod,
    festival_year: '2026',
    customer_type: orderData.customerType || 'new',
    processing_time: orderData.processingTime,
    // Tax and shipping (if applicable)
    tax: orderData.tax || 0,
    shipping: orderData.shipping || 0
  });
  
  // Send conversion event for performance tracking
  gtag('event', 'conversion', {
    send_to: GA4_MEASUREMENT_ID,
    value: orderData.totalAmount,
    currency: 'USD',
    transaction_id: orderData.orderNumber
  });
}

/**
 * Track payment failure
 */
export function trackPaymentFailed(errorData) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', ECOMMERCE_EVENTS.PAYMENT_FAILED, {
    currency: 'USD',
    value: errorData.amount || 0,
    // Error details
    error_type: errorData.errorType,
    error_code: errorData.errorCode,
    payment_method: errorData.paymentMethod,
    retry_count: errorData.retryCount || 0,
    // Custom parameters
    festival_year: '2026',
    checkout_step: errorData.checkoutStep || 'payment'
  });
}

/**
 * Track payment retry
 */
export function trackPaymentRetry(retryData) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', ECOMMERCE_EVENTS.PAYMENT_RETRY, {
    currency: 'USD',
    value: retryData.amount || 0,
    // Retry details
    retry_count: retryData.retryCount,
    original_error: retryData.originalError,
    payment_method: retryData.paymentMethod,
    // Custom parameters
    festival_year: '2026'
  });
}

/**
 * Track custom conversion events
 */
export function trackConversion(conversionType, value = 0, customParams = {}) {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', 'conversion', {
    send_to: GA4_MEASUREMENT_ID,
    value: value,
    currency: 'USD',
    conversion_type: conversionType,
    ...customParams
  });
}

/**
 * Track user engagement metrics
 */
export function trackEngagement(action, category = 'engagement', label = '') {
  if (typeof gtag === 'undefined') return;
  
  gtag('event', action, {
    event_category: category,
    event_label: label,
    // Custom parameters
    festival_year: '2026',
    page_location: window.location.href,
    page_title: document.title
  });
}

/**
 * Track page views with enhanced data
 */
export function trackPageView(pagePath, pageTitle, customParams = {}) {
  if (typeof gtag === 'undefined') return;
  
  gtag('config', GA4_MEASUREMENT_ID, {
    page_path: pagePath,
    page_title: pageTitle,
    // Custom parameters
    festival_year: '2026',
    ...customParams
  });
}

/**
 * Set user properties for segmentation
 */
export function setUserProperties(properties) {
  if (typeof gtag === 'undefined') return;
  
  gtag('config', GA4_MEASUREMENT_ID, {
    user_properties: {
      customer_type: properties.customerType || 'unknown',
      festival_year: '2026',
      registration_date: properties.registrationDate,
      ticket_count: properties.ticketCount || 0,
      total_spend: properties.totalSpend || 0,
      ...properties
    }
  });
}

/**
 * Create enhanced ecommerce funnel analysis
 */
export class EcommerceFunnel {
  constructor() {
    this.steps = [];
    this.startTime = Date.now();
  }
  
  addStep(stepName, stepData = {}) {
    const step = {
      name: stepName,
      timestamp: Date.now(),
      duration: Date.now() - this.startTime,
      ...stepData
    };
    
    this.steps.push(step);
    
    // Track funnel step
    gtag('event', 'funnel_step', {
      funnel_name: 'ticket_purchase',
      step_name: stepName,
      step_number: this.steps.length,
      step_duration: step.duration,
      ...stepData
    });
  }
  
  complete(orderData) {
    this.addStep('purchase_complete', {
      transaction_id: orderData.orderNumber,
      value: orderData.totalAmount,
      total_duration: Date.now() - this.startTime
    });
    
    // Track complete funnel
    gtag('event', 'funnel_complete', {
      funnel_name: 'ticket_purchase',
      total_steps: this.steps.length,
      total_duration: Date.now() - this.startTime,
      conversion_value: orderData.totalAmount
    });
  }
  
  abandon(stepName, reason = 'unknown') {
    gtag('event', 'funnel_abandon', {
      funnel_name: 'ticket_purchase',
      abandon_step: stepName,
      abandon_reason: reason,
      steps_completed: this.steps.length,
      total_duration: Date.now() - this.startTime
    });
  }
}

/**
 * Server-side Analytics (for API endpoints)
 */
export class ServerSideAnalytics {
  constructor(measurementId, apiSecret) {
    this.measurementId = measurementId;
    this.apiSecret = apiSecret;
    this.endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
  }
  
  async trackEvent(clientId, eventName, parameters = {}) {
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          engagement_time_msec: '100',
          ...parameters
        }
      }]
    };
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error('GA4 server-side tracking failed:', response.status);
      }
    } catch (error) {
      console.error('GA4 server-side tracking error:', error);
    }
  }
  
  async trackPurchase(clientId, orderData) {
    await this.trackEvent(clientId, 'purchase', {
      transaction_id: orderData.orderNumber,
      value: orderData.totalAmount,
      currency: 'USD',
      items: orderData.items.map(item => ({
        item_id: item.id,
        item_name: item.name,
        item_category: item.category || 'festival_ticket',
        price: item.price,
        quantity: item.quantity || 1
      }))
    });
  }
}

/**
 * Privacy-compliant analytics wrapper
 */
export class PrivacyCompliantAnalytics {
  constructor() {
    this.consentGiven = false;
    this.pendingEvents = [];
  }
  
  setConsent(consentGiven) {
    this.consentGiven = consentGiven;
    
    if (consentGiven && this.pendingEvents.length > 0) {
      // Process pending events
      this.pendingEvents.forEach(event => {
        this.trackEvent(event.name, event.parameters);
      });
      this.pendingEvents = [];
    }
    
    // Update GA consent
    if (typeof gtag !== 'undefined') {
      gtag('consent', 'update', {
        analytics_storage: consentGiven ? 'granted' : 'denied',
        ad_storage: 'denied' // Always deny ad storage for privacy
      });
    }
  }
  
  trackEvent(eventName, parameters = {}) {
    if (!this.consentGiven) {
      this.pendingEvents.push({ name: eventName, parameters });
      return;
    }
    
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, parameters);
    }
  }
}

export default {
  initializeGA4,
  trackViewItem,
  trackAddToCart,
  trackRemoveFromCart,
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  trackPaymentFailed,
  trackPaymentRetry,
  trackConversion,
  trackEngagement,
  trackPageView,
  setUserProperties,
  EcommerceFunnel,
  ServerSideAnalytics,
  PrivacyCompliantAnalytics,
  ECOMMERCE_EVENTS
};