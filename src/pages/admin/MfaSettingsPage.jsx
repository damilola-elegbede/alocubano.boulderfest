/**
 * Admin MFA Settings Page
 *
 * Multi-Factor Authentication setup and management.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdminProviders } from '../../providers/AdminProviders.jsx';
import { useAdminAuth } from '../../hooks/admin/useAdminAuth.js';
import { useAdminApi } from '../../hooks/admin/useAdminApi.js';
import { AdminLayout } from '../../components/admin/layout/index.js';
import {
    AdminCard,
    AdminButton,
    AdminBadge,
    AdminStatsCard,
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
 * MFA Status Banner
 */
function MfaStatusBanner({ isEnabled, enabledAt, backupCodesCount, recentAttempts, deviceName }) {
    const statusClass = isEnabled ? 'success' : 'error';
    const statusIcon = isEnabled ? '✅' : '❌';
    const statusTitle = isEnabled ? 'MFA is Enabled' : 'MFA is Disabled';

    let statusDesc = 'Your account is not protected by multi-factor authentication';
    if (isEnabled && enabledAt) {
        const date = new Date(enabledAt).toLocaleDateString('en-US', { timeZone: 'America/Denver' });
        statusDesc = `Enabled on ${date}`;
    }

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-lg)',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${isEnabled ? 'var(--color-success)' : 'var(--color-danger)'}`,
                background: isEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(204, 41, 54, 0.1)',
                marginBottom: 'var(--space-lg)',
            }}
        >
            <span style={{ fontSize: '1.5em' }}>{statusIcon}</span>
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        fontWeight: 700,
                        fontSize: '1.1em',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '4px',
                    }}
                >
                    {statusTitle}
                </div>
                <div style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)' }}>
                    {statusDesc}
                </div>
            </div>
        </div>
    );
}

/**
 * MFA Stats Grid - shown when MFA is enabled
 */
function MfaStatsGrid({ backupCodesCount, recentAttempts, deviceName }) {
    return (
        <div className="admin-grid auto-fit admin-mb-xl">
            <AdminStatsCard
                icon="🔑"
                title="Backup Codes"
                value={backupCodesCount || 0}
                subtitle="Available"
            />
            <AdminStatsCard
                icon="✓"
                title="Successful Attempts"
                value={recentAttempts?.successful || 0}
                subtitle="Last 24 hours"
            />
            <AdminStatsCard
                icon="🔄"
                title="Total Attempts"
                value={recentAttempts?.total || 0}
                subtitle="Last 24 hours"
            />
            <AdminStatsCard
                icon="📱"
                title="Authenticator"
                value={escapeHtml(deviceName || 'Unknown')}
                subtitle="Device"
            />
        </div>
    );
}

/**
 * Backup Codes Display
 */
function BackupCodesDisplay({ codes, onDownload, onContinue }) {
    return (
        <AdminCard title="Save Your Backup Codes" titleIcon="4">
            <div
                className="admin-alert warning"
                style={{ marginBottom: 'var(--space-lg)' }}
            >
                <strong>Important:</strong> Save these backup codes in a safe place.
                They are the only way to recover access if you lose your authenticator device.
                Each code can only be used once.
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 'var(--space-md)',
                    marginBottom: 'var(--space-xl)',
                }}
            >
                {codes.map((code, index) => (
                    <div
                        key={index}
                        style={{
                            background: 'var(--color-background-secondary)',
                            padding: 'var(--space-lg)',
                            textAlign: 'center',
                            borderRadius: 'var(--radius-md)',
                            fontFamily: 'var(--font-code)',
                            fontSize: '0.9em',
                            border: '1px solid var(--color-border)',
                            fontWeight: 600,
                        }}
                    >
                        {escapeHtml(code)}
                    </div>
                ))}
            </div>
            <div className="admin-flex admin-gap-md">
                <AdminButton variant="primary" onClick={() => onDownload(codes)}>
                    Download Codes
                </AdminButton>
                <AdminButton variant="success" onClick={onContinue}>
                    Continue
                </AdminButton>
            </div>
        </AdminCard>
    );
}

