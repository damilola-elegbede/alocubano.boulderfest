#!/usr/bin/env python3
"""
A Lo Cubano Boulder Fest - Link Validation Test Framework

This module provides comprehensive link validation testing for the festival website,
ensuring all internal and external links function correctly across the site.

Features:
- HTML parsing to extract all links from pages
- Internal link validation against existing files and server routing
- External link format validation (without making HTTP requests)
- Comprehensive reporting of broken or invalid links
- Integration with server.py routing logic

Usage:
    python3 test_link_validation.py
"""

import os
import re
import json
import sys
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Dict, Set, Tuple, Optional, Union
from dataclasses import dataclass, field
from enum import Enum


class LinkType(Enum):
    """Classification of link types for validation"""
    INTERNAL_PAGE = "internal_page"          # /home, /about, etc.
    INTERNAL_FILE = "internal_file"          # /css/base.css, /js/main.js
    INTERNAL_IMAGE = "internal_image"        # /images/logo.png
    EXTERNAL_HTTP = "external_http"          # https://example.com
    EXTERNAL_MAILTO = "external_mailto"      # mailto:email@domain.com
    FRAGMENT = "fragment"                    # #section-id
    JAVASCRIPT = "javascript"                # javascript:void(0)
    API_ENDPOINT = "api_endpoint"            # /api/gallery
    SPECIAL_ROUTE = "special_route"          # Routes handled by server.py


@dataclass
class LinkInfo:
    """Information about a discovered link"""
    url: str
    source_file: str
    line_number: int
    link_type: LinkType
    element_tag: str
    element_attributes: Dict[str, str] = field(default_factory=dict)
    is_valid: Optional[bool] = None
    validation_error: Optional[str] = None


@dataclass
class ValidationResults:
    """Results of link validation testing"""
    total_links: int = 0
    valid_links: int = 0
    invalid_links: int = 0
    links_by_type: Dict[LinkType, int] = field(default_factory=dict)
    broken_links: List[LinkInfo] = field(default_factory=list)
    all_links: List[LinkInfo] = field(default_factory=list)


