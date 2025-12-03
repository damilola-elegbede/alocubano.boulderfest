/**
 * Admin API Endpoints Page
 *
 * Interactive API testing and documentation portal.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminButton,
} from '../../components/admin/common/index.js';

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * API Endpoints Configuration
 */
const API_ENDPOINTS = [
    // Admin Endpoints
    {
        method: 'GET',
        path: '/api/admin/dashboard',
        category: 'Admin',
        description: 'Retrieve admin dashboard data including registrations and analytics overview',
        requiresAuth: true,
        queryParams: { eventId: 1 },
    },
    {
        method: 'POST',
        path: '/api/admin/login',
        category: 'Admin',
        description: 'Unified admin authentication - supports standard, simple (test only), and mobile modes',
        requiresAuth: false,
        body: { username: '', password: '', mode: 'simple' },
        dangerous: true,
        dangerMessage: '⚠️ Testing login may log you out of your current session.',
    },
    {
        method: 'GET',
        path: '/api/admin/registrations',
        category: 'Admin',
        description: 'Fetch all ticket registrations with filtering and pagination support',
        requiresAuth: true,
        queryParams: { limit: 10, sortBy: 'created_at', sortOrder: 'DESC' },
    },
    {
        method: 'GET',
        path: '/api/admin/transactions',
        category: 'Admin',
        description: 'Retrieve payment transaction history and analytics',
        requiresAuth: true,
    },
    {
        method: 'GET',
        path: '/api/admin/analytics',
        category: 'Admin',
        description: 'Get comprehensive analytics data for charts and insights',
        requiresAuth: true,
        queryParams: { type: 'summary', eventId: 1 },
    },
    {
        method: 'GET',
        path: '/api/admin/events',
        category: 'Admin',
        description: 'Retrieve available events for multi-event management',
        requiresAuth: true,
    },
    {
        method: 'GET',
        path: '/api/admin/generate-report',
        category: 'Admin',
        description: 'Generate and download comprehensive admin reports in CSV or JSON',
        requiresAuth: true,
        queryParams: { format: 'json', type: 'tickets' },
    },
    {
        method: 'GET',
        path: '/api/admin/csrf-token',
        category: 'Admin',
        description: 'Get CSRF token for state-changing operations',
        requiresAuth: true,
    },
    // Tickets Endpoints
    {
        method: 'POST',
        path: '/api/tickets/validate',
        category: 'Tickets',
        description: 'Validate QR code and check-in attendee at event',
        requiresAuth: true,
        body: { token: '' },
        note: 'Requires valid ticket token from QR code',
    },
    {
        method: 'GET',
        path: '/api/tickets/[ticketId]',
        category: 'Tickets',
        description: 'Retrieve specific ticket details by ID',
        requiresAuth: false,
        dynamicPath: true,
        pathParam: 'ticketId',
        note: 'Replace [ticketId] with actual ticket ID',
    },
    // Registration Endpoints
    {
        method: 'POST',
        path: '/api/tickets/register',
        category: 'Registration',
        description: 'Register attendee information for purchased ticket',
        requiresAuth: false,
        body: { ticketId: '', attendee_first_name: '', attendee_last_name: '', attendee_email: '' },
        dangerous: true,
        dangerMessage: '⚠️ This will register a real ticket and consume it.',
    },
    {
        method: 'GET',
        path: '/api/registration/health',
        category: 'Registration',
        description: 'Check health status of registration system',
        requiresAuth: false,
    },
    // Gallery Endpoints
    {
        method: 'GET',
        path: '/api/gallery',
        category: 'Gallery',
        description: 'Retrieve Google Drive photos and videos with caching',
        requiresAuth: false,
        queryParams: { year: 2024, limit: 5 },
    },
    {
        method: 'GET',
        path: '/api/gallery/years',
        category: 'Gallery',
        description: 'Get available years for gallery content filtering',
        requiresAuth: false,
    },
    {
        method: 'GET',
        path: '/api/featured-photos',
        category: 'Gallery',
        description: 'Retrieve curated featured photos for homepage',
        requiresAuth: false,
        queryParams: { limit: 3 },
    },
    // Email Endpoints
    {
        method: 'POST',
        path: '/api/email/subscribe',
        category: 'Email',
        description: 'Subscribe email to newsletter list via Brevo integration',
        requiresAuth: false,
        body: { email: 'test@alocubano.test' },
        note: 'Uses .test domain to avoid sending real emails',
    },
    // Health Endpoints
    {
        method: 'GET',
        path: '/api/test-db',
        category: 'Health',
        description: 'Test database connectivity and performance',
        requiresAuth: false,
    },
    {
        method: 'GET',
        path: '/api/health/check',
        category: 'Health',
        description: 'Comprehensive application health check',
        requiresAuth: false,
    },
    {
        method: 'GET',
        path: '/api/health/database',
        category: 'Health',
        description: 'Database-specific health monitoring',
        requiresAuth: false,
    },
];

