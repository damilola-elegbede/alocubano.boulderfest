#!/usr/bin/env python3
"""
Simple test runner for A Lo Cubano Boulder Fest link validation
"""

import sys
import subprocess
import os

def main():
    """Run link validation tests with proper output handling"""
    print("🎵 A Lo Cubano Boulder Fest - Running Link Validation Tests...")
    
    # Get the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    
    # Test file is now in tests/unit/link-validation/
    test_file = os.path.join(project_root, "tests", "unit", "link-validation", "test_link_validation.py")
    
    try:
        # Run the test framework
        result = subprocess.run([
            sys.executable, test_file
        ], capture_output=False, text=True, cwd=project_root)
        
        return result.returncode
        
    except KeyboardInterrupt:
        print("\n\n⏹️ Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n❌ Error running tests: {e}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    if exit_code == 0:
        print("\n🎊 All tests passed! Your festival website is ready to dance!")
    else:
        print(f"\n💃 Some links need attention before the festival starts!")
    sys.exit(exit_code)