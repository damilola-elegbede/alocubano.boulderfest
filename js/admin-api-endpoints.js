/**
 * A Lo Cubano Boulder Fest - Interactive API Endpoints Enhancement JavaScript
 * Advanced utilities and features for the API endpoints testing portal
 */

class EndpointManager {
  constructor() {
    this.endpoints = [];
    this.filteredEndpoints = [];
    this.activeRequests = new Map();
    this.requestHistory = [];
    this.preferences = this.loadPreferences();
    this.setupEventListeners();
  }

  /**
   * Initialize event listeners and keyboard shortcuts
   */
  setupEventListeners() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.focusSearch();
      }

      // Ctrl/Cmd + Enter to test focused endpoint
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.testFocusedEndpoint();
      }

      // Escape to close modals or clear search
      if (e.key === 'Escape') {
        this.handleEscape();
      }

      // Ctrl/Cmd + Shift + C to copy all endpoint URLs
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.copyAllEndpoints();
      }
    });

    // Auto-save preferences
    window.addEventListener('beforeunload', () => {
      this.savePreferences();
    });
  }

  /**
   * Focus the search input
   */
  focusSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  /**
   * Test the currently focused endpoint
   */
  testFocusedEndpoint() {
    const focusedCard = document.querySelector('.endpoint-card:focus-within');
    if (focusedCard) {
      const path = focusedCard.dataset.endpoint;
      const method = focusedCard.dataset.method;
      if (path && method) {
        testEndpoint(path, method);
      }
    }
  }

  /**
   * Handle escape key press
   */
  handleEscape() {
    const modal = document.getElementById('responseModal');
    const searchInput = document.getElementById('searchInput');

    if (modal && modal.classList.contains('show')) {
      closeModal();
    } else if (searchInput && searchInput.value) {
      searchInput.value = '';
      applyFilters();
      updateFilterTags();
    }
  }

  /**
   * Copy all endpoint URLs to clipboard
   */
  async copyAllEndpoints() {
    const endpoints = this.filteredEndpoints.map(ep => `${ep.method} ${ep.path}`).join('\n');
    try {
      await navigator.clipboard.writeText(endpoints);
      showToast('success', 'Copied!', `${this.filteredEndpoints.length} endpoint URLs copied to clipboard`);
    } catch (err) {
      showToast('error', 'Copy Failed', 'Could not copy to clipboard');
    }
  }

  /**
   * Enhanced endpoint testing with request tracking
   */
  async testEndpointEnhanced(path, method, options = {}) {
    const requestId = `${method}_${path}_${Date.now()}`;
    const startTime = performance.now();

    try {
      // Track active request
      this.activeRequests.set(requestId, {
        path,
        method,
        startTime,
        options
      });

      // Perform the request
      const result = await this.performRequest(path, method, options);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Add to history
      this.addToHistory({
        id: requestId,
        path,
        method,
        duration,
        status: result.status,
        timestamp: new Date().toISOString(),
        success: result.ok
      });

      // Update UI
      this.updateEndpointStatus(path, result.ok ? 'success' : 'error', duration);

      return result;

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      this.addToHistory({
        id: requestId,
        path,
        method,
        duration,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      });

      this.updateEndpointStatus(path, 'error', duration);
      throw error;

    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Perform the actual HTTP request
   */
  async performRequest(path, method, options = {}) {
    let requestOptions = {
      method: method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    // Add CSRF token for state-changing operations
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      try {
        const csrfResponse = await fetch('/api/admin/csrf-token', {
          credentials: 'include'
        });
        if (csrfResponse.ok) {
          const csrfData = await csrfResponse.json();
          requestOptions.headers['X-CSRF-Token'] = csrfData.token;
        }
      } catch (error) {
        console.warn('Could not fetch CSRF token:', error);
      }
    }

    // Add request body if provided
    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    return fetch(path, requestOptions);
  }

  /**
   * Update endpoint visual status
   */
  updateEndpointStatus(path, status, duration) {
    const card = document.querySelector(`[data-endpoint="${path}"]`);
    const timeElement = document.getElementById(`time-${path.replace(/[^a-zA-Z0-9]/g, '_')}`);

    if (card) {
      card.classList.remove('success', 'error', 'loading');
      card.classList.add(status);

      setTimeout(() => {
        card.classList.remove('success', 'error');
      }, 3000);
    }

    if (timeElement) {
      timeElement.textContent = `${Math.round(duration)}ms`;
    }
  }

  /**
   * Add request to history
   */
  addToHistory(request) {
    this.requestHistory.unshift(request);
    // Keep only last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(0, 100);
    }
    this.updateHistoryDisplay();
  }

  /**
   * Update history display if visible
   */
  updateHistoryDisplay() {
    const historyContainer = document.getElementById('requestHistory');
    if (!historyContainer) return;

    const historyHTML = this.requestHistory.slice(0, 10).map(req => {
      const statusClass = req.success ? 'success' : 'error';
      const statusIcon = req.success ? '✓' : '✗';

      return `
        <div class="history-item ${statusClass}">
          <div class="history-header">
            <span class="history-method">${req.method}</span>
            <span class="history-path">${req.path}</span>
            <span class="history-status">${statusIcon}</span>
          </div>
          <div class="history-details">
            <span class="history-time">${new Date(req.timestamp).toLocaleTimeString()}</span>
            <span class="history-duration">${Math.round(req.duration)}ms</span>
            ${req.status ? `<span class="history-http-status">${req.status}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    historyContainer.innerHTML = historyHTML;
  }

  /**
   * Generate endpoint documentation
   */
  generateDocumentation(endpoint) {
    const authRequired = endpoint.requiresAuth ? 'Yes' : 'No';
    const safeToTest = ['GET'].includes(endpoint.method) && !endpoint.requiresAuth;

    return `
      <div class="endpoint-docs">
        <h3>${endpoint.method} ${endpoint.path}</h3>

        <div class="docs-section">
          <h4>Description</h4>
          <p>${endpoint.description}</p>
        </div>

        <div class="docs-section">
          <h4>Details</h4>
          <ul>
            <li><strong>Method:</strong> ${endpoint.method}</li>
            <li><strong>Category:</strong> ${endpoint.category}</li>
            <li><strong>Authentication:</strong> ${authRequired}</li>
            <li><strong>Safe to Test:</strong> ${safeToTest ? 'Yes' : 'Use with caution'}</li>
          </ul>
        </div>

        ${this.generateExampleUsage(endpoint)}

        ${this.generateResponseExamples(endpoint)}
      </div>
    `;
  }

  /**
   * Generate example usage for endpoint
   */
  generateExampleUsage(endpoint) {
    const curlExample = this.generateCurlExample(endpoint);
    const jsExample = this.generateJavaScriptExample(endpoint);

    return `
      <div class="docs-section">
        <h4>Example Usage</h4>

        <div class="example-tabs">
          <button class="example-tab active" onclick="showExample('curl')">cURL</button>
          <button class="example-tab" onclick="showExample('javascript')">JavaScript</button>
        </div>

        <div class="example-content">
          <pre id="curl-example" class="example-code">${curlExample}</pre>
          <pre id="javascript-example" class="example-code" style="display: none;">${jsExample}</pre>
        </div>
      </div>
    `;
  }

  /**
   * Generate cURL example
   */
  generateCurlExample(endpoint) {
    let curl = `curl -X ${endpoint.method} \\
  "${window.location.origin}${endpoint.path}" \\
  -H "Content-Type: application/json"`;

    if (endpoint.requiresAuth) {
      curl += ' \\\n  -H "Authorization: Bearer YOUR_TOKEN"';
    }

    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      curl += ' \\\n  -d \'{"example": "data"}\'';
    }

    return curl;
  }

  /**
   * Generate JavaScript example
   */
  generateJavaScriptExample(endpoint) {
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (endpoint.requiresAuth) {
      options.headers.Authorization = 'Bearer YOUR_TOKEN';
    }

    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      options.body = JSON.stringify({ example: 'data' });
    }

    return `fetch('${endpoint.path}', ${JSON.stringify(options, null, 2)})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`;
  }

  /**
   * Generate response examples
   */
  generateResponseExamples(endpoint) {
    const examples = this.getResponseExamples(endpoint.category, endpoint.method);

    if (!examples.length) return '';

    const examplesHTML = examples.map((example, index) => `
      <div class="response-example">
        <h5>Example ${index + 1}: ${example.title}</h5>
        <div class="response-status ${example.success ? 'success' : 'error'}">
          Status: ${example.status}
        </div>
        <pre class="response-body">${JSON.stringify(example.body, null, 2)}</pre>
      </div>
    `).join('');

    return `
      <div class="docs-section">
        <h4>Response Examples</h4>
        ${examplesHTML}
      </div>
    `;
  }

  /**
   * Get response examples for endpoint category
   */
  getResponseExamples(category, method) {
    const examples = {
      Admin: [
        {
          title: 'Success Response',
          status: '200 OK',
          success: true,
          body: { success: true, data: { message: 'Operation completed' } }
        }
      ],
      Health: [
        {
          title: 'Healthy System',
          status: '200 OK',
          success: true,
          body: { status: 'healthy', timestamp: new Date().toISOString() }
        }
      ]
    };

    return examples[category] || [];
  }

  /**
   * Load user preferences
   */
  loadPreferences() {
    try {
      const stored = localStorage.getItem('api-endpoints-preferences');
      return stored ? JSON.parse(stored) : {
        theme: 'dark',
        autoRefresh: false,
        showHistory: true,
        compactView: false
      };
    } catch (error) {
      console.warn('Could not load preferences:', error);
      return {};
    }
  }

  /**
   * Save user preferences
   */
  savePreferences() {
    try {
      localStorage.setItem('api-endpoints-preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('Could not save preferences:', error);
    }
  }

  /**
   * Bulk test endpoints (with rate limiting)
   */
  async bulkTestEndpoints(endpoints, options = {}) {
    const { concurrency = 3, delay = 1000 } = options;
    const results = [];

    showToast('info', 'Bulk Testing', `Testing ${endpoints.length} endpoints...`);

    for (let i = 0; i < endpoints.length; i += concurrency) {
      const batch = endpoints.slice(i, i + concurrency);

      const batchPromises = batch.map(async (endpoint) => {
        try {
          const result = await this.testEndpointEnhanced(endpoint.path, endpoint.method);
          return { endpoint, result, success: true };
        } catch (error) {
          return { endpoint, error, success: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Delay between batches to avoid overwhelming the server
      if (i + concurrency < endpoints.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;

    showToast(
      errorCount === 0 ? 'success' : 'warning',
      'Bulk Test Complete',
      `${successCount} successful, ${errorCount} failed`
    );

    return results;
  }

  /**
   * Export test results
   */
  exportResults(format = 'json') {
    const data = {
      timestamp: new Date().toISOString(),
      endpoints: this.filteredEndpoints.length,
      history: this.requestHistory,
      preferences: this.preferences
    };

    let content, filename, mimeType;

    switch (format) {
      case 'csv':
        content = this.convertToCSV(this.requestHistory);
        filename = `api-endpoint-results-${Date.now()}.csv`;
        mimeType = 'text/csv';
        break;

      case 'json':
      default:
        content = JSON.stringify(data, null, 2);
        filename = `api-endpoint-results-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('success', 'Exported!', `Results saved as ${filename}`);
  }

  /**
   * Convert history to CSV format
   */
  convertToCSV(history) {
    const headers = ['Timestamp', 'Method', 'Path', 'Duration (ms)', 'Status', 'Success'];
    const rows = history.map(req => [
      req.timestamp,
      req.method,
      req.path,
      Math.round(req.duration),
      req.status || 'N/A',
      req.success ? 'Yes' : 'No'
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}

// Enhanced JSON formatter for response display
class JSONFormatter {
  static format(obj, indent = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return this.formatValue(obj);
    }

    const spaces = '  '.repeat(indent);
    const innerSpaces = '  '.repeat(indent + 1);

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';

      const items = obj.map(item => innerSpaces + this.format(item, indent + 1));
      return '[\n' + items.join(',\n') + '\n' + spaces + ']';
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';

    const pairs = keys.map(key => {
      const value = this.format(obj[key], indent + 1);
      return `${innerSpaces}<span class="json-key">"${key}"</span>: ${value}`;
    });

    return '{\n' + pairs.join(',\n') + '\n' + spaces + '}';
  }

  static formatValue(value) {
    if (value === null) {
      return '<span class="json-null">null</span>';
    }

    if (typeof value === 'string') {
      return `<span class="json-string">"${this.escapeHtml(value)}"</span>`;
    }

    if (typeof value === 'number') {
      return `<span class="json-number">${value}</span>`;
    }

    if (typeof value === 'boolean') {
      return `<span class="json-boolean">${value}</span>`;
    }

    return String(value);
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Performance monitor for endpoint testing
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.isMonitoring = false;
  }

  startMonitoring() {
    this.isMonitoring = true;
    this.startTime = performance.now();

    // Monitor various performance metrics
    if ('PerformanceObserver' in window) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric(entry);
        }
      });

      this.observer.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  recordMetric(entry) {
    if (!this.isMonitoring) return;

    const metric = {
      name: entry.name,
      type: entry.entryType,
      duration: entry.duration,
      startTime: entry.startTime,
      timestamp: Date.now()
    };

    const key = `${entry.entryType}_${entry.name}`;
    this.metrics.set(key, metric);
  }

  getMetrics() {
    return Array.from(this.metrics.values());
  }

  getAverageResponseTime() {
    const responseTimes = Array.from(this.metrics.values())
      .filter(m => m.type === 'resource' && m.name.includes('/api/'))
      .map(m => m.duration);

    if (responseTimes.length === 0) return 0;

    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }
}

// Global instances
window.endpointManager = new EndpointManager();
window.performanceMonitor = new PerformanceMonitor();

// Enhanced global functions for the API endpoints page
window.showExample = function(type) {
  const tabs = document.querySelectorAll('.example-tab');
  const codes = document.querySelectorAll('.example-code');

  tabs.forEach(tab => tab.classList.remove('active'));
  codes.forEach(code => code.style.display = 'none');

  document.querySelector(`[onclick="showExample('${type}')"]`).classList.add('active');
  document.getElementById(`${type}-example`).style.display = 'block';
};

// Enhanced switchTab function with syntax highlighting
window.switchTabEnhanced = function(tabName) {
  const tabs = document.querySelectorAll('.modal-tab');
  const content = document.getElementById('responseContent');

  tabs.forEach(tab => tab.classList.remove('active'));
  event?.target?.classList.add('active') || document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');

  if (!currentModal) return;

  currentModal.activeTab = tabName;
  const response = currentModal.response;

  switch (tabName) {
    case 'formatted':
      const formattedData = typeof response.data === 'object'
        ? JSONFormatter.format(response.data)
        : response.data;

      content.innerHTML = `
        <div style="margin-bottom: var(--space-md); padding: var(--space-md); background: var(--color-surface); border-radius: var(--radius-md);">
          <strong>Status:</strong> <span class="status-${response.status >= 200 && response.status < 300 ? 'success' : 'error'}">${response.status} ${response.statusText}</span><br>
          <strong>Response Time:</strong> ${response.responseTime}ms
        </div>
        <pre>${formattedData}</pre>
      `;
      break;

    case 'raw':
      content.innerHTML = `<pre>${typeof response.data === 'object' ? JSON.stringify(response.data) : response.data}</pre>`;
      break;

    case 'headers':
      const headersFormatted = Object.entries(response.headers)
        .map(([key, value]) => `<span class="json-key">${key}</span>: <span class="json-string">${value}</span>`)
        .join('\n');
      content.innerHTML = `<pre>${headersFormatted}</pre>`;
      break;
  }
};

// Initialize performance monitoring on page load
document.addEventListener('DOMContentLoaded', () => {
  window.performanceMonitor.startMonitoring();

  // Add performance metrics to the page
  setTimeout(() => {
    const avgResponseTime = window.performanceMonitor.getAverageResponseTime();
    if (avgResponseTime > 0) {
      const statusElement = document.getElementById('status');
      if (statusElement) {
        statusElement.textContent = `API Ready (Avg: ${Math.round(avgResponseTime)}ms)`;
      }
    }
  }, 2000);
});

// Export for use in other scripts
export { EndpointManager, JSONFormatter, PerformanceMonitor };