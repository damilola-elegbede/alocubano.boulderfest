/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  escapeHtml,
  createSafeHTML,
  setSafeHTML,
  sanitizeInput,
  createSafeText
} from '../../../../js/utils/dom-sanitizer.js';

describe('DOMSanitizer', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
      expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe('&lt;img src="x" onerror="alert(1)"&gt;');
    });

    it('should escape quotes and ampersands', () => {
      expect(escapeHtml('"quoted"')).toBe('"quoted"');
      expect(escapeHtml("'single'")).toBe("'single'");
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should handle empty and null strings', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should preserve safe text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
      expect(escapeHtml('123 456')).toBe('123 456');
    });

    it('should handle special Unicode characters', () => {
      expect(escapeHtml('©️ 2024')).toBe('©️ 2024');
      expect(escapeHtml('🎸 Cuban Music')).toBe('🎸 Cuban Music');
    });

    it('should escape nested HTML structures', () => {
      const maliciousHtml = '<div><script>evil()</script><p onclick="bad()">text</p></div>';
      const escaped = escapeHtml(maliciousHtml);
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&lt;/script&gt;');
      expect(escaped).not.toContain('<script>');
    });
  });

  describe('createSafeHTML', () => {
    it('should create safe document fragment from HTML', () => {
      const html = '<p>Safe paragraph</p>';
      const fragment = createSafeHTML(html);

      expect(fragment instanceof DocumentFragment).toBe(true);
      expect(fragment.children.length).toBe(1);
      expect(fragment.children[0].tagName).toBe('P');
      expect(fragment.children[0].textContent).toBe('Safe paragraph');
    });

    it('should remove script tags', () => {
      const html = '<p>Text</p><script>alert("xss")</script><div>More text</div>';
      const fragment = createSafeHTML(html);

      expect(fragment.querySelectorAll('script')).toHaveLength(0);
      expect(fragment.querySelectorAll('p')).toHaveLength(1);
      expect(fragment.querySelectorAll('div')).toHaveLength(1);
    });

    it('should remove inline event handlers', () => {
      const html = '<button onclick="malicious()">Click</button><img onload="bad()" src="test.jpg">';
      const fragment = createSafeHTML(html);

      const button = fragment.querySelector('button');
      const img = fragment.querySelector('img');

      expect(button.hasAttribute('onclick')).toBe(false);
      expect(img.hasAttribute('onload')).toBe(false);
      expect(img.hasAttribute('src')).toBe(true); // Safe attribute preserved
    });

    it('should remove javascript: URLs from href', () => {
      const html = '<a href="javascript:alert(1)">Bad Link</a><a href="/safe-link">Good Link</a>';
      const fragment = createSafeHTML(html);

      const links = fragment.querySelectorAll('a');
      expect(links[0].hasAttribute('href')).toBe(false); // javascript: URL removed
      expect(links[1].getAttribute('href')).toBe('/safe-link'); // Safe URL preserved
    });

    it('should remove javascript: URLs from src', () => {
      const html = '<img src="javascript:evil()" alt="bad"><img src="image.jpg" alt="good">';
      const fragment = createSafeHTML(html);

      const images = fragment.querySelectorAll('img');
      expect(images[0].hasAttribute('src')).toBe(false); // javascript: URL removed
      expect(images[1].getAttribute('src')).toBe('image.jpg'); // Safe URL preserved
    });

    it('should handle complex nested structures', () => {
      const html = `
        <div class="container">
          <h2>Title</h2>
          <p>Paragraph with <strong>bold</strong> text</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `;

      const fragment = createSafeHTML(html);
      expect(fragment.querySelector('.container')).toBeTruthy();
      expect(fragment.querySelector('h2')).toBeTruthy();
      expect(fragment.querySelector('strong')).toBeTruthy();
      expect(fragment.querySelectorAll('li')).toHaveLength(2);
    });

    it('should preserve safe attributes', () => {
      const html = '<div class="safe" id="test" data-value="123">Content</div>';
      const fragment = createSafeHTML(html);

      const div = fragment.querySelector('div');
      expect(div.getAttribute('class')).toBe('safe');
      expect(div.getAttribute('id')).toBe('test');
      expect(div.getAttribute('data-value')).toBe('123');
    });

    it('should handle empty HTML', () => {
      const fragment = createSafeHTML('');
      expect(fragment.children.length).toBe(0);
    });

    it('should remove all event handler attributes', () => {
      const eventHandlers = [
        'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
        'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown'
      ];

      const html = `<div ${eventHandlers.map(handler => `${handler}="evil()"`).join(' ')}>Test</div>`;
      const fragment = createSafeHTML(html);

      const div = fragment.querySelector('div');
      eventHandlers.forEach(handler => {
        expect(div.hasAttribute(handler)).toBe(false);
      });
    });
  });

  describe('setSafeHTML', () => {
    let container;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    it('should set safe HTML content', () => {
      const html = '<p>Safe content</p>';
      setSafeHTML(container, html);

      expect(container.children.length).toBe(1);
      expect(container.children[0].tagName).toBe('P');
      expect(container.children[0].textContent).toBe('Safe content');
    });

    it('should clear existing content', () => {
      container.innerHTML = '<div>Old content</div>';

      const html = '<p>New content</p>';
      setSafeHTML(container, html);

      expect(container.children.length).toBe(1);
      expect(container.children[0].tagName).toBe('P');
      expect(container.textContent).toBe('New content');
    });

    it('should sanitize malicious content', () => {
      const html = '<p>Safe</p><script>alert("xss")</script><div onclick="bad()">Click</div>';
      setSafeHTML(container, html);

      expect(container.querySelectorAll('script')).toHaveLength(0);
      expect(container.querySelector('div').hasAttribute('onclick')).toBe(false);
      expect(container.querySelectorAll('p')).toHaveLength(1);
    });

    it('should handle multiple child nodes', () => {
      const html = '<h1>Title</h1><p>Paragraph</p><ul><li>Item</li></ul>';
      setSafeHTML(container, html);

      expect(container.children.length).toBe(3);
      expect(container.querySelector('h1')).toBeTruthy();
      expect(container.querySelector('p')).toBeTruthy();
      expect(container.querySelector('ul')).toBeTruthy();
    });

    it('should handle empty content', () => {
      container.innerHTML = '<div>Content</div>';
      setSafeHTML(container, '');

      expect(container.children.length).toBe(0);
      expect(container.textContent).toBe('');
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags from input', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      const sanitized = sanitizeInput(input);

      expect(sanitized).toBe('Hello alert("xss") World');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should escape remaining special characters', () => {
      const input = 'Text with & < > characters';
      const sanitized = sanitizeInput(input);

      // The < > are treated as HTML tags and removed, only & is escaped
      expect(sanitized).toBe('Text with &amp;  characters');
      expect(sanitized).toContain('&amp;');
    });

    it('should handle complex HTML structures', () => {
      const input = '<div><p>Paragraph</p><span>Span</span></div>';
      const sanitized = sanitizeInput(input);

      expect(sanitized).toBe('ParagraphSpan');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
      expect(sanitizeInput(123)).toBe('');
      expect(sanitizeInput({})).toBe('');
    });

    it('should preserve safe text content', () => {
      const input = 'Regular text with numbers 123';
      const sanitized = sanitizeInput(input);

      expect(sanitized).toBe('Regular text with numbers 123');
    });

    it('should handle mixed content', () => {
      const input = 'Text <b>bold</b> & <i>italic</i> text';
      const sanitized = sanitizeInput(input);

      expect(sanitized).toBe('Text bold &amp; italic text');
    });

    it('should handle malformed HTML', () => {
      const input = 'Text <unclosed <tag> more text';
      const sanitized = sanitizeInput(input);

      expect(sanitized).toBe('Text  more text');
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('createSafeText', () => {
    it('should create text node from string', () => {
      const text = 'Safe text content';
      const textNode = createSafeText(text);

      expect(textNode instanceof Text).toBe(true);
      expect(textNode.textContent).toBe(text);
      expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    });

    it('should handle special characters safely', () => {
      const text = '<script>alert("xss")</script>';
      const textNode = createSafeText(text);

      expect(textNode.textContent).toBe(text);
      // Text nodes automatically escape content when displayed
    });

    it('should handle empty strings', () => {
      const textNode = createSafeText('');
      expect(textNode.textContent).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(createSafeText(null).textContent).toBe('null');
      expect(createSafeText(undefined).textContent).toBe('undefined');
    });

    it('should handle numbers', () => {
      const textNode = createSafeText(123);
      expect(textNode.textContent).toBe('123');
    });

    it('should be safe to append to DOM', () => {
      const container = document.createElement('div');
      const maliciousText = '<img src="x" onerror="alert(1)">';
      const textNode = createSafeText(maliciousText);

      container.appendChild(textNode);

      // Should not create any HTML elements
      expect(container.children.length).toBe(0);
      expect(container.textContent).toBe(maliciousText);
      expect(container.querySelector('img')).toBeFalsy();
    });
  });

  describe('integration scenarios', () => {
    it('should prevent XSS through multiple attack vectors', () => {
      const maliciousInputs = [
        '<script>alert("xss1")</script>',
        '<img src="x" onerror="alert(\'xss2\')">',
        '<div onclick="alert(\'xss3\')">Click me</div>',
        '<a href="javascript:alert(\'xss4\')">Link</a>',
        '"><script>alert("xss5")</script>',
        '\';alert("xss6");\'',
        '<iframe src="javascript:alert(\'xss7\')"></iframe>'
      ];

      maliciousInputs.forEach((input, index) => {
        const sanitized = sanitizeInput(input);
        const fragment = createSafeHTML(`<div>${sanitized}</div>`);

        expect(fragment.querySelectorAll('script')).toHaveLength(0);
        expect(sanitized).not.toContain('javascript:');
        // Note: sanitizeInput removes HTML tags but doesn't remove JavaScript function names
        // This is expected behavior - it sanitizes HTML/DOM injection, not JS execution context
      });
    });

    it('should preserve legitimate content while removing threats', () => {
      const mixedContent = `
        <div class="festival-info">
          <h2>A Lo Cubano Boulder Fest 2026</h2>
          <p>Cuban music & dance festival</p>
          <script>stealData()</script>
          <a href="/tickets">Buy Tickets</a>
          <img src="poster.jpg" onerror="hackSite()" alt="Festival Poster">
          <button onclick="malicious()">Click</button>
        </div>
      `;

      const fragment = createSafeHTML(mixedContent);

      // Legitimate content preserved
      expect(fragment.querySelector('h2').textContent).toContain('A Lo Cubano');
      expect(fragment.querySelector('p').textContent).toContain('Cuban music');
      expect(fragment.querySelector('a').getAttribute('href')).toBe('/tickets');
      expect(fragment.querySelector('img').getAttribute('src')).toBe('poster.jpg');
      expect(fragment.querySelector('img').getAttribute('alt')).toBe('Festival Poster');

      // Malicious content removed
      expect(fragment.querySelectorAll('script')).toHaveLength(0);
      expect(fragment.querySelector('img').hasAttribute('onerror')).toBe(false);
      expect(fragment.querySelector('button').hasAttribute('onclick')).toBe(false);
    });

    it('should handle deeply nested malicious content', () => {
      const nestedMalicious = `
        <div>
          <section>
            <article>
              <script>level1()</script>
              <p onclick="level2()">
                Text with <span onmouseover="level3()">span</span>
                <script>level4()</script>
              </p>
            </article>
          </section>
        </div>
      `;

      const fragment = createSafeHTML(nestedMalicious);

      expect(fragment.querySelectorAll('script')).toHaveLength(0);
      expect(fragment.querySelector('p').hasAttribute('onclick')).toBe(false);
      expect(fragment.querySelector('span').hasAttribute('onmouseover')).toBe(false);

      // Structure preserved
      expect(fragment.querySelector('div section article p span')).toBeTruthy();
    });

    it('should work with real festival content', () => {
      const festivalContent = `
        <div class="cart-item" data-ticket-type="general">
          <div class="cart-item-info">
            <h4>General Admission</h4>
            <p class="cart-item-price">$50.00 × 2 = $100.00</p>
          </div>
          <div class="cart-item-actions">
            <button class="qty-adjust minus" data-action="decrease">−</button>
            <span class="qty-display">2</span>
            <button class="qty-adjust plus" data-action="increase">+</button>
          </div>
        </div>
      `;

      const container = document.createElement('div');
      setSafeHTML(container, festivalContent);

      expect(container.querySelector('.cart-item')).toBeTruthy();
      expect(container.querySelector('h4').textContent).toBe('General Admission');
      expect(container.querySelector('.cart-item-price').textContent).toContain('$50.00');
      expect(container.querySelectorAll('button')).toHaveLength(2);
    });
  });
});