/**
 * MFA Setup Flow
 */
function MfaSetupFlow({ setupData, onVerify, onCancel, verifying }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    const handleVerify = async () => {
        if (!/^\d{6}$/.test(code)) {
            setError('Please enter a valid 6-digit code from your authenticator app.');
            return;
        }
        setError('');
        onVerify(code);
    };

    return (
        <div>
            {/* Step 1 */}
            <AdminCard title="Install Authenticator App" titleIcon="1" className="admin-mb-lg">
                <p>Install an authenticator app on your phone:</p>
                <ul style={{ margin: '10px 0 0 20px' }}>
                    <li><strong>Google Authenticator</strong> (iOS/Android)</li>
                    <li><strong>Authy</strong> (iOS/Android/Desktop)</li>
                    <li><strong>Microsoft Authenticator</strong> (iOS/Android)</li>
                    <li><strong>1Password</strong> (Premium feature)</li>
                </ul>
            </AdminCard>

            {/* Step 2 */}
            <AdminCard title="Scan QR Code" titleIcon="2" className="admin-mb-lg">
                <p>Open your authenticator app and scan this QR code:</p>
                <div style={{ textAlign: 'center', margin: 'var(--space-xl) 0' }}>
                    <img
                        src={setupData.qrCodeUrl}
                        alt="MFA QR Code"
                        style={{
                            maxWidth: '200px',
                            border: '2px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: 'var(--shadow-md)',
                        }}
                    />
                </div>
                <p><strong>Can't scan?</strong> Enter this key manually:</p>
                <div
                    style={{
                        background: 'var(--color-background-secondary)',
                        padding: 'var(--space-lg)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'var(--font-code)',
                        fontSize: '0.9em',
                        wordBreak: 'break-all',
                        border: '1px solid var(--color-border)',
                    }}
                >
                    {escapeHtml(setupData.manualEntryKey)}
                </div>
            </AdminCard>

            {/* Step 3 */}
            <AdminCard title="Verify Setup" titleIcon="3">
                <p>Enter the 6-digit code from your authenticator app:</p>
                <div
                    style={{
                        display: 'flex',
                        gap: 'var(--space-md)',
                        margin: 'var(--space-xl) 0',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength="6"
                        className="admin-form-input"
                        style={{
                            width: '140px',
                            textAlign: 'center',
                            letterSpacing: '0.2em',
                            fontSize: '1.2em',
                            fontFamily: 'var(--font-code)',
                        }}
                        autoComplete="off"
                        autoFocus
                    />
                    <AdminButton
                        variant="success"
                        onClick={handleVerify}
                        disabled={verifying}
                    >
                        {verifying ? 'Verifying...' : 'Verify & Enable'}
                    </AdminButton>
                    <AdminButton variant="default" onClick={onCancel}>
                        Cancel
                    </AdminButton>
                </div>
                {error && (
                    <div className="admin-alert error">{error}</div>
                )}
            </AdminCard>
        </div>
    );
}

/**
 * MfaSettingsPageContent - Main content
 */
function MfaSettingsPageContent() {
    const { isAuthenticated } = useAdminAuth();
    const { get, post } = useAdminApi();

    // State
    const [mfaStatus, setMfaStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [setupMode, setSetupMode] = useState(false);
    const [setupData, setSetupData] = useState(null);
    const [backupCodes, setBackupCodes] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [message, setMessage] = useState(null);

    /**
     * Load MFA status
     */
    const loadMfaStatus = useCallback(async () => {
        if (!isAuthenticated) return;

        setLoading(true);
        try {
            const data = await get('/api/admin/mfa-setup');
            setMfaStatus(data);
        } catch (error) {
            console.error('Failed to load MFA status:', error);
            setMessage({ type: 'error', text: `Failed to load MFA status: ${error.message}` });
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, get]);

    /**
     * Initial load
     */
    useEffect(() => {
        if (isAuthenticated) {
            loadMfaStatus();
        }
    }, [isAuthenticated, loadMfaStatus]);

    /**
     * Start MFA setup
     */
    const startMfaSetup = async () => {
        try {
            const data = await post('/api/admin/mfa-setup?action=generate-secret', {
                deviceName: 'Admin Authenticator',
            });
            setSetupData(data);
            setSetupMode(true);
            setMessage(null);
        } catch (error) {
            console.error('Failed to generate MFA secret:', error);
            setMessage({ type: 'error', text: `Failed to generate MFA secret: ${error.message}` });
        }
    };

    /**
     * Verify MFA setup
     */
    const verifyMfaSetup = async (code) => {
        setVerifying(true);
        try {
            const result = await post('/api/admin/mfa-setup?action=verify-setup', {
                token: code,
                deviceName: 'Admin Authenticator',
            });
            setBackupCodes(result.backupCodes);
            setSetupMode(false);
            setSetupData(null);
            setMessage({ type: 'success', text: 'MFA successfully enabled!' });
            // Refresh status after a moment
            setTimeout(loadMfaStatus, 2000);
        } catch (error) {
            console.error('MFA verification failed:', error);
            setMessage({ type: 'error', text: `Verification failed: ${error.message}` });
        } finally {
            setVerifying(false);
        }
    };

    /**
     * Generate new backup codes
     */
    const generateBackupCodes = async () => {
        if (!confirm('This will invalidate all existing backup codes. Continue?')) {
            return;
        }

        try {
            const result = await post('/api/admin/mfa-setup?action=generate-backup-codes', {});
            setBackupCodes(result.backupCodes);
            setMessage({ type: 'success', text: 'New backup codes generated!' });
        } catch (error) {
            console.error('Failed to generate backup codes:', error);
            setMessage({ type: 'error', text: `Failed to generate backup codes: ${error.message}` });
        }
    };

    /**
     * Disable MFA
     */
    const disableMfa = async () => {
        const code = prompt('Enter your current TOTP code or backup code to disable MFA:');
        if (!code) return;

        try {
            await post('/api/admin/mfa-setup?action=disable', {
                confirmationCode: code,
            });
            setMessage({ type: 'success', text: 'MFA has been disabled.' });
            loadMfaStatus();
        } catch (error) {
            console.error('Failed to disable MFA:', error);
            setMessage({ type: 'error', text: `Failed to disable MFA: ${error.message}` });
        }
    };

    /**
     * Download backup codes
     */
    const downloadBackupCodes = (codes) => {
        const content = `A Lo Cubano Boulder Fest - Admin MFA Backup Codes
Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })} (Mountain Time)

IMPORTANT: Store these codes safely. Each can only be used once.

${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Instructions:
- Use these codes if you lose access to your authenticator app
- Enter any unused code when prompted for MFA
- Generate new codes after using several of them
`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mfa-backup-codes-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Header actions
    const headerActions = (
        <AdminButton onClick={() => window.location.href = '/admin/dashboard'}>
            Dashboard
        </AdminButton>
    );

    if (loading) {
        return (
            <AdminLayout
                title="MFA Security Settings"
                subtitle="Multi-Factor Authentication Configuration"
                currentPage="mfa-settings"
                headerActions={headerActions}
            >
                <div className="admin-loading" style={{ padding: '60px', textAlign: 'center' }}>
                    Loading MFA status...
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="MFA Security Settings"
            subtitle="Multi-Factor Authentication Configuration"
            currentPage="mfa-settings"
            headerActions={headerActions}
        >
            {/* Status Message */}
            {message && (
                <div className={`admin-alert ${message.type} admin-mb-lg`}>
                    {message.text}
                </div>
            )}

            {/* Backup Codes Display (after setup or generation) */}
            {backupCodes && (
                <BackupCodesDisplay
                    codes={backupCodes}
                    onDownload={downloadBackupCodes}
                    onContinue={() => {
                        setBackupCodes(null);
                        loadMfaStatus();
                    }}
                />
            )}

            {/* Setup Flow */}
            {setupMode && setupData && !backupCodes && (
                <MfaSetupFlow
                    setupData={setupData}
                    onVerify={verifyMfaSetup}
                    onCancel={() => {
                        setSetupMode(false);
                        setSetupData(null);
                    }}
                    verifying={verifying}
                />
            )}

            {/* Normal View (when not in setup mode and no backup codes shown) */}
            {!setupMode && !backupCodes && mfaStatus && (
                <>
                    {/* MFA Status Card */}
                    <AdminCard title="Multi-Factor Authentication Status" className="admin-mb-xl">
                        <MfaStatusBanner
                            isEnabled={mfaStatus.isEnabled}
                            enabledAt={mfaStatus.enabledAt}
                            backupCodesCount={mfaStatus.backupCodesCount}
                            recentAttempts={mfaStatus.recentAttempts}
                            deviceName={mfaStatus.deviceName}
                        />
                        {mfaStatus.isEnabled && (
                            <MfaStatsGrid
                                backupCodesCount={mfaStatus.backupCodesCount}
                                recentAttempts={mfaStatus.recentAttempts}
                                deviceName={mfaStatus.deviceName}
                            />
                        )}
                    </AdminCard>

                    {/* Setup/Management Card */}
                    <AdminCard title="Setup Multi-Factor Authentication" className="admin-mb-xl">
                        {mfaStatus.isEnabled ? (
                            <>
                                <div className="admin-alert success admin-mb-lg">
                                    <strong>MFA is already enabled</strong><br />
                                    Your account is protected with multi-factor authentication.
                                </div>
                                <div className="admin-flex admin-gap-md admin-flex-wrap">
                                    <AdminButton variant="primary" onClick={generateBackupCodes}>
                                        Generate New Backup Codes
                                    </AdminButton>
                                    <AdminButton variant="danger" onClick={disableMfa}>
                                        Disable MFA
                                    </AdminButton>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="admin-alert warning admin-mb-lg">
                                    <strong>Your account is not protected</strong><br />
                                    Enable multi-factor authentication to secure your admin account.
                                </div>
                                <AdminButton variant="success" onClick={startMfaSetup}>
                                    Enable MFA
                                </AdminButton>
                            </>
                        )}
                    </AdminCard>

                    {/* Recovery Options */}
                    <AdminCard title="Recovery Options">
                        {mfaStatus.isEnabled ? (
                            <>
                                <div className="admin-alert warning admin-mb-lg">
                                    <strong>Important:</strong> Store your backup codes in a safe place.
                                    They are your only way to recover access if you lose your authenticator device.
                                </div>
                                <div className="admin-grid auto-fit admin-mb-lg">
                                    <AdminStatsCard
                                        icon="🔑"
                                        title="Backup Codes"
                                        value={mfaStatus.backupCodesCount || 0}
                                        subtitle="Available"
                                    />
                                </div>
                                <div className="admin-flex admin-gap-md admin-flex-wrap">
                                    <AdminButton variant="primary" onClick={generateBackupCodes}>
                                        Generate New Backup Codes
                                    </AdminButton>
                                </div>
                            </>
                        ) : (
                            <div className="admin-alert warning">
                                MFA must be enabled before recovery options are available.
                            </div>
                        )}
                    </AdminCard>
                </>
            )}
        </AdminLayout>
    );
}

/**
 * MfaSettingsPage - Admin MFA settings page with providers
 */
export default function MfaSettingsPage() {
    return (
        <AdminProviders>
            <MfaSettingsPageContent />
        </AdminProviders>
    );
}
