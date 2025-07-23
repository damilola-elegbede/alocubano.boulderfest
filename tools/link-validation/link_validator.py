#!/usr/bin/env python3
"""
Link Validation Logic for A Lo Cubano Boulder Fest Website

This module provides comprehensive link validation for all link types:
- Internal page links (clean URLs)
- Asset references (CSS, JS, images)
- External links (social media, email)
- API endpoints
- Anchor links within pages

Integrates with the server.py routing logic to validate that clean URLs
properly map to existing HTML files in the pages/ directory.
"""

import os
import re
import json
from urllib.parse import urlparse, urljoin
from typing import List, Dict, Set, Tuple, Optional, Union
from pathlib import Path


class LinkValidationResult:
    """Result of link validation with detailed information"""
    
    def __init__(self, link: str, is_valid: bool, link_type: str, 
                 target_path: Optional[str] = None, error_message: Optional[str] = None):
        self.link = link
        self.is_valid = is_valid
        self.link_type = link_type  # 'internal', 'external', 'asset', 'api', 'anchor', 'mailto'
        self.target_path = target_path
        self.error_message = error_message
    
    def __str__(self):
        status = "✅" if self.is_valid else "❌"
        return f"{status} [{self.link_type}] {self.link}"


class LinkValidator:
    """Comprehensive link validator for the A Lo Cubano Boulder Fest website"""
    
    def __init__(self, project_root: str, config_path: Optional[str] = None):
        """Initialize validator with project root directory"""
        self.project_root = Path(project_root).resolve()
        self.pages_dir = self.project_root / "pages"
        self.css_dir = self.project_root / "css"
        self.js_dir = self.project_root / "js"
        self.images_dir = self.project_root / "images"
        self.api_dir = self.project_root / "api"
        
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Cache of existing files for performance
        self._file_cache = {}
        self._build_file_cache()
    
    def _load_config(self, config_path: Optional[str] = None) -> Dict:
        """Load configuration from JSON file"""
        if config_path is None:
            config_path = self.project_root / "tools" / "link-validation" / "link_validation_config.json"
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            # Return default config if file not found or invalid
            return {
                "validation_settings": {
                    "skip_dns_prefetch": True,
                    "skip_protocol_relative": True
                },
                "exclusion_patterns": {
                    "dns_prefetch_links": ["//fonts.googleapis.com", "//fonts.gstatic.com"],
                    "protocol_relative_pattern": "^//[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
                    "skip_rel_attributes": ["dns-prefetch", "preconnect", "prefetch"]
                }
            }
    
    def _build_file_cache(self) -> None:
        """Build cache of all existing files for fast lookups"""
        for directory in [self.pages_dir, self.css_dir, self.js_dir, self.images_dir, self.api_dir]:
            if directory.exists():
                for file_path in directory.rglob("*"):
                    if file_path.is_file():
                        relative_path = file_path.relative_to(self.project_root)
                        self._file_cache[str(relative_path)] = file_path
    
    def _should_skip_link(self, link: str, link_attributes: Dict[str, str] = None) -> Tuple[bool, str]:
        """Check if a link should be skipped based on configuration patterns"""
        if not link_attributes:
            link_attributes = {}
            
        exclusions = self.config.get("exclusion_patterns", {})
        settings = self.config.get("validation_settings", {})
        
        # Skip DNS prefetch and similar rel attributes
        rel_attr = link_attributes.get("rel", "").lower()
        skip_rel_attrs = exclusions.get("skip_rel_attributes", [])
        if rel_attr in skip_rel_attrs:
            return True, f"Skipped: rel='{rel_attr}' link (DNS prefetch/preconnect)"
        
        # Skip specific DNS prefetch links
        dns_prefetch_links = exclusions.get("dns_prefetch_links", [])
        if link in dns_prefetch_links:
            return True, "Skipped: Known DNS prefetch link"
        
        # Skip protocol-relative URLs if configured
        if settings.get("skip_protocol_relative", False) and link.startswith("//"):
            protocol_pattern = exclusions.get("protocol_relative_pattern", "")
            if protocol_pattern and re.match(protocol_pattern, link):
                return True, "Skipped: Protocol-relative URL"
        
        return False, ""
    
    def validate_link(self, link: str, source_file: Optional[str] = None, link_attributes: Dict[str, str] = None) -> LinkValidationResult:
        """
        Validate a single link and return detailed result
        
        Args:
            link: The link to validate
            source_file: Optional source file path for context
            link_attributes: Optional dictionary of link attributes (rel, class, etc.)
            
        Returns:
            LinkValidationResult with validation details
        """
        # Handle empty or invalid links
        if not link or not isinstance(link, str):
            return LinkValidationResult(
                link=str(link), 
                is_valid=False, 
                link_type="invalid",
                error_message="Empty or invalid link"
            )
        
        # Check if link should be skipped
        should_skip, skip_reason = self._should_skip_link(link, link_attributes)
        if should_skip:
            return LinkValidationResult(
                link=link,
                is_valid=True,  # Mark as valid since it's intentionally skipped
                link_type="skipped",
                target_path=skip_reason
            )
        
        # Parse the link
        parsed = urlparse(link.strip())
        
        # Determine link type and validate accordingly
        if parsed.scheme in ('http', 'https'):
            return self._validate_external_link(link, parsed)
        elif link.startswith('//'):
            # Protocol-relative URLs - treat as external
            return self._validate_protocol_relative_link(link)
        elif parsed.scheme == 'mailto':
            return self._validate_mailto_link(link, parsed)
        elif link.startswith('#'):
            return self._validate_anchor_link(link, source_file)
        elif link.startswith('/api/'):
            return self._validate_api_link(link)
        elif link.startswith('/'):
            return self._validate_internal_link(link)
        else:
            # Relative links
            return self._validate_relative_link(link, source_file)
    
    def _validate_internal_link(self, link: str) -> LinkValidationResult:
        """Validate internal page links using server.py routing logic"""
        path = link.lstrip('/')
        
        # Handle root path redirect
        if not path or path == '/':
            # Root redirects to /home according to server.py line 190-191
            return self._validate_internal_link('/home')
        
        # Handle special cases from server.py routing
        
        # Static JSON files in public directory
        if path == 'featured-photos.json':
            target_file = self.project_root / "public" / "featured-photos.json"
            return LinkValidationResult(
                link=link,
                is_valid=target_file.exists(),
                link_type="internal",
                target_path=str(target_file) if target_file.exists() else None,
                error_message=None if target_file.exists() else f"Featured photos JSON not found: {target_file}"
            )
        
        # Gallery data JSON files
        if path.startswith('gallery-data/') and path.endswith('.json'):
            target_file = self.project_root / "public" / path
            return LinkValidationResult(
                link=link,
                is_valid=target_file.exists(),
                link_type="internal",
                target_path=str(target_file) if target_file.exists() else None,
                error_message=None if target_file.exists() else f"Gallery data JSON not found: {target_file}"
            )
        
        # Check for direct asset access
        if any(path.startswith(asset_type + '/') for asset_type in ['css', 'js', 'images']):
            return self._validate_asset_link(link)
        
        # Clean URL routing logic from server.py lines 194-207
        # Try adding .html extension for page links
        html_file_path = self.pages_dir / f"{path}.html"
        
        if html_file_path.exists():
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="internal",
                target_path=str(html_file_path)
            )
        
        # Check if it's a directory with index.html
        dir_path = self.pages_dir / path
        if dir_path.is_dir():
            index_path = dir_path / "index.html"
            if index_path.exists():
                return LinkValidationResult(
                    link=link,
                    is_valid=True,
                    link_type="internal",
                    target_path=str(index_path)
                )
        
        # Check root level files
        root_file = self.project_root / f"{path}.html"
        if root_file.exists():
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="internal",
                target_path=str(root_file)
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="internal",
            error_message=f"No matching page found for clean URL: {link}"
        )
    
    def _validate_asset_link(self, link: str) -> LinkValidationResult:
        """Validate asset links (CSS, JS, images)"""
        # Parse URL to handle query parameters
        parsed = urlparse(link)
        path = parsed.path.lstrip('/')
        target_file = self.project_root / path
        
        # Determine asset type
        if path.startswith('css/'):
            asset_type = "css"
        elif path.startswith('js/'):
            asset_type = "javascript"
        elif path.startswith('images/'):
            asset_type = "image"
        else:
            asset_type = "asset"
        
        # Check if file exists (ignoring query parameters)
        is_valid = target_file.exists()
        query_info = f" (with query: {parsed.query})" if parsed.query else ""
        
        return LinkValidationResult(
            link=link,
            is_valid=is_valid,
            link_type=asset_type,
            target_path=str(target_file) + query_info if is_valid else None,
            error_message=None if is_valid else f"Asset not found: {target_file}"
        )
    
    def _validate_api_link(self, link: str) -> LinkValidationResult:
        """Validate API endpoint links"""
        path = link.lstrip('/')
        
        # Known API endpoints from server.py
        valid_api_endpoints = {
            'api/featured-photos',
            'api/gallery', 
            'api/drive-folders',
            'api/debug-gallery'
        }
        
        # Image proxy pattern
        image_proxy_pattern = r'^api/image-proxy/[a-zA-Z0-9_-]{10,50}$'
        
        # Check exact match for known endpoints
        if path in valid_api_endpoints:
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="api",
                target_path=f"Server endpoint: {path}"
            )
        
        # Check image proxy pattern
        if re.match(image_proxy_pattern, path):
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="api",
                target_path=f"Image proxy endpoint: {path}"
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="api",
            error_message=f"Unknown API endpoint: {link}"
        )
    
    def _validate_external_link(self, link: str, parsed) -> LinkValidationResult:
        """Validate external HTTP/HTTPS links"""
        # Basic URL structure validation
        if not parsed.netloc:
            return LinkValidationResult(
                link=link,
                is_valid=False,
                link_type="external",
                error_message="Invalid URL: missing domain"
            )
        
        # Validate common social media patterns
        social_patterns = {
            'instagram.com': r'https://(?:www\.)?instagram\.com/[\w.]+/?',
            'facebook.com': r'https://(?:www\.)?facebook\.com/[\w.-]+/?',
            'twitter.com': r'https://(?:www\.)?twitter\.com/[\w]+/?',
            'x.com': r'https://(?:www\.)?x\.com/[\w]+/?',
            'youtube.com': r'https://(?:www\.)?youtube\.com/[\w@.-]+/?',
            'linkedin.com': r'https://(?:www\.)?linkedin\.com/[\w/-]+/?',
            'wa.me': r'https://wa\.me/[\d+]+/?',
            'api.whatsapp.com': r'https://api\.whatsapp\.com/send\?phone=[\d+]+.*'
        }
        
        domain = parsed.netloc.lower().replace('www.', '')
        
        for social_domain, pattern in social_patterns.items():
            if domain == social_domain or domain.endswith(f'.{social_domain}'):
                if re.match(pattern, link, re.IGNORECASE):
                    return LinkValidationResult(
                        link=link,
                        is_valid=True,
                        link_type="external",
                        target_path=f"Social media: {social_domain}"
                    )
                else:
                    return LinkValidationResult(
                        link=link,
                        is_valid=False,
                        link_type="external",
                        error_message=f"Invalid {social_domain} URL format"
                    )
        
        # General external link validation (basic format check)
        if parsed.scheme in ('http', 'https') and parsed.netloc:
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="external",
                target_path=f"External: {parsed.netloc}"
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="external",
            error_message="Invalid external URL format"
        )
    
    def _validate_protocol_relative_link(self, link: str) -> LinkValidationResult:
        """Validate protocol-relative links (starting with //)"""
        # Remove the // prefix and parse the domain
        domain_part = link[2:]  # Remove //
        
        # Basic domain validation
        if not domain_part or '.' not in domain_part:
            return LinkValidationResult(
                link=link,
                is_valid=False,
                link_type="protocol_relative",
                error_message="Invalid protocol-relative URL: missing or invalid domain"
            )
        
        # Extract just the domain part (before any path)
        domain = domain_part.split('/')[0]
        
        # Check if it's a known domain pattern
        known_patterns = {
            'fonts.googleapis.com': 'Google Fonts API',
            'fonts.gstatic.com': 'Google Fonts Static Resources',
            'cdnjs.cloudflare.com': 'CDNJS Library',
            'cdn.jsdelivr.net': 'JSDelivr CDN'
        }
        
        if domain in known_patterns:
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="protocol_relative",
                target_path=f"External CDN: {known_patterns[domain]}"
            )
        
        # General validation for protocol-relative URLs
        # Basic pattern: domain should have at least one dot and valid characters
        domain_pattern = r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if re.match(domain_pattern, domain):
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="protocol_relative",
                target_path=f"External protocol-relative: {domain}"
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="protocol_relative",
            error_message=f"Invalid protocol-relative URL domain: {domain}"
        )
    
    def _validate_mailto_link(self, link: str, parsed) -> LinkValidationResult:
        """Validate mailto links"""
        # Extract email from mailto: link
        email = parsed.path
        
        # Basic email validation pattern
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        if re.match(email_pattern, email):
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="mailto",
                target_path=f"Email: {email}"
            )
        else:
            return LinkValidationResult(
                link=link,
                is_valid=False,
                link_type="mailto",
                error_message=f"Invalid email address: {email}"
            )
    
    def _validate_anchor_link(self, link: str, source_file: Optional[str]) -> LinkValidationResult:
        """Validate anchor links within pages"""
        anchor = link.lstrip('#')
        
        if not anchor:
            # Empty anchor refers to top of page - always valid
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="anchor",
                target_path="Page top"
            )
        
        # If source file provided, could check if anchor exists in that file
        # For now, assume anchor links are valid if they follow ID naming patterns
        if re.match(r'^[a-zA-Z][\w-]*$', anchor):
            return LinkValidationResult(
                link=link,
                is_valid=True,
                link_type="anchor",
                target_path=f"Page anchor: #{anchor}"
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="anchor",
            error_message=f"Invalid anchor format: {anchor}"
        )
    
    def _validate_relative_link(self, link: str, source_file: Optional[str]) -> LinkValidationResult:
        """Validate relative links"""
        if not source_file:
            return LinkValidationResult(
                link=link,
                is_valid=False,
                link_type="relative",
                error_message="Cannot validate relative link without source file context"
            )
        
        # Convert relative link to absolute path
        source_dir = Path(source_file).parent
        try:
            target_path = (source_dir / link).resolve()
            
            if target_path.exists():
                return LinkValidationResult(
                    link=link,
                    is_valid=True,
                    link_type="relative",
                    target_path=str(target_path)
                )
        except Exception as e:
            return LinkValidationResult(
                link=link,
                is_valid=False,
                link_type="relative",
                error_message=f"Error resolving relative path: {e}"
            )
        
        return LinkValidationResult(
            link=link,
            is_valid=False,
            link_type="relative",
            error_message="Relative link target not found"
        )
    
    def extract_links_from_html(self, html_content: str) -> List[Tuple[str, Dict[str, str]]]:
        """Extract all links from HTML content with their attributes"""
        links = []
        
        # Enhanced pattern to capture link tags with attributes
        # This pattern captures the entire link tag to extract all attributes
        link_tag_pattern = r'<(\w+)([^>]*?(?:href|src|action)=[^>]*?)>'
        
        for match in re.finditer(link_tag_pattern, html_content, re.IGNORECASE | re.DOTALL):
            tag_name = match.group(1).lower()
            attributes_str = match.group(2)
            
            # Extract individual attributes
            attributes = {}
            attr_pattern = r'(\w+)=["\']([^"\']*)["\']'
            
            for attr_match in re.finditer(attr_pattern, attributes_str):
                attr_name = attr_match.group(1).lower()
                attr_value = attr_match.group(2)
                attributes[attr_name] = attr_value
            
            # Extract the link URL from href, src, or action
            link_url = None
            if 'href' in attributes:
                link_url = attributes['href']
            elif 'src' in attributes:
                link_url = attributes['src']
            elif 'action' in attributes:
                link_url = attributes['action']
            
            # Skip javascript: and data: URLs
            if link_url and not link_url.startswith(('javascript:', 'data:')):
                links.append((link_url, attributes))
        
        # Remove duplicates while preserving attributes
        seen = set()
        unique_links = []
        for link_url, attrs in links:
            if link_url not in seen:
                seen.add(link_url)
                unique_links.append((link_url, attrs))
        
        return unique_links
    
    def validate_file_links(self, file_path: str) -> List[LinkValidationResult]:
        """Validate all links found in a specific HTML file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            links_with_attrs = self.extract_links_from_html(content)
            results = []
            
            for link_url, attributes in links_with_attrs:
                result = self.validate_link(link_url, file_path, attributes)
                results.append(result)
            
            return results
            
        except Exception as e:
            return [LinkValidationResult(
                link=file_path,
                is_valid=False,
                link_type="file",
                error_message=f"Error reading file: {e}"
            )]
    
    def validate_all_site_links(self) -> Dict[str, List[LinkValidationResult]]:
        """Validate links in all HTML files across the site"""
        results = {}
        
        # Validate links in all HTML files
        html_files = list(self.project_root.glob("*.html")) + list(self.pages_dir.glob("*.html"))
        
        for html_file in html_files:
            relative_path = html_file.relative_to(self.project_root)
            results[str(relative_path)] = self.validate_file_links(str(html_file))
        
        return results
    
    def get_all_valid_internal_urls(self) -> Set[str]:
        """Get all valid internal URLs that should work with the routing system"""
        valid_urls = set()
        
        # Add root path
        valid_urls.add('/')
        valid_urls.add('/home')  # Root redirects here
        
        # Add all pages that exist
        if self.pages_dir.exists():
            for html_file in self.pages_dir.glob("*.html"):
                page_name = html_file.stem
                valid_urls.add(f'/{page_name}')
        
        # Add known API endpoints
        api_endpoints = [
            '/api/featured-photos',
            '/api/gallery', 
            '/api/drive-folders',
            '/api/debug-gallery'
        ]
        valid_urls.update(api_endpoints)
        
        return valid_urls
    
    def generate_link_validation_report(self) -> Dict:
        """Generate comprehensive link validation report"""
        all_results = self.validate_all_site_links()
        
        # Aggregate statistics
        total_links = 0
        valid_links = 0
        issues_by_type = {}
        
        for file_path, file_results in all_results.items():
            for result in file_results:
                total_links += 1
                if result.is_valid:
                    valid_links += 1
                else:
                    if result.link_type not in issues_by_type:
                        issues_by_type[result.link_type] = []
                    issues_by_type[result.link_type].append({
                        'file': file_path,
                        'link': result.link,
                        'error': result.error_message
                    })
        
        return {
            'summary': {
                'total_links': total_links,
                'valid_links': valid_links,
                'invalid_links': total_links - valid_links,
                'validation_rate': round((valid_links / total_links) * 100, 2) if total_links > 0 else 0
            },
            'issues_by_type': issues_by_type,
            'detailed_results': all_results,
            'valid_internal_urls': sorted(list(self.get_all_valid_internal_urls()))
        }


# Convenience functions for testing framework integration

def validate_single_link(link: str, project_root: str, source_file: Optional[str] = None) -> LinkValidationResult:
    """Validate a single link - convenience function"""
    validator = LinkValidator(project_root)
    return validator.validate_link(link, source_file)


def validate_html_file_links(file_path: str, project_root: str) -> List[LinkValidationResult]:
    """Validate all links in an HTML file - convenience function"""
    validator = LinkValidator(project_root)
    return validator.validate_file_links(file_path)


def get_site_link_validation_report(project_root: str) -> Dict:
    """Generate full site link validation report - convenience function"""
    validator = LinkValidator(project_root)
    return validator.generate_link_validation_report()


if __name__ == "__main__":
    # Example usage for testing
    import sys
    
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    
    print("🔗 A Lo Cubano Boulder Fest - Link Validation")
    print("=" * 50)
    
    validator = LinkValidator(project_root)
    report = validator.generate_link_validation_report()
    
    print(f"📊 Summary:")
    print(f"   Total links: {report['summary']['total_links']}")
    print(f"   Valid links: {report['summary']['valid_links']}")
    print(f"   Invalid links: {report['summary']['invalid_links']}")
    print(f"   Validation rate: {report['summary']['validation_rate']}%")
    
    if report['issues_by_type']:
        print(f"\n❌ Issues by type:")
        for link_type, issues in report['issues_by_type'].items():
            print(f"   {link_type}: {len(issues)} issues")
            for issue in issues[:3]:  # Show first 3 issues per type
                print(f"      • {issue['file']}: {issue['link']} - {issue['error']}")
            if len(issues) > 3:
                print(f"      ... and {len(issues) - 3} more")
    
    print(f"\n✅ Valid internal URLs ({len(report['valid_internal_urls'])}):")
    for url in report['valid_internal_urls']:
        print(f"   • {url}")