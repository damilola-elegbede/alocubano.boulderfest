#!/usr/bin/env python3
"""
Link Analyzer CLI

Command-line interface for the A Lo Cubano Boulder Fest HTML link analysis tools.
Provides easy access to parsing, validation, and reporting functionality.
"""

import argparse
import sys
from .html_link_parser import HTMLLinkExtractor
from .link_validation_utils import LinkAnalyzer


def main():
    parser = argparse.ArgumentParser(
        description="A Lo Cubano Boulder Fest - HTML Link Analysis Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --quick              # Quick analysis without external validation
  %(prog)s --full               # Full analysis including external link validation
  %(prog)s --file page.html     # Analyze a single HTML file
  %(prog)s --category nav       # Show only navigation links
  %(prog)s --export-csv         # Export detailed data to CSV
        """
    )
    
    parser.add_argument('--quick', action='store_true',
                       help='Run quick analysis (internal links only)')
    parser.add_argument('--full', action='store_true',
                       help='Run full analysis including external link validation')
    parser.add_argument('--file', type=str,
                       help='Analyze a single HTML file')
    parser.add_argument('--category', type=str,
                       choices=['nav', 'content', 'asset', 'external', 'social', 'email', 'anchor'],
                       help='Show links from specific category only')
    parser.add_argument('--export-csv', action='store_true',
                       help='Export detailed analysis to CSV file')
    parser.add_argument('--validate-external', action='store_true',
                       help='Validate external links (may be slow)')
    parser.add_argument('--project-root', type=str, default='.',
                       help='Project root directory (default: current directory)')
    
    args = parser.parse_args()
    
    # Default to quick analysis if no specific action is specified
    if not any([args.quick, args.full, args.file, args.category, args.export_csv]):
        args.quick = True
    
    try:
        if args.file:
            # Analyze single file
            analyze_single_file(args.file, args.project_root)
        elif args.category:
            # Show specific category
            show_category(args.category, args.project_root)
        elif args.full or args.validate_external:
            # Full analysis
            run_full_analysis(args.project_root, validate_external=True)
        else:
            # Quick analysis
            run_quick_analysis(args.project_root, export_csv=args.export_csv)
            
    except KeyboardInterrupt:
        print("\nAnalysis interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def analyze_single_file(file_path: str, project_root: str):
    """Analyze a single HTML file."""
    print(f"Analyzing file: {file_path}")
    print("-" * 40)
    
    extractor = HTMLLinkExtractor(project_root)
    results = extractor.parse_file(file_path)
    
    print(f"Total links: {len(results.links)}")
    print(f"Categories found:")
    
    categories = [
        ("Navigation", results.navigation_links),
        ("Content", results.content_links),
        ("Assets", results.asset_links),
        ("External", results.external_links),
        ("Social", results.social_links),
        ("Email", results.email_links),
        ("Anchor", results.anchor_links)
    ]
    
    for name, links in categories:
        if links:
            print(f"  {name}: {len(links)} links")
            for link in links[:5]:  # Show first 5
                print(f"    - {link.href} ({link.text[:30]}{'...' if len(link.text) > 30 else ''})")
            if len(links) > 5:
                print(f"    ... and {len(links) - 5} more")


def show_category(category: str, project_root: str):
    """Show links from a specific category."""
    category_map = {
        'nav': 'navigation_links',
        'content': 'content_links',
        'asset': 'asset_links',
        'external': 'external_links',
        'social': 'social_links',
        'email': 'email_links',
        'anchor': 'anchor_links'
    }
    
    extractor = HTMLLinkExtractor(project_root)
    results = extractor.parse_project()
    
    attr_name = category_map[category]
    links = getattr(results, attr_name)
    
    print(f"{category.upper()} LINKS ({len(links)} found)")
    print("=" * 50)
    
    for link in links:
        file_name = link.source_file.split('/')[-1]
        print(f"{link.href:30} | {file_name:20} | {link.text[:25]}")


def run_quick_analysis(project_root: str, export_csv: bool = False):
    """Run quick analysis without external validation."""
    print("A Lo Cubano Boulder Fest - Quick Link Analysis")
    print("=" * 50)
    
    extractor = HTMLLinkExtractor(project_root)
    results = extractor.parse_project()
    analysis = extractor.get_link_analysis(results)
    
    # Display summary
    print(f"Total links: {analysis['total_links']}")
    print(f"Unique URLs: {analysis['unique_hrefs']}")
    print(f"Files analyzed: {analysis['files_parsed']}")
    print()
    
    print("Link categories:")
    for category, count in analysis['categories'].items():
        if count > 0:
            print(f"  {category.capitalize():12}: {count:3d}")
    print()
    
    if analysis['external_domains']:
        print("External domains:")
        for domain in analysis['external_domains']:
            print(f"  {domain}")
        print()
    
    if export_csv:
        extractor.export_links_csv(results, 'quick_analysis.csv')
        print("Detailed data exported to 'quick_analysis.csv'")


def run_full_analysis(project_root: str, validate_external: bool = True):
    """Run comprehensive analysis with validation."""
    print("A Lo Cubano Boulder Fest - Comprehensive Link Analysis")
    print("=" * 60)
    
    analyzer = LinkAnalyzer(project_root)
    results, validation_results = analyzer.run_full_analysis(validate_external)
    analyzer.generate_reports(results, validation_results)
    
    # Display detailed summary
    print("\nDETAILED RESULTS:")
    print("=" * 30)
    
    print(f"Total links found: {len(results.links)}")
    print(f"Unique URLs: {len(results.get_unique_hrefs())}")
    print()
    
    # Validation summary
    if 'internal' in validation_results:
        internal_val = validation_results['internal']
        print("Internal link validation:")
        print(f"  Valid: {len(internal_val.get('valid', []))}")
        print(f"  Missing: {len(internal_val.get('missing', []))}")
        
        # Show some missing links
        missing = internal_val.get('missing', [])
        if missing:
            print("  Missing links:")
            for link in missing[:5]:
                print(f"    - {link.href} (in {link.source_file.split('/')[-1]})")
    
    if validate_external and 'external' in validation_results:
        external_val = validation_results['external']
        print("\nExternal link validation:")
        for status, links in external_val.items():
            print(f"  {status.capitalize()}: {len(links)}")
    
    if 'accessibility' in validation_results:
        acc_val = validation_results['accessibility']
        total_issues = sum(len(issues) for issues in acc_val.values())
        if total_issues > 0:
            print(f"\nAccessibility issues found: {total_issues}")
            for issue_type, issues in acc_val.items():
                if issues:
                    print(f"  {issue_type.replace('_', ' ').title()}: {len(issues)}")


if __name__ == "__main__":
    main()