/**
 * Admin Analytics Page
 *
 * Dashboard with charts, metrics, and insights.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminStatsCard,
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
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount || 0);
}

/**
 * Simple bar chart component using CSS
 */
function SimpleBarChart({ data, title, valueFormatter = (v) => v }) {
    if (!data || data.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                No data available
            </div>
        );
    }

    const maxValue = Math.max(...data.map((d) => d.value || 0));

    return (
        <div>
            {title && (
                <h4 style={{ marginBottom: '16px', fontWeight: 600 }}>{title}</h4>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.map((item, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            style={{
                                width: '100px',
                                fontSize: '0.85em',
                                color: 'var(--color-text-secondary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                            title={item.label}
                        >
                            {escapeHtml(item.label)}
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                                style={{
                                    height: '24px',
                                    width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                                    minWidth: '4px',
                                    background: `linear-gradient(90deg, var(--color-blue), var(--color-red))`,
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                }}
                            />
                            <span style={{ fontSize: '0.85em', fontWeight: 600, minWidth: '60px' }}>
                                {valueFormatter(item.value)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Recommendation item component
 */
function RecommendationItem({ type, title, text }) {
    const colors = {
        success: {
            bg: 'var(--color-success-light, rgba(16, 185, 129, 0.1))',
            border: 'var(--color-success, #10b981)',
            icon: '✅',
        },
        warning: {
            bg: 'var(--color-warning-light, rgba(245, 158, 11, 0.1))',
            border: 'var(--color-warning, #f59e0b)',
            icon: '⚠️',
        },
        info: {
            bg: 'var(--color-info-light, rgba(59, 130, 246, 0.1))',
            border: 'var(--color-info, #3b82f6)',
            icon: 'ℹ️',
        },
    };

    const style = colors[type] || colors.info;

    return (
        <div
            style={{
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                background: style.bg,
                borderLeft: `4px solid ${style.border}`,
            }}
        >
            <span style={{ fontSize: '1.2em' }}>{style.icon}</span>
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        fontWeight: 700,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        fontSize: '0.85em',
                        letterSpacing: '0.5px',
                    }}
                >
                    {escapeHtml(title)}
                </div>
                <div style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)' }}>
                    {escapeHtml(text)}
                </div>
            </div>
        </div>
    );
}

/**
 * AnalyticsPageContent - Main content
 */
function AnalyticsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get } = useAdminApi();

    // State
    const [stats, setStats] = useState(null);
    const [revenueByType, setRevenueByType] = useState([]);
    const [salesOverTime, setSalesOverTime] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('30d');

    /**
     * Load analytics data
     */
    const loadAnalytics = useCallback(async () => {
        if (!isAuthenticated) return;

        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('period', timeRange);

            const data = await get(`/api/admin/analytics?${params.toString()}`);

            setStats(data.stats || {});
            setRevenueByType(data.revenueByType || []);
            setSalesOverTime(data.salesOverTime || []);
            setRecommendations(data.recommendations || []);
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, get, timeRange]);

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadAnalytics();
        }
    }, [isAuthenticated, loadAnalytics]);

    // Time range buttons
    const timeRanges = [
        { value: '7d', label: '7 Days' },
        { value: '30d', label: '30 Days' },
        { value: '90d', label: '90 Days' },
        { value: 'all', label: 'All Time' },
    ];

    if (loading) {
        return (
            <AdminLayout
                title="Analytics"
                subtitle="A Lo Cubano Boulder Fest - Performance Analytics"
                currentPage="analytics"
            >
                <div className="admin-loading" style={{ padding: '60px', textAlign: 'center' }}>
                    Loading analytics data...
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Analytics"
            subtitle="A Lo Cubano Boulder Fest - Performance Analytics"
            currentPage="analytics"
        >
            {/* Time Range Selector */}
            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '24px',
                    justifyContent: 'flex-end',
                }}
            >
                {timeRanges.map((range) => (
                    <AdminButton
                        key={range.value}
                        size="sm"
                        variant={timeRange === range.value ? 'primary' : 'default'}
                        onClick={() => setTimeRange(range.value)}
                    >
                        {range.label}
                    </AdminButton>
                ))}
            </div>

            {/* Stats Grid */}
            <div className="admin-grid auto-fit admin-mb-xl">
                <AdminStatsCard
                    icon="💰"
                    title="Total Revenue"
                    value={formatCurrency(stats?.totalRevenue || 0)}
                    trend={stats?.revenueTrend > 0 ? 'up' : stats?.revenueTrend < 0 ? 'down' : 'neutral'}
                    trendValue={stats?.revenueTrend ? `${Math.abs(stats.revenueTrend)}%` : undefined}
                />
                <AdminStatsCard
                    icon="🎫"
                    title="Tickets Sold"
                    value={stats?.ticketsSold || 0}
                    subtitle={`${stats?.conversionRate || 0}% conversion`}
                />
                <AdminStatsCard
                    icon="📧"
                    title="Unique Attendees"
                    value={stats?.uniqueAttendees || 0}
                    subtitle="Registered emails"
                />
                <AdminStatsCard
                    icon="💝"
                    title="Donations"
                    value={formatCurrency(stats?.totalDonations || 0)}
                    subtitle={`${stats?.donationCount || 0} donors`}
                />
            </div>

            {/* Charts Section */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                    gap: '24px',
                    marginBottom: '24px',
                }}
            >
                {/* Revenue by Ticket Type */}
                <AdminCard title="Revenue by Ticket Type">
                    <SimpleBarChart
                        data={revenueByType.map((item) => ({
                            label: item.name || item.ticket_type || 'Unknown',
                            value: item.revenue || item.amount || 0,
                        }))}
                        valueFormatter={formatCurrency}
                    />
                </AdminCard>

                {/* Sales Over Time */}
                <AdminCard title="Sales Over Time">
                    <SimpleBarChart
                        data={salesOverTime.map((item) => ({
                            label: item.date || item.period || 'Unknown',
                            value: item.count || item.sales || 0,
                        }))}
                        valueFormatter={(v) => `${v} tickets`}
                    />
                </AdminCard>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
                <AdminCard title="Insights & Recommendations" titleIcon="💡">
                    {recommendations.map((rec, index) => (
                        <RecommendationItem
                            key={index}
                            type={rec.type || 'info'}
                            title={rec.title}
                            text={rec.text || rec.description}
                        />
                    ))}
                </AdminCard>
            )}

            {/* Additional Metrics */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '16px',
                    marginTop: '24px',
                }}
            >
                <AdminCard>
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                            {stats?.avgOrderValue ? formatCurrency(stats.avgOrderValue) : '$0.00'}
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            Average Order Value
                        </div>
                    </div>
                </AdminCard>
                <AdminCard>
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                            {stats?.checkInRate || 0}%
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            Check-in Rate
                        </div>
                    </div>
                </AdminCard>
                <AdminCard>
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                            {stats?.returningCustomers || 0}%
                        </div>
                        <div style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            Returning Customers
                        </div>
                    </div>
                </AdminCard>
            </div>
        </AdminLayout>
    );
}

/**
 * AnalyticsPage - Admin analytics page with providers
 */
export default function AnalyticsPage() {
    return (
        <AdminProviders>
            <AnalyticsPageContent />
        </AdminProviders>
    );
}
