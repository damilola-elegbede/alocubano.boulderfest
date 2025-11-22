/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '../../../../src/contexts/ThemeContext.jsx';
import { useTheme } from '../../../../src/hooks/useTheme.js';

describe('useTheme', () => {
    describe('Hook Behavior', () => {
        it('should return theme context values', () => {
            const { result } = renderHook(() => useTheme(), {
                wrapper: ThemeProvider
            });

            expect(result.current).toHaveProperty('theme');
            expect(result.current).toHaveProperty('userPreference');
            expect(result.current).toHaveProperty('isAdminPage');
            expect(result.current).toHaveProperty('setTheme');
        });

        it('should return current theme', () => {
            const { result } = renderHook(() => useTheme(), {
                wrapper: ThemeProvider
            });

            expect(['light', 'dark']).toContain(result.current.theme);
        });

        it('should return setTheme function', () => {
            const { result } = renderHook(() => useTheme(), {
                wrapper: ThemeProvider
            });

            expect(typeof result.current.setTheme).toBe('function');
        });

        it('should return isAdminPage boolean', () => {
            const { result } = renderHook(() => useTheme(), {
                wrapper: ThemeProvider
            });

            expect(typeof result.current.isAdminPage).toBe('boolean');
        });
    });

    describe('Error Handling', () => {
        it('should throw error when used outside ThemeProvider', () => {
            // Suppress console.error for this test
            const originalError = console.error;
            console.error = () => {};

            expect(() => {
                renderHook(() => useTheme());
            }).toThrow('useTheme must be used within a ThemeProvider');

            console.error = originalError;
        });
    });
});
