#!/usr/bin/env python3
import os
import re
import glob

def fix_regex_patterns():
    """Fix loose regex patterns in E2E test files."""
    
    test_files = glob.glob("tests/e2e/**/*.test.js", recursive=True)
    
    patterns_fixed = 0
    files_modified = []
    
    # Define regex pattern fixes
    fixes = [
        # Fix tickets pattern
        (r'toHaveURL\(/\.\*tickets/\)', 'toHaveURL(/\\/tickets(\\/|$)/)'),
        
        # Fix dashboard patterns
        (r'toHaveURL\(/dashboard/\)', 'toHaveURL(/\\/dashboard(\\/|$)/)'),
        (r'not\.toHaveURL\(/dashboard/\)', 'not.toHaveURL(/\\/dashboard(\\/|$)/)'),
        
        # Fix login patterns  
        (r'toHaveURL\(/login/\)', 'toHaveURL(/\\/login(\\/|$)/)'),
        
        # Fix home patterns
        (r'toHaveURL\(/home/\)', 'toHaveURL(/\\/home(\\/|$)/)'),
        
        # Fix about patterns
        (r'toHaveURL\(/about/\)', 'toHaveURL(/\\/about(\\/|$)/)'),
        
        # Fix contact patterns  
        (r'toHaveURL\(/contact/\)', 'toHaveURL(/\\/contact(\\/|$)/)'),
        
        # Complex multi-pattern fix
        (r'toHaveURL\(/login\|admin\.\*login\|home/\)', 'toHaveURL(/\\/(login|admin.*login|home)(\\/|$)/)'),
    ]
    
    for test_file in test_files:
        if not os.path.exists(test_file):
            continue
            
        with open(test_file, 'r') as f:
            content = f.read()
        
        original_content = content
        
        for pattern, replacement in fixes:
            new_content = re.sub(pattern, replacement, content)
            if new_content != content:
                patterns_fixed += 1
                print(f"Fixed pattern in {test_file}: {pattern}")
            content = new_content
        
        if content != original_content:
            with open(test_file, 'w') as f:
                f.write(content)
            files_modified.append(test_file)
    
    print(f"\nSummary:")
    print(f"- {patterns_fixed} regex patterns fixed")
    print(f"- {len(files_modified)} files modified")
    
    if files_modified:
        print(f"\nModified files:")
        for file in files_modified:
            print(f"  - {file}")

if __name__ == "__main__":
    fix_regex_patterns()
