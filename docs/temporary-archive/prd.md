# Product Requirements Document: Universal Ticket Registration System

## Executive Summary

The Universal Ticket Registration System transforms the current ticket purchase flow by requiring ALL ticket buyers to register attendee information post-purchase. This ensures accurate attendee data collection, enables personalized communication, and provides a seamless experience for both individual and group ticket purchases.

## Business Objectives

### Primary Goals
- **100% Attendee Data Capture**: Collect first name, last name, and email for every ticket holder
- **Improved Event Management**: Accurate attendee lists for check-in and communication
- **Enhanced User Experience**: Individual ticket confirmations with wallet passes
- **Reduced Support Burden**: Automated reminders and clear registration process

### Success Metrics
- Registration completion rate >85% within 72 hours
- Average registration time <5 minutes for 4 tickets
- Support tickets <3% of total purchases
- Email delivery success rate >98%

## Scope

### In Scope
- Universal registration requirement for all ticket purchases
- Per-ticket registration tracking in database
- Multi-stage automated reminder system
- Individual attendee confirmation emails
- Admin dashboard for registration monitoring
- Comprehensive test coverage

### Out of Scope
- Phone number collection (removed from requirements)
- Modification of Stripe checkout process
- Changes to ticket pricing or types
- Social media integration
- Mobile app development

## Technical Requirements

### Functional Requirements

**REQ-FUNC-001**: Universal Registration Trigger
- All ticket purchases require registration regardless of quantity
- Registration email sent immediately after successful payment
- 72-hour deadline for completion

**REQ-FUNC-002**: Per-Ticket Tracking
- Individual registration status for each ticket
- Support partial registration (some tickets complete, others pending)
- Track registration timestamp per ticket

**REQ-FUNC-003**: Multi-Stage Reminder System
- 4 reminder emails: 72hr, 48hr, 24hr, 2hr before deadline
- Automatic cancellation when ticket is registered
- Track reminder delivery status

**REQ-FUNC-004**: Registration Deadline Management
- 72-hour window from purchase time
- Automatic expiration after deadline
- Clear deadline display in all communications

**REQ-FUNC-005**: Automatic Expiration
- Change status to 'expired' after 72 hours
- Cancel pending reminders for expired tickets
- Prevent registration of expired tickets

**REQ-FUNC-006**: Attendee Confirmation Emails
- Send confirmation to each registered attendee
- Include ticket details and wallet pass links
- Different templates for purchaser vs non-purchaser

### Database Requirements

**REQ-DB-001**: Ticket Registration Fields
- Add registration_status: 'pending', 'completed', 'expired'
- Add registered_at: timestamp of completion
- Add registration_deadline: 72 hours from purchase

**REQ-DB-002**: Reminder Tracking Table
```sql
CREATE TABLE registration_reminders (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  sent_at DATETIME,
  status TEXT DEFAULT 'scheduled'
)
```

**REQ-DB-003**: Email Tracking Table
```sql
CREATE TABLE registration_emails (
  id INTEGER PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at DATETIME,
  brevo_message_id TEXT
)
```

**REQ-DB-004**: Use Existing Attendee Fields
- Populate existing attendee_first_name field
- Populate existing attendee_last_name field
- Populate existing attendee_email field
- Ignore attendee_phone field (not collected)

### Security Requirements

**REQ-SEC-001**: Token Security
- JWT tokens with server-side validation
- 256-bit signing secret minimum
- Single-use token enforcement
- Token revocation capability

**REQ-SEC-002**: Input Validation
- Name validation: 2-50 characters, letters/spaces/hyphens only
- Email validation: RFC 5322 compliant
- XSS prevention through sanitization
- SQL injection prevention via parameterized queries

**REQ-SEC-003**: Rate Limiting
- 3 registration attempts per 15 minutes per IP
- Progressive backoff for failed attempts
- Bypass for authenticated admin users

**REQ-SEC-004**: CSRF Protection
- CSRF tokens on all registration forms
- SameSite cookie configuration
- Origin validation

**REQ-SEC-005**: Audit Logging
- Log all registration attempts
- Track IP addresses and user agents
- Maintain 90-day retention policy

### Performance Requirements

**REQ-PERF-001**: Page Load Performance
- Registration form load <2 seconds on 3G
- Progressive enhancement for slow connections
- Optimized asset delivery

**REQ-PERF-002**: API Response Times
- Token validation <100ms
- Registration submission <500ms
- Database queries <50ms

**REQ-PERF-003**: Email Delivery
- Initial email within 5 minutes of purchase
- Reminders within 5 minutes of scheduled time
- 98% delivery success rate

### Email Requirements

**REQ-EMAIL-001**: Registration Invitation
- Sent to purchaser immediately after payment
- Contains secure registration link
- Shows 72-hour deadline clearly

