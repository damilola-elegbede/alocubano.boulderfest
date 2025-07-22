#!/usr/bin/env python3
"""
Test script for Link Validator - demonstrates validation capabilities
"""

from link_validator import LinkValidator, validate_single_link
import os

def test_link_validation():
    """Test various link validation scenarios"""
    project_root = os.path.dirname(os.path.abspath(__file__))
    validator = LinkValidator(project_root)
    
    print("🧪 Testing Link Validation Logic")
    print("=" * 50)
    
    # Test cases covering different link types
    test_links = [
        # Internal page links (clean URLs)
        ("/home", "internal - home page"),
        ("/about", "internal - about page"), 
        ("/artists", "internal - artists page"),
        ("/nonexistent", "internal - nonexistent page"),
        
        # Asset links
        ("/css/base.css", "CSS asset"),
        ("/js/main.js", "JavaScript asset"),
        ("/js/main.js?v=2025", "JavaScript with query params"),
        ("/images/logo.png", "Image asset"),
        ("/css/nonexistent.css", "nonexistent CSS"),
        
        # API links
        ("/api/gallery", "API - gallery endpoint"),
        ("/api/featured-photos", "API - featured photos endpoint"), 
        ("/api/image-proxy/abc123defg456", "API - image proxy"),
        ("/api/unknown-endpoint", "API - unknown endpoint"),
        
        # External links
        ("https://www.instagram.com/alocubano.boulderfest/", "Instagram link"),
        ("https://wa.me/1234567890", "WhatsApp link"),
        ("https://example.com/page", "general external link"),
        ("https://invalid-domain-that-doesnt-exist-hopefully.com", "external - exists but unknown"),
        ("https://", "malformed external URL"),
        
        # Email links
        ("mailto:info@alocubano.boulderfest.com", "valid email"),
        ("mailto:invalid-email", "invalid email format"),
        
        # Anchor links
        ("#main-content", "anchor - main content"),
        ("#navigation", "anchor - navigation"),
        ("#invalid-anchor-123!", "invalid anchor format"),
        
        # JSON data files
        ("/featured-photos.json", "featured photos JSON"),
        ("/gallery-data/2025.json", "gallery data JSON"),
        
        # Edge cases
        ("", "empty link"),
        ("javascript:void(0)", "javascript: protocol"),
        ("data:image/svg+xml;base64,PHN2Zz4=", "data: protocol"),
    ]
    
    for link, description in test_links:
        result = validator.validate_link(link)
        status = "✅" if result.is_valid else "❌"
        print(f"{status} {result.link_type:10} | {link:50} | {description}")
        if not result.is_valid and result.error_message:
            print(f"   └─ Error: {result.error_message}")
    
    print(f"\n📊 Test Summary:")
    valid_count = sum(1 for link, _ in test_links if validator.validate_link(link).is_valid)
    total_count = len(test_links)
    print(f"   Valid: {valid_count}/{total_count} ({valid_count/total_count*100:.1f}%)")
    
    # Test HTML link extraction
    print(f"\n🔍 Testing HTML Link Extraction:")
    sample_html = """
    <html>
    <head>
        <link rel="stylesheet" href="/css/base.css">
        <script src="/js/main.js"></script>
    </head>
    <body>
        <a href="/home">Home</a>
        <a href="/about">About</a>
        <a href="https://instagram.com/test">Instagram</a>
        <img src="/images/logo.png" alt="Logo">
        <form action="/api/contact" method="post">
        </form>
    </body>
    </html>
    """
    
    extracted_links = validator.extract_links_from_html(sample_html)
    print(f"   Extracted {len(extracted_links)} links from sample HTML:")
    for link in sorted(extracted_links):
        print(f"   • {link}")
    
    # Test valid internal URLs
    print(f"\n🌐 All Valid Internal URLs:")
    valid_urls = validator.get_all_valid_internal_urls()
    for url in sorted(valid_urls):
        print(f"   • {url}")

if __name__ == "__main__":
    test_link_validation()