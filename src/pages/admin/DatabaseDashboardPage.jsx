/**
 * Admin Database Monitoring Dashboard
 *
 * Enterprise connection management system monitoring and performance analytics.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
 * Format uptime
 */
function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/**
 * Format time ago
 */
function formatTimeAgo(milliseconds) {
    if (!milliseconds) return 'Never';

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
}

/**
 * Get utilization status
 */
function getUtilizationStatus(utilization) {
    if (utilization >= 95) return 'critical';
    if (utilization >= 85) return 'warning';
    return 'healthy';
}

/**
 * Get alerts status
 */
function getAlertsStatus(criticalCount) {
    if (criticalCount > 0) return 'critical';
    return 'healthy';
}

/**
 * Get error rate status
 */
function getErrorRateStatus(errorRate) {
    if (errorRate >= 10) return 'critical';
    if (errorRate >= 5) return 'warning';
    return 'healthy';
}

/**
 * Status card component
 */
function StatusCard({ title, value, trend, status = 'healthy' }) {
    const statusColors = {
        healthy: 'rgba(4, 120, 87, 0.1)',
        warning: 'rgba(245, 158, 11, 0.1)',
        critical: 'rgba(239, 68, 68, 0.1)',
    };

    const borderColors = {
        healthy: 'var(--color-success)',
        warning: '#f59e0b',
        critical: '#ef4444',
    };

    return (
        <div
            style={{
                background: statusColors[status],
                border: `2px solid ${borderColors[status]}`,
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
                transition: 'all 0.3s ease',
            }}
        >
            <h3
                style={{
                    margin: '0 0 0.5rem 0',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.9rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
            >
                {title}
            </h3>
            <div
                style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    margin: '0.5rem 0',
                    color: 'var(--color-text-primary)',
                }}
            >
                {value}
            </div>
            {trend && (
                <div
                    style={{
                        fontSize: '0.8rem',
                        opacity: 0.7,
                        color: 'var(--color-text-secondary)',
                    }}
                >
                    {trend}
                </div>
            )}
        </div>
    );
}

/**
 * Status badge component
 */
function StatusBadge({ status, children }) {
    const colors = {
        healthy: { bg: 'rgba(4, 120, 87, 0.2)', color: 'var(--color-success)' },
        warning: { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' },
        critical: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
        unhealthy: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
        closed: { bg: 'rgba(4, 120, 87, 0.2)', color: 'var(--color-success)' },
        open: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
        half_open: { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' },
    };

    const style = colors[status] || colors.healthy;

    return (
        <span
            style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                background: style.bg,
                color: style.color,
            }}
        >
            {children}
        </span>
    );
}

/**
 * Alert item component
 */
function AlertItem({ alert }) {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                borderRadius: '4px',
                borderLeft: `4px solid ${alert.type === 'critical' ? '#ef4444' : '#f59e0b'}`,
                background:
                    alert.type === 'critical'
                        ? 'rgba(239, 68, 68, 0.1)'
                        : 'rgba(245, 158, 11, 0.1)',
            }}
        >
            <div style={{ flex: 1, fontSize: '0.9rem' }}>
                <strong>{escapeHtml(alert.component)}</strong>: {escapeHtml(alert.message)}
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                {formatTimeAgo(Date.now() - alert.lastSeen)}
            </div>
        </div>
    );
}

/**
 * Recommendation item component
 */
function RecommendationItem({ recommendation }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px',
                borderLeft: '4px solid var(--color-blue)',
                background: 'var(--color-background-secondary)',
            }}
        >
            <div
                style={{
                    background: 'var(--color-blue)',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    marginRight: '1rem',
                    flexShrink: 0,
                }}
            >
                {recommendation.priority}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    {escapeHtml(recommendation.issue)}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    {escapeHtml(recommendation.action)}
                </div>
            </div>
        </div>
    );
}

/**
 * Simple bar chart component (CSS-based, no external dependency)
 */
