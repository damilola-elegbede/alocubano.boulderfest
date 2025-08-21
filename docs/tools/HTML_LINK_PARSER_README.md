# HTML Link Parser Utilities

Specialized HTML parsing tools for extracting and categorizing links from the A Lo Cubano Boulder Fest website's HTML files.

## Overview

This toolkit provides comprehensive link extraction, categorization, validation, and reporting capabilities specifically designed for the project's HTML structure. It consists of three main components:

1. **`tools/link-validation/html_link_parser.py`** - Core HTML parsing and link extraction
2. **`tools/link-validation/link_validation_utils.py`** - Link validation and accessibility checking
3. **`tools/link-validation/link_analyzer.py`** - Command-line interface for easy usage

## Features

### Link Extraction

- Extracts all `href`, `src`, and `action` attributes from HTML files
- Captures metadata: source file, line number, context, attributes
- Handles the specific HTML structure used in the A Lo Cubano website

### Link Categorization

- **Navigation links**: Header/footer navigation (nav, header, footer context)
- **Content links**: Body content links (main content area)
- **Asset links**: CSS, JS, images, fonts (by file extension)
- **External links**: HTTP/HTTPS links to other domains
- **Social links**: Instagram, WhatsApp, Facebook, etc.
- **Email links**: `mailto:` links
- **Anchor links**: Internal page anchors (`#section`)

### Validation & Analysis

- **Internal link validation**: Check if files/routes exist
- **External link validation**: HTTP status code checking (optional)
- **Accessibility checking**: Missing alt text, aria-labels, rel attributes
- **Comprehensive reporting**: Summary and detailed JSON reports

## Installation

No additional dependencies required beyond Python 3.6+ standard library. For external link validation, install `requests`:

```bash
pip install requests
```

## Usage

### Command Line Interface (Recommended)

```bash
# Quick analysis (internal links only)
python3 tools/link-validation/link_analyzer.py --quick

# Full analysis including external link validation
python3 tools/link-validation/link_analyzer.py --full

# Analyze a single HTML file
python3 tools/link-validation/link_analyzer.py --file pages/about.html

# Show only navigation links
python3 tools/link-validation/link_analyzer.py --category nav

# Export detailed data to CSV
python3 tools/link-validation/link_analyzer.py --export-csv

# Show help
python3 tools/link-validation/link_analyzer.py --help
```

### Python API

```python
from tools.link_validation.html_link_parser import HTMLLinkExtractor
from tools.link_validation.link_validation_utils import LinkAnalyzer

# Basic parsing
extractor = HTMLLinkExtractor()
results = extractor.parse_project()

print(f"Found {len(results.links)} total links")
print(f"Navigation links: {len(results.navigation_links)}")
print(f"Asset links: {len(results.asset_links)}")

# Full analysis with validation
analyzer = LinkAnalyzer()
results, validation = analyzer.run_full_analysis(validate_external=True)
analyzer.generate_reports(results, validation)
```

## File Structure

```
project/
├── tools/
│   └── link-validation/
│       ├── html_link_parser.py          # Core parsing functionality
│       ├── link_validation_utils.py     # Validation and reporting
│       └── link_analyzer.py             # CLI interface
└── docs/
    └── tools/
        └── HTML_LINK_PARSER_README.md   # This file
└── Generated output files:
    ├── link_analysis.csv         # Detailed CSV export
    ├── link_analysis_summary.txt # Human-readable summary
    └── link_analysis_detailed.json # JSON report
```

## Core Classes

### `LinkInfo`

Data class containing information about a single link:

```python
@dataclass
class LinkInfo:
    href: str                    # The link URL
    text: str                    # Link text content
    source_file: str             # Source HTML file path
    line_number: int             # Line number in source
    tag: str                     # HTML tag (a, img, link, script)
    attributes: Dict[str, str]   # All HTML attributes
    context: str                 # Parsing context (header|nav|main|footer)
    category: str                # Categorized type
    is_valid: bool              # Validation status
    error_message: str          # Error details if invalid
```

### `ParseResults`

Container for categorized parsing results:

```python
@dataclass
class ParseResults:
    links: List[LinkInfo]           # All links
    navigation_links: List[LinkInfo] # Nav/header/footer links
    content_links: List[LinkInfo]   # Main content links
    asset_links: List[LinkInfo]     # CSS/JS/image assets
    external_links: List[LinkInfo]  # External HTTP links
    anchor_links: List[LinkInfo]    # Internal anchors (#)
    email_links: List[LinkInfo]     # mailto: links
    social_links: List[LinkInfo]    # Social media links
```

### `ALCBFHTMLParser`

