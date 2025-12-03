/**
 * Check-in Scanner Page (PWA)
 *
 * QR code scanner for event check-in with:
 * - Camera-based QR scanning using html5-qrcode
 * - Session statistics with localStorage persistence
 * - Offline support with service worker
 * - Recent activity feed
 * - Manual ticket entry fallback
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';

// Storage keys
const STATS_STORAGE_KEY = 'scanner_stats_v2';
const SESSION_SCAN_LOG_IDS_KEY = 'session_scan_log_ids_v1';
const STATS_SESSION_HOURS = 8;
const MAX_SESSION_SCAN_LOGS = 900;
const MAX_RECENT_SCANS = 10;

/**
 * HTML escape function to prevent XSS
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
 * Device detection utility
 */
function getDeviceInfo() {
    const userAgent = navigator.userAgent;
    return {
        isIOS: /iPad|iPhone|iPod/.test(userAgent),
        isAndroid: /Android/.test(userAgent),
        isSafari: /^((?!chrome|android).)*safari/i.test(userAgent),
        isChrome: /Chrome/.test(userAgent) && !/Edge|OPR/.test(userAgent),
        isPWA: window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true,
    };
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return 'today';
}

/**
 * Stats Bar Component
 */
function StatsBar({ stats, onStatClick }) {
    const statItems = [
        { key: 'session', label: 'Session', value: stats.session },
        { key: 'today', label: 'Today', value: stats.todayBaseline + stats.todayIncrement },
        { key: 'total', label: 'Total', value: stats.totalBaseline + stats.session },
        { key: 'valid', label: 'Valid', value: stats.validBaseline + stats.sessionValidIncrement },
        { key: 'failed', label: 'Failed', value: stats.failedBaseline + stats.sessionFailedIncrement },
    ];

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 'var(--space-sm)',
                padding: 'var(--space-md)',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 'var(--space-lg)',
            }}
        >
            {statItems.map((item) => (
                <button
                    key={item.key}
                    onClick={() => onStatClick(item.key)}
                    style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-sm)',
                        cursor: 'pointer',
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            fontSize: 'var(--font-size-xl)',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                        }}
                    >
                        {item.value}
                    </div>
                    <div
                        style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                        }}
                    >
                        {item.label}
                    </div>
                </button>
            ))}
        </div>
    );
}

/**
 * Recent Activity Feed Component
 */
