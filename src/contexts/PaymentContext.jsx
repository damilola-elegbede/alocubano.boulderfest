/**
 * PaymentContext - React context for payment state management
 *
 * Follows the CartContext bridge pattern to manage payment state
 * and provide payment operations to React components.
 *
 * Payment Methods: 'stripe', 'paypal'
 * Payment Status: 'idle', 'selecting', 'processing', 'redirecting', 'success', 'error'
 *
 * Usage:
 *   import { PaymentProvider } from './contexts/PaymentContext';
 *   import { usePayment } from './hooks/usePayment';
 *
 *   <PaymentProvider>
 *     <App />
 *   </PaymentProvider>
 *
 * @module src/contexts/PaymentContext
 */

import React, { createContext, useState, useCallback, useMemo } from 'react';

/**
 * Payment status enum-like constants
 */
export const PaymentStatus = {
    IDLE: 'idle',
    SELECTING: 'selecting',
    PROCESSING: 'processing',
    REDIRECTING: 'redirecting',
    SUCCESS: 'success',
    ERROR: 'error',
};

/**
 * Payment method constants
 */
export const PaymentMethod = {
    STRIPE: 'stripe',
    PAYPAL: 'paypal',
};

export const PaymentContext = createContext(null);

export function PaymentProvider({ children }) {
    // Core payment state
    const [paymentMethod, setPaymentMethodState] = useState(null);
    const [status, setStatus] = useState(PaymentStatus.IDLE);
    const [error, setErrorState] = useState(null);

    // Processing state for UI feedback
    const [isProcessing, setIsProcessing] = useState(false);

    // Redirect URL when payment provider redirects
    const [redirectUrl, setRedirectUrl] = useState(null);

    /**
     * Set the selected payment method
     */
    const setPaymentMethod = useCallback((method) => {
        if (method && !Object.values(PaymentMethod).includes(method)) {
            console.warn(`Invalid payment method: ${method}`);
            return;
        }
        setPaymentMethodState(method);
        setStatus(method ? PaymentStatus.SELECTING : PaymentStatus.IDLE);
        setErrorState(null);
    }, []);

    /**
     * Set payment error
     */
    const setError = useCallback((errorMessage) => {
        setErrorState(errorMessage);
        setStatus(PaymentStatus.ERROR);
        setIsProcessing(false);
    }, []);

    /**
     * Clear payment error
     */
    const clearError = useCallback(() => {
        setErrorState(null);
        if (status === PaymentStatus.ERROR) {
            setStatus(paymentMethod ? PaymentStatus.SELECTING : PaymentStatus.IDLE);
        }
    }, [status, paymentMethod]);

    /**
     * Start payment processing
     */
    const startProcessing = useCallback(() => {
        setIsProcessing(true);
        setStatus(PaymentStatus.PROCESSING);
        setErrorState(null);
    }, []);

    /**
     * Set redirecting state (after successful API call, before redirect)
     */
    const setRedirecting = useCallback((url) => {
        setRedirectUrl(url);
        setStatus(PaymentStatus.REDIRECTING);
        setIsProcessing(false);
    }, []);

    /**
     * Set success state
     */
    const setSuccess = useCallback(() => {
        setStatus(PaymentStatus.SUCCESS);
        setIsProcessing(false);
    }, []);

    /**
     * Reset all payment state
     */
    const reset = useCallback(() => {
        setPaymentMethodState(null);
        setStatus(PaymentStatus.IDLE);
        setErrorState(null);
        setIsProcessing(false);
        setRedirectUrl(null);
    }, []);

    // Computed properties
    const isReady = useMemo(() => {
        return paymentMethod !== null && status === PaymentStatus.SELECTING;
    }, [paymentMethod, status]);

    const canSubmit = useMemo(() => {
        return isReady && !isProcessing;
    }, [isReady, isProcessing]);

    const value = useMemo(() => ({
        // State
        paymentMethod,
        status,
        error,
        isProcessing,
        redirectUrl,

        // Computed
        isReady,
        canSubmit,

        // Actions
        setPaymentMethod,
        setError,
        clearError,
        startProcessing,
        setRedirecting,
        setSuccess,
        reset,

        // Constants (for convenience)
        PaymentStatus,
        PaymentMethod,
    }), [
        paymentMethod,
        status,
        error,
        isProcessing,
        redirectUrl,
        isReady,
        canSubmit,
        setPaymentMethod,
        setError,
        clearError,
        startProcessing,
        setRedirecting,
        setSuccess,
        reset,
    ]);

    return (
        <PaymentContext.Provider value={value}>
            {children}
        </PaymentContext.Provider>
    );
}
