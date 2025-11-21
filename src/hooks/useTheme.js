/**
 * useTheme - Custom hook for accessing theme context
 *
 * Provides convenient access to theme state and controls.
 * Must be used within a ThemeProvider.
 *
 * Returns:
 *   - theme: Current resolved theme ('light' or 'dark')
 *   - userPreference: User's stored preference ('system', 'light', 'dark', or null)
 *   - isAdminPage: Whether current page is admin (theme locked to dark)
 *   - setTheme: Function to change theme (blocked on admin pages)
 *
 * Usage:
 *   function MyComponent() {
 *     const { theme, setTheme, isAdminPage } = useTheme();
 *
 *     return (
 *       <div className={`theme-${theme}`}>
 *         {!isAdminPage && (
 *           <button onClick={() => setTheme('dark')}>
 *             Dark Mode
 *           </button>
 *         )}
 *       </div>
 *     );
 *   }
 */

import { useContext } from 'react';
import { ThemeContext } from '../contexts/ThemeContext.jsx';

export function useTheme() {
    const context = useContext(ThemeContext);

    if (context === null) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }

    return context;
}
