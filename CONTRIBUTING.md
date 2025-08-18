# Contributing to A Lo Cubano Boulder Fest

Welcome to the A Lo Cubano Boulder Fest project! This guide outlines our development practices, testing philosophy, and contribution standards.

## Project Overview

A Lo Cubano Boulder Fest is a Cuban salsa festival website built with:
- **Frontend**: Vanilla JavaScript (ES6 modules, no frameworks)
- **Backend**: Vercel serverless functions with Node.js
- **Database**: SQLite (local) / Turso (production)
- **Testing**: Vitest with radical simplicity philosophy
- **Architecture**: Simple, maintainable code with minimal abstractions

## Test Philosophy: Radical Simplicity

<test-philosophy priority="critical">
**We have eliminated over 70,000 lines of complex test infrastructure in favor of radical simplicity.** Our tests follow five core principles:

1. **Simplicity First** - Any JavaScript developer can read and understand
2. **No Abstractions** - Direct interaction with real APIs and databases  
3. **Fast Execution** - Complete test suite runs in under 60 seconds
4. **Self-Contained** - Each test includes all context needed to understand it
5. **Visible Logic** - No hidden magic or implicit behavior
</test-philosophy>

### Test Requirements

<test-requirements>
  <mandatory-standards>
    - No test function >20 lines
    - No utility function >10 lines  
    - No setup function >15 lines
    - Maximum 3 levels of nesting
    - Use real APIs, not mocks (except for CI optimization)
    - Self-contained tests with visible data and logic
  </mandatory-standards>
  
  <forbidden-patterns>
    - Custom test builders or factories
    - Test orchestrators or managers
    - Complex parameterized tests (>5 parameters)
    - Dynamic test generation
    - Custom assertions beyond expect()
    - Testing test infrastructure instead of application behavior
  </forbidden-patterns>
</test-requirements>

## Getting Started

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/alocubano-boulderfest.git
   cd alocubano-boulderfest
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   Create `.env.local` file with required variables:
   ```bash
   # Database
   TURSO_DATABASE_URL="file:./test-integration.db"
   
   # Authentication  
   ADMIN_SECRET="your-32-character-secret-key-here"
   ADMIN_PASSWORD="$2b$10$your.bcrypt.hashed.password"
   
   # Stripe
   STRIPE_PUBLISHABLE_KEY="pk_test_..."
   STRIPE_SECRET_KEY="sk_test_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   
   # Email (optional)
   BREVO_API_KEY="xkeysib-..."
   BREVO_WEBHOOK_SECRET="webhook-secret"
   ```

4. **Start development server**
   ```bash
   npm start  # With ngrok tunnel
   # or
   npm run start:local  # Local only
   ```

5. **Run tests**
   ```bash
   npm run test:new  # New simple test suite
   npm test          # Legacy tests (being phased out)
   ```

## Development Workflow

### Adding New Features

1. **Write integration test first** - Test the complete user interaction
   ```javascript
   // Good example: Clear, direct, tests real behavior
   it('should create ticket and send confirmation email', async () => {
     const ticketData = {
       buyer_email: 'test@example.com',
       event_name: 'Boulder Fest 2026',
       ticket_type: 'Weekend Pass'
     };
     
     const response = await httpClient.post('/api/tickets', ticketData);
     
     expect(response.status).toBe(201);
     expect(response.data.id).toBeDefined();
     
     // Verify database state
     const ticket = await databaseHelper.getTicket(response.data.id);
     expect(ticket.buyer_email).toBe('test@example.com');
   });
   ```

2. **Implement minimal code** to make the test pass
3. **Test manually** to ensure real-world usage works  
4. **Refactor if needed** (but never abstract the test)

### Code Standards

<code-standards>
  <javascript-patterns>
    - Use ES6 modules with explicit imports/exports
    - Prefer `const` and `let` over `var`
    - Use async/await over promises and callbacks
    - Write descriptive variable and function names
    - Keep functions under 20 lines
    - Minimize nesting (max 3 levels)
  </javascript-patterns>
  
  <api-patterns>
    - Use Promise-based Lazy Singleton pattern for async services
    - Handle errors gracefully with meaningful messages
    - Validate input parameters
    - Use proper HTTP status codes
    - Always await database client initialization
  </api-patterns>
  
  <database-patterns>
    - Use parameterized queries to prevent SQL injection
    - Handle SQLITE_BUSY errors with retry logic
    - Clean up test data between tests
    - Use transactions for multi-step operations
  </database-patterns>
