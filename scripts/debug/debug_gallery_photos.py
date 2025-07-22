#!/usr/bin/env python3
"""Debug script to check gallery photos loading"""

import json
import os

def check_static_file():
    """Check if static JSON file exists and is valid"""
    file_path = "public/gallery-data/2025.json"
    
    print(f"Checking {file_path}...")
    
    if os.path.exists(file_path):
        print(f"✓ File exists: {file_path}")
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                
            print(f"✓ Valid JSON with {data.get('totalCount', 0)} total items")
            
            categories = data.get('categories', {})
            for category, items in categories.items():
                print(f"  - {category}: {len(items)} items")
                
                # Show first item as example
                if items:
                    first_item = items[0]
                    print(f"    Example: {first_item.get('name')}")
                    print(f"    URL: {first_item.get('viewUrl')}")
                    
        except json.JSONDecodeError as e:
            print(f"✗ Invalid JSON: {e}")
        except Exception as e:
            print(f"✗ Error reading file: {e}")
    else:
        print(f"✗ File not found: {file_path}")

def test_server_endpoints():
    """Test if server endpoints are accessible"""
    import urllib.request
    import urllib.error
    
    endpoints = [
        "http://localhost:8000/gallery-data/2025.json",
        "http://localhost:8000/api/gallery?year=2025&limit=5",
        "http://localhost:8000/pages/gallery-2025.html"
    ]
    
    print("\nTesting server endpoints...")
    
    for endpoint in endpoints:
        try:
            response = urllib.request.urlopen(endpoint)
            print(f"✓ {endpoint} - Status: {response.status}")
        except urllib.error.URLError as e:
            print(f"✗ {endpoint} - Error: {e}")

if __name__ == "__main__":
    print("Gallery Debug Script")
    print("=" * 50)
    
    check_static_file()
    
    try:
        test_server_endpoints()
    except Exception as e:
        print(f"\nNote: Server might not be running - {e}")