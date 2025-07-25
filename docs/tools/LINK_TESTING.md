# Link Validation Test Framework

## Overview

This test framework provides comprehensive link validation for the A Lo Cubano Boulder Fest website. It automatically discovers and validates all links across HTML files to prevent broken links and ensure a smooth user experience.

## Features

✅ **Comprehensive Link Detection**
- HTML parsing to extract all links from pages
- Support for `href`, `src`, `srcset`, and `action` attributes
- Handles complex link structures and query parameters

✅ **Smart Link Classification**
- Internal pages (routed through Vercel)
- Internal files (CSS, JS, JSON)
- Internal images (PNG, JPG, SVG, etc.)
- API endpoints (/api/*)
- External HTTP/HTTPS links
- Email (mailto:) links
- Fragment links (#section)
- JavaScript links

✅ **Server Integration**
- Understands Vercel routing patterns
- Validates clean URLs (/home → /pages/home.html)
- Handles special routes like /gallery-2025
- API endpoint validation

✅ **Detailed Reporting**
- Success rate statistics
- Links grouped by type
- Broken link details with source location
- Actionable recommendations

## Quick Start

### Run All Tests
```bash
# Simple runner
python3 tools/link-validation/run_link_tests.py

# Direct execution
python3 tests/unit/link-validation/test_link_validation.py
```

### Test Output
```
🔍 A Lo Cubano Boulder Fest - Link Validation Tests
============================================================
📄 Found 9 HTML files to test
🔗 Validating 251 total links...
✅ All link validation tests passed!
```

## File Structure

```
/
├── tests/
│   └── unit/
│       └── link-validation/
│           └── test_link_validation.py      # Main test framework
├── tools/
│   └── link-validation/
│       ├── run_link_tests.py            # Simple test runner
│       └── link_validation_config.json  # Configuration settings
├── docs/
│   └── tools/
│       └── LINK_TESTING.md              # This documentation
├── link_validation_report.txt   # Generated test report
└── link_validation_results.json # JSON results (optional)
```

## Configuration

The framework can be customized through `link_validation_config.json`:

- **File Discovery**: Control which HTML files to test
- **Validation Settings**: Enable/disable specific validation types
- **Server Routes**: Define custom routing patterns
- **API Endpoints**: Specify valid API endpoints
- **Reporting**: Customize output format and detail level

## Link Types Validated

### Internal Pages
- `/home` → `/pages/home.html`
- `/about` → `/pages/about.html`
- Clean URLs handled by Vercel routing

### Internal Files
- CSS: `/css/base.css`, `/css/typography.css`
- JavaScript: `/js/main.js`, `/js/navigation.js`
- JSON: `/public/featured-photos.json`
- Query parameters: `/js/main.js?v=2025-07-20`

### Internal Images
- Logo: `/images/logo.png`
- Favicons: `/images/favicon-*.png`
- SVG icons: `/images/social/instagram-type.svg`

### API Endpoints
- Gallery: `/api/gallery?year=2025`
- Featured Photos: `/api/featured-photos`
- Image Proxy: `/api/image-proxy/abc123`

### External Links
- Social Media: `https://instagram.com/alocubanoboulder`
- Email: `mailto:alocubanoboulderfest@gmail.com`
- WhatsApp: `https://chat.whatsapp.com/...`

## Integration with Development Workflow

### Pre-commit Testing
Add to your pre-commit hooks:
```bash
#!/bin/bash
python3 tools/link-validation/run_link_tests.py
if [ $? -ne 0 ]; then
  echo "❌ Link validation failed. Please fix broken links before committing."
  exit 1
fi
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Validate Links
  run: |
    python3 tests/unit/link-validation/test_link_validation.py
```

### Development Server Testing
The tests understand your Vercel routing, so they work seamlessly with:
```bash
npm start  # Start development server
python3 tools/link-validation/run_link_tests.py  # Test all links
```

## Troubleshooting

### Common Issues

**File Not Found Errors**
- Check if the file exists in the expected location
- Verify Vercel routing for page links
- Ensure static files are in correct directories

**Query Parameter Issues**
- Framework ignores query parameters for file validation
- `/js/main.js?v=123` validates `/js/main.js`

**External Link Validation**
- Framework only validates URL format by default
- Set `check_external_links: true` for HTTP status validation
- Consider rate limiting for external checks

### Debug Mode
Enable verbose logging by modifying the test configuration:
```json
{
  "reporting": {
    "verbose_output": true,
    "show_successful_links": true
  }
}
```

## Framework Architecture

### Core Components

- **`LinkExtractorParser`**: HTML parser for link discovery
- **`LinkValidator`**: Core validation logic for different link types
- **`HTMLFileFinder`**: Discovers testable HTML files
- **`TestRunner`**: Orchestrates testing and reporting

### Validation Flow

1. **Discovery**: Find all HTML files to test
2. **Extraction**: Parse HTML and extract all links
3. **Classification**: Categorize links by type
4. **Validation**: Apply type-specific validation rules
5. **Reporting**: Generate comprehensive test results

## Extending the Framework

### Adding New Link Types
```python
class LinkType(Enum):
    CUSTOM_TYPE = "custom_type"

# Add validation logic
def _validate_custom_type(self, link: LinkInfo) -> bool:
    # Custom validation logic
    return True
```

### Custom Validation Rules
```python
def _validate_internal_page(self, link: LinkInfo) -> bool:
    # Override default validation
    # Add custom routing logic
    return custom_validation_result
```

### Custom Reporting
```python
def generate_custom_report(self, results: ValidationResults) -> str:
    # Generate custom report format
    return custom_report
```

## Best Practices

1. **Run Tests Regularly**: Validate links before each deployment
2. **Fix Broken Links Immediately**: Don't let broken links accumulate  
3. **Update Route Configuration**: Keep server routes in sync
4. **Monitor External Links**: Periodically check external link health
5. **Document Link Changes**: Update tests when adding new link patterns

## Performance Considerations

- **File Discovery**: Only scans relevant HTML files
- **Parsing Optimization**: Efficient HTML parsing with line tracking
- **Validation Caching**: Results cached during single test run
- **External Link Limits**: Rate limiting for external validations
- **Memory Usage**: Processes files individually to minimize memory

This framework ensures your festival website maintains excellent link integrity, providing a smooth experience for all your Cuban salsa enthusiasts! 🎵💃