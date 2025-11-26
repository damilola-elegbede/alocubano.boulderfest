/**
 * AppProviders - Composite provider wrapping all legacy system bridges
 *
 * Combines Theme, Cart, Time, and Payment providers into a single component
 * for convenient use at the app root level.
 *
 * Nesting Order:
 *   Theme → Cart → Time → Payment → children
 *
 * This order ensures:
 * - Theme is available first (affects entire UI)
 * - Cart can use theme if needed
 * - Time utilities available to all components
 * - Payment can access cart and time for checkout
 *
 * Usage:
 *   import { AppProviders } from './providers/AppProviders';
 *
 *   function App() {
 *     return (
 *       <AppProviders>
 *         <YourAppContent />
 *       </AppProviders>
 *     );
 *   }
 *
 * Individual hooks can then be used anywhere in the component tree:
 *   - useTheme() for theme state and controls
 *   - useCart() for cart state and methods
 *   - useTimeManager() for Mountain Time formatting
 *   - usePayment() for payment method and checkout operations
 */

import React from 'react';
import { ThemeProvider } from '../contexts/ThemeContext.jsx';
import { CartProvider } from '../contexts/CartContext.jsx';
import { TimeProvider } from '../contexts/TimeContext.jsx';
import { PaymentProvider } from '../contexts/PaymentContext.jsx';

export function AppProviders({ children }) {
    return (
        <ThemeProvider>
            <CartProvider>
                <TimeProvider>
                    <PaymentProvider>
                        {children}
                    </PaymentProvider>
                </TimeProvider>
            </CartProvider>
        </ThemeProvider>
    );
}
