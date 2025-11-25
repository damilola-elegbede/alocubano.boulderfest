/**
 * CustomerInfoForm - React component for customer information collection
 *
 * Uses react-hook-form with zodResolver for validation against PR 6 schemas.
 * Follows AboutPage.jsx patterns for form styling and error display.
 *
 * @module src/components/checkout/CustomerInfoForm
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Extended CustomerInfoSchema for checkout form (requires firstName/lastName)
// Base schema from PR 6 makes these optional, but checkout requires them
const CheckoutCustomerSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address')
        .max(254, 'Email must be 254 characters or less'),
    firstName: z
        .string()
        .min(1, 'First name is required')
        .min(2, 'First name must be at least 2 characters')
        .max(100, 'First name must be 100 characters or less'),
    lastName: z
        .string()
        .min(1, 'Last name is required')
        .min(2, 'Last name must be at least 2 characters')
        .max(100, 'Last name must be 100 characters or less'),
    phone: z
        .string()
        .max(50, 'Phone number must be 50 characters or less')
        .optional()
        .or(z.literal('')),
});

/**
 * CustomerInfoForm component
 *
 * @param {Object} props
 * @param {Function} props.onValidSubmit - Called with validated customer data
 * @param {boolean} props.disabled - Disables all form fields
 * @param {Object} props.defaultValues - Default values for form fields
 */
export default function CustomerInfoForm({
    onValidSubmit,
    disabled = false,
    defaultValues = {}
}) {
    const {
        register,
        handleSubmit,
        formState: { errors, isValid },
        watch,
    } = useForm({
        resolver: zodResolver(CheckoutCustomerSchema),
        mode: 'onBlur',
        reValidateMode: 'onChange',
        defaultValues: {
            firstName: defaultValues.firstName || '',
            lastName: defaultValues.lastName || '',
            email: defaultValues.email || '',
            phone: defaultValues.phone || '',
        },
    });

    const onSubmit = (data) => {
        if (onValidSubmit) {
            onValidSubmit({
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                email: data.email.trim(),
                phone: data.phone?.trim() || '',
            });
        }
    };

    return (
        <div className="checkout-form-section" data-testid="customer-info-form">
            <h3
                className="form-title"
                style={{
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--font-size-2xl)',
                    textTransform: 'uppercase',
                }}
            >
                Customer Information
            </h3>

            <form
                id="customerInfoForm"
                onSubmit={handleSubmit(onSubmit)}
                className="volunteer-form-typographic"
            >
                <div className="form-grid-type">
                    {/* First Name */}
                    <div className="form-group-type">
                        <label
                            className="form-label-type font-mono"
                            htmlFor="firstName"
                        >
                            FIRST NAME *
                        </label>
                        <input
                            {...register('firstName')}
                            type="text"
                            id="firstName"
                            data-testid="customer-firstName"
                            className="form-input-type"
                            placeholder="Your first name"
                            autoComplete="given-name"
                            disabled={disabled}
                            aria-required="true"
                            aria-describedby="firstName-error"
                            aria-invalid={errors.firstName ? 'true' : 'false'}
                            style={errors.firstName ? { borderColor: '#dc2626' } : {}}
                        />
                        {errors.firstName && (
                            <span
                                id="firstName-error"
                                data-testid="firstName-error"
                                className="form-hint"
                                style={{
                                    display: 'block',
                                    color: '#dc2626',
                                    fontSize: '0.875rem',
                                    marginTop: '4px',
                                }}
                            >
                                {errors.firstName.message}
                            </span>
                        )}
                    </div>

                    {/* Last Name */}
                    <div className="form-group-type">
                        <label
                            className="form-label-type font-mono"
                            htmlFor="lastName"
                        >
                            LAST NAME *
                        </label>
                        <input
                            {...register('lastName')}
                            type="text"
                            id="lastName"
                            data-testid="customer-lastName"
                            className="form-input-type"
                            placeholder="Your last name"
                            autoComplete="family-name"
                            disabled={disabled}
                            aria-required="true"
                            aria-describedby="lastName-error"
                            aria-invalid={errors.lastName ? 'true' : 'false'}
                            style={errors.lastName ? { borderColor: '#dc2626' } : {}}
                        />
                        {errors.lastName && (
                            <span
                                id="lastName-error"
                                data-testid="lastName-error"
                                className="form-hint"
                                style={{
                                    display: 'block',
                                    color: '#dc2626',
                                    fontSize: '0.875rem',
                                    marginTop: '4px',
                                }}
                            >
                                {errors.lastName.message}
                            </span>
                        )}
                    </div>
                </div>

                {/* Email */}
                <div className="form-group-type">
                    <label
                        className="form-label-type font-mono"
                        htmlFor="email"
                    >
                        EMAIL *
                    </label>
                    <input
                        {...register('email')}
                        type="email"
                        id="email"
                        data-testid="customer-email"
                        className="form-input-type"
                        placeholder="your@email.com"
                        autoComplete="email"
                        inputMode="email"
                        disabled={disabled}
                        aria-required="true"
                        aria-describedby="email-error"
                        aria-invalid={errors.email ? 'true' : 'false'}
                        style={errors.email ? { borderColor: '#dc2626' } : {}}
                    />
                    {errors.email && (
                        <span
                            id="email-error"
                            data-testid="email-error"
                            className="form-hint"
                            style={{
                                display: 'block',
                                color: '#dc2626',
                                fontSize: '0.875rem',
                                marginTop: '4px',
                            }}
                        >
                            {errors.email.message}
                        </span>
                    )}
                </div>

                {/* Phone */}
                <div className="form-group-type">
                    <label
                        className="form-label-type font-mono"
                        htmlFor="phone"
                    >
                        PHONE
                    </label>
                    <input
                        {...register('phone')}
                        type="tel"
                        id="phone"
                        data-testid="customer-phone"
                        className="form-input-type"
                        placeholder="(303) 555-0123"
                        autoComplete="tel"
                        inputMode="tel"
                        disabled={disabled}
                        aria-describedby="phone-error"
                        aria-invalid={errors.phone ? 'true' : 'false'}
                        style={errors.phone ? { borderColor: '#dc2626' } : {}}
                    />
                    {errors.phone && (
                        <span
                            id="phone-error"
                            data-testid="phone-error"
                            className="form-hint"
                            style={{
                                display: 'block',
                                color: '#dc2626',
                                fontSize: '0.875rem',
                                marginTop: '4px',
                            }}
                        >
                            {errors.phone.message}
                        </span>
                    )}
                </div>
            </form>
        </div>
    );
}

// Export the schema for external use (e.g., CheckoutPage validation)
export { CheckoutCustomerSchema };