class LinkExtractorParser(HTMLParser):
    """HTML parser to extract all links from HTML content"""
    
    def __init__(self, source_file: str):
        super().__init__()
        self.source_file = source_file
        self.links: List[LinkInfo] = []
        self.current_line = 1
        
        # Tags and attributes that contain links
        self.link_attributes = {
            'a': ['href'],
            'link': ['href'],
            'script': ['src'],
            'img': ['src'],
            'source': ['src', 'srcset'],
            'iframe': ['src'],
            'form': ['action'],
            'area': ['href'],
            'base': ['href']
        }
    
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str]]):
        """Extract links from HTML start tags"""
        if tag.lower() not in self.link_attributes:
            return
        
        attr_dict = dict(attrs)
        
        # Check each possible link attribute for this tag
        for attr_name in self.link_attributes[tag.lower()]:
            if attr_name in attr_dict and attr_dict[attr_name]:
                url = attr_dict[attr_name].strip()
                
                # Handle special cases
                if attr_name == 'srcset':
                    # Parse srcset attribute (comma-separated URLs with descriptors)
                    urls = self._parse_srcset(url)
                    for srcset_url in urls:
                        self._add_link(srcset_url, tag, attr_dict)
                else:
                    self._add_link(url, tag, attr_dict)
    
    def handle_data(self, data: str):
        """Count newlines to track line numbers"""
        self.current_line += data.count('\n')
    
    def _parse_srcset(self, srcset: str) -> List[str]:
        """Parse srcset attribute to extract URLs"""
        urls = []
        # srcset format: "url1 descriptor1, url2 descriptor2, ..."
        for item in srcset.split(','):
            parts = item.strip().split()
            if parts:
                urls.append(parts[0])  # First part is the URL
        return urls
    
    def _add_link(self, url: str, tag: str, attributes: Dict[str, str]):
        """Add a discovered link to the collection"""
        if not url or url in ['#', 'javascript:void(0)', 'javascript:;']:
            return
            
        # Skip template variables and JavaScript expressions from coverage files
        if self._is_template_variable(url):
            return
        
        link_type = self._classify_link(url)
        
        link_info = LinkInfo(
            url=url,
            source_file=self.source_file,
            line_number=self.current_line,
            link_type=link_type,
            element_tag=tag,
            element_attributes=attributes
        )
        
        self.links.append(link_info)
    
    def _is_template_variable(self, url: str) -> bool:
        """Check if URL is a template variable or JavaScript expression to skip"""
        # Skip template variables, JavaScript expressions, and coverage report artifacts
        skip_patterns = [
            '${',           # Template literals
            'request.url',  # JavaScript properties
            'link.href',    # JavaScript properties
            'imageUrl',     # JavaScript variables
            'fileId',       # JavaScript variables
            'scriptSrc',    # JavaScript variables
            'imageSrc',     # JavaScript variables
            'document.',    # DOM properties
            '</span>',      # HTML artifacts from coverage
            '&lt;',         # HTML entities
            '&gt;',         # HTML entities
            'blurredDataUrl', # JavaScript variables
            'item.thumbnailUrl', # Template expressions
        ]
        
        # Also skip single-word variables that are clearly not URLs
        single_word_variables = ['url', 'imageUrl', 'fileId']
        if url.strip() in single_word_variables:
            return True
        
        return any(pattern in url for pattern in skip_patterns)
    
    def _classify_link(self, url: str) -> LinkType:
        """Classify a link by its type"""
        url = url.lower().strip()
        
        # JavaScript links
        if url.startswith('javascript:'):
            return LinkType.JAVASCRIPT
        
        # Fragment links
        if url.startswith('#'):
            return LinkType.FRAGMENT
        
        # External links (including protocol-relative URLs)
        if url.startswith(('http://', 'https://', '//')):
            return LinkType.EXTERNAL_HTTP
        
        # Email links
        if url.startswith('mailto:'):
            return LinkType.EXTERNAL_MAILTO
        
        # API endpoints
        if url.startswith('/api/'):
            return LinkType.API_ENDPOINT
        
        # Parse URL to handle query parameters
        parsed_url = urllib.parse.urlparse(url)
        base_path = parsed_url.path.lower()
        
        # Internal file types (check base path without query params)
        if any(base_path.endswith(ext) for ext in ['.css', '.js', '.json']):
            return LinkType.INTERNAL_FILE
        
        # Internal images (check base path without query params)
        if any(base_path.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp']):
            return LinkType.INTERNAL_IMAGE
        
        # Special routes (handled by server.py routing)
        if url == '/' or url.startswith('/gallery-data/'):
            return LinkType.SPECIAL_ROUTE
        
        # Default to internal page
        return LinkType.INTERNAL_PAGE


class LinkValidator:
    """Core link validation logic"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.pages_dir = self.project_root / "pages"
        self.static_dirs = [
            self.project_root / "css",
            self.project_root / "js", 
            self.project_root / "images",
            self.project_root / "assets",
            self.project_root / "public"
        ]
        
        # Server.py routing patterns (based on current vercel.json)
        self.server_routes = {
            '/': '/index.html',
            '/home': '/pages/home.html',
            '/about': '/pages/about.html',
            '/contact': '/pages/contact.html',
            '/tickets': '/pages/tickets.html',
            '/donations': '/pages/donations.html',
            '/boulder-fest-2025': '/pages/boulder-fest-2025-index.html',
            '/boulder-fest-2025/artists': '/pages/boulder-fest-2025-artists.html',
            '/boulder-fest-2025/schedule': '/pages/boulder-fest-2025-schedule.html',
            '/boulder-fest-2025/gallery': '/pages/boulder-fest-2025-gallery.html',
            '/boulder-fest-2026': '/pages/boulder-fest-2026-index.html',
            '/boulder-fest-2026/artists': '/pages/boulder-fest-2026-artists.html',
            '/boulder-fest-2026/schedule': '/pages/boulder-fest-2026-schedule.html',
            '/boulder-fest-2026/gallery': '/pages/boulder-fest-2026-gallery.html',
            '/weekender-2026-09': '/pages/weekender-2026-09-index.html',
            '/weekender-2026-09/artists': '/pages/weekender-2026-09-artists.html',
            '/weekender-2026-09/schedule': '/pages/weekender-2026-09-schedule.html',
            '/weekender-2026-09/gallery': '/pages/weekender-2026-09-gallery.html',
            '/2026-artists': '/pages/boulder-fest-2026-artists.html',
            '/2026-schedule': '/pages/boulder-fest-2026-schedule.html',
            '/2026-gallery': '/pages/boulder-fest-2026-gallery.html',
            '/2025-artists': '/pages/boulder-fest-2025-artists.html',
            '/2025-schedule': '/pages/boulder-fest-2025-schedule.html',
            '/2025-gallery': '/pages/boulder-fest-2025-gallery.html',
            '/2026-sept-artists': '/pages/weekender-2026-09-artists.html',
            '/2026-sept-schedule': '/pages/weekender-2026-09-schedule.html',
            '/2026-sept-gallery': '/pages/weekender-2026-09-gallery.html',
            # Redirects that ultimately resolve to pages
            '/gallery-2025': '/pages/boulder-fest-2025-gallery.html',
            '/weekender-2026-09-tickets': '/pages/tickets.html',
            '/artists': '/pages/boulder-fest-2026-artists.html',
            '/schedule': '/pages/boulder-fest-2026-schedule.html',
            '/gallery': '/pages/boulder-fest-2026-gallery.html'
        }
        
        # API endpoints (from server.py)
        self.api_endpoints = {
            '/api/featured-photos',
            '/api/gallery',
            '/api/drive-folders', 
            '/api/debug-gallery'
        }
    
    def validate_link(self, link: LinkInfo) -> bool:
        """Validate a single link based on its type"""
        try:
            if link.link_type == LinkType.INTERNAL_PAGE:
                return self._validate_internal_page(link)
            
            elif link.link_type == LinkType.INTERNAL_FILE:
                return self._validate_internal_file(link)
            
            elif link.link_type == LinkType.INTERNAL_IMAGE:
                return self._validate_internal_image(link)
            
            elif link.link_type == LinkType.API_ENDPOINT:
                return self._validate_api_endpoint(link)
            
            elif link.link_type == LinkType.SPECIAL_ROUTE:
                return self._validate_special_route(link)
            
            elif link.link_type == LinkType.EXTERNAL_HTTP:
                return self._validate_external_http(link)
            
            elif link.link_type == LinkType.EXTERNAL_MAILTO:
                return self._validate_external_mailto(link)
            
            elif link.link_type in [LinkType.FRAGMENT, LinkType.JAVASCRIPT]:
                # These are considered valid by default
                return True
            
            else:
                link.validation_error = f"Unknown link type: {link.link_type}"
                return False
                
        except Exception as e:
            link.validation_error = f"Validation error: {str(e)}"
            return False
    
    def _validate_internal_page(self, link: LinkInfo) -> bool:
        """Validate internal page links"""
        url = link.url
        
        # Check server routing first
        if url in self.server_routes:
            target_file = self.project_root / self.server_routes[url].lstrip('/')
            if target_file.exists():
                return True
            else:
                link.validation_error = f"Route target file not found: {target_file}"
                return False
        
        # Check direct file access
        # Remove leading slash and check if file exists
        clean_url = url.lstrip('/')
        
        # Try with .html extension
        html_file = self.project_root / f"{clean_url}.html"
        if html_file.exists():
            return True
        
        # Try in pages directory
        pages_file = self.pages_dir / f"{clean_url}.html"
        if pages_file.exists():
            return True
        
        # Try as directory with index.html
        index_file = self.project_root / clean_url / "index.html"
        if index_file.exists():
            return True
        
        link.validation_error = f"Internal page not found: {url}"
        return False
    
    def _validate_internal_file(self, link: LinkInfo) -> bool:
        """Validate internal file links (CSS, JS, JSON)"""
        # Parse URL to remove query parameters for file validation
        parsed_url = urllib.parse.urlparse(link.url)
        clean_path = parsed_url.path.lstrip('/')
        
        file_path = self.project_root / clean_path
        
        if file_path.exists():
            return True
        
        # Check in static directories
        for static_dir in self.static_dirs:
            if static_dir.exists():
                static_file = static_dir / Path(clean_path).name
                if static_file.exists():
                    return True
        
        link.validation_error = f"Internal file not found: {parsed_url.path}"
        return False
    
    def _validate_internal_image(self, link: LinkInfo) -> bool:
        """Validate internal image links"""
        url = link.url.lstrip('/')
        file_path = self.project_root / url
        
        if file_path.exists():
            return True
        
        link.validation_error = f"Internal image not found: {link.url}"
        return False
    
    def _validate_api_endpoint(self, link: LinkInfo) -> bool:
        """Validate API endpoint links"""
        # Extract base endpoint path
        parsed = urllib.parse.urlparse(link.url)
        base_path = parsed.path
        
        # Check if it's a known API endpoint
        if base_path in self.api_endpoints:
            return True
        
        # Check for parameterized endpoints
        if base_path.startswith('/api/image-proxy/'):
            # Extract file ID and validate format
            file_id_match = re.match(r'/api/image-proxy/([a-zA-Z0-9_-]{10,50})', base_path)
            if file_id_match:
                return True
            else:
                link.validation_error = f"Invalid image proxy file ID format: {base_path}"
                return False
        
        link.validation_error = f"Unknown API endpoint: {base_path}"
        return False
    
    def _validate_special_route(self, link: LinkInfo) -> bool:
        """Validate special routes handled by server.py"""
        url = link.url
        
        if url == '/':
            # Root route redirects to index.html
            return (self.project_root / "index.html").exists()
        
        
        elif url.startswith('/gallery-data/') and url.endswith('.json'):
            # Static gallery data files
            public_file = self.project_root / "public" / url.lstrip('/')
            return public_file.exists()
        
        elif url == '/featured-photos.json':
            # Static featured photos JSON
            public_file = self.project_root / "public" / "featured-photos.json"
            return public_file.exists()
        
        link.validation_error = f"Unknown special route: {url}"
        return False
    
    def _validate_external_http(self, link: LinkInfo) -> bool:
        """Validate external HTTP links (format validation only)"""
        url = link.url
        
        # Handle protocol-relative URLs (//example.com)
        if url.startswith('//'):
            # Protocol-relative URLs are valid, just check the netloc part
            try:
                parsed = urllib.parse.urlparse('https:' + url)  # Add a scheme for parsing
                if not parsed.netloc:
                    link.validation_error = f"Invalid protocol-relative URL format: {url}"
                    return False
                return True
            except Exception as e:
                link.validation_error = f"Protocol-relative URL parsing error: {str(e)}"
                return False
        
        # Basic URL format validation for full URLs
        try:
            parsed = urllib.parse.urlparse(url)
            if not all([parsed.scheme, parsed.netloc]):
                link.validation_error = f"Invalid URL format: {url}"
                return False
            
            # Check for common protocols
            if parsed.scheme not in ['http', 'https']:
                link.validation_error = f"Unsupported protocol: {parsed.scheme}"
                return False
            
            return True
            
        except Exception as e:
            link.validation_error = f"URL parsing error: {str(e)}"
            return False
    
    def _validate_external_mailto(self, link: LinkInfo) -> bool:
        """Validate mailto links"""
        url = link.url
        
        # Basic mailto format validation
        if not url.startswith('mailto:'):
            link.validation_error = "Mailto link must start with 'mailto:'"
            return False
        
        # Extract email address
        email_part = url[7:]  # Remove 'mailto:'
        
        # Handle query parameters (subject, body, etc.)
        if '?' in email_part:
            email_part = email_part.split('?')[0]
        
        # Basic email format validation
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email_part):
            link.validation_error = f"Invalid email format: {email_part}"
            return False
        
        return True


class HTMLFileFinder:
    """Find and manage HTML files for testing"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
    
    def find_html_files(self) -> List[Path]:
        """Find all HTML files that should be tested"""
        html_files = []
        
        # Include root index.html
        root_index = self.project_root / "index.html"
        if root_index.exists():
            html_files.append(root_index)
        
        # Include all files in pages directory
        pages_dir = self.project_root / "pages"
        if pages_dir.exists():
            for html_file in pages_dir.glob("*.html"):
                html_files.append(html_file)
        
        # Exclude test files and coverage reports
        excluded_patterns = [
            "**/node_modules/**",
            "**/coverage/**",
            "**/lcov-report/**", 
            "**/*test*.html",
            "**/favicon-*.html",
            "**/test-reports/**"
        ]
        
        filtered_files = []
        for html_file in html_files:
            exclude_file = False
            for pattern in excluded_patterns:
                if html_file.match(pattern):
                    exclude_file = True
                    break
            if not exclude_file:
                filtered_files.append(html_file)
        
        return filtered_files


class TestRunner:
    """Execute link validation tests and generate reports"""
    
    def __init__(self, project_root: str):
        self.project_root = project_root
        self.file_finder = HTMLFileFinder(project_root)
        self.validator = LinkValidator(project_root)
    
    def run_all_tests(self) -> ValidationResults:
        """Run comprehensive link validation tests"""
        print("🔍 A Lo Cubano Boulder Fest - Link Validation Tests")
        print("=" * 60)
        
        results = ValidationResults()
        html_files = self.file_finder.find_html_files()
        
        print(f"📄 Found {len(html_files)} HTML files to test")
        
        for html_file in html_files:
            print(f"\n📝 Testing: {html_file.relative_to(Path(self.project_root))}")
            file_results = self._test_file(html_file)
            results = self._merge_results(results, file_results)
        
        # Final validation
        self._perform_validation(results)
        
        return results
    
    def _test_file(self, html_file: Path) -> ValidationResults:
        """Test links in a single HTML file"""
        results = ValidationResults()
        
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse HTML and extract links
            parser = LinkExtractorParser(str(html_file))
            parser.feed(content)
            
            results.all_links.extend(parser.links)
            results.total_links += len(parser.links)
            
            # Count links by type
            for link in parser.links:
                link_type = link.link_type
                results.links_by_type[link_type] = results.links_by_type.get(link_type, 0) + 1
            
            print(f"   Found {len(parser.links)} links")
            
        except Exception as e:
            print(f"   ❌ Error reading file: {e}")
        
        return results
    
    def _merge_results(self, main_results: ValidationResults, file_results: ValidationResults) -> ValidationResults:
        """Merge results from individual file testing"""
        main_results.total_links += file_results.total_links
        main_results.all_links.extend(file_results.all_links)
        
        for link_type, count in file_results.links_by_type.items():
            main_results.links_by_type[link_type] = main_results.links_by_type.get(link_type, 0) + count
        
        return main_results
    
    def _perform_validation(self, results: ValidationResults):
        """Perform actual link validation"""
        print(f"\n🔗 Validating {results.total_links} total links...")
        
        for link in results.all_links:
            is_valid = self.validator.validate_link(link)
            link.is_valid = is_valid
            
            if is_valid:
                results.valid_links += 1
            else:
                results.invalid_links += 1
                results.broken_links.append(link)
    
    def generate_report(self, results: ValidationResults) -> str:
        """Generate a comprehensive test report"""
        report_lines = []
        
        # Header
        report_lines.append("=" * 80)
        report_lines.append("A LO CUBANO BOULDER FEST - LINK VALIDATION REPORT")
        report_lines.append("=" * 80)
        report_lines.append("")
        
        # Summary
        report_lines.append("📊 SUMMARY")
        report_lines.append("-" * 40)
        report_lines.append(f"Total Links Tested: {results.total_links}")
        report_lines.append(f"Valid Links: {results.valid_links}")
        report_lines.append(f"Invalid Links: {results.invalid_links}")
        
        if results.total_links > 0:
            success_rate = (results.valid_links / results.total_links) * 100
            report_lines.append(f"Success Rate: {success_rate:.1f}%")
        
        report_lines.append("")
        
        # Links by Type
        report_lines.append("📈 LINKS BY TYPE")
        report_lines.append("-" * 40)
        for link_type, count in sorted(results.links_by_type.items(), key=lambda x: x[0].value):
            report_lines.append(f"{link_type.value:20}: {count:4d}")
        report_lines.append("")
        
        # Broken Links
        if results.broken_links:
            report_lines.append("❌ BROKEN LINKS")
            report_lines.append("-" * 40)
            
            # Group broken links by type
            broken_by_type = {}
            for link in results.broken_links:
                link_type = link.link_type
                if link_type not in broken_by_type:
                    broken_by_type[link_type] = []
                broken_by_type[link_type].append(link)
            
            for link_type, broken_links in broken_by_type.items():
                report_lines.append(f"\n{link_type.value.upper()} ({len(broken_links)} broken):")
                for link in broken_links:
                    source_file = Path(link.source_file).name
                    report_lines.append(f"  • {link.url}")
                    report_lines.append(f"    Source: {source_file}:{link.line_number}")
                    report_lines.append(f"    Error: {link.validation_error}")
                    report_lines.append("")
        else:
            report_lines.append("✅ NO BROKEN LINKS FOUND")
            report_lines.append("")
        
        # Recommendations
        report_lines.append("💡 RECOMMENDATIONS")
        report_lines.append("-" * 40)
        
        if results.broken_links:
            report_lines.append("1. Fix all broken internal links to prevent 404 errors")
            report_lines.append("2. Verify external link URLs are correct")
            report_lines.append("3. Consider implementing redirect handling for moved pages")
        else:
            report_lines.append("✅ All links validated successfully!")
            report_lines.append("🎉 Your website's link structure is solid!")
        
        report_lines.append("")
        report_lines.append("=" * 80)
        
        return "\n".join(report_lines)


def main():
    """Main test execution function"""
    # Get project root directory (go up 4 levels from tests/unit/link-validation/)
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    
    # Initialize test runner
    runner = TestRunner(project_root)
    
    # Run all tests
    results = runner.run_all_tests()
    
    # Generate and display report
    report = runner.generate_report(results)
    print("\n" + report)
    
    # Save report to file
    report_file = os.path.join(project_root, "link_validation_report.txt")
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"\n📄 Full report saved to: {report_file}")
    
    # Exit with appropriate code
    if results.invalid_links > 0:
        print(f"\n❌ Test failed: {results.invalid_links} broken links found")
        return 1
    else:
        print("\n✅ All link validation tests passed!")
        return 0


if __name__ == "__main__":
    sys.exit(main())