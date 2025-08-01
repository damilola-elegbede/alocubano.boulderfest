const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

/**
 * Template Engine for Email Service
 * Manages Handlebars templates with custom helpers and multi-language support
 */
class TemplateEngine {
  constructor() {
    this.templates = new Map();
    this.partials = new Map();
    this.helpers = new Map();
    this.initialized = false;
    this.templateDir = path.join(__dirname, 'templates');
    this.partialsDir = path.join(__dirname, 'templates', 'partials');
    
    // Default language settings
    this.defaultLanguage = 'en';
    this.supportedLanguages = ['en', 'es'];
    this.translations = new Map();
  }

  /**
   * Initialize the template engine
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Register custom helpers
      this.registerHelpers();
      
      // Load translations
      await this.loadTranslations();
      
      // Load templates and partials
      await this.loadTemplates();
      await this.loadPartials();
      
      this.initialized = true;
      console.log('✅ Template engine initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize template engine:', error);
      throw error;
    }
  }

  /**
   * Register custom Handlebars helpers
   */
  registerHelpers() {
    // Date formatting helper
    handlebars.registerHelper('formatDate', (date, format = 'long') => {
      if (!date) return '';
      
      const d = new Date(date);
      const options = {
        short: { month: 'short', day: 'numeric', year: 'numeric' },
        long: { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        },
        time: { hour: '2-digit', minute: '2-digit' },
        date: { year: 'numeric', month: 'long', day: 'numeric' }
      };
      
      return d.toLocaleDateString('en-US', options[format] || options.long);
    });

    // Currency formatting helper
    handlebars.registerHelper('formatCurrency', (amount, currency = 'USD') => {
      if (typeof amount !== 'number') return amount;
      
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    });

    // Translation helper
    handlebars.registerHelper('t', (key, lang = 'en') => {
      const translations = this.translations.get(lang) || this.translations.get(this.defaultLanguage);
      return translations?.[key] || key;
    });

    // Conditional helper
    handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // Math helpers
    handlebars.registerHelper('add', (a, b) => a + b);
    handlebars.registerHelper('subtract', (a, b) => a - b);
    handlebars.registerHelper('multiply', (a, b) => a * b);
    handlebars.registerHelper('divide', (a, b) => b !== 0 ? a / b : 0);

    // String helpers
    handlebars.registerHelper('uppercase', str => String(str).toUpperCase());
    handlebars.registerHelper('lowercase', str => String(str).toLowerCase());
    handlebars.registerHelper('capitalize', str => {
      return String(str).charAt(0).toUpperCase() + String(str).slice(1);
    });

    // Array helpers
    handlebars.registerHelper('length', array => Array.isArray(array) ? array.length : 0);
    handlebars.registerHelper('first', array => Array.isArray(array) ? array[0] : null);
    handlebars.registerHelper('last', array => Array.isArray(array) ? array[array.length - 1] : null);

    // URL helpers
    handlebars.registerHelper('addParams', (url, params) => {
      if (!params || typeof params !== 'object') return url;
      
      const urlObj = new URL(url, process.env.FESTIVAL_URL || 'https://alocubanoboulderfest.com');
      Object.keys(params).forEach(key => {
        urlObj.searchParams.set(key, params[key]);
      });
      
      return urlObj.toString();
    });

    // Festival-specific helpers
    handlebars.registerHelper('festivalDates', () => 'May 15-17, 2026');
    handlebars.registerHelper('festivalVenue', () => 'Avalon Ballroom');
    handlebars.registerHelper('festivalAddress', () => '6185 Arapahoe Rd, Boulder, CO 80303');
    handlebars.registerHelper('festivalEmail', () => 'alocubanoboulderfest@gmail.com');
    handlebars.registerHelper('festivalInstagram', () => '@alocubano.boulderfest');

    // Spanish phrases helper
    handlebars.registerHelper('spanishPhrase', (key) => {
      const phrases = {
        greeting: '¡Gracias por tu compra!',
        farewell: '¡Nos vemos en la pista!',
        welcome: '¡Bienvenidos!',
        thanks: 'Gracias',
        seeYouSoon: '¡Esperamos verte pronto!',
        withLove: 'Con cariño'
      };
      return phrases[key] || key;
    });

    console.log('✅ Handlebars helpers registered');
  }

