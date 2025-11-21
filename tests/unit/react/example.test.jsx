/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

/**
 * Example React Component Test
 *
 * This test demonstrates:
 * 1. React Testing Library integration with Vitest
 * 2. @testing-library/jest-dom custom matchers
 * 3. Proper test structure for React components
 * 4. Environment configuration using @vitest-environment directive
 *
 * Purpose: Validates that React testing infrastructure is correctly set up
 * for PR 2 (React Testing Infrastructure) and serves as a reference for
 * future component tests in PR 4 (About Page Migration).
 */

// Simple example component for testing
function WelcomeMessage({ name }) {
    return (
        <div>
            <h1>Welcome to A Lo Cubano Boulder Fest</h1>
            {name && <p>Hello, {name}!</p>}
        </div>
    );
}

describe('React Testing Library Setup', () => {
    describe('Basic Rendering', () => {
        it('should render a simple component', () => {
            render(<WelcomeMessage />);

            // Using @testing-library/jest-dom matcher
            expect(screen.getByText('Welcome to A Lo Cubano Boulder Fest')).toBeInTheDocument();
        });

        it('should render component with props', () => {
            render(<WelcomeMessage name="Dancer" />);

            expect(screen.getByText('Hello, Dancer!')).toBeInTheDocument();
        });
    });

    describe('Custom Matchers from @testing-library/jest-dom', () => {
        it('should support toBeInTheDocument matcher', () => {
            render(<WelcomeMessage />);

            const heading = screen.getByRole('heading', { level: 1 });
            expect(heading).toBeInTheDocument();
        });

        it('should support toHaveTextContent matcher', () => {
            render(<WelcomeMessage name="Salsa Dancer" />);

            const paragraph = screen.getByText(/Hello/);
            expect(paragraph).toHaveTextContent('Hello, Salsa Dancer!');
        });
    });

    describe('Cleanup Verification', () => {
        it('should cleanup DOM after each test (test 1)', () => {
            render(<WelcomeMessage name="Test1" />);

            // This test renders with name="Test1"
            expect(screen.getByText('Hello, Test1!')).toBeInTheDocument();
        });

        it('should cleanup DOM after each test (test 2)', () => {
            render(<WelcomeMessage name="Test2" />);

            // If cleanup works correctly, we should NOT find "Test1" from previous test
            expect(screen.queryByText('Hello, Test1!')).not.toBeInTheDocument();
            expect(screen.getByText('Hello, Test2!')).toBeInTheDocument();
        });
    });

    describe('Environment Configuration', () => {
        it('should have access to DOM APIs', () => {
            // Verify jsdom environment is available
            expect(typeof document).toBe('object');
            expect(typeof window).toBe('object');
            expect(document.createElement).toBeDefined();
        });

        it('should have React available', () => {
            expect(React).toBeDefined();
            expect(React.createElement).toBeDefined();
        });
    });
});
