#!/usr/bin/env python3
"""
Example Test Framework Integration for Link Validation

This demonstrates how the link_validator module would be integrated
into the main test framework for the A Lo Cubano Boulder Fest website.
"""

from link_validator import LinkValidator, LinkValidationResult
import os
from typing import Dict, List

class TestFramework:
    """Example test framework showing link validation integration"""
    
    def __init__(self, project_root: str):
        self.project_root = project_root
        self.link_validator = LinkValidator(project_root)
        self.test_results = []
    
    def run_link_validation_tests(self) -> Dict:
        """Run comprehensive link validation tests"""
        print("🔗 Running Link Validation Tests")
        print("-" * 40)
        
        results = {
            'overall_status': 'PASS',
            'tests_run': 0,
            'tests_passed': 0,
            'tests_failed': 0,
            'failures': []
        }
        
        # Test 1: Validate all site links
        print("📋 Test 1: Validating all site links...")
        site_report = self.link_validator.generate_link_validation_report()
        results['tests_run'] += 1
        
        if site_report['summary']['invalid_links'] == 0:
            print("   ✅ PASS - All links are valid")
            results['tests_passed'] += 1
        else:
            print(f"   ❌ FAIL - {site_report['summary']['invalid_links']} invalid links found")
            results['tests_failed'] += 1
            results['overall_status'] = 'FAIL'
            results['failures'].append({
                'test': 'Site-wide link validation',
                'details': site_report['issues_by_type']
            })
        
        # Test 2: Check critical page accessibility
        print("📋 Test 2: Checking critical page accessibility...")
        critical_pages = ['/home', '/about', '/artists', '/schedule', '/gallery', '/tickets']
        critical_test_passed = True
        
        for page in critical_pages:
            validation_result = self.link_validator.validate_link(page)
            if not validation_result.is_valid:
                print(f"   ❌ FAIL - Critical page not accessible: {page}")
                critical_test_passed = False
                results['failures'].append({
                    'test': 'Critical page accessibility',
                    'page': page,
                    'error': validation_result.error_message
                })
        
        results['tests_run'] += 1
        if critical_test_passed:
            print("   ✅ PASS - All critical pages accessible")
            results['tests_passed'] += 1
        else:
            results['tests_failed'] += 1
            results['overall_status'] = 'FAIL'
        
        # Test 3: Validate asset references
        print("📋 Test 3: Validating core asset references...")
        core_assets = [
            '/css/base.css',
            '/css/typography.css', 
            '/js/main.js',
            '/js/navigation.js',
            '/images/logo.png'
        ]
        
        asset_test_passed = True
        for asset in core_assets:
            validation_result = self.link_validator.validate_link(asset)
            if not validation_result.is_valid:
                print(f"   ❌ FAIL - Core asset missing: {asset}")
                asset_test_passed = False
                results['failures'].append({
                    'test': 'Core asset validation',
                    'asset': asset,
                    'error': validation_result.error_message
                })
        
        results['tests_run'] += 1
        if asset_test_passed:
            print("   ✅ PASS - All core assets found")
            results['tests_passed'] += 1
        else:
            results['tests_failed'] += 1
            results['overall_status'] = 'FAIL'
        
        # Test 4: Validate API endpoint patterns
        print("📋 Test 4: Validating API endpoints...")
        api_endpoints = [
            '/api/gallery',
            '/api/featured-photos',
            '/api/image-proxy/1bfMHqDMG6KF7maQwIpteBsyRfpzzEyer'
        ]
        
        api_test_passed = True
        for endpoint in api_endpoints:
            validation_result = self.link_validator.validate_link(endpoint)
            if not validation_result.is_valid:
                print(f"   ❌ FAIL - API endpoint validation failed: {endpoint}")
                api_test_passed = False
                results['failures'].append({
                    'test': 'API endpoint validation',
                    'endpoint': endpoint,
                    'error': validation_result.error_message
                })
        
        results['tests_run'] += 1
        if api_test_passed:
            print("   ✅ PASS - All API endpoints valid")
            results['tests_passed'] += 1
        else:
            results['tests_failed'] += 1
            results['overall_status'] = 'FAIL'
        
        # Test 5: Check external social media links format
        print("📋 Test 5: Validating social media link formats...")
        social_links = [
            'https://www.instagram.com/alocubano.boulderfest/',
            'mailto:alocubanoboulderfest@gmail.com',
            'https://wa.me/1234567890'  # Example WhatsApp
        ]
        
        social_test_passed = True
        for link in social_links:
            validation_result = self.link_validator.validate_link(link)
            if not validation_result.is_valid:
                print(f"   ❌ FAIL - Social link format invalid: {link}")
                social_test_passed = False
                results['failures'].append({
                    'test': 'Social media link validation',
                    'link': link,
                    'error': validation_result.error_message
                })
        
        results['tests_run'] += 1
        if social_test_passed:
            print("   ✅ PASS - All social media links formatted correctly")
            results['tests_passed'] += 1
        else:
            results['tests_failed'] += 1
            results['overall_status'] = 'FAIL'
        
        return results
    
    def print_test_summary(self, results: Dict):
        """Print formatted test summary"""
        print("\n" + "="*50)
        print("🧪 LINK VALIDATION TEST SUMMARY")
        print("="*50)
        
        status_icon = "✅" if results['overall_status'] == 'PASS' else "❌"
        print(f"{status_icon} Overall Status: {results['overall_status']}")
        print(f"📊 Tests Run: {results['tests_run']}")
        print(f"✅ Passed: {results['tests_passed']}")
        print(f"❌ Failed: {results['tests_failed']}")
        
        if results['failures']:
            print(f"\n❌ FAILURE DETAILS:")
            for i, failure in enumerate(results['failures'], 1):
                print(f"   {i}. {failure['test']}")
                if 'details' in failure:
                    # Site-wide issues
                    for issue_type, issues in failure['details'].items():
                        print(f"      • {issue_type}: {len(issues)} issues")
                else:
                    # Specific failures
                    for key, value in failure.items():
                        if key != 'test':
                            print(f"      • {key}: {value}")
        
        print("\n" + "="*50)


def main():
    """Main function demonstrating the test framework integration"""
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    # Initialize test framework with link validation
    test_framework = TestFramework(project_root)
    
    # Run all link validation tests
    results = test_framework.run_link_validation_tests()
    
    # Print summary
    test_framework.print_test_summary(results)
    
    # Return exit code based on test results
    return 0 if results['overall_status'] == 'PASS' else 1


if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)