</code-standards>

## Testing Guidelines

### Writing Tests

**✅ DO:**
- Test user-visible behavior, not implementation details
- Use real HTTP requests to actual API endpoints
- Create test data explicitly in each test
- Include both success and error scenarios
- Clean up after each test
- Keep tests under 20 lines
- Make assertions about specific values, not snapshots

**❌ DON'T:**
- Create elaborate test infrastructure or abstractions
- Mock internal application logic
- Write tests that test the testing framework
- Use complex test builders or factories
- Create shared test state between tests
- Write parameterized tests with many parameters
- Use custom assertion helpers

### Test Structure

<test-structure>
```javascript
describe('Feature Name', () => {
  beforeEach(async () => {
    // Minimal setup - usually just database initialization
    await databaseHelper.initialize();
    await databaseHelper.cleanBetweenTests();
  });

  it('should handle typical user scenario', async () => {
    // 1. Create test data explicitly
    const testData = {
      field1: 'value1',
      field2: 'value2'
    };
    
    // 2. Make real API call
    const response = await httpClient.post('/api/endpoint', testData);
    
    // 3. Assert specific, meaningful values
    expect(response.status).toBe(201);
    expect(response.data.field1).toBe('value1');
    
    // 4. Verify side effects if needed
    const dbRecord = await databaseHelper.query(
      'SELECT * FROM table WHERE id = ?',
      [response.data.id]
    );
    expect(dbRecord.rows[0].field1).toBe('value1');
  });
});
```
</test-structure>

### Running Tests

```bash
# Run new test suite (recommended)
npm run test:new
npm run test:new:watch      # With watch mode
npm run test:new:coverage   # With coverage

# Run specific test file  
npx vitest tests-new/integration/api-health.test.js

# Run tests in CI mode (uses mock server)
CI=true npm run test:new

# Run legacy tests (being phased out)
npm test
npm run test:unit
npm run test:integration
```

## Architecture Patterns

### Async Service Pattern

All async services MUST use the Promise-based Lazy Singleton pattern:

<async-service-pattern>
```javascript
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) {
      return this.instance; // Fast path for already initialized
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for existing initialization
    }
    
    this.initializationPromise = this._performInitialization();
    
    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      this.instance = result;
      return result;
    } catch (error) {
      this.initializationPromise = null; // Enable retry on next call
      throw error;
    }
  }

  async _performInitialization() {
    // Actual initialization logic
    return await createServiceInstance();
  }
}
```
</async-service-pattern>

### API Handler Pattern

```javascript
// api/example/endpoint.js
import { getDatabaseClient } from '../lib/database.js';

export default async function handler(req, res) {
  try {
    // Always await database client initialization
    const client = await getDatabaseClient();
    
    // Validate input
    if (!req.body.required_field) {
      return res.status(400).json({
        error: 'required_field is required'
      });
    }
    
    // Perform operation
    const result = await client.execute(
      'INSERT INTO table (field) VALUES (?)',
      [req.body.required_field]
    );
    
    // Return success response
    res.status(201).json({
      id: result.insertId,
      message: 'Created successfully'
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}
```

## Pull Request Process

### Before Submitting

<pr-checklist>
- [ ] All tests pass: `npm run test:new`
- [ ] Code follows our style guidelines
- [ ] New features have integration tests
- [ ] Tests are simple and follow our philosophy (no abstractions)
- [ ] No test function exceeds 20 lines
- [ ] Database migrations are included if needed
- [ ] Environment variables documented if new ones added
</pr-checklist>

### PR Description Template

```markdown
## Description
Brief description of what this PR does and why.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)  
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Added integration tests for new functionality
- [ ] All tests pass locally
- [ ] Tests follow radical simplicity philosophy
- [ ] No test exceeds 20 lines

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated if needed
- [ ] No new abstractions or complex test infrastructure
```

### Code Review Criteria

<review-criteria>
  <functionality>
    - Does the code solve the stated problem?
    - Are edge cases handled appropriately?
    - Is error handling comprehensive?
  </functionality>
  
  <simplicity>
    - Can any developer understand this code immediately?
    - Are there unnecessary abstractions that should be removed?
    - Is the solution as simple as possible?
  </simplicity>
  
  <testing>
    - Do tests verify real user-visible behavior?
    - Are tests under 20 lines and self-contained?
    - Do tests use real APIs and databases?
    - Are both success and error cases covered?
  </testing>
  
  <maintainability>
    - Will this code be easy to modify in the future?
    - Are there clear, descriptive names?
    - Is the logic easy to follow?
  </maintainability>
