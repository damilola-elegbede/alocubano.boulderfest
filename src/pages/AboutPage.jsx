import React, { useState, useEffect } from 'react';
import { AppProviders } from '../providers/AppProviders';

// Form validation patterns - defined outside component to avoid recreation on every render
const NAME_PATTERN = /^[\p{L}\p{M}\s'\-\.]{2,100}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPAM_PATTERNS = [
    /^test$/i,
    /^asdf+$/i,
    /^qwerty$/i,
    /^\d+$/,
    /^(.)\1{4,}$/,
    /^http/i
];
const DISPOSABLE_DOMAINS = [
    '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
    'temp-mail.org', 'throwaway.email', 'yopmail.com', 'tempmail.com',
    'trashmail.com', 'getnada.com', 'maildrop.cc'
];

function AboutPageContent() {
    const [submitButtonState, setSubmitButtonState] = useState({
        disabled: true,
        text: 'SUBMIT APPLICATION'
    });

    const [formErrors, setFormErrors] = useState({
        firstName: null,
        lastName: null,
        email: null
    });

    const [formValues, setFormValues] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        areas: [],
        days: [],
        message: ''
    });

    // Helper functions for validation
    const showFieldError = (fieldId, message) => {
        setFormErrors(prev => ({ ...prev, [fieldId]: message }));
    };

    const clearFieldError = (fieldId) => {
        setFormErrors(prev => ({ ...prev, [fieldId]: null }));
    };

    const validateName = (value, fieldName) => {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return null;
        }

        if (trimmed.length < 2) {
            return `${fieldName} must be at least 2 characters`;
        }

        if (trimmed.length > 100) {
            return `${fieldName} must not exceed 100 characters`;
        }

        if (!NAME_PATTERN.test(trimmed)) {
            return `${fieldName} can only contain letters, spaces, hyphens, apostrophes, and periods`;
        }

        for (const pattern of SPAM_PATTERNS) {
            if (pattern.test(trimmed)) {
                return `Please enter a valid ${fieldName.toLowerCase()}`;
            }
        }

        return null;
    };

    const validateEmail = (value) => {
        const trimmed = value.toLowerCase().trim();

        if (trimmed.length === 0) {
            return null;
        }

        if (!EMAIL_PATTERN.test(trimmed)) {
            return 'Please enter a valid email address (e.g., name@example.com)';
        }

        if (trimmed.includes('..')) {
            return 'Email address cannot contain consecutive dots';
        }

        const domain = trimmed.split('@')[1];
        if (domain && DISPOSABLE_DOMAINS.includes(domain)) {
            return 'Disposable email addresses are not allowed. Please use a permanent email.';
        }

        const typos = {
            'gmai.com': 'gmail.com',
            'gmial.com': 'gmail.com',
            'yaho.com': 'yahoo.com',
            'hotmai.com': 'hotmail.com',
            'outlok.com': 'outlook.com'
        };

        if (domain && typos[domain]) {
            return `Did you mean ${trimmed.replace(domain, typos[domain])}?`;
        }

        return null;
    };

    // Check if mandatory fields are filled
    useEffect(() => {
        const { firstName, lastName, email } = formValues;
        const allFilled = firstName.trim() && lastName.trim() && email.trim();
        setSubmitButtonState({
            disabled: !allFilled,
            text: 'SUBMIT APPLICATION'
        });
    }, [formValues]);

    // Initialize team member photo lightbox after component renders
    useEffect(() => {
        if (typeof window.initTeamLightbox === 'function') {
            window.initTeamLightbox();
        }
    }, []);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;

        if (type === 'checkbox') {
            const checkboxName = name === 'area' ? 'areas' : 'days';
            setFormValues(prev => ({
                ...prev,
                [checkboxName]: checked
                    ? [...prev[checkboxName], value]
                    : prev[checkboxName].filter(v => v !== value)
            }));
        } else {
            setFormValues(prev => ({ ...prev, [name]: value }));
            if (value.trim().length > 0) {
                clearFieldError(name);
            }
        }
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        let error = null;

        if (name === 'firstName') {
            error = validateName(value, 'First name');
        } else if (name === 'lastName') {
            error = validateName(value, 'Last name');
        } else if (name === 'email') {
            error = validateEmail(value);
        }

        if (error) {
            showFieldError(name, error);
        } else {
            clearFieldError(name);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const data = {
            firstName: formValues.firstName,
            lastName: formValues.lastName,
            email: formValues.email,
            phone: formValues.phone,
            areasOfInterest: formValues.areas,
            availability: formValues.days,
            message: formValues.message
        };

        setSubmitButtonState({ disabled: true, text: 'SUBMITTING...' });

        try {
            const response = await fetch('/api/volunteer/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                setFormErrors({ firstName: null, lastName: null, email: null });
                alert(`Thank you, ${data.firstName}! We've received your volunteer application and sent you a confirmation email. We'll be in touch as we approach the festival!`);
                setFormValues({
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    areas: [],
                    days: [],
                    message: ''
                });
                setSubmitButtonState({ disabled: false, text: 'SUBMIT APPLICATION' });
            } else {
                setFormErrors({ firstName: null, lastName: null, email: null });

                if (result.field && result.error) {
                    showFieldError(result.field, result.error);
                } else if (result.error) {
                    alert(result.error);
                } else {
                    alert('Unable to submit application. Please check your information and try again.');
                }

                setSubmitButtonState({ disabled: false, text: 'SUBMIT APPLICATION' });
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            setFormErrors({ firstName: null, lastName: null, email: null });

            const errorMessage = error.message && error.message !== 'Failed to fetch'
                ? `Error: ${error.message}\n\nIf this problem persists, please email us at alocubanoboulderfest@gmail.com`
                : 'Network error. Please check your internet connection and try again.\n\nIf this problem persists, please email us at alocubanoboulderfest@gmail.com';

            alert(errorMessage);
            setSubmitButtonState({ disabled: false, text: 'SUBMIT APPLICATION' });
        }
    };

    return (
        <main>
            {/* Hero Splash Image */}
            <section className="gallery-hero-splash">
                <div className="hero-image-container">
                    <img
                        id="hero-splash-image"
                        src="/images/hero/about.jpg"
                        alt="Behind-the-scenes moments from A Lo Cubano Boulder Fest, showcasing our community, organizers, and festival atmosphere"
                        className="hero-splash-img"
                        style={{ objectPosition: 'top center' }}
                    />
                </div>
            </section>

            {/* About Sub Navigation */}
            <section className="event-subnav">
                <div className="container">
                    <nav className="event-nav" aria-label="About Navigation">
                        <ul className="event-nav-list">
                            <li>
                                <a
                                    href="#the-beginning"
                                    className="event-nav-link"
                                    data-text="The Beginning"
                                >
                                    The Beginning
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#the-team"
                                    className="event-nav-link"
                                    data-text="The Team"
                                >
                                    The Team
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#join-our-team"
                                    className="event-nav-link"
                                    data-text="Join Our Team"
                                >
                                    Join Our Team
                                </a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </section>

            {/* Story Opening Typography */}
            <section id="the-beginning" className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-mask">THE BEGINNING</h2>
                    <div className="text-composition">
                        <div className="text-block-large">
                            <p>
                                <span className="highlight">Marcela Lay</span> had a vision of
                                bringing a Cuban salsa festival to Boulder in 2023 to a
                                community that was ready to dance.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Story Timeline Typography */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <div className="gallery-typographic" style={{ marginTop: 'var(--space-xl)' }}>
                        <div className="gallery-item-type" data-number="2023">
                            <h2 className="hero__subtitle">2023</h2>
                            <h3 className="gallery-type-title">THE BIRTH</h3>
                            <p className="gallery-type-meta">
                                Marcela Lay launches A Lo Cubano Boulder Fest
                            </p>
                            <p className="gallery-type-description">
                                80 attendees • 6 local artists • 1 live band • 2 days<br />
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="2025">
                            <h2 className="hero__subtitle">2025</h2>
                            <h3 className="gallery-type-title">THE GROWTH</h3>
                            <p className="gallery-type-meta">Building momentum and community</p>
                            <p className="gallery-type-description">
                                150 attendees • 4 artists • 3 days<br />
                                The festival finds its rhythm
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="2026">
                            <h2 className="hero__subtitle">2026</h2>
                            <h3 className="gallery-type-title">THE FUTURE</h3>
                            <p className="gallery-type-meta">
                                May 15-17, 2026 - Our biggest year yet
                            </p>
                            <p className="gallery-type-description">
                                We are committed to bring the best artists/talent and grow the festival.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Mission Typography */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-glitch" data-text="MISSION">MISSION</h2>
                    <div className="text-composition">
                        <div className="text-block-large">
                            <p>
                                We bring Cuban salsa to Boulder, Colorado through
                                <span className="accent-text"> dance events</span>,
                                <span className="accent-text"> workshops</span>, and
                                <span className="accent-text"> festivals</span>.
                            </p>
                        </div>
                        <div className="text-block-small">
                            <p>
                                Our mission centers on bringing cuban salsa instructors and
                                teachers to share traditional dance styles and movement
                                with the Boulder community. We recognize that not everyone
                                has the opportunity to travel to congresses so we're dedicated to
                                bringing that experience to Boulder.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Values Typography */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <div className="text-composition"></div>
                    <div className="gallery-typographic" style={{ marginTop: 'var(--space-xl)' }}>
                        <div className="gallery-item-type" data-number="01">
                            <h3 className="gallery-type-title font-display">AUTHENTICITY</h3>
                            <p className="gallery-type-description">
                                We honor the traditional forms of cultural dance.<br />
                                Working directly with Cuban artists<br />
                                Preserving traditional forms while embracing innovation
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="02">
                            <h3 className="gallery-type-title font-display">INCLUSIVITY</h3>
                            <p className="gallery-type-description">
                                All are welcome and invited to join.<br />
                                All skill levels • All ages • All backgrounds<br />
                                Music is the universal language
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="03">
                            <h3 className="gallery-type-title font-display">EXCELLENCE</h3>
                            <p className="gallery-type-description">
                                Experience world class artists/instructors.<br />
                                Professional production • Exceptional venues<br />
                                An experience that honors the artistry
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="04">
                            <h3 className="gallery-type-title font-display">COMMUNITY</h3>
                            <p className="gallery-type-description">
                                We're building something bigger than a festival<br />
                                year round workshops. • Initiatives<br />
                                A legacy for Boulder
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Team Typography */}
            <section id="the-team" className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-mask">THE TEAM</h2>

                    <div className="text-composition" style={{ marginBottom: 'var(--space-xl)' }}>
                        <div className="text-block-large font-serif">
                            Officers and Board Members
                        </div>
                    </div>
                    <div className="gallery-typographic team-grid">
                        <div className="gallery-item-type team-member-card">
                            <img src="/images/team/marcela.jpg" alt="Marcela Lay" className="team-member-photo" />
                            <h3 className="gallery-type-title font-display">MARCELA LAY</h3>
                            <p className="gallery-type-meta">PRESIDENT & FOUNDER</p>
                            <p className="gallery-type-description">
                                Visionary who brought Cuba to Boulder. Started the festival in 2023. The heart and soul of our mission.
                            </p>
                        </div>
                        <div className="gallery-item-type team-member-card">
                            <img src="/images/team/damilola.jpeg" alt="Damilola Elegbede" className="team-member-photo" />
                            <h3 className="gallery-type-title font-display">
                                DAMILOLA ELEGBEDE
                            </h3>
                            <p className="gallery-type-meta">VICE PRESIDENT & TREASURER</p>
                            <p className="gallery-type-description">
                                Strategic leadership and financial stewardship. Ensuring sustainable growth. Building our future with precision.
                            </p>
                        </div>
                        <div className="gallery-item-type team-member-card">
                            <img src="/images/team/yolanda.jpeg" alt="Yolanda Meiler" className="team-member-photo" />
                            <h3 className="gallery-type-title font-display">
                                YOLANDA MEILER
                            </h3>
                            <p className="gallery-type-meta">SECRETARY</p>
                            <p className="gallery-type-description">
                                Arts champion and supporter. Festival experience architect. Creating unforgettable moments. Yolanda is an accomplished DJ who has been active in the Boulder dance community and has contributed her musical expertise to our past events.
                            </p>
                        </div>
                        <div className="gallery-item-type team-member-card">
                            <img src="/images/team/analis.jpeg" alt="Analis Ledesma" className="team-member-photo" />
                            <h3 className="gallery-type-title font-display">
                                ANALIS LEDESMA
                            </h3>
                            <p className="gallery-type-meta">BOARD MEMBER</p>
                            <p className="gallery-type-description">
                                Keeper of our stories and records. Community connector. The voice of our collective journey. Analis also manages much of our social media presence, helping to build and engage our community online.
                            </p>
                        </div>
                        <div className="gallery-item-type team-member-card">
                            <img src="/images/team/donal.png" alt="Donal Solick" className="team-member-photo" />
                            <h3 className="gallery-type-title font-display">DONAL SOLICK</h3>
                            <p className="gallery-type-meta">BOARD MEMBER</p>
                            <p className="gallery-type-description">
                                Cultural advocate and advisor. Bridging communities. Expanding our reach and impact. Donal is an experienced dancer who brings valuable insight into how our events are run, ensuring they meet the needs of dancers at all levels.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Impact Typography */}
            <section className="section-typographic" style={{ padding: 'var(--space-xl) 0' }}>
                <div className="container">
                    <h2 className="text-glitch" data-text="Supporting Artists and Instructors">Supporting Artists and Instructors</h2>
                    <div className="gallery-typographic">
                        <div className="gallery-item-type" data-number="50+">
                            <h3 className="gallery-type-title font-mono">
                                CUBAN ARTISTS SUPPORTED
                            </h3>
                            <p className="gallery-type-description">
                                creating opportunities for dance exposure
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="10K+">
                            <h3 className="gallery-type-title font-mono">PEOPLE REACHED</h3>
                            <p className="gallery-type-description">
                                Vibrant in Boulder Colorado
                            </p>
                        </div>
                        <div className="gallery-item-type" data-number="$250K+">
                            <h3 className="gallery-type-title font-mono">
                                INVESTED IN COMMUNITY
                            </h3>
                            <p className="gallery-type-description">
                                Supporting artists, venues, and local businesses
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Volunteer Section */}
            <section
                id="join-our-team"
                className="section-typographic volunteer-section"
                style={{ padding: 'var(--space-xl) 0', paddingBottom: '50px' }}
            >
                <div className="container">
                    <div style={{ marginBottom: 'var(--space-xl)' }}>
                        <h2 className="text-mask">Join our Team!</h2>
                        <h3>Be a part of the story</h3>
                    </div>

                    <div className="volunteer-benefits__cards">
                        <div className="volunteer-benefits__card">
                            <div className="volunteer-benefits__card-emoji">🎭</div>
                            <h4 className="volunteer-benefits__card-title">
                                FREE FESTIVAL ACCESS
                            </h4>
                            <p className="volunteer-benefits__card-description">
                                Enjoy performances when not on duty
                            </p>
                        </div>
                        <div className="volunteer-benefits__card">
                            <div className="volunteer-benefits__card-emoji">👕</div>
                            <h4 className="volunteer-benefits__card-title">EXCLUSIVE T-SHIRT</h4>
                            <p className="volunteer-benefits__card-description">
                                Limited edition volunteer gear
                            </p>
                        </div>
                        <div className="volunteer-benefits__card">
                            <div className="volunteer-benefits__card-emoji">🤝</div>
                            <h4 className="volunteer-benefits__card-title">MEET THE ARTISTS</h4>
                            <p className="volunteer-benefits__card-description">
                                Behind-the-scenes access
                            </p>
                        </div>
                        <div className="volunteer-benefits__card">
                            <div className="volunteer-benefits__card-emoji">💃</div>
                            <h4 className="volunteer-benefits__card-title">FREE WORKSHOPS</h4>
                            <p className="volunteer-benefits__card-description">
                                Learn from the masters
                            </p>
                        </div>
                    </div>

                    <form
                        className="volunteer-form-typographic"
                        id="volunteer-form"
                        onSubmit={handleSubmit}
                        method="post"
                    >
                        <h3
                            className="form-title"
                            style={{
                                color: 'var(--color-text-primary)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 'var(--font-size-2xl)',
                                textTransform: 'uppercase',
                            }}
                        >
                            VOLUNTEER APPLICATION
                        </h3>

                        <div className="form-grid-type">
                            <div className="form-group-type">
                                <label className="form-label-type font-mono" htmlFor="firstName">FIRST NAME *</label>
                                <input
                                    type="text"
                                    name="firstName"
                                    id="firstName"
                                    className="form-input-type"
                                    placeholder="Your first name"
                                    required
                                    minLength="2"
                                    maxLength="100"
                                    autoComplete="given-name"
                                    aria-required="true"
                                    aria-describedby="firstName-hint"
                                    aria-invalid={formErrors.firstName ? 'true' : 'false'}
                                    value={formValues.firstName}
                                    onChange={handleInputChange}
                                    onBlur={handleBlur}
                                    style={formErrors.firstName ? { borderColor: '#dc2626' } : {}}
                                />
                                {formErrors.firstName && (
                                    <span
                                        id="firstName-hint"
                                        className="form-hint"
                                        style={{ display: 'block', color: '#dc2626', fontSize: '0.875rem', marginTop: '4px' }}
                                    >
                                        {formErrors.firstName}
                                    </span>
                                )}
                            </div>
                            <div className="form-group-type">
                                <label className="form-label-type font-mono" htmlFor="lastName">LAST NAME *</label>
                                <input
                                    type="text"
                                    name="lastName"
                                    id="lastName"
                                    className="form-input-type"
                                    placeholder="Your last name"
                                    required
                                    minLength="2"
                                    maxLength="100"
                                    autoComplete="family-name"
                                    aria-required="true"
                                    aria-describedby="lastName-hint"
                                    aria-invalid={formErrors.lastName ? 'true' : 'false'}
                                    value={formValues.lastName}
                                    onChange={handleInputChange}
                                    onBlur={handleBlur}
                                    style={formErrors.lastName ? { borderColor: '#dc2626' } : {}}
                                />
                                {formErrors.lastName && (
                                    <span
                                        id="lastName-hint"
                                        className="form-hint"
                                        style={{ display: 'block', color: '#dc2626', fontSize: '0.875rem', marginTop: '4px' }}
                                    >
                                        {formErrors.lastName}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="form-group-type">
                            <label className="form-label-type font-mono" htmlFor="email">EMAIL *</label>
                            <input
                                type="email"
                                name="email"
                                id="email"
                                className="form-input-type"
                                placeholder="your@email.com"
                                required
                                maxLength="254"
                                autoComplete="email"
                                inputMode="email"
                                aria-required="true"
                                aria-describedby="email-hint"
                                aria-invalid={formErrors.email ? 'true' : 'false'}
                                value={formValues.email}
                                onChange={handleInputChange}
                                onBlur={handleBlur}
                                style={formErrors.email ? { borderColor: '#dc2626' } : {}}
                            />
                            {formErrors.email && (
                                <span
                                    id="email-hint"
                                    className="form-hint"
                                    style={{ display: 'block', color: '#dc2626', fontSize: '0.875rem', marginTop: '4px' }}
                                >
                                    {formErrors.email}
                                </span>
                            )}
                        </div>

                        <div className="form-group-type">
                            <label className="form-label-type font-mono" htmlFor="phone">PHONE</label>
                            <input
                                type="tel"
                                name="phone"
                                id="phone"
                                className="form-input-type"
                                placeholder="(303) 555-0123"
                                maxLength="50"
                                autoComplete="tel"
                                inputMode="tel"
                                value={formValues.phone}
                                onChange={handleInputChange}
                            />
                        </div>

                        <div className="form-group-type">
                            <label className="form-label-type font-mono">AREAS OF INTEREST</label>
                            <div className="checkbox-group-type">
                                {[
                                    { value: 'setup', label: 'Event Setup/Breakdown' },
                                    { value: 'registration', label: 'Registration Desk' },
                                    { value: 'artist', label: 'Artist Support' },
                                    { value: 'merchandise', label: 'Merchandise Sales' },
                                    { value: 'info', label: 'Information Booth' },
                                    { value: 'social', label: 'Social Media Team' },
                                ].map(({ value, label }) => (
                                    <label key={value} className="checkbox-type">
                                        <input
                                            type="checkbox"
                                            name="area"
                                            value={value}
                                            checked={formValues.areas.includes(value)}
                                            onChange={handleInputChange}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-group-type">
                            <label className="form-label-type font-mono">AVAILABILITY</label>
                            <div className="checkbox-group-type">
                                {[
                                    { value: 'friday', label: 'Friday, May 15' },
                                    { value: 'saturday', label: 'Saturday, May 16' },
                                    { value: 'sunday', label: 'Sunday, May 17' },
                                ].map(({ value, label }) => (
                                    <label key={value} className="checkbox-type">
                                        <input
                                            type="checkbox"
                                            name="day"
                                            value={value}
                                            checked={formValues.days.includes(value)}
                                            onChange={handleInputChange}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-group-type">
                            <label className="form-label-type font-mono" htmlFor="message">
                                WHY DO YOU WANT TO VOLUNTEER?
                            </label>
                            <textarea
                                name="message"
                                id="message"
                                className="form-textarea-type"
                                rows="4"
                                placeholder="Tell us about your motivation..."
                                value={formValues.message}
                                onChange={handleInputChange}
                            />
                        </div>

                        <div className="form-actions-type">
                            <button
                                type="submit"
                                id="volunteerSubmitBtn"
                                className="form-button-type volunteer-submit"
                                disabled={submitButtonState.disabled}
                                style={{
                                    opacity: submitButtonState.disabled ? '0.5' : '1',
                                    cursor: submitButtonState.disabled ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {submitButtonState.text}
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </main>
    );
}

export default function AboutPage() {
    return (
        <AppProviders>
            <AboutPageContent />
        </AppProviders>
    );
}
