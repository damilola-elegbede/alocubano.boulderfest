#!/usr/bin/env python3
"""
HTML Link Parser

Specialized HTML parsing utilities for extracting and categorizing links from the
A Lo Cubano Boulder Fest website's HTML files.

This module provides comprehensive link extraction with categorization, metadata capture,
and analysis capabilities specifically designed for the project's HTML structure.
"""

import os
import re
from html.parser import HTMLParser
from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional, Tuple
from urllib.parse import urlparse
from pathlib import Path


@dataclass
class LinkInfo:
    """Information about a single link found in HTML."""
    href: str
    text: str
    source_file: str
    line_number: int
    tag: str
    attributes: Dict[str, str]
    context: str = ""  # Surrounding text context
    category: str = ""  # Will be set by categorizer
    is_valid: bool = True
    error_message: str = ""


@dataclass
class ParseResults:
    """Results from parsing HTML files for links."""
    links: List[LinkInfo] = field(default_factory=list)
    navigation_links: List[LinkInfo] = field(default_factory=list)
    content_links: List[LinkInfo] = field(default_factory=list)
    asset_links: List[LinkInfo] = field(default_factory=list)
    external_links: List[LinkInfo] = field(default_factory=list)
    anchor_links: List[LinkInfo] = field(default_factory=list)
    email_links: List[LinkInfo] = field(default_factory=list)
    social_links: List[LinkInfo] = field(default_factory=list)
    
    def get_by_category(self, category: str) -> List[LinkInfo]:
        """Get links by category."""
        return [link for link in self.links if link.category == category]
    
    def get_unique_hrefs(self) -> Set[str]:
        """Get set of unique href values."""
        return {link.href for link in self.links}
    
    def get_external_domains(self) -> Set[str]:
        """Get set of external domains referenced."""
        domains = set()
        for link in self.external_links:
            try:
                parsed = urlparse(link.href)
                if parsed.netloc:
                    domains.add(parsed.netloc)
            except:
                pass
        return domains


class ALCBFHTMLParser(HTMLParser):
    """HTML parser specialized for A Lo Cubano Boulder Fest website structure."""
    
    def __init__(self, file_path: str):
        super().__init__()
        self.file_path = file_path
        self.links = []
        self.current_line = 1
        self.in_navigation = False
        self.in_header = False
        self.in_footer = False
        self.in_main = False
        self.current_context = ""
        self.tag_stack = []
        
        # Patterns for different link types
        self.social_domains = {
            'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
            'youtube.com', 'tiktok.com', 'linkedin.com', 'whatsapp.com',
            'chat.whatsapp.com'
        }
        
        self.asset_extensions = {
            '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
            '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.mp3',
            '.mp4', '.webp', '.avif'
        }
        
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str]]):
        """Handle opening tags, extract links and track context."""
        attrs_dict = dict(attrs)
        self.tag_stack.append(tag)
        
        # Update context flags
        if tag in ['nav', 'navigation']:
            self.in_navigation = True
        elif tag == 'header':
            self.in_header = True
        elif tag == 'footer':
            self.in_footer = True
        elif tag == 'main':
            self.in_main = True
            
        # Extract href links
        if 'href' in attrs_dict:
            href = attrs_dict['href']
            link_info = LinkInfo(
                href=href,
                text="",  # Will be filled by handle_data
                source_file=self.file_path,
                line_number=self.current_line,
                tag=tag,
                attributes=attrs_dict.copy(),
                context=self._get_current_context()
            )
            self.links.append(link_info)
            
        # Extract src links (for images, scripts, etc.)
        if 'src' in attrs_dict:
            src = attrs_dict['src']
            link_info = LinkInfo(
                href=src,
                text=attrs_dict.get('alt', ''),
                source_file=self.file_path,
                line_number=self.current_line,
                tag=tag,
                attributes=attrs_dict.copy(),
                context=self._get_current_context()
            )
            self.links.append(link_info)
            
        # Extract action attributes from forms
        if tag == 'form' and 'action' in attrs_dict:
            action = attrs_dict['action']
            link_info = LinkInfo(
                href=action,
                text="",
                source_file=self.file_path,
                line_number=self.current_line,
                tag=tag,
                attributes=attrs_dict.copy(),
                context=self._get_current_context()
            )
            self.links.append(link_info)
    
    def handle_endtag(self, tag: str):
        """Handle closing tags, update context."""
        if self.tag_stack:
            self.tag_stack.pop()
            
        # Update context flags
        if tag in ['nav', 'navigation']:
            self.in_navigation = False
        elif tag == 'header':
            self.in_header = False
        elif tag == 'footer':
            self.in_footer = False
        elif tag == 'main':
            self.in_main = False
    
    def handle_data(self, data: str):
        """Handle text data, update link text for most recent links."""
        clean_data = data.strip()
        if clean_data and self.links:
            # Update text for the most recent link if it's empty
            last_link = self.links[-1]
            if not last_link.text and last_link.line_number == self.current_line:
                last_link.text = clean_data
        
        # Count newlines to track line numbers
        self.current_line += data.count('\n')
    
    def _get_current_context(self) -> str:
        """Determine the current parsing context."""
        contexts = []
        
        if self.in_header:
            contexts.append("header")
        if self.in_navigation:
            contexts.append("navigation")
        if self.in_main:
            contexts.append("main")
        if self.in_footer:
            contexts.append("footer")
            
        # Add tag context
        if self.tag_stack:
            if 'nav' in self.tag_stack:
                contexts.append("nav")
            if any(tag in ['ul', 'ol', 'li'] for tag in self.tag_stack[-3:]):
                contexts.append("list")
            if 'form' in self.tag_stack:
                contexts.append("form")
                
        return "|".join(contexts) if contexts else "body"