/**
 * Method badge component
 */
function MethodBadge({ method }) {
    const colors = {
        GET: 'var(--color-success)',
        POST: 'var(--color-blue)',
        PUT: 'var(--color-warning)',
        DELETE: 'var(--color-error)',
        PATCH: 'var(--color-info)',
    };

    return (
        <span
            style={{
                background: colors[method] || 'var(--color-text-secondary)',
                color: 'var(--color-text-inverse)',
                padding: 'var(--space-xs) var(--space-sm)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-code)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                minWidth: '60px',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: 'var(--letter-spacing-wide)',
            }}
        >
            {method}
        </span>
    );
}

/**
 * Endpoint card component
 */
function EndpointCard({ endpoint, onTest, testing }) {
    const [showParams, setShowParams] = useState(false);
    const [queryParams, setQueryParams] = useState(
        endpoint.queryParams ? JSON.stringify(endpoint.queryParams, null, 2) : ''
    );
    const [bodyParams, setBodyParams] = useState(
        endpoint.body !== undefined ? JSON.stringify(endpoint.body, null, 2) : ''
    );
    const [pathParam, setPathParam] = useState('');

    const hasParams = endpoint.queryParams || endpoint.body || endpoint.dynamicPath;

    const handleTest = () => {
        let parsedQuery = null;
        let parsedBody = null;

        try {
            if (queryParams) {
                parsedQuery = JSON.parse(queryParams);
            }
        } catch {
            alert('Invalid JSON in query parameters');
            return;
        }

        try {
            if (bodyParams) {
                parsedBody = JSON.parse(bodyParams);
            }
        } catch {
            alert('Invalid JSON in request body');
            return;
        }

        if (endpoint.dynamicPath && !pathParam) {
            alert(`Please provide ${endpoint.pathParam} in the path parameter field`);
            return;
        }

        onTest(endpoint, { queryParams: parsedQuery, body: parsedBody, pathParam });
    };

    return (
        <div
            style={{
                background: 'var(--color-surface)',
                border: '2px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-lg)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all var(--transition-base)',
            }}
        >
            {/* Top gradient bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, var(--color-blue), var(--color-red))',
                }}
            />

            {/* Category badge */}
            <div
                style={{
                    display: 'inline-block',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-tertiary)',
                    padding: 'var(--space-xs) var(--space-sm)',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-code)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--letter-spacing-wide)',
                    marginBottom: 'var(--space-sm)',
                }}
            >
                {endpoint.category}
            </div>

            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-md)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-sm)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-md)',
                        flex: 1,
                    }}
                >
                    <MethodBadge method={endpoint.method} />
                    <code
                        style={{
                            fontFamily: 'var(--font-code)',
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-primary)',
                            fontWeight: 600,
                            wordBreak: 'break-all',
                        }}
                    >
                        {endpoint.path}
                    </code>
                    {endpoint.note && (
                        <span title={endpoint.note} style={{ cursor: 'help' }}>
                            ℹ️
                        </span>
                    )}
                    {endpoint.dangerous && (
                        <span title={endpoint.dangerMessage} style={{ cursor: 'help' }}>
                            ⚠️
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    {hasParams && (
                        <AdminButton
                            size="sm"
                            variant="default"
                            onClick={() => setShowParams(!showParams)}
                        >
                            ⚙️
                        </AdminButton>
                    )}
                    <AdminButton
                        size="sm"
                        variant="primary"
                        onClick={handleTest}
                        disabled={testing}
                    >
                        {testing ? '...' : 'Test'}
                    </AdminButton>
                </div>
            </div>

            {/* Description */}
            <p
                style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: 'var(--space-md)',
                    lineHeight: 'var(--line-height-relaxed)',
                }}
            >
                {endpoint.description}
            </p>

            {/* Parameters */}
            {showParams && hasParams && (
                <div
                    style={{
                        marginTop: 'var(--space-md)',
                        padding: 'var(--space-md)',
                        background: 'var(--color-background-secondary)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    {endpoint.queryParams && (
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                }}
                            >
                                Query Parameters (JSON):
                            </label>
                            <textarea
                                value={queryParams}
                                onChange={(e) => setQueryParams(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: 'var(--space-sm)',
                                    background: 'var(--color-background)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: '0.875rem',
                                    resize: 'vertical',
                                    minHeight: '60px',
                                }}
                                rows={3}
                            />
                        </div>
                    )}

                    {endpoint.body !== undefined && (
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                }}
                            >
                                Request Body (JSON):
                            </label>
                            <textarea
                                value={bodyParams}
                                onChange={(e) => setBodyParams(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: 'var(--space-sm)',
                                    background: 'var(--color-background)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: '0.875rem',
                                    resize: 'vertical',
                                    minHeight: '80px',
                                }}
                                rows={5}
                            />
                        </div>
                    )}

                    {endpoint.dynamicPath && (
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: 'var(--space-xs)',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                }}
                            >
                                Path Parameter ({endpoint.pathParam}):
                            </label>
                            <input
                                type="text"
                                value={pathParam}
                                onChange={(e) => setPathParam(e.target.value)}
                                placeholder={`e.g., ${endpoint.pathParam === 'ticketId' ? 'ticket ID' : 'token'}`}
                                style={{
                                    width: '100%',
                                    padding: 'var(--space-sm)',
                                    background: 'var(--color-background)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--color-text-primary)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: '0.875rem',
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Response modal component
 */
function ResponseModal({ response, onClose }) {
    const [activeTab, setActiveTab] = useState('formatted');

    if (!response) return null;

    const formatJSON = (obj) => {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    };

    const copyToClipboard = () => {
        const text = activeTab === 'headers'
            ? formatJSON(response.headers)
            : formatJSON(response.data);
        navigator.clipboard.writeText(text);
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--color-surface)',
                    border: '2px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    width: '90%',
                    maxWidth: '800px',
                    maxHeight: '90%',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: 'var(--space-xl)',
                        borderBottom: '2px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 900,
                            margin: 0,
                        }}
                    >
                        {response.method} {response.path}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: 'var(--font-size-2xl)',
                            color: 'var(--color-text-tertiary)',
                            cursor: 'pointer',
                            padding: 'var(--space-sm)',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Tabs */}
                <div
                    style={{
                        display: 'flex',
                        background: 'var(--color-background-secondary)',
                        borderBottom: '2px solid var(--color-border)',
                    }}
                >
                    {['formatted', 'raw', 'headers'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                flex: 1,
                                padding: 'var(--space-md) var(--space-lg)',
                                background: activeTab === tab ? 'var(--color-blue)' : 'none',
                                border: 'none',
                                color: activeTab === tab ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: 'var(--space-xl)', maxHeight: '60vh', overflowY: 'auto' }}>
                    {/* Actions */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 'var(--space-md)',
                            marginBottom: 'var(--space-lg)',
                        }}
                    >
                        <AdminButton size="sm" onClick={copyToClipboard}>
                            Copy
                        </AdminButton>
                        <span
                            style={{
                                marginLeft: 'auto',
                                fontFamily: 'var(--font-code)',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            Status: {response.status} | {response.responseTime}ms
                        </span>
                    </div>

                    {/* Response */}
                    <pre
                        style={{
                            background: 'var(--color-background-secondary)',
                            padding: 'var(--space-lg)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            overflow: 'auto',
                            fontFamily: 'var(--font-code)',
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-primary)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                    >
                        {activeTab === 'headers'
                            ? formatJSON(response.headers)
                            : activeTab === 'raw'
                                ? typeof response.data === 'object'
                                    ? JSON.stringify(response.data)
                                    : String(response.data)
                                : formatJSON(response.data)}
                    </pre>
                </div>
            </div>
        </div>
    );
}

/**
 * ApiEndpointsPageContent - Main content
 */
function ApiEndpointsPageContent() {
    const { isAuthenticated, csrfToken } = useAdminAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [methodFilter, setMethodFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [testingEndpoint, setTestingEndpoint] = useState(null);
    const [response, setResponse] = useState(null);

    // Get unique categories
    const categories = useMemo(() => {
        return [...new Set(API_ENDPOINTS.map((e) => e.category))];
    }, []);

    // Filter endpoints
    const filteredEndpoints = useMemo(() => {
        return API_ENDPOINTS.filter((endpoint) => {
            const matchesSearch =
                !searchTerm ||
                endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                endpoint.category.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesMethod = !methodFilter || endpoint.method === methodFilter;
            const matchesCategory = !categoryFilter || endpoint.category === categoryFilter;

            return matchesSearch && matchesMethod && matchesCategory;
        });
    }, [searchTerm, methodFilter, categoryFilter]);

    /**
     * Test endpoint
     */
    const handleTestEndpoint = useCallback(
        async (endpoint, params) => {
            // Check for dangerous operations
            if (endpoint.dangerous) {
                const confirmed = window.confirm(
                    `${endpoint.dangerMessage}\n\nAre you sure you want to continue?`
                );
                if (!confirmed) return;
            }

            setTestingEndpoint(endpoint.path);

            const startTime = performance.now();

            try {
                // Build path with path parameter if needed
                let path = endpoint.path;
                if (endpoint.dynamicPath && params.pathParam) {
                    path = path.replace(`[${endpoint.pathParam}]`, params.pathParam);
                }

                // Build URL with query parameters
                let url = path;
                if (params.queryParams) {
                    const searchParams = new URLSearchParams(params.queryParams);
                    url = `${path}?${searchParams.toString()}`;
                }

                const requestOptions = {
                    method: endpoint.method,
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                };

                // Add request body for POST/PUT/PATCH
                if (params.body !== null && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
                    requestOptions.body = JSON.stringify(params.body);
                }

                // Add CSRF token for state-changing operations
                if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(endpoint.method) && csrfToken) {
                    requestOptions.headers['X-CSRF-Token'] = csrfToken;
                }

                const fetchResponse = await fetch(url, requestOptions);
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);

                let responseData;
                const contentType = fetchResponse.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                    responseData = await fetchResponse.json();
                } else {
                    responseData = await fetchResponse.text();
                }

                setResponse({
                    method: endpoint.method,
                    path: path,
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    headers: Object.fromEntries(fetchResponse.headers.entries()),
                    data: responseData,
                    responseTime: responseTime,
                });
            } catch (error) {
                console.error('Endpoint test error:', error);
                setResponse({
                    method: endpoint.method,
                    path: endpoint.path,
                    status: 0,
                    statusText: 'Error',
                    headers: {},
                    data: { error: error.message },
                    responseTime: Math.round(performance.now() - startTime),
                });
            } finally {
                setTestingEndpoint(null);
            }
        },
        [csrfToken]
    );

    /**
     * Clear filters
     */
    const handleClearFilters = () => {
        setSearchTerm('');
        setMethodFilter('');
        setCategoryFilter('');
    };

    // Header actions
    const headerActions = (
        <AdminButton variant="primary" onClick={() => window.location.reload()}>
            Refresh
        </AdminButton>
    );

    return (
        <AdminLayout
            title="API Endpoints"
            subtitle="Interactive API Testing & Documentation Portal"
            currentPage="api-endpoints"
            headerActions={headerActions}
        >
            {/* Search and Filter Controls */}
            <AdminCard className="admin-mb-xl">
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: 'var(--space-lg)',
                        alignItems: 'end',
                        marginBottom: 'var(--space-lg)',
                    }}
                >
                    <div style={{ position: 'relative' }}>
                        <span
                            style={{
                                position: 'absolute',
                                left: 'var(--space-md)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--color-text-tertiary)',
                            }}
                        >
                            🔍
                        </span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search endpoints by name, path, or description..."
                            style={{
                                width: '100%',
                                padding: 'var(--space-sm) var(--space-md) var(--space-sm) var(--space-3xl)',
                                fontFamily: 'var(--font-sans)',
                                fontSize: 'var(--font-size-base)',
                                color: 'var(--color-text-primary)',
                                background: 'var(--color-background-secondary)',
                                border: '2px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                minHeight: '44px',
                            }}
                        />
                    </div>
                    <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="admin-form-select"
                        style={{ minWidth: '140px' }}
                    >
                        <option value="">All Methods</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                        <option value="PATCH">PATCH</option>
                    </select>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="admin-form-select"
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Categories</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Active filters */}
                {(searchTerm || methodFilter || categoryFilter) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                        {searchTerm && (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-xs)',
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    background: 'var(--color-blue)',
                                    color: 'var(--color-text-inverse)',
                                    borderRadius: 'var(--radius-full)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 700,
                                }}
                            >
                                Search: "{searchTerm}"
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'currentColor',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        {methodFilter && (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-xs)',
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    background: 'var(--color-blue)',
                                    color: 'var(--color-text-inverse)',
                                    borderRadius: 'var(--radius-full)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 700,
                                }}
                            >
                                Method: {methodFilter}
                                <button
                                    onClick={() => setMethodFilter('')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'currentColor',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        {categoryFilter && (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-xs)',
                                    padding: 'var(--space-xs) var(--space-sm)',
                                    background: 'var(--color-blue)',
                                    color: 'var(--color-text-inverse)',
                                    borderRadius: 'var(--radius-full)',
                                    fontFamily: 'var(--font-code)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 700,
                                }}
                            >
                                Category: {categoryFilter}
                                <button
                                    onClick={() => setCategoryFilter('')}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'currentColor',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        )}
                        <button
                            onClick={handleClearFilters}
                            style={{
                                background: 'transparent',
                                color: 'var(--color-text-tertiary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-xs) var(--space-sm)',
                                fontFamily: 'var(--font-code)',
                                fontSize: 'var(--font-size-xs)',
                                cursor: 'pointer',
                            }}
                        >
                            Clear All
                        </button>
                    </div>
                )}
            </AdminCard>

            {/* Results count */}
            <div className="admin-mb-md">
                <span className="admin-text-secondary">
                    {filteredEndpoints.length} endpoint{filteredEndpoints.length !== 1 ? 's' : ''}{' '}
                    found
                </span>
            </div>

            {/* Endpoints Grid */}
            {filteredEndpoints.length === 0 ? (
                <div
                    style={{
                        textAlign: 'center',
                        padding: 'var(--space-4xl)',
                        color: 'var(--color-text-tertiary)',
                    }}
                >
                    <div style={{ fontSize: 'var(--font-size-4xl)', marginBottom: 'var(--space-lg)', opacity: 0.5 }}>
                        🔍
                    </div>
                    <h3>No endpoints found</h3>
                    <p>Try adjusting your search criteria or filters</p>
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                        gap: 'var(--space-lg)',
                    }}
                >
                    {filteredEndpoints.map((endpoint, index) => (
                        <EndpointCard
                            key={`${endpoint.method}-${endpoint.path}-${index}`}
                            endpoint={endpoint}
                            onTest={handleTestEndpoint}
                            testing={testingEndpoint === endpoint.path}
                        />
                    ))}
                </div>
            )}

            {/* Response Modal */}
            {response && (
                <ResponseModal response={response} onClose={() => setResponse(null)} />
            )}
        </AdminLayout>
    );
}

/**
 * ApiEndpointsPage - Admin API endpoints page with providers
 */
export default function ApiEndpointsPage() {
    return (
        <AdminProviders>
            <ApiEndpointsPageContent />
        </AdminProviders>
    );
}