  /**
   * Load translation files
   */
  async loadTranslations() {
    const translations = {
      en: {
        'email.receipt.title': 'Payment Receipt',
        'email.receipt.greeting': 'Thank you for your purchase!',
        'email.receipt.message': 'Your payment has been processed successfully.',
        'email.failure.title': 'Payment Issue',
        'email.failure.message': 'We encountered an issue processing your payment.',
        'email.refund.title': 'Refund Processed',
        'email.refund.message': 'Your refund has been processed successfully.',
        'ticket.type': 'Ticket Type',
        'ticket.id': 'Ticket ID',
        'order.id': 'Order ID',
        'payment.method': 'Payment Method',
        'transaction.date': 'Transaction Date',
        'refund.date': 'Refund Date',
        'amount': 'Amount',
        'attendee': 'Attendee',
        'email': 'Email',
        'important.info': 'Important Information',
        'contact.us': 'Contact us',
        'questions': 'Questions?',
        'follow.us': 'Follow us'
      },
      es: {
        'email.receipt.title': 'Recibo de Pago',
        'email.receipt.greeting': '¡Gracias por tu compra!',
        'email.receipt.message': 'Tu pago ha sido procesado exitosamente.',
        'email.failure.title': 'Problema con el Pago',
        'email.failure.message': 'Encontramos un problema procesando tu pago.',
        'email.refund.title': 'Reembolso Procesado',
        'email.refund.message': 'Tu reembolso ha sido procesado exitosamente.',
        'ticket.type': 'Tipo de Boleto',
        'ticket.id': 'ID del Boleto',
        'order.id': 'ID del Pedido',
        'payment.method': 'Método de Pago',
        'transaction.date': 'Fecha de Transacción',
        'refund.date': 'Fecha de Reembolso',
        'amount': 'Cantidad',
        'attendee': 'Asistente',
        'email': 'Correo',
        'important.info': 'Información Importante',
        'contact.us': 'Contáctanos',
        'questions': '¿Preguntas?',
        'follow.us': 'Síguenos'
      }
    };

    this.supportedLanguages.forEach(lang => {
      this.translations.set(lang, translations[lang]);
    });

    console.log('✅ Translations loaded');
  }

