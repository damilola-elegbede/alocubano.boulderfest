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
    
    # Change to project directory
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)
    
    try:
        # Run the test framework
        result = subprocess.run([
            sys.executable, "test_link_validation.py"
        ], capture_output=False, text=True)
        
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