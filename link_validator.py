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
    
    def __init__(self, project_root: str):
        """Initialize validator with project root directory"""
        self.project_root = Path(project_root).resolve()
        self.pages_dir = self.project_root / "pages"
        self.css_dir = self.project_root / "css"
        self.js_dir = self.project_root / "js"
        self.images_dir = self.project_root / "images"
        self.api_dir = self.project_root / "api"
        
        # Cache of existing files for performance
        self._file_cache = {}
        self._build_file_cache()
    
    def _build_file_cache(self) -> None:
        """Build cache of all existing files for fast lookups"""
        for directory in [self.pages_dir, self.css_dir, self.js_dir, self.images_dir, self.api_dir]:
            if directory.exists():
                for file_path in directory.rglob("*"):
                    if file_path.is_file():
                        relative_path = file_path.relative_to(self.project_root)
                        self._file_cache[str(relative_path)] = file_path
    
    def validate_link(self, link: str, source_file: Optional[str] = None) -> LinkValidationResult:
        """
        Validate a single link and return detailed result
        
        Args:
            link: The link to validate
            source_file: Optional source file path for context
            
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
        
        # Parse the link
        parsed = urlparse(link.strip())
        
        # Determine link type and validate accordingly
        if parsed.scheme in ('http', 'https'):
            return self._validate_external_link(link, parsed)
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
    
    def extract_links_from_html(self, html_content: str) -> List[str]:
        """Extract all links from HTML content"""
        links = []
        
        # Pattern to find href attributes
        href_pattern = r'href=["\']([^"\']+)["\']'
        
        # Pattern to find src attributes (for images, scripts)
        src_pattern = r'src=["\']([^"\']+)["\']'
        
        # Pattern to find action attributes (for forms)
        action_pattern = r'action=["\']([^"\']+)["\']'
        
        # Extract all href links
        for match in re.finditer(href_pattern, html_content, re.IGNORECASE):
            link = match.group(1)
            if link and not link.startswith('javascript:') and not link.startswith('data:'):
                links.append(link)
        
        # Extract all src links
        for match in re.finditer(src_pattern, html_content, re.IGNORECASE):
            link = match.group(1)
            if link and not link.startswith('javascript:') and not link.startswith('data:'):
                links.append(link)
        
        # Extract all action links
        for match in re.finditer(action_pattern, html_content, re.IGNORECASE):
            link = match.group(1)
            if link and not link.startswith('javascript:') and not link.startswith('data:'):
                links.append(link)
        
        return list(set(links))  # Remove duplicates
    
    def validate_file_links(self, file_path: str) -> List[LinkValidationResult]:
        """Validate all links found in a specific HTML file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            links = self.extract_links_from_html(content)
            results = []
            
            for link in links:
                result = self.validate_link(link, file_path)
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