function ActivityFeed({ scans }) {
    if (scans.length === 0) {
        return (
            <div
                style={{
                    padding: 'var(--space-xl)',
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                }}
            >
                Waiting for scans...
            </div>
        );
    }

    return (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {scans.map((scan, index) => {
                const timeAgo = formatTimeAgo(scan.timestamp);
                const icon =
                    scan.type === 'success'
                        ? scan.isTestTicket
                            ? '🧪'
                            : '✅'
                        : scan.type === 'error'
                            ? '❌'
                            : '📥';

                const detailsLines = scan.details.split('\n');
                const attendeeName = detailsLines[0] || scan.details;
                const ticketType = detailsLines.length > 1 ? detailsLines[1] : '';

                return (
                    <div
                        key={`${scan.timestamp}-${index}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            padding: 'var(--space-md)',
                            borderBottom: '1px solid var(--color-border)',
                            background:
                                scan.type === 'success'
                                    ? 'rgba(16, 185, 129, 0.05)'
                                    : scan.type === 'error'
                                        ? 'rgba(239, 68, 68, 0.05)'
                                        : 'transparent',
                        }}
                    >
                        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {escapeHtml(attendeeName)}
                            </div>
                            {ticketType && (
                                <div
                                    style={{
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-text-secondary)',
                                    }}
                                >
                                    {escapeHtml(ticketType)}
                                </div>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-tertiary)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {timeAgo}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Result Modal Component
 */
function ResultModal({ isOpen, result, onClose, countdown }) {
    if (!isOpen || !result) return null;

    const isSuccess = result.type === 'success';
    const isError = result.type === 'error';
    const isQueued = result.type === 'queued';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 'var(--space-lg)',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: isSuccess
                        ? 'linear-gradient(135deg, #059669, #10b981)'
                        : isError
                            ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                            : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-2xl)',
                    maxWidth: '400px',
                    width: '100%',
                    textAlign: 'center',
                    color: '#fff',
                }}
            >
                <div style={{ fontSize: '4rem', marginBottom: 'var(--space-lg)' }}>
                    {isSuccess ? '✅' : isError ? '❌' : '📥'}
                </div>
                <h2
                    style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 700,
                        marginBottom: 'var(--space-md)',
                    }}
                >
                    {result.title}
                </h2>
                <p
                    style={{
                        fontSize: 'var(--font-size-lg)',
                        opacity: 0.9,
                        marginBottom: 'var(--space-xl)',
                        whiteSpace: 'pre-line',
                    }}
                >
                    {result.details}
                </p>
                {countdown > 0 && (
                    <div
                        style={{
                            fontSize: 'var(--font-size-sm)',
                            opacity: 0.7,
                            marginBottom: 'var(--space-lg)',
                        }}
                    >
                        Returning to scanner in {countdown}s
                    </div>
                )}
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-md) var(--space-xl)',
                        color: '#fff',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                    }}
                >
                    Continue Scanning
                </button>
            </div>
        </div>
    );
}

/**
 * Manual Input Modal Component
 */
function ManualInputModal({ isOpen, onClose, onSubmit }) {
    const [ticketId, setTicketId] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (ticketId.trim()) {
            onSubmit(ticketId.trim());
            setTicketId('');
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999,
                }}
                onClick={onClose}
            />
            <div
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
                    padding: 'var(--space-xl)',
                    zIndex: 1000,
                }}
            >
                <h3
                    style={{
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 700,
                        marginBottom: 'var(--space-lg)',
                        color: 'var(--color-text-primary)',
                    }}
                >
                    Manual Ticket Entry
                </h3>
                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={ticketId}
                        onChange={(e) => setTicketId(e.target.value)}
                        placeholder="Enter ticket ID..."
                        style={{
                            width: '100%',
                            padding: 'var(--space-md)',
                            border: '2px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-lg)',
                            marginBottom: 'var(--space-md)',
                            background: 'var(--color-background-secondary)',
                            color: 'var(--color-text-primary)',
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: 'var(--space-md)',
                            background: 'var(--color-blue)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-lg)',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Check In
                    </button>
                </form>
            </div>
        </>
    );
}

/**
 * Fullscreen Scanner Modal Component
 */
function FullscreenScannerModal({ isOpen, onClose, onScan, deviceInfo }) {
    const readerRef = useRef(null);
    const scannerRef = useRef(null);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;

        let scanner = null;

        const initScanner = async () => {
            if (!window.Html5Qrcode) {
                setError('QR scanner library not loaded');
                return;
            }

            try {
                scanner = new window.Html5Qrcode('fullscreen-reader');
                scannerRef.current = scanner;

                const config = {
                    fps: deviceInfo.isIOS ? 20 : 30,
                    formatsToSupport:
                        typeof window.Html5QrcodeSupportedFormats !== 'undefined'
                            ? [window.Html5QrcodeSupportedFormats.QR_CODE]
                            : undefined,
                    useBarCodeDetectorIfSupported: true,
                };

                await scanner.start(
                    { facingMode: 'environment' },
                    config,
                    (decodedText) => {
                        // Extract token from QR URL
                        let token = decodedText;
                        if (decodedText.includes('#')) {
                            const hashIndex = decodedText.indexOf('#');
                            token = decodedText.substring(hashIndex + 1);
                        }

                        // Haptic feedback
                        if (navigator.vibrate) {
                            navigator.vibrate(200);
                        }

                        onScan(token);
                    },
                    () => {
                        // Ignore scan failures
                    }
                );

                setIsScanning(true);
                setError(null);
            } catch (err) {
                console.error('Scanner init error:', err);
                setError(
                    err.name === 'NotAllowedError'
                        ? 'Camera permission denied. Please allow camera access.'
                        : `Camera error: ${err.message}`
                );
            }
        };

        initScanner();

        return () => {
            if (scanner) {
                scanner
                    .stop()
                    .then(() => scanner.clear())
                    .catch(console.error);
            }
        };
    }, [isOpen, deviceInfo.isIOS, onScan]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: '#000',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'rgba(0, 0, 0, 0.8)',
                }}
            >
                <span style={{ color: '#fff', fontWeight: 600 }}>Scan Ticket QR Code</span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        padding: 'var(--space-sm)',
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Scanner Area */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                {error ? (
                    <div
                        style={{
                            color: '#fff',
                            textAlign: 'center',
                            padding: 'var(--space-xl)',
                        }}
                    >
                        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-lg)' }}>📷</div>
                        <p>{error}</p>
                        <button
                            onClick={onClose}
                            style={{
                                marginTop: 'var(--space-lg)',
                                padding: 'var(--space-md) var(--space-xl)',
                                background: 'var(--color-blue)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                            }}
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <div
                        id="fullscreen-reader"
                        ref={readerRef}
                        style={{
                            width: '100%',
                            maxWidth: '500px',
                            aspectRatio: '1',
                        }}
                    />
                )}
            </div>

            {/* Instructions */}
            <div
                style={{
                    padding: 'var(--space-lg)',
                    background: 'rgba(0, 0, 0, 0.8)',
                    textAlign: 'center',
                    color: '#fff',
                }}
            >
                Position the QR code within the frame
            </div>
        </div>
    );
}

/**
 * Tickets Overlay Modal Component
 */
function TicketsOverlay({ isOpen, onClose, filter, tickets, loading, error, pagination, onPageChange }) {
    if (!isOpen) return null;

    const titles = {
        today: "Today's Check-Ins",
        session: 'Session Check-Ins',
        total: 'All Checked-In Tickets',
        valid: 'Valid Scans',
        failed: 'Failed Scans',
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 'var(--space-lg)',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-xl)',
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 'var(--space-lg)',
                        borderBottom: '1px solid var(--color-border)',
                    }}
                >
                    <h3
                        style={{
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                            margin: 0,
                        }}
                    >
                        {titles[filter] || 'Checked-In Tickets'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-md)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                            <div className="loading-spinner" />
                            <p style={{ color: 'var(--color-text-secondary)' }}>Loading tickets...</p>
                        </div>
                    ) : error ? (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 'var(--space-xl)',
                                color: 'var(--color-error)',
                            }}
                        >
                            {error}
                        </div>
                    ) : tickets.length === 0 ? (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 'var(--space-xl)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            No tickets found for this filter.
                        </div>
                    ) : (
                        <table
                            style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: 'var(--font-size-sm)',
                            }}
                        >
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: 'var(--space-sm)',
                                            borderBottom: '2px solid var(--color-border)',
                                            color: 'var(--color-text-secondary)',
                                        }}
                                    >
                                        Ticket ID
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: 'var(--space-sm)',
                                            borderBottom: '2px solid var(--color-border)',
                                            color: 'var(--color-text-secondary)',
                                        }}
                                    >
                                        Name
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: 'var(--space-sm)',
                                            borderBottom: '2px solid var(--color-border)',
                                            color: 'var(--color-text-secondary)',
                                        }}
                                    >
                                        Scan Time
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((ticket, index) => (
                                    <tr key={ticket.ticket_id || index}>
                                        <td
                                            style={{
                                                padding: 'var(--space-sm)',
                                                borderBottom: '1px solid var(--color-border)',
                                            }}
                                        >
                                            <a
                                                href={`/admin/ticket-detail?ticketId=${encodeURIComponent(ticket.ticket_id)}`}
                                                style={{ color: 'var(--color-blue)' }}
                                            >
                                                {escapeHtml(ticket.ticket_id)}
                                            </a>
                                        </td>
                                        <td
                                            style={{
                                                padding: 'var(--space-sm)',
                                                borderBottom: '1px solid var(--color-border)',
                                                color: 'var(--color-text-primary)',
                                            }}
                                        >
                                            {escapeHtml(ticket.first_name || '')} {escapeHtml(ticket.last_name || '')}
                                        </td>
                                        <td
                                            style={{
                                                padding: 'var(--space-sm)',
                                                borderBottom: '1px solid var(--color-border)',
                                                color: 'var(--color-text-secondary)',
                                            }}
                                        >
                                            {escapeHtml(ticket.scan_time_mt || ticket.scan_time || '')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 'var(--space-md)',
                            padding: 'var(--space-md)',
                            borderTop: '1px solid var(--color-border)',
                        }}
                    >
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={!pagination.hasPrev}
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: pagination.hasPrev ? 'var(--color-blue)' : 'var(--color-border)',
                                color: pagination.hasPrev ? '#fff' : 'var(--color-text-tertiary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                            }}
                        >
                            Previous
                        </button>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={!pagination.hasNext}
                            style={{
                                padding: 'var(--space-sm) var(--space-md)',
                                background: pagination.hasNext ? 'var(--color-blue)' : 'var(--color-border)',
                                color: pagination.hasNext ? '#fff' : 'var(--color-text-tertiary)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
                            }}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * CheckinPageContent - Main content
 */
function CheckinPageContent() {
    const { isAuthenticated, csrfToken } = useAdminAuth();
    const { get, post } = useAdminApi();

    const [deviceInfo] = useState(() => getDeviceInfo());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [recentScans, setRecentScans] = useState([]);
    const [sessionScanLogIds, setSessionScanLogIds] = useState([]);

    // Stats state
    const [stats, setStats] = useState({
        todayBaseline: 0,
        totalBaseline: 0,
        validBaseline: 0,
        failedBaseline: 0,
        todayIncrement: 0,
        session: 0,
        sessionValidIncrement: 0,
        sessionFailedIncrement: 0,
        queued: 0,
        sessionStart: Date.now(),
    });

    // UI state
    const [showScanner, setShowScanner] = useState(false);
    const [showManualInput, setShowManualInput] = useState(false);
    const [resultModal, setResultModal] = useState({ isOpen: false, result: null });
    const [countdown, setCountdown] = useState(0);
    const countdownRef = useRef(null);

    // Tickets overlay state
    const [ticketsOverlay, setTicketsOverlay] = useState({
        isOpen: false,
        filter: 'total',
        tickets: [],
        loading: false,
        error: null,
        pagination: null,
    });

    /**
     * Restore session stats from localStorage
     */
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STATS_STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                const age = (Date.now() - data.sessionStart) / (1000 * 60 * 60);

                if (age <= STATS_SESSION_HOURS) {
                    setStats((prev) => ({
                        ...prev,
                        todayIncrement: data.todayIncrement || 0,
                        session: data.session || 0,
                        sessionValidIncrement: data.sessionValidIncrement || 0,
                        sessionFailedIncrement: data.sessionFailedIncrement || 0,
                        queued: data.queued || 0,
                        sessionStart: data.sessionStart,
                    }));
                }
            }

            // Restore scan log IDs
            const scanLogStored = localStorage.getItem(SESSION_SCAN_LOG_IDS_KEY);
            if (scanLogStored) {
                const scanLogData = JSON.parse(scanLogStored);
                const age = (Date.now() - scanLogData.sessionStart) / (1000 * 60 * 60);

                if (age <= STATS_SESSION_HOURS && Array.isArray(scanLogData.ids)) {
                    setSessionScanLogIds(scanLogData.ids);
                }
            }
        } catch (error) {
            console.error('Failed to restore session stats:', error);
        }
    }, []);

    /**
     * Persist stats to localStorage
     */
    useEffect(() => {
        try {
            localStorage.setItem(
                STATS_STORAGE_KEY,
                JSON.stringify({
                    todayIncrement: stats.todayIncrement,
                    session: stats.session,
                    sessionValidIncrement: stats.sessionValidIncrement,
                    sessionFailedIncrement: stats.sessionFailedIncrement,
                    queued: stats.queued,
                    sessionStart: stats.sessionStart,
                    lastActivity: Date.now(),
                })
            );
        } catch (error) {
            console.error('Failed to persist stats:', error);
        }
    }, [stats]);

    /**
     * Persist scan log IDs to localStorage
     */
    useEffect(() => {
        try {
            const idsToSave =
                sessionScanLogIds.length > MAX_SESSION_SCAN_LOGS
                    ? sessionScanLogIds.slice(-MAX_SESSION_SCAN_LOGS)
                    : sessionScanLogIds;

            localStorage.setItem(
                SESSION_SCAN_LOG_IDS_KEY,
                JSON.stringify({
                    ids: idsToSave,
                    sessionStart: stats.sessionStart,
                    lastActivity: Date.now(),
                })
            );
        } catch (error) {
            console.error('Failed to persist scan log IDs:', error);
        }
    }, [sessionScanLogIds, stats.sessionStart]);

    /**
     * Load stats from server
     */
    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await get('/api/admin/scanner-stats');
                if (data.stats) {
                    setStats((prev) => ({
                        ...prev,
                        todayBaseline: data.stats.today || 0,
                        totalBaseline: data.stats.total || 0,
                        validBaseline: data.stats.valid || 0,
                        failedBaseline: data.stats.failed || 0,
                    }));
                }
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        };

        loadStats();
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, [get]);

    /**
     * Load today's scans for activity feed
     */
    useEffect(() => {
        const loadTodaysScans = async () => {
            try {
                const data = await get('/api/admin/checked-in-tickets?filter=today&limit=10&page=1');
                if (data.tickets && Array.isArray(data.tickets)) {
                    setRecentScans(
                        data.tickets.map((ticket) => ({
                            timestamp: new Date(ticket.scan_time).getTime(),
                            type: 'success',
                            title: `${ticket.first_name || 'Unknown'} ${ticket.last_name || ''}`.trim(),
                            details: `${ticket.first_name || 'Unknown'} ${ticket.last_name || ''}\n${ticket.ticket_type || ''}`,
                            ticketId: ticket.ticket_id,
                            isTestTicket: false,
                        }))
                    );
                }
            } catch (error) {
                console.error('Failed to load today\'s scans:', error);
            }
        };

        loadTodaysScans();
    }, [get]);

    /**
     * Online status listener
     */
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    /**
     * Register service worker
     */
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/js/sw.js').catch(console.error);
        }
    }, []);

    /**
     * Countdown timer for result modal
     */
    useEffect(() => {
        if (resultModal.isOpen && countdown > 0) {
            countdownRef.current = setTimeout(() => {
                setCountdown((c) => c - 1);
            }, 1000);
        } else if (countdown === 0 && resultModal.isOpen) {
            setResultModal({ isOpen: false, result: null });
        }

        return () => {
            if (countdownRef.current) {
                clearTimeout(countdownRef.current);
            }
        };
    }, [countdown, resultModal.isOpen]);

    /**
     * Validate ticket
     */
    const validateTicket = useCallback(
        async (token) => {
            try {
                const isWalletToken = token.includes('.') && token.length > 100;

                const response = await fetch('/api/tickets/validate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
                    },
                    body: JSON.stringify({
                        token: token,
                        validatedBy: 'admin-scanner',
                        location: 'entrance',
                        wallet_source: isWalletToken ? 'jwt' : null,
                        qr_access_method: isWalletToken ? 'wallet' : 'qr_code',
                    }),
                    credentials: 'include',
                });

                // Handle rate limiting
                if (response.status === 429) {
                    setStats((prev) => ({
                        ...prev,
                        session: prev.session + 1,
                        todayIncrement: prev.todayIncrement + 1,
                        sessionFailedIncrement: prev.sessionFailedIncrement + 1,
                    }));

                    showResult('error', 'Rate Limit Reached', 'Too many scans. Please wait before scanning again.');
                    return;
                }

                // Handle scan limit exceeded
                if (response.status === 410) {
                    setStats((prev) => ({
                        ...prev,
                        session: prev.session + 1,
                        todayIncrement: prev.todayIncrement + 1,
                        sessionFailedIncrement: prev.sessionFailedIncrement + 1,
                    }));

                    showResult('error', 'Scan Limit Exceeded', 'This ticket has reached its maximum scan limit.');
                    return;
                }

                const data = await response.json();

                if (data.valid) {
                    // Success
                    setStats((prev) => ({
                        ...prev,
                        session: prev.session + 1,
                        todayIncrement: prev.todayIncrement + 1,
                        sessionValidIncrement: prev.sessionValidIncrement + 1,
                    }));

                    // Store scan log ID
                    if (data.scanLogId != null) {
                        setSessionScanLogIds((prev) => {
                            const newIds = [...prev, data.scanLogId];
                            return newIds.length > MAX_SESSION_SCAN_LOGS
                                ? newIds.slice(-MAX_SESSION_SCAN_LOGS)
                                : newIds;
                        });
                    }

                    const isTestTicket =
                        data.ticket?.is_test ||
                        data.ticket?.ticket_id?.startsWith('TEST-') ||
                        data.ticket?.attendeeName?.includes('Test');

                    const scanCount = data.validation?.scan_count ?? 0;
                    const maxScans = data.validation?.max_scan_count ?? 0;

                    const details = data.ticket
                        ? `${data.ticket.attendee}\n${data.ticket.type}\nScan ${scanCount}/${maxScans}`
                        : 'Check-in successful';

                    showResult('success', isTestTicket ? '🧪 Valid Test Ticket!' : 'Valid Ticket!', details);

                    // Add to activity feed
                    addToActivityFeed({
                        type: 'success',
                        title: 'Valid Ticket!',
                        details,
                        isTestTicket,
                        ticketId: data.ticket?.ticket_id,
                    });
                } else {
                    // Invalid
                    setStats((prev) => ({
                        ...prev,
                        session: prev.session + 1,
                        todayIncrement: prev.todayIncrement + 1,
                        sessionFailedIncrement: prev.sessionFailedIncrement + 1,
                    }));

                    showResult('error', 'Invalid Ticket', data.error || 'This ticket cannot be validated');

                    addToActivityFeed({
                        type: 'error',
                        title: 'Invalid Ticket',
                        details: data.error || 'This ticket cannot be validated',
                    });
                }
            } catch (error) {
                console.error('Validation error:', error);

                setStats((prev) => ({
                    ...prev,
                    queued: prev.queued + 1,
                }));

                showResult('queued', 'Queued for Sync', 'No connection - check-in saved');

                addToActivityFeed({
                    type: 'queued',
                    title: 'Queued',
                    details: 'Saved offline',
                });
            }
        },
        [csrfToken]
    );

    /**
     * Show result modal
     */
    const showResult = (type, title, details) => {
        setResultModal({
            isOpen: true,
            result: { type, title, details },
        });
        setCountdown(30);
        setShowScanner(false);
    };

    /**
     * Add to activity feed
     */
    const addToActivityFeed = useCallback((scanData) => {
        setRecentScans((prev) => {
            const newScans = [
                {
                    timestamp: Date.now(),
                    type: scanData.type,
                    title: scanData.title,
                    details: scanData.details,
                    isTestTicket: scanData.isTestTicket || false,
                    ticketId: scanData.ticketId || null,
                },
                ...prev,
            ];
            return newScans.slice(0, MAX_RECENT_SCANS);
        });
    }, []);

    /**
     * Handle stat click to show tickets overlay
     */
    const handleStatClick = useCallback(
        async (filter, page = 1) => {
            setTicketsOverlay((prev) => ({
                ...prev,
                isOpen: true,
                filter,
                loading: true,
                error: null,
                tickets: [],
            }));

            try {
                let data;
                const baseUrl = `/api/admin/checked-in-tickets?filter=${filter}&page=${page}&limit=50`;

                // Use POST for session filter with scan log IDs to avoid URL length limits
                if (filter === 'session' && sessionScanLogIds.length > 0) {
                    data = await post('/api/admin/checked-in-tickets', {
                        filter,
                        page,
                        limit: 50,
                        scanLogIds: sessionScanLogIds,
                    });
                } else {
                    data = await get(baseUrl);
                }

                setTicketsOverlay((prev) => ({
                    ...prev,
                    loading: false,
                    tickets: data.tickets || [],
                    pagination: data.pagination || null,
                }));
            } catch (error) {
                setTicketsOverlay((prev) => ({
                    ...prev,
                    loading: false,
                    error: 'Failed to load tickets',
                }));
            }
        },
        [get, sessionScanLogIds]
    );

    /**
     * Handle manual ticket submission
     */
    const handleManualSubmit = useCallback(
        async (ticketId) => {
            setShowManualInput(false);

            try {
                const data = await get(`/api/tickets?ticket_id=${encodeURIComponent(ticketId)}`);

                if (data.ticket && data.ticket.qr_token) {
                    await validateTicket(data.ticket.qr_token);
                } else {
                    showResult('error', 'Not Found', 'Ticket ID not found');
                }
            } catch (error) {
                showResult('error', 'Error', 'Failed to lookup ticket');
            }
        },
        [get, validateTicket]
    );

    /**
     * Handle scan from fullscreen scanner
     */
    const handleScan = useCallback(
        (token) => {
            setShowScanner(false);
            validateTicket(token);
        },
        [validateTicket]
    );

    /**
     * Clear session data
     */
    const handleClearSession = useCallback(() => {
        if (
            !window.confirm(
                'Clear Session Data?\n\n' +
                    'This will reset session scan count and clear scan log history.\n\n' +
                    'Database records will NOT be affected.\n\nContinue?'
            )
        ) {
            return;
        }

        setSessionScanLogIds([]);
        localStorage.removeItem(STATS_STORAGE_KEY);
        localStorage.removeItem(SESSION_SCAN_LOG_IDS_KEY);

        setStats((prev) => ({
            ...prev,
            session: 0,
            todayIncrement: 0,
            queued: 0,
            sessionValidIncrement: 0,
            sessionFailedIncrement: 0,
            sessionStart: Date.now(),
        }));

        alert('Session data cleared successfully!');
    }, []);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'var(--color-background)',
                padding: 'var(--space-lg)',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--space-lg)',
                }}
            >
                <div>
                    <h1
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--font-size-2xl)',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                            margin: 0,
                        }}
                    >
                        Check-in Scanner
                    </h1>
                    <p
                        style={{
                            color: 'var(--color-text-secondary)',
                            margin: 0,
                        }}
                    >
                        Scan tickets to check in attendees
                    </p>
                </div>
                <a
                    href="/admin"
                    style={{
                        color: 'var(--color-blue)',
                        textDecoration: 'none',
                    }}
                >
                    ← Back
                </a>
            </div>

            {/* Offline indicator */}
            {!isOnline && (
                <div
                    style={{
                        background: 'var(--color-warning)',
                        color: '#000',
                        padding: 'var(--space-sm) var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-lg)',
                        textAlign: 'center',
                        fontWeight: 600,
                    }}
                >
                    📴 Offline Mode - Scans will be queued
                </div>
            )}

            {/* Stats Bar */}
            <StatsBar stats={stats} onStatClick={handleStatClick} />

            {/* Control Buttons */}
            <div
                style={{
                    display: 'flex',
                    gap: 'var(--space-md)',
                    marginBottom: 'var(--space-xl)',
                }}
            >
                <button
                    onClick={() => setShowScanner(true)}
                    style={{
                        flex: 1,
                        padding: 'var(--space-lg)',
                        background: 'linear-gradient(135deg, var(--color-blue), var(--color-red))',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: 'var(--font-size-xl)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-sm)',
                    }}
                >
                    📷 Scan Ticket
                </button>
                <button
                    onClick={() => setShowManualInput(true)}
                    style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--color-surface)',
                        border: '2px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: 'var(--font-size-xl)',
                        cursor: 'pointer',
                    }}
                    title="Manual Entry"
                >
                    ⌨️
                </button>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--color-surface)',
                        border: '2px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: 'var(--font-size-xl)',
                        cursor: 'pointer',
                    }}
                    title="Refresh"
                >
                    🔄
                </button>
                <button
                    onClick={handleClearSession}
                    style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--color-warning)',
                        border: 'none',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: 'var(--font-size-xl)',
                        cursor: 'pointer',
                    }}
                    title="Clear Session Data"
                >
                    🗑️
                </button>
            </div>

            {/* Recent Activity */}
            <div
                style={{
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                }}
            >
                <h3
                    style={{
                        padding: 'var(--space-md) var(--space-lg)',
                        margin: 0,
                        borderBottom: '1px solid var(--color-border)',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                    }}
                >
                    Recent Scans
                </h3>
                <ActivityFeed scans={recentScans} />
            </div>

            {/* Modals */}
            <FullscreenScannerModal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={handleScan}
                deviceInfo={deviceInfo}
            />

            <ManualInputModal
                isOpen={showManualInput}
                onClose={() => setShowManualInput(false)}
                onSubmit={handleManualSubmit}
            />

            <ResultModal
                isOpen={resultModal.isOpen}
                result={resultModal.result}
                onClose={() => setResultModal({ isOpen: false, result: null })}
                countdown={countdown}
            />

            <TicketsOverlay
                isOpen={ticketsOverlay.isOpen}
                onClose={() => setTicketsOverlay((prev) => ({ ...prev, isOpen: false }))}
                filter={ticketsOverlay.filter}
                tickets={ticketsOverlay.tickets}
                loading={ticketsOverlay.loading}
                error={ticketsOverlay.error}
                pagination={ticketsOverlay.pagination}
                onPageChange={(page) => handleStatClick(ticketsOverlay.filter, page)}
            />
        </div>
    );
}

/**
 * CheckinPage - Check-in scanner with providers
 */
export default function CheckinPage() {
    return (
        <AdminProviders>
            <CheckinPageContent />
        </AdminProviders>
    );
}