Specialized HTML parser for the A Lo Cubano website structure:

- Tracks parsing context (header, nav, main, footer)
- Extracts links with proper categorization metadata
- Handles the specific HTML patterns used in the project

### `LinkCategorizer`

Categorizes extracted links based on:

- URL patterns (internal vs external, social domains)
- File extensions (assets)
- HTML context (navigation areas)
- Link attributes

### `LinkValidator`

Validates links and checks accessibility:

- Internal link validation (file existence)
- External link HTTP status checking
- Accessibility attribute validation
- Security attribute checking (rel="noopener")

## Website-Specific Features

### Navigation Detection

Automatically identifies navigation links based on:

- HTML context (header, nav, footer elements)
- Known navigation paths (`/home`, `/about`, `/artists`, etc.)
- CSS classes and ARIA labels

### Social Media Recognition

Recognizes social media platforms:

- Instagram (`instagram.com/alocubanoboulder`)
- WhatsApp (`chat.whatsapp.com/...`)
- Facebook, Twitter, YouTube, etc.

### Asset Classification

Categorizes assets by extension:

- Stylesheets: `.css`
- Scripts: `.js`
- Images: `.png`, `.jpg`, `.svg`, `.webp`
- Fonts: `.woff`, `.woff2`, `.ttf`
- Documents: `.pdf`

## Sample Output

### Quick Analysis

```
A Lo Cubano Boulder Fest - Quick Link Analysis
==================================================
Total links: 271
Unique URLs: 44
Files analyzed: 12

Link categories:
  Navigation  :  64
  Content     :  25
  Assets      : 152
  External    :   3
  Social      :  16
  Email       :   9
  Anchor      :   2

External domains:
  picsum.photos
```

### Category Display

```bash
python3 tools/link-validation/link_analyzer.py --category social
```

```
SOCIAL LINKS (16 found)
==================================================
https://www.instagram.com/alocubano.boulderfest/ | home.html     |
https://chat.whatsapp.com/...          | home.html     |
...
```

## Integration with Test Framework

These utilities are designed to integrate with link validation test frameworks:

```python
# Use in pytest or other testing frameworks
def test_all_internal_links_valid():
    extractor = HTMLLinkExtractor()
    results = extractor.parse_project()
    validator = LinkValidator()
    validation = validator.validate_internal_links(results)

    assert len(validation['missing']) == 0, f"Missing links: {validation['missing']}"

def test_accessibility_compliance():
    analyzer = LinkAnalyzer()
    results, validation = analyzer.run_full_analysis()
    accessibility_issues = validation['accessibility']

    # Check for critical accessibility issues
    assert len(accessibility_issues['missing_aria_label']) < 5
    assert len(accessibility_issues['external_without_rel']) == 0
```

## Performance Considerations

- **Memory usage**: Minimal - processes files sequentially
- **Speed**: Fast for internal validation, slower for external link checking
- **Scalability**: Suitable for websites with hundreds of links
- **Caching**: Results can be cached and compared between runs

## Error Handling

- **File not found**: Graceful handling with error messages
- **Malformed HTML**: Continues parsing, reports issues
- **Network timeouts**: Configurable timeouts for external validation
- **Encoding issues**: Handles UTF-8 and other common encodings

## Extending the Parser

### Adding New Link Categories

```python
# In LinkCategorizer.categorize_link()
if href.endswith('.pdf'):
    return 'document'
```

### Custom Validation Rules

```python
# In LinkValidator
def validate_custom_rule(self, link: LinkInfo) -> bool:
    # Add custom validation logic
    return True
```

### Additional Metadata Extraction

```python
# In ALCBFHTMLParser.handle_starttag()
if 'data-custom' in attrs_dict:
    link_info.custom_attribute = attrs_dict['data-custom']
```

## Troubleshooting

### Common Issues

1. **ImportError**: Ensure all files are in the same directory
2. **Permission errors**: Check file permissions on HTML files
3. **External validation timeout**: Increase timeout or skip external validation
4. **Memory usage**: For very large sites, consider processing files in batches

### Debug Mode

Add debug prints in the parser:

```python
# In ALCBFHTMLParser
def handle_starttag(self, tag, attrs):
    print(f"Processing {tag} at line {self.current_line}")
    # ... rest of method
```

## Future Enhancements

- [ ] Support for JavaScript-rendered content
- [ ] Integration with CI/CD pipelines
- [ ] Performance metrics and benchmarking
- [ ] Visual link relationship mapping
- [ ] Historical link change tracking
- [ ] SEO-focused link analysis

## License

This tool is part of the A Lo Cubano Boulder Fest project and follows the same licensing terms.
