/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '../../../../src/contexts/ThemeContext.jsx';
import { useTheme } from '../../../../src/hooks/useTheme.js';

// Test component that uses the theme context
function TestComponent() {
    const { theme, userPreference, isAdminPage, setTheme } = useTheme();

    return (
        <div>
            <div data-testid="theme">{theme}</div>
            <div data-testid="user-preference">{userPreference || 'null'}</div>
            <div data-testid="is-admin">{isAdminPage ? 'true' : 'false'}</div>
            <button onClick={() => setTheme('dark')}>Set Dark</button>
        </div>
    );
}

describe('ThemeContext', () => {
    describe('Provider Rendering', () => {
        it('should render children without crashing', () => {
            render(
                <ThemeProvider>
                    <div data-testid="child">Child Content</div>
                </ThemeProvider>
            );

            expect(screen.getByTestId('child')).toBeInTheDocument();
            expect(screen.getByTestId('child')).toHaveTextContent('Child Content');
        });

        it('should provide theme context to children', () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            // Should have theme value (either 'light' or 'dark')
            const themeElement = screen.getByTestId('theme');
            expect(themeElement.textContent).toMatch(/^(light|dark)$/);
        });
    });

    describe('Theme State', () => {
        it('should initialize with current theme from legacy system', () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            const theme = screen.getByTestId('theme').textContent;
            expect(['light', 'dark']).toContain(theme);
        });

        it('should provide user preference', () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            const userPref = screen.getByTestId('user-preference').textContent;
            // User preference can be 'system', 'light', 'dark', or 'null'
            expect(['system', 'light', 'dark', 'null']).toContain(userPref);
        });

        it('should provide isAdminPage status', () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            const isAdmin = screen.getByTestId('is-admin').textContent;
            expect(['true', 'false']).toContain(isAdmin);
        });
    });

    describe('Event Synchronization', () => {
        it('should update theme when themechange event is dispatched', async () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            const initialTheme = screen.getByTestId('theme').textContent;

            // Dispatch a themechange event
            const newTheme = initialTheme === 'light' ? 'dark' : 'light';
            const event = new CustomEvent('themechange', {
                detail: {
                    theme: newTheme,
                    userPreference: newTheme,
                    isAdminPage: false
                }
            });

            document.dispatchEvent(event);

            // Wait for state update
            await waitFor(() => {
                expect(screen.getByTestId('theme')).toHaveTextContent(newTheme);
            });
        });

        it('should update userPreference when themechange event is dispatched', async () => {
            render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            // Dispatch event with system preference
            const event = new CustomEvent('themechange', {
                detail: {
                    theme: 'dark',
                    userPreference: 'system',
                    isAdminPage: false
                }
            });

            document.dispatchEvent(event);

            await waitFor(() => {
                expect(screen.getByTestId('user-preference')).toHaveTextContent('system');
            });
        });
    });

    describe('Cleanup', () => {
        it('should cleanup event listeners on unmount', () => {
            const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
            const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

            const { unmount } = render(
                <ThemeProvider>
                    <TestComponent />
                </ThemeProvider>
            );

            // Verify listener was added
            expect(addEventListenerSpy).toHaveBeenCalledWith('themechange', expect.any(Function));

            unmount();

            // Verify listener was removed
            expect(removeEventListenerSpy).toHaveBeenCalledWith('themechange', expect.any(Function));

            addEventListenerSpy.mockRestore();
            removeEventListenerSpy.mockRestore();
        });
    });
});
