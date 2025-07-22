#!/usr/bin/env python3
"""
Link Validation Utilities

Additional utilities for validating and analyzing links extracted from HTML files.
Designed to work with the html_link_parser module for comprehensive link analysis.
"""

import os
import json
import requests
from pathlib import Path
from typing import Dict, List, Set, Tuple
from urllib.parse import urljoin, urlparse
from .html_link_parser import HTMLLinkExtractor, ParseResults, LinkInfo


class LinkValidator:
    """Validates links found in HTML files."""
    
    def __init__(self, project_root: str = None, base_url: str = "http://localhost:8000"):
        self.project_root = project_root or os.getcwd()
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'ALCBFLinkValidator/1.0 (Website Link Checker)'
        })
    
    def validate_internal_links(self, results: ParseResults) -> Dict[str, List[LinkInfo]]:
        """Validate internal links by checking if files exist."""
        internal_links = []
        external_links = []
        
        # Separate internal and external links
        for link in results.links:
            if link.href.startswith(('http://', 'https://')):
                external_links.append(link)
            elif not link.href.startswith(('mailto:', 'tel:', '#')):
                internal_links.append(link)
        
        validation_results = {
            'valid': [],
            'missing': [],
            'invalid_format': []
        }
        
        for link in internal_links:
            if self._validate_internal_link(link):
                validation_results['valid'].append(link)
            else:
                validation_results['missing'].append(link)
        
        return validation_results
    
    def _validate_internal_link(self, link: LinkInfo) -> bool:
        """Check if an internal link points to an existing file or valid route."""
        href = link.href
        
        # Skip anchor links
        if href.startswith('#'):
            return True
            
        # Clean the href
        if href.startswith('/'):
            href = href[1:]  # Remove leading slash
            
        # Check for query parameters or fragments
        if '?' in href:
            href = href.split('?')[0]
        if '#' in href:
            href = href.split('#')[0]
        
        # Check for file extensions
        if '.' in href:
            # Direct file check
            file_path = Path(self.project_root) / href
            return file_path.exists()
        else:
            # Route-based check (for pages like /about, /artists)
            possible_paths = [
                Path(self.project_root) / f"{href}.html",
                Path(self.project_root) / "pages" / f"{href}.html",
                Path(self.project_root) / href / "index.html"
            ]
            
            return any(path.exists() for path in possible_paths)
    
    def validate_external_links(self, results: ParseResults, timeout: int = 10) -> Dict[str, List[LinkInfo]]:
        """Validate external links by making HTTP requests."""
        external_links = [link for link in results.links 
                         if link.href.startswith(('http://', 'https://'))]
        
        validation_results = {
            'valid': [],
            'invalid': [],
            'timeout': [],
            'error': []
        }
        
        for link in external_links:
            try:
                response = self.session.head(link.href, timeout=timeout, allow_redirects=True)
                if response.status_code < 400:
                    validation_results['valid'].append(link)
                else:
                    link.error_message = f"HTTP {response.status_code}"
                    validation_results['invalid'].append(link)
                    
            except requests.Timeout:
                link.error_message = "Request timeout"
                validation_results['timeout'].append(link)
            except requests.RequestException as e:
                link.error_message = str(e)
                validation_results['error'].append(link)
        
        return validation_results
    
    def check_accessibility_attributes(self, results: ParseResults) -> Dict[str, List[LinkInfo]]:
        """Check links for accessibility attributes."""
        accessibility_issues = {
            'missing_aria_label': [],
            'external_without_rel': [],
            'images_without_alt': [],
            'empty_link_text': []
        }
        
        for link in results.links:
            # Check for missing aria-label on icon links
            if not link.text and not link.attributes.get('aria-label'):
                accessibility_issues['missing_aria_label'].append(link)
            
            # Check external links for security attributes
            if (link.href.startswith(('http://', 'https://')) and 
                link.attributes.get('target') == '_blank' and
                not link.attributes.get('rel')):
                accessibility_issues['external_without_rel'].append(link)
            
            # Check images for alt text
            if link.tag == 'img' and not link.attributes.get('alt'):
                accessibility_issues['images_without_alt'].append(link)
            
            # Check for empty link text
            if link.tag == 'a' and not link.text.strip() and not link.attributes.get('aria-label'):
                accessibility_issues['empty_link_text'].append(link)
        
        return accessibility_issues