**REQ-EMAIL-002**: Reminder Emails
- Progressive urgency in messaging
- Clear call-to-action buttons
- Mobile-responsive templates

**REQ-EMAIL-003**: Attendee Confirmations
- Individual email to each registered attendee
- Includes ticket details and ID
- Wallet pass download links

**REQ-EMAIL-004**: Wallet Pass Integration
- Apple Wallet pass generation
- Google Wallet pass generation
- QR code for ticket validation

**REQ-EMAIL-005**: Template Differentiation
- Distinct template for purchaser's own ticket
- Different template for non-purchaser attendees
- Completion notice for purchaser

### Testing Requirements

**REQ-TEST-001**: API Contract Tests
- Registration endpoint structure validation
- Token validation testing
- Error response format verification

**REQ-TEST-002**: Validation Tests
- Input sanitization verification
- Required field validation
- Security boundary testing

**REQ-TEST-003**: Flow Tests
- End-to-end registration simulation
- Reminder scheduling verification
- Email delivery confirmation

**REQ-TEST-004**: Performance Baseline
- Maintain <500ms total test execution
- No increase in test complexity
- Direct API testing approach

**REQ-TEST-005**: Readability Standard
- Zero test abstractions
- Clear test descriptions
- Maintainable by any JavaScript developer

## Implementation Phases

### Phase 1: Infrastructure & Database (Week 1)
- Database schema updates
- Security token service
- Webhook modifications
- Reminder scheduling system

### Phase 2: Core Implementation (Week 1.5)
- Registration API endpoints
- Registration UI components
- Email template creation
- Reminder processing automation

### Phase 3: Testing & Launch (Week 0.5)
- Comprehensive test suite
- Admin dashboard
- Documentation
- Deployment procedures

## Risk Assessment

### Technical Risks

**Risk**: Email delivery failures
- **Mitigation**: Implement retry logic with exponential backoff
- **Monitoring**: Track delivery rates via Brevo webhooks

**Risk**: Database migration complexity
- **Mitigation**: Test migrations on staging with production data volume
- **Rollback**: Prepared rollback scripts for each migration

**Risk**: Token security vulnerabilities
- **Mitigation**: Regular security audits and penetration testing
- **Response**: Incident response plan with token revocation capability

### Business Risks

**Risk**: User confusion about registration requirement
- **Mitigation**: Clear communication in purchase flow and emails
- **Support**: FAQ documentation and support templates

**Risk**: Low registration completion rates
- **Mitigation**: Aggressive reminder schedule and clear deadlines
- **Fallback**: Admin tools for manual registration

**Risk**: Increased support volume
- **Mitigation**: Self-service status checking and clear help documentation
- **Preparation**: Support team training before launch

## Dependencies

### External Dependencies
- Stripe Checkout (existing integration)
- Brevo Email Service (existing integration)
- JWT library for token generation
- Cron job scheduler for reminders

### Internal Dependencies
- Existing ticket and transaction tables
- Current Stripe webhook implementation
- Email service infrastructure
- Admin authentication system

## Timeline

### Week 1: Foundation
- Days 1-2: Database migrations and testing
- Days 3-4: Security token service implementation
- Day 5: Webhook modifications and testing

### Week 2: Implementation
- Days 1-2: Registration API development
- Days 3-4: UI components and forms
- Day 5: Email template integration

### Week 3: Polish & Launch
- Days 1-2: Comprehensive testing
- Day 3: Admin dashboard completion
- Days 4-5: Documentation and deployment

## Success Criteria

### Launch Criteria
- All test suites passing with >95% coverage
- Performance benchmarks met
- Security audit completed
- Documentation approved

### Post-Launch Success
- 85% registration completion within 72 hours
- <3% support ticket rate
- No critical security incidents
- Positive user feedback

## Rollback Plan

### Feature Flag Implementation
```javascript
const FEATURE_FLAGS = {
  UNIVERSAL_REGISTRATION: process.env.ENABLE_UNIVERSAL_REGISTRATION === 'true'
};
```

### Rollback Procedure
1. Set ENABLE_UNIVERSAL_REGISTRATION=false
2. Tickets automatically use purchaser name
3. No registration emails sent
4. Existing registrations remain valid

### Data Preservation
- All registration data retained
- No destructive migrations
- Ability to re-enable without data loss

## Monitoring & Analytics

### Key Metrics to Track
- Registration completion rate by time
- Reminder email effectiveness
- Average time to complete registration
- Support ticket correlation

### Alerting Thresholds
- Registration rate <70%: Warning
- Email delivery <95%: Critical
- API response >1s: Warning
- Error rate >1%: Critical

## Documentation Requirements

### User Documentation
- FAQ for ticket registration
- Step-by-step registration guide
- Troubleshooting common issues

### Technical Documentation
- API endpoint specifications
- Database schema changes
- Email template documentation

### Support Documentation
- Common support scenarios
- Manual registration procedures
- Escalation guidelines