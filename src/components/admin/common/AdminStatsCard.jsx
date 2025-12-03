/**
 * AdminStatsCard Component
 *
 * Statistics card for dashboard displays.
 */

import React from 'react';

/**
 * AdminStatsCard - Statistics display card
 *
 * @param {Object} props
 * @param {string} props.title - Stat title
 * @param {string|number} props.value - Stat value
 * @param {string} [props.icon] - Icon emoji
 * @param {string} [props.trend] - Trend direction ('up', 'down', 'neutral')
 * @param {string} [props.trendValue] - Trend value (e.g., '+5%')
 * @param {string} [props.subtitle] - Additional context
 * @param {boolean} [props.loading] - Loading state
 * @param {string} [props.className] - Additional CSS classes
 */
export default function AdminStatsCard({
    title,
    value,
    icon,
    trend,
    trendValue,
    subtitle,
    loading = false,
    className = '',
}) {
    const getTrendColor = () => {
        switch (trend) {
            case 'up':
                return 'var(--color-success, #10b981)';
            case 'down':
                return 'var(--color-danger, #e11d48)';
            default:
                return 'var(--color-text-secondary)';
        }
    };

    const getTrendIcon = () => {
        switch (trend) {
            case 'up':
                return '↑';
            case 'down':
                return '↓';
            default:
                return '→';
        }
    };

    if (loading) {
        return (
            <div className={`admin-stats-card ${className}`}>
                <div className="admin-stats-card-loading">
                    <div className="admin-skeleton" style={{ height: '24px', width: '60%' }} />
                    <div className="admin-skeleton" style={{ height: '32px', width: '80%', marginTop: '8px' }} />
                </div>
            </div>
        );
    }

    return (
        <div className={`admin-stats-card ${className}`}>
            <div className="admin-stats-card-header">
                {icon && <span className="admin-stats-card-icon">{icon}</span>}
                <span className="admin-stats-card-title">{title}</span>
            </div>
            <div className="admin-stats-card-value">{value}</div>
            {(trendValue || subtitle) && (
                <div className="admin-stats-card-footer">
                    {trendValue && (
                        <span
                            className="admin-stats-card-trend"
                            style={{ color: getTrendColor() }}
                        >
                            {getTrendIcon()} {trendValue}
                        </span>
                    )}
                    {subtitle && (
                        <span className="admin-stats-card-subtitle">{subtitle}</span>
                    )}
                </div>
            )}
        </div>
    );
}
