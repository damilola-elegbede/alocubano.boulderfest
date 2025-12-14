import React, { useState, useCallback, useEffect } from 'react';
import { useCart } from '../../hooks/useCart';

/**
 * DonationSelector Component
 *
 * Card-based donation amount selection with preset amounts and custom input.
 * Integrates with CartContext to add donations to the cart.
 */

const PRESET_AMOUNTS = [20, 50, 100];

export default function DonationSelector() {
    const { addDonation } = useCart();
    const [selectedAmount, setSelectedAmount] = useState(null);
    const [customAmount, setCustomAmount] = useState('');
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationAmount, setCelebrationAmount] = useState(0);

    // Calculate the effective donation amount
    const effectiveAmount = selectedAmount === 'custom'
        ? (parseFloat(customAmount) || 0)
        : (selectedAmount || 0);

    const isButtonDisabled = effectiveAmount <= 0;

    const handleCardClick = useCallback((amount) => {
        if (selectedAmount === amount) {
            // Toggle off if already selected
            setSelectedAmount(null);
            setCustomAmount('');
        } else {
            setSelectedAmount(amount);
            if (amount !== 'custom') {
                setCustomAmount('');
            }
        }
    }, [selectedAmount]);

    const handleCustomAmountChange = useCallback((e) => {
        const value = e.target.value;
        // Only allow positive numbers
        if (value === '' || /^\d+(\.\d{0,2})?$/.test(value)) {
            setCustomAmount(value);
        }
    }, []);

    const handleCustomAmountBlur = useCallback(() => {
        // If custom amount is empty or 0, deselect
        if (!customAmount || parseFloat(customAmount) <= 0) {
            setSelectedAmount(null);
            setCustomAmount('');
        }
    }, [customAmount]);

    const handleKeyDown = useCallback((e, amount) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick(amount);
        }
    }, [handleCardClick]);

    // Create fly-to-cart animation
    const createFlyToCartAnimation = useCallback((amount) => {
        const donateBtn = document.getElementById('donate-button');
        const cartIcon = document.querySelector('.nav-cart-icon');

        if (!donateBtn || !cartIcon) return;

        // Respect reduced motion preference
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const btnRect = donateBtn.getBoundingClientRect();
        const cartRect = cartIcon.getBoundingClientRect();

        // Create flying element
        const flyItem = document.createElement('div');
        flyItem.className = 'fly-to-cart-item';
        flyItem.textContent = `$${amount}`;

        // Position at button center
        const startX = btnRect.left + btnRect.width / 2;
        const startY = btnRect.top + btnRect.height / 2;
        flyItem.style.left = `${startX}px`;
        flyItem.style.top = `${startY}px`;

        document.body.appendChild(flyItem);

        // Calculate end position (cart icon center)
        const endX = cartRect.left + cartRect.width / 2;
        const endY = cartRect.top + cartRect.height / 2;

        // Set CSS custom properties for animation
        flyItem.style.setProperty('--fly-x', `${endX - startX}px`);
        flyItem.style.setProperty('--fly-y', `${endY - startY}px`);

        // Trigger animation
        requestAnimationFrame(() => {
            flyItem.classList.add('flying');
        });

        // Remove element after animation (600ms)
        setTimeout(() => {
            if (flyItem.parentNode) {
                flyItem.parentNode.removeChild(flyItem);
            }
        }, 600);
    }, []);

    const handleDonate = useCallback(() => {
        if (effectiveAmount <= 0) return;

        // Guard: Don't show success UI if cart manager isn't available
        if (!window.globalCartManager) {
            return;
        }

        // Add to cart
        addDonation(effectiveAmount, false);

        // Create fly-to-cart animation
        createFlyToCartAnimation(effectiveAmount);

        // Show celebration
        setCelebrationAmount(effectiveAmount);
        setShowCelebration(true);

        // Reset form
        setSelectedAmount(null);
        setCustomAmount('');

        // Hide celebration after confetti animation completes (max 3.5s)
        setTimeout(() => {
            setShowCelebration(false);
        }, 4000);
    }, [effectiveAmount, addDonation, createFlyToCartAnimation]);

    // Create confetti effect
    useEffect(() => {
        if (!showCelebration) return;

        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
        ];
        const confettiCount = 400;
        const confettiElements = [];
        const isMobile = window.innerWidth < 768;

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            // Start from center, burst outward via CSS --confetti-drift
            confetti.style.left = '50vw';
            // Drift determines burst direction: desktop ±30vw, mobile ±50vw
            const driftRange = isMobile ? 100 : 60;
            const drift = (Math.random() - 0.5) * driftRange;
            confetti.style.setProperty('--confetti-drift', drift + 'vw');
            // Variable width/height for natural look (6-14px range)
            const width = Math.random() * 8 + 6;
            const height = Math.random() * 8 + 6;
            confetti.style.width = width + 'px';
            confetti.style.height = height + 'px';
            // Tight burst delay for explosive effect
            confetti.style.animationDelay = Math.random() * 0.3 + 's';
            // 2.5-3.5 seconds for faster fall (doubled speed)
            confetti.style.animationDuration = Math.random() * 1 + 2.5 + 's';
            document.body.appendChild(confetti);
            confettiElements.push(confetti);
        }

        // Cleanup confetti after animation (max delay 0.3s + max duration 3.5s + buffer)
        const cleanup = setTimeout(() => {
            confettiElements.forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        }, 5000);

        return () => {
            clearTimeout(cleanup);
            confettiElements.forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        };
    }, [showCelebration]);

    return (
        <div
            className="donation-form-wrapper donation-form-container"
            style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}
        >
            <h2
                id="donation-form-title"
                className="text-display"
                style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}
            >
                MAKE A DONATION
            </h2>

            {/* Donation Selection Interface */}
            <section className="donation-selection" aria-labelledby="donation-form-title">
                <h3
                    className="form-label-type font-mono"
                    style={{
                        display: 'block',
                        marginBottom: 'var(--space-lg)',
                        textAlign: 'center'
                    }}
                >
                    SELECT AMOUNT
                </h3>

                <div
                    className="donation-amounts"
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-lg)',
                        marginBottom: 'var(--space-xl)'
                    }}
                    role="group"
                    aria-label="Donation amount options"
                >
                    {PRESET_AMOUNTS.map((amount) => (
                        <div
                            key={amount}
                            className={`donation-card ${selectedAmount === amount ? 'selected' : ''}`}
                            data-amount={amount}
                            tabIndex={0}
                            role="button"
                            aria-pressed={selectedAmount === amount}
                            onClick={() => handleCardClick(amount)}
                            onKeyDown={(e) => handleKeyDown(e, amount)}
                        >
                            <div className="donation-amount">${amount}</div>
                        </div>
                    ))}

                    <div
                        className={`donation-card ${selectedAmount === 'custom' ? 'selected' : ''}`}
                        data-amount="custom"
                        tabIndex={0}
                        role="button"
                        aria-pressed={selectedAmount === 'custom'}
                        onClick={() => handleCardClick('custom')}
                        onKeyDown={(e) => handleKeyDown(e, 'custom')}
                    >
                        <div className="donation-amount">
                            {selectedAmount === 'custom' ? (
                                <span className="custom-amount-wrapper">
                                    <span className="dollar-sign">$</span>
                                    <input
                                        type="number"
                                        className="custom-amount-input"
                                        min="1"
                                        step="1"
                                        value={customAmount}
                                        onChange={handleCustomAmountChange}
                                        onBlur={handleCustomAmountBlur}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Custom donation amount"
                                        autoFocus
                                    />
                                </span>
                            ) : (
                                'CUSTOM'
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <form
                className="donation-form"
                id="donation-form"
                role="form"
                aria-labelledby="donation-form-title"
                onSubmit={(e) => {
                    e.preventDefault();
                    handleDonate();
                }}
            >
                {/* Submit Button */}
                <div style={{ textAlign: 'center' }}>
                    <button
                        type="submit"
                        id="donate-button"
                        className={`form-button-type ${showCelebration ? 'donation-celebration' : ''}`}
                        style={{ padding: 'var(--space-lg) var(--space-3xl)' }}
                        disabled={isButtonDisabled}
                    >
                        {effectiveAmount > 0 ? `ADD TO CART - $${effectiveAmount}` : 'ADD TO CART'}
                    </button>
                </div>
            </form>

            {/* Celebration Message */}
            {showCelebration && (
                <div className="celebration-message" role="status" aria-live="polite">
                    <span role="img" aria-label="celebration">🎉</span> Thank You!<br />
                    ${celebrationAmount} added to cart
                </div>
            )}
        </div>
    );
}