class LinkCategorizer:
    """Categorizes links based on their attributes and context."""
    
    def __init__(self):
        self.social_domains = {
            'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
            'youtube.com', 'tiktok.com', 'linkedin.com', 'whatsapp.com',
            'chat.whatsapp.com'
        }
        
        self.asset_extensions = {
            '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
            '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.mp3',
            '.mp4', '.webp', '.avif'
        }
        
        # Navigation link patterns for this specific site
        self.nav_links = {
            '/home', '/about', '/artists', '/schedule', '/gallery', 
            '/tickets', '/donations'
        }
    
    def categorize_link(self, link: LinkInfo) -> str:
        """Categorize a single link based on its properties."""
        href = link.href.lower()
        
        # Email links
        if href.startswith('mailto:'):
            return 'email'
            
        # Anchor links
        if href.startswith('#'):
            return 'anchor'
            
        # External links
        if href.startswith(('http://', 'https://')):
            try:
                parsed = urlparse(link.href)
                domain = parsed.netloc.lower()
                
                # Social media links
                if any(social in domain for social in self.social_domains):
                    return 'social'
                    
                return 'external'
            except:
                return 'external'
        
        # Asset links (by extension)
        if any(href.endswith(ext) for ext in self.asset_extensions):
            return 'asset'
            
        # Navigation links (by context and href)
        if ('header' in link.context or 'nav' in link.context) and link.href in self.nav_links:
            return 'navigation'
            
        # Footer links
        if 'footer' in link.context:
            if link.href.startswith('mailto:'):
                return 'email'
            elif link.href.startswith(('http://', 'https://')):
                return 'social'  # Most footer external links are social
            else:
                return 'navigation'
        
        # Content links (everything else)
        return 'content'
    
    def categorize_all(self, links: List[LinkInfo]) -> ParseResults:
        """Categorize all links and organize them."""
        results = ParseResults()
        results.links = links
        
        for link in links:
            category = self.categorize_link(link)
            link.category = category
            
            # Add to appropriate category list
            if category == 'navigation':
                results.navigation_links.append(link)
            elif category == 'content':
                results.content_links.append(link)
            elif category == 'asset':
                results.asset_links.append(link)
            elif category == 'external':
                results.external_links.append(link)
            elif category == 'anchor':
                results.anchor_links.append(link)
            elif category == 'email':
                results.email_links.append(link)
            elif category == 'social':
                results.social_links.append(link)
                
        return results