  /**
   * Load email templates
   */
  async loadTemplates() {
    try {
      const files = await fs.readdir(this.templateDir);
      
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templatePath = path.join(this.templateDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          const compiled = handlebars.compile(templateContent);
          this.templates.set(templateName, compiled);
          
          console.log(`📧 Loaded template: ${templateName}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not load templates from directory:', error.message);
      // Fall back to inline templates if directory doesn't exist
      this.loadInlineTemplates();
    }
  }

  /**
   * Load partial templates
   */
  async loadPartials() {
    try {
      const files = await fs.readdir(this.partialsDir);
      
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const partialPath = path.join(this.partialsDir, file);
          const partialContent = await fs.readFile(partialPath, 'utf8');
          
          handlebars.registerPartial(partialName, partialContent);
          this.partials.set(partialName, partialContent);
          
          console.log(`🧩 Loaded partial: ${partialName}`);
        }
      }
    } catch (error) {
      console.log('ℹ️ No partials directory found, skipping partials');
    }
  }

  /**
   * Load inline templates as fallback
   */
  loadInlineTemplates() {
    const inlineTemplates = {
      'receipt-simple': `
        <h1>{{spanishPhrase 'greeting'}}</h1>
        <p>Hi {{customerName}},</p>
        <p>{{t 'email.receipt.message'}}</p>
        <ul>
          <li>{{t 'order.id'}}: {{orderId}}</li>
          <li>{{t 'amount'}}: {{formatCurrency amount}}</li>
          <li>{{t 'transaction.date'}}: {{formatDate transactionDate}}</li>
        </ul>
        <p>{{spanishPhrase 'farewell'}}</p>
      `,
      
      'failure-simple': `
        <h1>{{t 'email.failure.title'}}</h1>
        <p>Hi {{customerName}},</p>
        <p>{{t 'email.failure.message'}}</p>
        <p>Issue: {{failureReason}}</p>
        <p><a href="{{retryUrl}}">Try Again</a></p>
      `,
      
      'refund-simple': `
        <h1>{{t 'email.refund.title'}}</h1>
        <p>Hi {{customerName}},</p>
        <p>{{t 'email.refund.message'}}</p>
        <ul>
          <li>{{t 'refund.date'}}: {{formatDate refundDate}}</li>
          <li>{{t 'amount'}}: {{formatCurrency amount}}</li>
        </ul>
        <p>{{spanishPhrase 'seeYouSoon'}}</p>
      `
    };

    Object.keys(inlineTemplates).forEach(name => {
      const compiled = handlebars.compile(inlineTemplates[name]);
      this.templates.set(name, compiled);
    });

    console.log('✅ Inline templates loaded as fallback');
  }

  /**
   * Render a template with data
   */
  async render(templateName, data = {}, options = {}) {
    await this.ensureInitialized();
    
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Merge default data
    const templateData = this.prepareTemplateData(data, options);
    
    try {
      return template(templateData);
    } catch (error) {
      console.error(`❌ Error rendering template '${templateName}':`, error);
      throw error;
    }
  }

  /**
   * Prepare template data with defaults and helpers
   */
  prepareTemplateData(data, options = {}) {
    const language = options.language || this.defaultLanguage;
    
    return {
      ...data,
      // Festival information
      festival: {
        name: 'A Lo Cubano Boulder Fest',
        dates: 'May 15-17, 2026',
        venue: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80303',
        email: 'alocubanoboulderfest@gmail.com',
        instagram: '@alocubano.boulderfest',
        website: 'www.alocubanoboulderfest.com'
      },
      
      // Current year and date
      currentYear: new Date().getFullYear(),
      currentDate: new Date().toISOString(),
      
      // Language settings
      language: language,
      
      // URLs
      baseUrl: process.env.FESTIVAL_URL || 'https://alocubanoboulderfest.com',
      unsubscribeUrl: `${process.env.FESTIVAL_URL || 'https://alocubanoboulderfest.com'}/unsubscribe`,
      
      // Template metadata
      templateMeta: {
        rendered: new Date().toISOString(),
        version: '1.0'
      }
    };
  }

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if template exists
   */
  hasTemplate(templateName) {
    return this.templates.has(templateName);
  }

  /**
   * Add or update a template dynamically
   */
  addTemplate(name, content) {
    const compiled = handlebars.compile(content);
    this.templates.set(name, compiled);
    console.log(`📧 Template '${name}' added/updated`);
  }

  /**
   * Remove a template
   */
  removeTemplate(name) {
    const removed = this.templates.delete(name);
    if (removed) {
      console.log(`🗑️ Template '${name}' removed`);
    }
    return removed;
  }

  /**
   * Ensure template engine is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get template statistics
   */
  getStats() {
    return {
      templates: this.templates.size,
      partials: this.partials.size,
      helpers: this.helpers.size,
      supportedLanguages: this.supportedLanguages.length,
      initialized: this.initialized
    };
  }

  /**
   * Validate template syntax
   */
  validateTemplate(content) {
    try {
      handlebars.compile(content);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        line: error.line,
        column: error.column 
      };
    }
  }

  /**
   * Preview template with sample data
   */
  async previewTemplate(templateName, sampleData = {}) {
    const defaultSampleData = {
      customerName: 'Maria Rodriguez',
      customerEmail: 'maria@example.com',
      orderId: 'ALB-2026-001',
      amount: 299.99,
      transactionDate: new Date().toISOString(),
      paymentMethod: 'Credit Card',
      tickets: [
        { ticketId: 'TKT-001', type: 'Festival Pass' }
      ]
    };

    return this.render(templateName, { ...defaultSampleData, ...sampleData });
  }
}

module.exports = TemplateEngine;