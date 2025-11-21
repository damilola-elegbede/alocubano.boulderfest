/**
 * ThemeContext - React bridge to legacy theme-manager.js
 *
 * Wraps the existing theme system to provide React components with theme state.
 * Does NOT reimplement theme logic - simply bridges legacy events to React state.
 *
 * Legacy System: js/theme-manager.js
 * - Hybrid approach: admin pages always dark, main site user-controlled
 * - Emits 'themechange' events on document when theme changes
 * - Stores user preference in localStorage
 *
 * Usage:
 *   import { ThemeProvider } from './contexts/ThemeContext';
 *   import { useTheme } from './hooks/useTheme';
 *
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 */

import React, { createContext, useState, useEffect } from 'react';
import { getCurrentTheme, setTheme as setLegacyTheme, getUserPreference, isAdminPage } from '../../js/theme-manager.js';

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    // Initialize with current theme from legacy system
    const [theme, setTheme] = useState(() => getCurrentTheme());
    const [userPreference, setUserPreference] = useState(() => getUserPreference());
    const [isAdmin, setIsAdmin] = useState(() => isAdminPage());

    // Listen to legacy themechange events and sync React state
    useEffect(() => {
        const handleThemeChange = (event) => {
            const { theme: newTheme, userPreference: newPref, isAdminPage: admin } = event.detail;

            setTheme(newTheme);
            setUserPreference(newPref);
            setIsAdmin(admin);
        };

        document.addEventListener('themechange', handleThemeChange);

        return () => {
            document.removeEventListener('themechange', handleThemeChange);
        };
    }, []);

    // Wrapper function to call legacy setTheme
    const changeTheme = (newTheme) => {
        if (isAdmin) {
            console.warn('Theme changes are disabled on admin pages');
            return;
        }

        // Call legacy theme manager (will emit themechange event)
        setLegacyTheme(newTheme);
    };

    const value = {
        theme,              // Current resolved theme ('light' or 'dark')
        userPreference,     // User's stored preference ('system', 'light', 'dark', or null for admin)
        isAdminPage: isAdmin, // Whether current page is admin (theme locked to dark)
        setTheme: changeTheme  // Function to change theme (blocked on admin pages)
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}