class LinkReporter:
    """Generate reports from link parsing and validation results."""
    
    def generate_summary_report(self, results: ParseResults, validation_results: Dict = None) -> str:
        """Generate a human-readable summary report."""
        report = []
        report.append("A LO CUBANO BOULDER FEST - LINK ANALYSIS REPORT")
        report.append("=" * 60)
        report.append("")
        
        # Overview
        total_links = len(results.links)
        unique_hrefs = len(results.get_unique_hrefs())
        files_parsed = len(set(link.source_file for link in results.links))
        
        report.append(f"Total Links Found: {total_links}")
        report.append(f"Unique URLs: {unique_hrefs}")
        report.append(f"Files Parsed: {files_parsed}")
        report.append("")
        
        # Category breakdown
        report.append("LINK CATEGORIES")
        report.append("-" * 20)
        categories = [
            ("Navigation", results.navigation_links),
            ("Content", results.content_links),
            ("Assets", results.asset_links),
            ("External", results.external_links),
            ("Social Media", results.social_links),
            ("Email", results.email_links),
            ("Anchor", results.anchor_links)
        ]
        
        for name, links in categories:
            report.append(f"{name:15}: {len(links):3d} links")
        
        report.append("")
        
        # External domains
        external_domains = results.get_external_domains()
        if external_domains:
            report.append("EXTERNAL DOMAINS")
            report.append("-" * 20)
            for domain in sorted(external_domains):
                count = sum(1 for link in results.external_links + results.social_links
                           if domain in link.href)
                report.append(f"{domain:30}: {count} links")
            report.append("")
        
        # Validation results
        if validation_results:
            report.append("VALIDATION RESULTS")
            report.append("-" * 20)
            for category, links in validation_results.items():
                if links:
                    report.append(f"{category.replace('_', ' ').title():15}: {len(links)} links")
            report.append("")
        
        # File distribution
        file_link_count = {}
        for link in results.links:
            filename = os.path.basename(link.source_file)
            file_link_count[filename] = file_link_count.get(filename, 0) + 1
        
        report.append("LINKS PER FILE")
        report.append("-" * 20)
        for filename in sorted(file_link_count.keys()):
            report.append(f"{filename:25}: {file_link_count[filename]:3d} links")
        
        return "\n".join(report)
    
    def generate_detailed_json_report(self, results: ParseResults, validation_results: Dict = None) -> Dict:
        """Generate a detailed JSON report."""
        report = {
            'metadata': {
                'total_links': len(results.links),
                'unique_hrefs': len(results.get_unique_hrefs()),
                'files_parsed': len(set(link.source_file for link in results.links)),
                'external_domains': list(results.get_external_domains())
            },
            'categories': {
                'navigation': self._links_to_dict(results.navigation_links),
                'content': self._links_to_dict(results.content_links),
                'assets': self._links_to_dict(results.asset_links),
                'external': self._links_to_dict(results.external_links),
                'social': self._links_to_dict(results.social_links),
                'email': self._links_to_dict(results.email_links),
                'anchor': self._links_to_dict(results.anchor_links)
            }
        }
        
        if validation_results:
            report['validation'] = {}
            for category, subcategories in validation_results.items():
                if isinstance(subcategories, dict):
                    report['validation'][category] = {
                        subcat: self._links_to_dict(links) if isinstance(links, list) else links
                        for subcat, links in subcategories.items()
                    }
                else:
                    report['validation'][category] = self._links_to_dict(subcategories)
        
        return report
    
    def _links_to_dict(self, links: List[LinkInfo]) -> List[Dict]:
        """Convert LinkInfo objects to dictionaries."""
        return [
            {
                'href': link.href,
                'text': link.text,
                'source_file': os.path.basename(link.source_file),
                'line_number': link.line_number,
                'tag': link.tag,
                'category': link.category,
                'context': link.context,
                'attributes': link.attributes,
                'is_valid': link.is_valid,
                'error_message': link.error_message
            }
            for link in links
        ]
    
    def save_report(self, content: str, filename: str):
        """Save report content to file."""
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
    
    def save_json_report(self, data: Dict, filename: str):
        """Save JSON report to file."""
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


class LinkAnalyzer:
    """High-level interface for comprehensive link analysis."""
    
    def __init__(self, project_root: str = None):
        self.extractor = HTMLLinkExtractor(project_root)
        self.validator = LinkValidator(project_root)
        self.reporter = LinkReporter()
    
    def run_full_analysis(self, validate_external: bool = False) -> Tuple[ParseResults, Dict]:
        """Run complete link analysis and validation."""
        print("Parsing HTML files...")
        results = self.extractor.parse_project()
        
        print("Validating internal links...")
        internal_validation = self.validator.validate_internal_links(results)
        
        validation_results = {'internal': internal_validation}
        
        if validate_external:
            print("Validating external links...")
            external_validation = self.validator.validate_external_links(results)
            validation_results['external'] = external_validation
        
        print("Checking accessibility attributes...")
        accessibility_issues = self.validator.check_accessibility_attributes(results)
        validation_results['accessibility'] = accessibility_issues
        
        return results, validation_results
    
    def generate_reports(self, results: ParseResults, validation_results: Dict):
        """Generate and save all reports."""
        # Summary report
        summary = self.reporter.generate_summary_report(results, validation_results)
        self.reporter.save_report(summary, 'link_analysis_summary.txt')
        
        # Detailed JSON report
        json_report = self.reporter.generate_detailed_json_report(results, validation_results)
        self.reporter.save_json_report(json_report, 'link_analysis_detailed.json')
        
        print("Reports saved:")
        print("  - link_analysis_summary.txt")
        print("  - link_analysis_detailed.json")


def main():
    """Run comprehensive link analysis."""
    analyzer = LinkAnalyzer()
    
    print("A Lo Cubano Boulder Fest - Comprehensive Link Analysis")
    print("=" * 60)
    
    # Run analysis (set validate_external=True to check external links)
    results, validation_results = analyzer.run_full_analysis(validate_external=False)
    
    # Generate reports
    analyzer.generate_reports(results, validation_results)
    
    # Display summary
    print("\nSUMMARY:")
    print(f"Total links: {len(results.links)}")
    print(f"Navigation links: {len(results.navigation_links)}")
    print(f"Asset links: {len(results.asset_links)}")
    print(f"External links: {len(results.external_links + results.social_links)}")
    
    # Show validation issues
    internal_issues = validation_results['internal']['missing']
    accessibility_issues = sum(len(issues) for issues in validation_results['accessibility'].values())
    
    if internal_issues:
        print(f"\nISSUES FOUND:")
        print(f"Missing internal links: {len(internal_issues)}")
        for link in internal_issues[:3]:  # Show first 3
            print(f"  - {link.href} in {os.path.basename(link.source_file)}")
    
    if accessibility_issues:
        print(f"Accessibility issues: {accessibility_issues}")


if __name__ == "__main__":
    main()