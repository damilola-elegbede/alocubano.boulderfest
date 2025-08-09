import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

describe("Admin Dashboard XSS Prevention", () => {
  let dom;
  let window;
  let document;
  let escapeHtml;

  beforeEach(() => {
    // Create a basic DOM environment
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="statsGrid"></div>
          <div id="registrationsTable"></div>
        </body>
      </html>
    `,
      { runScripts: "dangerously" },
    );

    window = dom.window;
    document = window.document;

    // Define the escapeHtml function as it appears in the dashboard
    window.eval(`
      function escapeHtml(unsafe) {
        if (unsafe == null) return '';
        return String(unsafe)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
    `);

    escapeHtml = window.escapeHtml;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe("escapeHtml function", () => {
    it("should escape HTML tags", () => {
      const malicious = '<script>alert("XSS")</script>';
      const escaped = escapeHtml(malicious);

      expect(escaped).toBe(
        "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;",
      );
      expect(escaped).not.toContain("<script>");
      expect(escaped).not.toContain("</script>");
    });

    it("should escape event handlers", () => {
      const malicious = '<img src="x" onerror="alert(\'XSS\')">';
      const escaped = escapeHtml(malicious);

      expect(escaped).toBe(
        "&lt;img src=&quot;x&quot; onerror=&quot;alert(&#039;XSS&#039;)&quot;&gt;",
      );
      // The escaped string will still contain the text "onerror=" but it's safe because < and > are escaped
      // What matters is that it doesn't contain actual HTML tags
      expect(escaped).not.toContain("<img");
      expect(escaped).not.toContain('">');
    });

    it("should escape quotes", () => {
      const malicious = '" onmouseover="alert(\'XSS\')" "';
      const escaped = escapeHtml(malicious);

      expect(escaped).toBe(
        "&quot; onmouseover=&quot;alert(&#039;XSS&#039;)&quot; &quot;",
      );
    });

    it("should escape ampersands", () => {
      const text = "Tom & Jerry";
      const escaped = escapeHtml(text);

      expect(escaped).toBe("Tom &amp; Jerry");
    });

    it("should handle null and undefined", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    it("should convert non-strings to strings", () => {
      expect(escapeHtml(123)).toBe("123");
      expect(escapeHtml(true)).toBe("true");
      expect(escapeHtml(false)).toBe("false");
    });

    it("should handle complex XSS patterns", () => {
      const patterns = [
        'javascript:alert("XSS")',
        "<iframe src=\"javascript:alert('XSS')\">",
        "<body onload=\"alert('XSS')\">",
        "<svg onload=\"alert('XSS')\">",
        '<<SCRIPT>alert("XSS");//<</SCRIPT>',
        "<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>",
      ];

      patterns.forEach((pattern) => {
        const escaped = escapeHtml(pattern);
        // Check that HTML tags are escaped (< and > become &lt; and &gt;)
        expect(escaped).not.toContain("<script");
        expect(escaped).not.toContain("<iframe");
        expect(escaped).not.toContain("<svg");
        expect(escaped).not.toContain("<IMG");
        expect(escaped).not.toContain("<body");
        // Note: "javascript:" and "onload=" text will still appear but are harmless when escaped
      });
    });
  });

  describe("Safe rendering in dashboard", () => {
    it("should safely render error messages", () => {
      const maliciousError = '<script>alert("XSS")</script>';

      // Simulate how error messages are rendered in the dashboard
      const errorDiv = document.getElementById("statsGrid");
      errorDiv.innerHTML = `<div class="error">Failed to load dashboard: ${escapeHtml(maliciousError)}</div>`;

      // Check that no script elements were created
      const scripts = errorDiv.getElementsByTagName("script");
      expect(scripts.length).toBe(0);

      // Check that the text content contains the escaped version
      expect(errorDiv.textContent).toContain("Failed to load dashboard:");
      expect(errorDiv.innerHTML).toContain("&lt;script&gt;");
      expect(errorDiv.innerHTML).not.toContain("<script>");
    });

    it("should safely render user data in tables", () => {
      const maliciousData = {
        ticket_id: 'ABC<script>alert("XSS")</script>123',
        attendee_first_name: "<img src=x onerror=\"alert('XSS')\">John",
        attendee_last_name: "Doe</script>",
        attendee_email: 'test@example.com"><script>alert("XSS")</script>',
        order_number: 'ORD-123<iframe src="javascript:alert(1)">',
        status: "valid",
        ticket_type: "vip-pass",
      };

      // Simulate table row rendering
      const tableHTML = `
        <tr>
          <td><span class="ticket-id">${escapeHtml(maliciousData.ticket_id)}</span></td>
          <td>${escapeHtml(maliciousData.attendee_first_name)} ${escapeHtml(maliciousData.attendee_last_name)}</td>
          <td>${escapeHtml(maliciousData.attendee_email)}</td>
          <td>${escapeHtml(maliciousData.order_number)}</td>
        </tr>
      `;

      const tableDiv = document.getElementById("registrationsTable");
      tableDiv.innerHTML = tableHTML;

      // Check that no script or iframe elements were created
      expect(tableDiv.getElementsByTagName("script").length).toBe(0);
      expect(tableDiv.getElementsByTagName("iframe").length).toBe(0);
      expect(tableDiv.getElementsByTagName("img").length).toBe(0);

      // Check that the dangerous content was escaped
      expect(tableDiv.innerHTML).toContain("&lt;script&gt;");
      expect(tableDiv.innerHTML).toContain("&lt;img");
      expect(tableDiv.innerHTML).toContain("&lt;iframe");
      expect(tableDiv.innerHTML).not.toContain("<script>");
      // Note: "onerror=" text will appear but is harmless when the tags are escaped
    });

    it("should safely handle onclick attributes", () => {
      const maliciousTicketId = '"><script>alert("XSS")</script><"';

      // Test that escaping prevents XSS in onclick attributes
      const escapedId = escapeHtml(maliciousTicketId);

      // When the escaped ID is used in an onclick, it should be safe
      // The escaping converts dangerous characters to HTML entities
      expect(escapedId).toBe(
        "&quot;&gt;&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&lt;&quot;",
      );

      // In practice, we need to escape for JavaScript string context too
      // This is a more realistic test
      const jsEscapedId = escapedId.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const buttonHTML = `<button onclick="checkinTicket('${jsEscapedId}')">Check In</button>`;

      const div = document.createElement("div");
      div.innerHTML = buttonHTML;

      // No script elements should be created
      expect(div.getElementsByTagName("script").length).toBe(0);

      // Verify the button was created successfully
      const button = div.querySelector("button");
      expect(button).toBeTruthy();

      // The onclick should contain the function call
      const onclickAttr = button.getAttribute("onclick");
      expect(onclickAttr).toContain("checkinTicket");

      // Verify that the structure is intact and no scripts can execute
      // The key is that no actual script elements were created
      expect(div.getElementsByTagName("script").length).toBe(0);
    });
  });

  describe("CSV Export Safety", () => {
    it("should handle special characters in CSV export", () => {
      // CSV doesn't need HTML escaping, but needs proper quoting
      const data = {
        ticket_id: 'ABC"123',
        attendee_first_name: "John,Smith",
        attendee_last_name: "O'Brien",
        attendee_email: "test@example.com",
      };

      // Simulate CSV cell formatting
      const formatCSVCell = (value) => {
        if (value == null) return '""';
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
      };

      expect(formatCSVCell(data.ticket_id)).toBe('"ABC""123"');
      expect(formatCSVCell(data.attendee_first_name)).toBe('"John,Smith"');
      expect(formatCSVCell(data.attendee_last_name)).toBe('"O\'Brien"');
    });
  });
});
