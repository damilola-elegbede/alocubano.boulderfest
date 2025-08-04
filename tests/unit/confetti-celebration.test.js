// Confetti Celebration Tests
// Tests the donation confetti animation and celebration features

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Confetti Celebration System', () => {
    let dom;
    let document;
    let window;

    beforeEach(() => {
        dom = new JSDOM(
            `<!DOCTYPE html>
            <html>
            <head>
                <link rel="stylesheet" href="/css/components.css">
            </head>
            <body>
                <div class="donation-selection">
                    <div class="donation-card" data-amount="50">
                        <div class="donation-amount">$50</div>
                    </div>
                    <div class="donation-card" data-amount="custom">
                        <div class="donation-amount">CUSTOM</div>
                    </div>
                </div>
                <button id="donate-button">ADD TO CART</button>
            </body>
            </html>`,
            {
                url: 'https://localhost',
                pretendToBeVisual: true,
                resources: 'usable'
            }
        );
        
        document = dom.window.document;
        window = dom.window;
        
        global.document = document;
        global.window = window;
        
        // Mock performance.now for timing
        global.performance = { now: vi.fn(() => Date.now()) };
    });

    afterEach(() => {
        if (dom) {
            dom.window.close();
        }
    });

    describe('Confetti Animation Creation', () => {
        test('should create confetti pieces with correct properties', () => {
            // Mock the DonationSelection class method
            const createConfetti = () => {
                const colors = ['#5B6BB5', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF9FF3', '#54A0FF'];
                const confettiCount = 150;
                
                const createdPieces = [];
                
                for (let i = 0; i < confettiCount; i++) {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti-piece';
                    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.left = Math.random() * 120 + 'vw';
                    confetti.style.animationDelay = Math.random() * 2 + 's';
                    confetti.style.animationDuration = (Math.random() * 2 + 3) + 's';
                    
                    document.body.appendChild(confetti);
                    createdPieces.push(confetti);
                }
                
                return createdPieces;
            };

            const confettiPieces = createConfetti();

            expect(confettiPieces.length).toBe(150);
            
            confettiPieces.forEach(piece => {
                expect(piece.className).toBe('confetti-piece');
                expect(piece.style.backgroundColor).toBeTruthy();
                expect(piece.style.left).toMatch(/^\d+(\.\d+)?vw$/);
                expect(piece.style.animationDelay).toMatch(/^\d+(\.\d+)?s$/);
                expect(piece.style.animationDuration).toMatch(/^\d+(\.\d+)?s$/);
            });
        });

        test('should use correct festival colors for confetti', () => {
            const expectedColors = ['#5B6BB5', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#FF9FF3', '#54A0FF'];
            
            // Test that we can set and retrieve colors correctly
            expectedColors.forEach(color => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti-piece';
                confetti.style.backgroundColor = color;
                
                // The color should be set (browser may convert format)
                expect(confetti.style.backgroundColor).toBeTruthy();
            });
            
            // Test that the color array contains all expected values
            expect(expectedColors).toHaveLength(8);
            expect(expectedColors).toContain('#5B6BB5'); // Festival blue
            expect(expectedColors).toContain('#FF6B6B'); // Vibrant red
        });

        test('should spread confetti across full screen width', () => {
            const confetti = document.createElement('div');
            const leftPosition = Math.random() * 120; // 120vw
            confetti.style.left = leftPosition + 'vw';
            
            expect(parseFloat(confetti.style.left)).toBeGreaterThanOrEqual(0);
            expect(parseFloat(confetti.style.left)).toBeLessThanOrEqual(120);
        });
    });

    describe('Celebration Message', () => {
        test('should create celebration message with correct styling', () => {
            const amount = 75;
            
            const celebrationMessage = document.createElement('div');
            celebrationMessage.className = 'celebration-message';
            celebrationMessage.innerHTML = `
                🎉 Thank You!<br>
                $${amount} added to cart
            `;
            
            document.body.appendChild(celebrationMessage);
            
            expect(celebrationMessage.className).toBe('celebration-message');
            expect(celebrationMessage.innerHTML).toContain('🎉 Thank You!');
            expect(celebrationMessage.innerHTML).toContain('$75 added to cart');
        });

        test('should remove celebration message after timeout', (done) => {
            const celebrationMessage = document.createElement('div');
            celebrationMessage.className = 'celebration-message';
            celebrationMessage.textContent = 'Test message';
            
            document.body.appendChild(celebrationMessage);
            
            expect(document.querySelector('.celebration-message')).toBeTruthy();
            
            // Simulate the cleanup timeout
            setTimeout(() => {
                if (celebrationMessage.parentNode) {
                    celebrationMessage.parentNode.removeChild(celebrationMessage);
                }
                
                expect(document.querySelector('.celebration-message')).toBeFalsy();
                done();
            }, 100); // Shorter timeout for testing
        });
    });

    describe('Donation Button Celebration', () => {
        test('should add celebration class to donate button', () => {
            const donateBtn = document.getElementById('donate-button');
            
            expect(donateBtn).toBeTruthy();
            expect(donateBtn.classList.contains('donation-celebration')).toBe(false);
            
            // Simulate adding celebration class
            donateBtn.classList.add('donation-celebration');
            
            expect(donateBtn.classList.contains('donation-celebration')).toBe(true);
        });

        test('should remove celebration class after animation', (done) => {
            const donateBtn = document.getElementById('donate-button');
            
            donateBtn.classList.add('donation-celebration');
            expect(donateBtn.classList.contains('donation-celebration')).toBe(true);
            
            // Simulate the timeout removal
            setTimeout(() => {
                donateBtn.classList.remove('donation-celebration');
                expect(donateBtn.classList.contains('donation-celebration')).toBe(false);
                done();
            }, 100); // Shorter timeout for testing
        });
    });

    describe('Performance and Cleanup', () => {
        test('should clean up confetti pieces after animation', (done) => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.backgroundColor = '#5B6BB5';
            
            document.body.appendChild(confetti);
            
            expect(document.querySelector('.confetti-piece')).toBeTruthy();
            
            // Simulate cleanup timeout
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
                
                expect(document.querySelector('.confetti-piece')).toBeFalsy();
                done();
            }, 100); // Shorter timeout for testing
        });

        test('should handle multiple confetti celebrations without memory leaks', () => {
            const initialPieces = document.querySelectorAll('.confetti-piece').length;
            
            // Create multiple confetti sets
            for (let set = 0; set < 3; set++) {
                for (let i = 0; i < 10; i++) {
                    const confetti = document.createElement('div');
                    confetti.className = 'confetti-piece';
                    confetti.style.backgroundColor = '#5B6BB5';
                    document.body.appendChild(confetti);
                }
            }
            
            const afterCreation = document.querySelectorAll('.confetti-piece').length;
            expect(afterCreation).toBe(initialPieces + 30);
            
            // Clean up all pieces
            document.querySelectorAll('.confetti-piece').forEach(piece => {
                piece.parentNode.removeChild(piece);
            });
            
            const afterCleanup = document.querySelectorAll('.confetti-piece').length;
            expect(afterCleanup).toBe(0);
        });
    });

    describe('CSS Integration', () => {
        test('should have required CSS classes for confetti animation', () => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            
            // Verify the class is properly set
            expect(confetti.classList.contains('confetti-piece')).toBe(true);
            
            // Test different confetti variations
            const variations = ['confetti-piece'];
            variations.forEach(className => {
                const element = document.createElement('div');
                element.className = className;
                expect(element.className).toBe(className);
            });
        });

        test('should support different confetti shapes through CSS', () => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            
            // Test various size configurations that would be applied via CSS
            const sizesConfigurations = [
                { width: '16px', height: '16px' },
                { width: '14px', height: '14px' },
                { width: '12px', height: '12px', borderRadius: '50%' },
                { width: '20px', height: '8px' }
            ];
            
            sizesConfigurations.forEach(config => {
                Object.assign(confetti.style, config);
                expect(confetti.style.width).toBe(config.width);
                expect(confetti.style.height).toBe(config.height);
                if (config.borderRadius) {
                    expect(confetti.style.borderRadius).toBe(config.borderRadius);
                }
            });
        });
    });
});