</review-criteria>

## Database Migrations

When adding database changes:

1. **Create migration file** in `/migrations/` directory
   ```sql
   -- migrations/013_add_new_feature.sql
   BEGIN TRANSACTION;
   
   ALTER TABLE tickets ADD COLUMN new_field TEXT;
   CREATE INDEX idx_tickets_new_field ON tickets(new_field);
   
   COMMIT;
   ```

2. **Test migration locally**
   ```bash
   npm run migrate:up
   npm run migrate:status
   ```

3. **Add integration test** for new database functionality
   ```javascript
   it('should store new field data', async () => {
     const data = { new_field: 'test_value' };
     const ticket = await databaseHelper.createTestTicket(data);
     expect(ticket.new_field).toBe('test_value');
   });
   ```

## Performance Guidelines

### Frontend Performance
- Use progressive loading for images (AVIF → WebP → JPEG)
- Implement virtual scrolling for large lists (gallery)
- Cache API responses appropriately (24 hours for static assets)
- Minimize JavaScript bundle size

### API Performance  
- Target <100ms response time for API endpoints
- Use database indexes for frequently queried fields
- Implement proper caching strategies
- Handle database connection pooling properly

### Test Performance
- Keep test suite under 60 seconds total execution time
- Individual tests should complete in under 2 seconds
- Use in-memory database for unit tests
- Optimize test setup/teardown

## Troubleshooting

### Common Issues

<troubleshooting-guide>
  <database-issues>
    **SQLITE_BUSY errors**
    - Use retry logic with exponential backoff
    - Ensure proper connection cleanup
    - Check for concurrent database access
    
    **Migration failures**
    - Verify migration SQL syntax
    - Check for conflicting column names
    - Ensure proper transaction boundaries
  </database-issues>
  
  <test-issues>
    **Tests timing out**
    - Check if Vercel dev server is running
    - Verify environment variables are set
    - Ensure database is properly initialized
    
    **Flaky tests**
    - Check for shared state between tests
    - Verify test cleanup is working
    - Look for timing-dependent assertions
  </test-issues>
  
  <api-issues>
    **500 errors**
    - Check server logs for error details
    - Verify database connection
    - Validate request parameters
    
    **Authentication failures**  
    - Verify JWT secret configuration
    - Check token expiration
    - Validate admin password hash
  </api-issues>
</troubleshooting-guide>

### Getting Help

- **Documentation**: Check `/docs/` directory for detailed guides
- **Test Examples**: Look at `tests-new/integration/` for patterns
- **Architecture**: See `CLAUDE.md` for project-specific guidance
- **Issues**: Create GitHub issue with detailed reproduction steps

## Quality Standards

### Code Quality
- No function longer than 20 lines
- No file longer than 200 lines (except documentation)
- Clear, descriptive naming
- Minimal nesting (max 3 levels)
- Comprehensive error handling

### Test Quality
- Focus on user-visible behavior
- Real API and database interactions
- Self-contained and readable
- Fast execution (<2 seconds per test)
- Reliable (no flaky tests)

### Documentation Quality
- Keep README.md up to date
- Document new environment variables
- Explain non-obvious architectural decisions
- Provide usage examples for new APIs

## Project Roadmap

<roadmap>
  <current-phase>
    **Phase: Test Simplification Complete**
    - ✅ Eliminate 70k+ lines of test complexity
    - ✅ Implement radical simplicity philosophy
    - ✅ Create comprehensive documentation
    - ✅ Establish contributor guidelines
  </current-phase>
  
  <next-priorities>
    - Migrate remaining legacy tests to new philosophy
    - Implement automated complexity detection
    - Create onboarding materials for new contributors
    - Establish performance monitoring for tests
  </next-priorities>
</roadmap>

---

## Summary

Contributing to this project means embracing radical simplicity. We value:

1. **Readable code** over clever abstractions
2. **Real testing** over elaborate mocking
3. **Direct solutions** over complex patterns  
4. **Maintainability** over short-term convenience
5. **User-focused behavior** over implementation details

When in doubt, choose the simpler approach that tests real functionality with minimal complexity.

**Welcome to the team!** 🎺🎉