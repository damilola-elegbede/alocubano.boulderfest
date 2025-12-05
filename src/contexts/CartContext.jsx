/**
 * CartContext - React bridge to legacy global-cart.js and CartManager
 *
 * Wraps the existing cart system to provide React components with cart state.
 * Does NOT reimplement cart logic - simply bridges legacy events to React state.
 *
 * Legacy System: js/global-cart.js + js/lib/cart-manager.js
 * - Singleton CartManager accessible via window.globalCartManager
 * - Emits cart:* events (cart:updated, cart:ticket:added, etc.)
 * - Manages tickets and donations with localStorage persistence
 * - Handles async initialization
 *
 * Usage:
 *   import { CartProvider } from './contexts/CartContext';
 *   import { useCart } from './hooks/useCart';
 *
 *   <CartProvider>
 *     <App />
 *   </CartProvider>
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';

export const CartContext = createContext(null);

export function CartProvider({ children }) {
    const [cart, setCart] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize cart and listen for cart:initialized event
    useEffect(() => {
        const handleCartInitialized = () => {
            if (window.globalCartManager) {
                setCart(window.globalCartManager.getState());
                setIsInitialized(true);
                setIsLoading(false);
            }
        };

        const handleCartUpdated = (event) => {
            if (window.globalCartManager) {
                setCart(window.globalCartManager.getState());
            }
        };

        // Check if cart is already initialized
        if (window.globalCartManager) {
            const state = window.globalCartManager.getState();
            if (state) {
                setCart(state);
                setIsInitialized(true);
                setIsLoading(false);
            }
        }

        // Listen to cart events
        document.addEventListener('cart:initialized', handleCartInitialized);
        document.addEventListener('cart:updated', handleCartUpdated);

        return () => {
            document.removeEventListener('cart:initialized', handleCartInitialized);
            document.removeEventListener('cart:updated', handleCartUpdated);
        };
    }, []);

    // Wrapper functions to call legacy CartManager methods
    const addTicket = useCallback((ticketData) => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.addTicket(ticketData);
    }, []);

    const removeTicket = useCallback((ticketType) => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.removeTicket(ticketType);
    }, []);

    const updateTicketQuantity = useCallback((ticketType, quantity) => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.updateTicketQuantity(ticketType, quantity);
    }, []);

    const addDonation = useCallback((amount, isTest = false) => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.addDonation(amount, isTest);
    }, []);

    const removeDonation = useCallback((donationId) => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.removeDonation(donationId);
    }, []);

    const clearCart = useCallback(() => {
        if (!window.globalCartManager) {
            console.error('CartManager not initialized');
            return;
        }
        window.globalCartManager.clear();
    }, []);

    const value = {
        cart,                      // Current cart state
        isInitialized,             // Whether cart has been initialized
        isLoading,                 // Whether cart is still loading
        addTicket,                 // Add or increment ticket
        removeTicket,              // Remove ticket
        updateTicketQuantity,      // Update ticket quantity
        addDonation,               // Add donation
        removeDonation,            // Remove donation
        clear: clearCart,          // Clear entire cart
    };

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}
