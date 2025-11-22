/**
 * AppProviders - Composite provider wrapping all legacy system bridges
 *
 * Combines Theme, Cart, and Time providers into a single component
 * for convenient use at the app root level.
 *
 * Nesting Order:
 *   Theme → Cart → Time → children
 *
 * This order ensures:
 * - Theme is available first (affects entire UI)
 * - Cart can use theme if needed
 * - Time utilities available to all components
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
 */

import React from 'react';
import { ThemeProvider } from '../contexts/ThemeContext.jsx';
import { CartProvider } from '../contexts/CartContext.jsx';
import { TimeProvider } from '../contexts/TimeContext.jsx';

export function AppProviders({ children }) {
    return (
        <ThemeProvider>
            <CartProvider>
                <TimeProvider>
                    {children}
                </TimeProvider>
            </CartProvider>
        </ThemeProvider>
    );
}
