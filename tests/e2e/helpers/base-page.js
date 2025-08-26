/**
 * Base page class for page object model
 */

export class BasePage {
  constructor(page) {
    this.page = page;
    this.baseURL = page.context()._options.baseURL || 'http://localhost:3000';
  }

  /**
   * Navigate to a path
   */
  async goto(path = '/') {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for page to be ready
   */
  async waitForReady() {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle');
    
    // Wait for any loading indicators to disappear
    const loadingSelectors = [
      '.loading',
      '.spinner',
      '[data-loading="true"]',
      '.skeleton'
    ];
    
    for (const selector of loadingSelectors) {
      const element = await this.page.$(selector);
      if (element) {
        await element.waitForElementState('hidden').catch(() => {});
      }
    }
  }

  /**
   * Click element with retry
   */
  async click(selector, options = {}) {
    await this.page.waitForSelector(selector, { state: 'visible', ...options });
    await this.page.click(selector, options);
  }

  /**
   * Type text with clear
   */
  async type(selector, text, options = {}) {
    await this.page.waitForSelector(selector, { state: 'visible', ...options });
    await this.page.fill(selector, text);
  }

  /**
   * Select option from dropdown
   */
  async select(selector, value, options = {}) {
    await this.page.waitForSelector(selector, { state: 'visible', ...options });
    await this.page.selectOption(selector, value);
  }

  /**
   * Check if element exists
   */
  async exists(selector) {
    return await this.page.$(selector) !== null;
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector) {
    const element = await this.page.$(selector);
    if (!element) return false;
    return await element.isVisible();
  }

  /**
   * Get element text
   */
  async getText(selector) {
    await this.page.waitForSelector(selector);
    return await this.page.textContent(selector);
  }

  /**
   * Get element attribute
   */
  async getAttribute(selector, attribute) {
    await this.page.waitForSelector(selector);
    return await this.page.getAttribute(selector, attribute);
  }

  /**
   * Take screenshot
   */
  async screenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${timestamp}.png`,
      fullPage: true
    });
  }

  /**
   * Handle dialog
   */
  async handleDialog(accept = true, promptText = '') {
    this.page.once('dialog', async dialog => {
      if (accept) {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(options = {}) {
    await this.page.waitForNavigation({
      waitUntil: 'networkidle',
      ...options
    });
  }

  /**
   * Get current URL
   */
  async getURL() {
    return this.page.url();
  }

  /**
   * Reload page
   */
  async reload() {
    await this.page.reload();
    await this.waitForReady();
  }

  /**
   * Go back
   */
  async goBack() {
    await this.page.goBack();
    await this.waitForReady();
  }

  /**
   * Submit form
   */
  async submitForm(selector) {
    await this.page.evaluate((sel) => {
      const form = document.querySelector(sel);
      if (form) form.submit();
    }, selector);
    await this.waitForReady();
  }

  /**
   * Scroll to element
   */
  async scrollTo(selector) {
    await this.page.waitForSelector(selector);
    await this.page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, selector);
  }

  /**
   * Get all matching elements text
   */
  async getAllText(selector) {
    await this.page.waitForSelector(selector);
    return await this.page.$$eval(selector, elements => 
      elements.map(el => el.textContent.trim())
    );
  }

  /**
   * Count elements
   */
  async count(selector) {
    const elements = await this.page.$$(selector);
    return elements.length;
  }

  /**
   * Wait for text to appear
   */
  async waitForText(text, options = {}) {
    await this.page.waitForSelector(`text=${text}`, options);
  }

  /**
   * Check checkbox
   */
  async check(selector) {
    await this.page.waitForSelector(selector);
    await this.page.check(selector);
  }

  /**
   * Uncheck checkbox
   */
  async uncheck(selector) {
    await this.page.waitForSelector(selector);
    await this.page.uncheck(selector);
  }

  /**
   * Upload file
   */
  async uploadFile(selector, filePath) {
    await this.page.waitForSelector(selector);
    await this.page.setInputFiles(selector, filePath);
  }

  /**
   * Clear input
   */
  async clear(selector) {
    await this.page.waitForSelector(selector);
    await this.page.fill(selector, '');
  }

  /**
   * Press key
   */
  async pressKey(key) {
    await this.page.keyboard.press(key);
  }

  /**
   * Hover over element
   */
  async hover(selector) {
    await this.page.waitForSelector(selector);
    await this.page.hover(selector);
  }

  /**
   * Focus element
   */
  async focus(selector) {
    await this.page.waitForSelector(selector);
    await this.page.focus(selector);
  }

  /**
   * Get cookies
   */
  async getCookies() {
    return await this.page.context().cookies();
  }

  /**
   * Set cookie
   */
  async setCookie(cookie) {
    await this.page.context().addCookies([cookie]);
  }

  /**
   * Clear cookies
   */
  async clearCookies() {
    await this.page.context().clearCookies();
  }

  /**
   * Get localStorage
   */
  async getLocalStorage(key) {
    return await this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  /**
   * Set localStorage
   */
  async setLocalStorage(key, value) {
    await this.page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
  }

  /**
   * Clear localStorage
   */
  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }
}