class HTMLLinkExtractor:
    """Main interface for extracting and analyzing links from HTML files."""
    
    def __init__(self, project_root: str = None):
        self.project_root = project_root or os.getcwd()
        self.categorizer = LinkCategorizer()
    
    def parse_file(self, file_path: str) -> ParseResults:
        """Parse a single HTML file and return categorized links."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            parser = ALCBFHTMLParser(file_path)
            parser.feed(content)
            
            return self.categorizer.categorize_all(parser.links)
            
        except Exception as e:
            # Return empty results with error info
            results = ParseResults()
            error_link = LinkInfo(
                href="", text="", source_file=file_path,
                line_number=0, tag="", attributes={},
                is_valid=False, error_message=str(e)
            )
            results.links.append(error_link)
            return results
    
    def parse_project(self) -> ParseResults:
        """Parse all HTML files in the project."""
        all_results = ParseResults()
        
        # Find all HTML files
        html_files = []
        
        # Root level HTML files
        for file in Path(self.project_root).glob('*.html'):
            html_files.append(str(file))
            
        # Pages directory HTML files
        pages_dir = Path(self.project_root) / 'pages'
        if pages_dir.exists():
            for file in pages_dir.glob('*.html'):
                html_files.append(str(file))
        
        # Parse each file
        for file_path in html_files:
            file_results = self.parse_file(file_path)
            
            # Merge results
            all_results.links.extend(file_results.links)
            all_results.navigation_links.extend(file_results.navigation_links)
            all_results.content_links.extend(file_results.content_links)
            all_results.asset_links.extend(file_results.asset_links)
            all_results.external_links.extend(file_results.external_links)
            all_results.anchor_links.extend(file_results.anchor_links)
            all_results.email_links.extend(file_results.email_links)
            all_results.social_links.extend(file_results.social_links)
        
        return all_results
    
    def get_link_analysis(self, results: ParseResults) -> Dict[str, any]:
        """Generate comprehensive link analysis."""
        analysis = {
            'total_links': len(results.links),
            'unique_hrefs': len(results.get_unique_hrefs()),
            'categories': {
                'navigation': len(results.navigation_links),
                'content': len(results.content_links),
                'asset': len(results.asset_links),
                'external': len(results.external_links),
                'anchor': len(results.anchor_links),
                'email': len(results.email_links),
                'social': len(results.social_links),
            },
            'external_domains': list(results.get_external_domains()),
            'files_parsed': len(set(link.source_file for link in results.links)),
            'errors': [link for link in results.links if not link.is_valid]
        }
        
        return analysis
    
    def export_links_csv(self, results: ParseResults, output_path: str):
        """Export links to CSV file for analysis."""
        import csv
        
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                'href', 'text', 'source_file', 'line_number', 'tag',
                'category', 'context', 'is_valid', 'target', 'rel',
                'aria_label', 'class'
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for link in results.links:
                writer.writerow({
                    'href': link.href,
                    'text': link.text,
                    'source_file': os.path.basename(link.source_file),
                    'line_number': link.line_number,
                    'tag': link.tag,
                    'category': link.category,
                    'context': link.context,
                    'is_valid': link.is_valid,
                    'target': link.attributes.get('target', ''),
                    'rel': link.attributes.get('rel', ''),
                    'aria_label': link.attributes.get('aria-label', ''),
                    'class': link.attributes.get('class', '')
                })


def main():
    """Example usage and testing."""
    extractor = HTMLLinkExtractor()
    
    print("A Lo Cubano Boulder Fest - HTML Link Parser")
    print("=" * 50)
    
    # Parse all HTML files in the project
    results = extractor.parse_project()
    
    # Generate analysis
    analysis = extractor.get_link_analysis(results)
    
    print(f"Total links found: {analysis['total_links']}")
    print(f"Unique hrefs: {analysis['unique_hrefs']}")
    print(f"Files parsed: {analysis['files_parsed']}")
    print()
    
    print("Link categories:")
    for category, count in analysis['categories'].items():
        print(f"  {category.capitalize()}: {count}")
    print()
    
    print("External domains:")
    for domain in analysis['external_domains']:
        print(f"  {domain}")
    print()
    
    if analysis['errors']:
        print(f"Errors encountered: {len(analysis['errors'])}")
        for error_link in analysis['errors'][:5]:  # Show first 5 errors
            print(f"  {error_link.source_file}: {error_link.error_message}")
    
    # Export to CSV for detailed analysis
    extractor.export_links_csv(results, 'link_analysis.csv')
    print("Detailed analysis exported to 'link_analysis.csv'")


if __name__ == "__main__":
    main()