function SimpleBarChart({ data, title, maxValue = 100 }) {
    if (!data || data.length === 0) {
        return (
            <div
                style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: 'var(--color-text-secondary)',
                }}
            >
                No data available
            </div>
        );
    }

    return (
        <div style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '8px' }}>
                {data.map((item, index) => (
                    <div
                        key={index}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'flex-end',
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                background: 'linear-gradient(180deg, var(--color-blue), var(--color-red))',
                                borderRadius: '4px 4px 0 0',
                                height: `${Math.max(4, (item.value / maxValue) * 100)}%`,
                                transition: 'height 0.3s ease',
                                minHeight: '4px',
                            }}
                            title={`${item.label}: ${item.value}${item.unit || ''}`}
                        />
                        <div
                            style={{
                                fontSize: '0.7rem',
                                color: 'var(--color-text-tertiary)',
                                marginTop: '4px',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                            }}
                        >
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * DatabaseDashboardPageContent - Main content
 */
function DatabaseDashboardPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get } = useAdminApi();

    const [healthData, setHealthData] = useState(null);
    const [metricsData, setMetricsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const refreshIntervalRef = useRef(null);

    /**
     * Load dashboard data
     */
    const loadDashboardData = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            // Load both health and metrics data in parallel
            const [healthResponse, metricsResponse] = await Promise.all([
                get('/api/admin/database-health?includeHistory=false&includePerformance=true'),
                get('/api/admin/database-metrics?metrics=all&granularity=medium'),
            ]);

            setHealthData(healthResponse);
            setMetricsData(metricsResponse);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, get]);

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadDashboardData();
        }
    }, [isAuthenticated, loadDashboardData]);

    /**
     * Auto-refresh
     */
    useEffect(() => {
        if (autoRefresh && isAuthenticated) {
            refreshIntervalRef.current = setInterval(() => {
                loadDashboardData();
            }, 30000); // 30 seconds
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [autoRefresh, isAuthenticated, loadDashboardData]);

    // Extract data from responses
    const health = healthData?.health || {};
    const components = healthData?.components || {};
    const alerts = healthData?.alerts || {};
    const recommendations = healthData?.recommendations || [];
    const metrics = metricsData?.metrics?.current || {};
    const timeSeries = metricsData?.metrics?.timeSeries || [];

    // Prepare chart data from time series
    const poolChartData = timeSeries.slice(-10).map((ts) => ({
        label: new Date(ts.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Denver',
        }),
        value: ts.metrics?.connectionPool?.utilization || 0,
        unit: '%',
    }));

    const errorChartData = timeSeries.slice(-10).map((ts) => ({
        label: new Date(ts.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Denver',
        }),
        value: ts.metrics?.connectionPool?.errorRate || 0,
        unit: '%',
    }));

    // Calculate status values
    const overallStatus = health.status || 'unknown';
    const poolUtilization = components.connectionPool?.metrics?.utilization || 0;
    const activeLeases = components.connectionPool?.metrics?.activeLeases || 0;
    const totalAlerts = alerts.total || 0;
    const criticalAlerts = alerts.critical || 0;
    const errorRate = components.connectionPool?.metrics?.errorRate || 0;
    const circuitBreaker = components.circuitBreaker || {};

    // Header actions
    const headerActions = (
        <AdminButton variant="primary" onClick={loadDashboardData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
        </AdminButton>
    );

    if (loading && !healthData) {
        return (
            <AdminLayout
                title="Database Monitoring"
                subtitle="Enterprise connection management system monitoring"
                currentPage="database-dashboard"
            >
                <div style={{ textAlign: 'center', padding: '60px' }}>Loading dashboard data...</div>
            </AdminLayout>
        );
    }

    if (error && !healthData) {
        return (
            <AdminLayout
                title="Database Monitoring"
                subtitle="Enterprise connection management system monitoring"
                currentPage="database-dashboard"
            >
                <AdminCard>
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: 'var(--color-error)',
                        }}
                    >
                        <p>Failed to load dashboard data</p>
                        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>{error}</p>
                        <AdminButton onClick={loadDashboardData} style={{ marginTop: '20px' }}>
                            Retry
                        </AdminButton>
                    </div>
                </AdminCard>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Database Monitoring"
            subtitle="Enterprise connection management system monitoring and performance analytics"
            currentPage="database-dashboard"
            headerActions={headerActions}
        >
            {/* Auto-refresh toggle */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '1rem',
                    marginBottom: '1rem',
                }}
            >
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Auto-refresh (30s)
                </label>
                {lastUpdated && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                        Last updated: {lastUpdated.toLocaleTimeString('en-US', { timeZone: 'America/Denver' })}
                    </span>
                )}
            </div>

            {/* Status Overview */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem',
                }}
            >
                <StatusCard
                    title="Overall Health"
                    value={overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
                    trend={`Uptime: ${formatUptime(health.uptime || 0)}`}
                    status={overallStatus}
                />
                <StatusCard
                    title="Pool Utilization"
                    value={`${poolUtilization.toFixed(1)}%`}
                    trend={`${activeLeases} active`}
                    status={getUtilizationStatus(poolUtilization)}
                />
                <StatusCard
                    title="Active Alerts"
                    value={totalAlerts}
                    trend={`${criticalAlerts} critical`}
                    status={getAlertsStatus(criticalAlerts)}
                />
                <StatusCard
                    title="Error Rate"
                    value={`${errorRate.toFixed(2)}%`}
                    trend="Last 24h"
                    status={getErrorRateStatus(errorRate)}
                />
            </div>

            {/* Dashboard Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                    gap: '2rem',
                    marginBottom: '2rem',
                }}
            >
                {/* Connection Pool Chart */}
                <AdminCard title="Connection Pool Utilization">
                    <div style={{ height: '250px' }}>
                        <SimpleBarChart data={poolChartData} maxValue={100} />
                    </div>
                </AdminCard>

                {/* Error Rate Chart */}
                <AdminCard title="Error Rate Over Time">
                    <div style={{ height: '250px' }}>
                        <SimpleBarChart data={errorChartData} maxValue={Math.max(10, ...errorChartData.map((d) => d.value))} />
                    </div>
                </AdminCard>

                {/* Circuit Breaker Status */}
                <AdminCard title="Circuit Breaker Status">
                    {circuitBreaker.state ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <strong>State</strong>
                                    </td>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <StatusBadge status={circuitBreaker.state.toLowerCase()}>
                                            {circuitBreaker.state}
                                        </StatusBadge>
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <strong>Health Status</strong>
                                    </td>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <StatusBadge status={circuitBreaker.metrics?.isHealthy ? 'healthy' : 'unhealthy'}>
                                            {circuitBreaker.metrics?.isHealthy ? 'Healthy' : 'Unhealthy'}
                                        </StatusBadge>
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        <strong>Failure Rate</strong>
                                    </td>
                                    <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                        {(circuitBreaker.metrics?.failureRate || 0).toFixed(2)}%
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '0.75rem' }}>
                                        <strong>Last Failure</strong>
                                    </td>
                                    <td style={{ padding: '0.75rem' }}>
                                        {formatTimeAgo(circuitBreaker.metrics?.timeSinceLastFailure)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ color: 'var(--color-text-secondary)', padding: '20px', textAlign: 'center' }}>
                            Circuit breaker data unavailable
                        </div>
                    )}
                </AdminCard>

                {/* Active Alerts */}
                <AdminCard title="Active Alerts">
                    {alerts.active && alerts.active.length > 0 ? (
                        <div>
                            {alerts.active.slice(0, 5).map((alert, index) => (
                                <AlertItem key={index} alert={alert} />
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'var(--color-text-secondary)', padding: '20px', textAlign: 'center' }}>
                            No active alerts
                        </div>
                    )}
                </AdminCard>
            </div>

            {/* Detailed Metrics Table */}
            <AdminCard title="Detailed Metrics" className="admin-mb-xl">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-background-secondary)' }}>
                            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                                Metric
                            </th>
                            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                                Current Value
                            </th>
                            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                                Status
                            </th>
                            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                                Trend
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Connection Pool Utilization
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                {(metrics.pool?.utilization || 0).toFixed(1)}%
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                <StatusBadge status={getUtilizationStatus(metrics.pool?.utilization || 0)}>
                                    {getUtilizationStatus(metrics.pool?.utilization || 0)}
                                </StatusBadge>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Stable
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Active Connections
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                {metrics.pool?.connections || 0}
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                <StatusBadge status="healthy">Normal</StatusBadge>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Stable
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Active Leases
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                {metrics.pool?.activeLeases || 0}
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                <StatusBadge status="healthy">Normal</StatusBadge>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Stable
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Available Connections
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                {metrics.pool?.availableConnections || 0}
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                <StatusBadge status="healthy">Normal</StatusBadge>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                Stable
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.75rem' }}>Active Alerts</td>
                            <td style={{ padding: '0.75rem' }}>{metrics.alerts?.active || 0}</td>
                            <td style={{ padding: '0.75rem' }}>
                                <StatusBadge status={getAlertsStatus(metrics.alerts?.critical || 0)}>
                                    {getAlertsStatus(metrics.alerts?.critical || 0)}
                                </StatusBadge>
                            </td>
                            <td style={{ padding: '0.75rem' }}>Stable</td>
                        </tr>
                    </tbody>
                </table>
            </AdminCard>

            {/* Recommendations */}
            {recommendations.length > 0 && (
                <AdminCard title="Operational Recommendations" titleIcon="💡">
                    {recommendations.slice(0, 5).map((rec, index) => (
                        <RecommendationItem key={index} recommendation={rec} />
                    ))}
                </AdminCard>
            )}

            {recommendations.length === 0 && (
                <AdminCard title="Operational Recommendations" titleIcon="💡">
                    <div style={{ color: 'var(--color-text-secondary)', padding: '20px', textAlign: 'center' }}>
                        No recommendations at this time
                    </div>
                </AdminCard>
            )}
        </AdminLayout>
    );
}

/**
 * DatabaseDashboardPage - Admin database dashboard page with providers
 */
export default function DatabaseDashboardPage() {
    return (
        <AdminProviders>
            <DatabaseDashboardPageContent />
        </AdminProviders>
    );
}
