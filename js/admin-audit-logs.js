/**
 * Admin Audit Logs Frontend
 * Handles filtering, pagination, and detail viewing of audit logs
 */

let currentPage = 0;
const pageSize = 50;
let currentFilters = {};
let totalLogs = 0;

/**
 * Fetch audit logs with current filters
 */
async function fetchAuditLogs(offset = 0) {
  const params = new URLSearchParams({
    limit: pageSize,
    offset: offset,
    ...currentFilters
  });

  showLoading(true);

  try {
    const response = await fetch(`/api/admin/audit-logs?${params}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    showError('Failed to load audit logs. Please try again.');
    return null;
  } finally {
    showLoading(false);
  }
}

/**
 * Render audit logs table
 */
function renderAuditLogs(data) {
  const tbody = document.getElementById('audit-logs-body');
  const table = document.getElementById('audit-table');
  const emptyState = document.getElementById('empty-state');
  const pagination = document.getElementById('pagination');

  if (!data || !data.logs || data.logs.length === 0) {
    table.style.display = 'none';
    pagination.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  pagination.style.display = 'flex';
  emptyState.style.display = 'none';
  tbody.innerHTML = '';

  data.logs.forEach(log => {
    const row = document.createElement('tr');
    row.className = `severity-${log.severity}`;
    row.innerHTML = `
      <td>${log.created_at_mt || 'N/A'}</td>
      <td><span class="event-type-badge">${log.event_type}</span></td>
      <td>${log.action}</td>
      <td>${log.admin_user || 'System'}</td>
      <td>${log.ip_address || 'N/A'}</td>
      <td><span class="severity-badge severity-${log.severity}">${log.severity}</span></td>
      <td><button class="details-btn" data-log-id="${log.id}">View</button></td>
    `;
    tbody.appendChild(row);
  });

  // Update pagination
  updatePagination(data.pagination);

  // Update stats
  updateStats(data);

  // Add event listeners to detail buttons
  document.querySelectorAll('.details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const logId = e.target.dataset.logId;
      const log = data.logs.find(l => l.id == logId);
      if (log) {
        showLogDetails(log);
      }
    });
  });
}

/**
 * Update pagination controls
 */
function updatePagination(pagination) {
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');

  totalLogs = pagination.total;
  const start = pagination.offset + 1;
  const end = Math.min(pagination.offset + pageSize, pagination.total);

  pageInfo.textContent = `Showing ${start}-${end} of ${pagination.total.toLocaleString()} logs`;

  prevBtn.disabled = pagination.offset === 0;
  nextBtn.disabled = !pagination.hasMore;
}

/**
 * Update statistics bar
 */
function updateStats(data) {
  document.getElementById('stat-total').textContent = data.pagination.total.toLocaleString();

  // Count last 24h events
  const last24h = data.stats.last24Hours?.reduce((sum, stat) => sum + (stat.count || 0), 0) || 0;
  document.getElementById('stat-24h').textContent = last24h.toLocaleString();

  // Count critical events in current query
  const criticalCount = data.logs.filter(log => log.severity === 'critical').length;
  document.getElementById('stat-critical').textContent = criticalCount;
}

/**
 * Show log details in modal
 */
function showLogDetails(log) {
  const modal = document.getElementById('details-modal');
  const modalBody = document.getElementById('modal-body');

  modalBody.innerHTML = `
    <div class="detail-section">
      <h3>Basic Information</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Event Type</div>
          <div class="detail-value">${log.event_type}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Action</div>
          <div class="detail-value">${log.action}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Severity</div>
          <div class="detail-value"><span class="severity-badge severity-${log.severity}">${log.severity}</span></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Timestamp (MT)</div>
          <div class="detail-value">${log.created_at_mt || 'N/A'}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>User & Context</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Admin User</div>
          <div class="detail-value">${log.admin_user || 'System'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Session ID</div>
          <div class="detail-value">${log.session_id || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">IP Address</div>
          <div class="detail-value">${log.ip_address || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">User Agent</div>
          <div class="detail-value">${log.user_agent || 'N/A'}</div>
        </div>
      </div>
    </div>

    ${log.target_type || log.target_id ? `
    <div class="detail-section">
      <h3>Target</h3>
      <div class="detail-grid">
        ${log.target_type ? `
        <div class="detail-item">
          <div class="detail-label">Target Type</div>
          <div class="detail-value">${log.target_type}</div>
        </div>` : ''}
        ${log.target_id ? `
        <div class="detail-item">
          <div class="detail-label">Target ID</div>
          <div class="detail-value">${log.target_id}</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    ${log.request_method || log.request_url ? `
    <div class="detail-section">
      <h3>Request Information</h3>
      <div class="detail-grid">
        ${log.request_method ? `
        <div class="detail-item">
          <div class="detail-label">HTTP Method</div>
          <div class="detail-value">${log.request_method}</div>
        </div>` : ''}
        ${log.request_url ? `
        <div class="detail-item">
          <div class="detail-label">Request URL</div>
          <div class="detail-value">${log.request_url}</div>
        </div>` : ''}
        ${log.response_status ? `
        <div class="detail-item">
          <div class="detail-label">Response Status</div>
          <div class="detail-value">${log.response_status}</div>
        </div>` : ''}
        ${log.response_time_ms ? `
        <div class="detail-item">
          <div class="detail-label">Response Time</div>
          <div class="detail-value">${log.response_time_ms}ms</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    ${log.before_value || log.after_value ? `
    <div class="detail-section">
      <h3>Data Changes</h3>
      ${log.before_value ? `
      <div style="margin-bottom: 1rem;">
        <div class="detail-label">Before</div>
        <pre class="json-viewer">${JSON.stringify(JSON.parse(log.before_value), null, 2)}</pre>
      </div>` : ''}
      ${log.after_value ? `
      <div>
        <div class="detail-label">After</div>
        <pre class="json-viewer">${JSON.stringify(JSON.parse(log.after_value), null, 2)}</pre>
      </div>` : ''}
    </div>` : ''}

    ${log.metadata ? `
    <div class="detail-section">
      <h3>Metadata</h3>
      <pre class="json-viewer">${JSON.stringify(JSON.parse(log.metadata), null, 2)}</pre>
    </div>` : ''}

    ${log.error_message ? `
    <div class="detail-section">
      <h3>Error Information</h3>
      <div class="detail-item">
        <div class="detail-label">Error Message</div>
        <div class="detail-value" style="color: var(--color-error);">${log.error_message}</div>
      </div>
    </div>` : ''}
  `;

  modal.classList.add('active');
}

/**
 * Show/hide loading spinner
 */
function showLoading(show) {
  const spinner = document.getElementById('loading-spinner');
  spinner.classList.toggle('active', show);
}

/**
 * Show error message
 */
function showError(message) {
  // For now, just console.error - could enhance with toast notification
  console.error(message);
  alert(message);
}

/**
 * Apply current filters
 */
async function applyFilters() {
  const filters = {
    eventType: document.getElementById('event-type-filter').value,
    severity: document.getElementById('severity-filter').value,
    adminUser: document.getElementById('admin-user-filter').value,
    action: document.getElementById('action-filter').value,
    startDate: document.getElementById('start-date-filter').value,
    endDate: document.getElementById('end-date-filter').value
  };

  // Remove empty filters
  currentFilters = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== '')
  );

  currentPage = 0;
  const data = await fetchAuditLogs(0);
  if (data) {
    renderAuditLogs(data);
  }
}

/**
 * Clear all filters
 */
async function clearFilters() {
  document.getElementById('event-type-filter').value = '';
  document.getElementById('severity-filter').value = '';
  document.getElementById('admin-user-filter').value = '';
  document.getElementById('action-filter').value = '';
  document.getElementById('start-date-filter').value = '';
  document.getElementById('end-date-filter').value = '';

  currentFilters = {};
  currentPage = 0;

  const data = await fetchAuditLogs(0);
  if (data) {
    renderAuditLogs(data);
  }
}

/**
 * Go to previous page
 */
async function previousPage() {
  if (currentPage > 0) {
    currentPage--;
    const data = await fetchAuditLogs(currentPage * pageSize);
    if (data) {
      renderAuditLogs(data);
    }
  }
}

/**
 * Go to next page
 */
async function nextPage() {
  const nextOffset = (currentPage + 1) * pageSize;
  if (nextOffset < totalLogs) {
    currentPage++;
    const data = await fetchAuditLogs(nextOffset);
    if (data) {
      renderAuditLogs(data);
    }
  }
}

/**
 * Initialize page
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Set up event listeners
  document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
  document.getElementById('prev-page-btn').addEventListener('click', previousPage);
  document.getElementById('next-page-btn').addEventListener('click', nextPage);

  // Modal close handlers
  document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('details-modal').classList.remove('active');
  });

  document.getElementById('details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'details-modal') {
      document.getElementById('details-modal').classList.remove('active');
    }
  });

  // Allow Enter key to apply filters
  document.querySelectorAll('.filter-group input').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyFilters();
      }
    });
  });

  // Load initial data
  const data = await fetchAuditLogs(0);
  if (data) {
    renderAuditLogs(data);
  }
});
