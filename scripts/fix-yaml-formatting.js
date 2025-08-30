#!/usr/bin/env node

/**
 * Fix YAML formatting violations in GitHub workflow files
 * Addresses:
 * - Line length violations (>120 chars)
 * - Inconsistent indentation
 * - Missing anchors for repeated values
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');

// YAML formatting rules
const MAX_LINE_LENGTH = 120;
const INDENT_SIZE = 2;

/**
 * Fix line length violations by splitting long lines
 */
function fixLineLengths(content) {
  const lines = content.split('\n');
  const fixedLines = [];
  
  for (let line of lines) {
    if (line.length <= MAX_LINE_LENGTH) {
      fixedLines.push(line);
      continue;
    }
    
    // Handle different types of long lines
    if (line.includes('echo "') && line.includes('"')) {
      // Split long echo statements
      const indent = line.match(/^(\s*)/)[1];
      const echoMatch = line.match(/echo "(.+)"/);
      if (echoMatch && echoMatch[1].length > 80) {
        const message = echoMatch[1];
        const chunks = [];
        let currentChunk = '';
        
        for (const word of message.split(' ')) {
          if ((currentChunk + ' ' + word).length > 80) {
            chunks.push(currentChunk);
            currentChunk = word;
          } else {
            currentChunk = currentChunk ? currentChunk + ' ' + word : word;
          }
        }
        if (currentChunk) chunks.push(currentChunk);
        
        fixedLines.push(`${indent}echo "${chunks[0]}"`);
        for (let i = 1; i < chunks.length; i++) {
          fixedLines.push(`${indent}echo "${chunks[i]}"`);
        }
        continue;
      }
    }
    
    // Handle long run commands with pipes
    if (line.includes('|') && !line.trim().startsWith('#')) {
      const indent = line.match(/^(\s*)/)[1];
      const parts = line.split('|').map(p => p.trim());
      
      if (parts.length > 1) {
        fixedLines.push(`${indent}${parts[0]} |`);
        for (let i = 1; i < parts.length; i++) {
          const continuation = i < parts.length - 1 ? ' |' : '';
          fixedLines.push(`${indent}  ${parts[i]}${continuation}`);
        }
        continue;
      }
    }
    
    // Handle long descriptions
    if (line.includes('description:') && line.length > MAX_LINE_LENGTH) {
      const indent = line.match(/^(\s*)/)[1];
      const descMatch = line.match(/description:\s*['"]?(.+?)['"]?$/);
      if (descMatch) {
        fixedLines.push(`${indent}description: |`);
        fixedLines.push(`${indent}  ${descMatch[1]}`);
        continue;
      }
    }
    
    // Default: keep the line as is (manual review needed)
    fixedLines.push(line);
  }
  
  return fixedLines.join('\n');
}

/**
 * Fix indentation issues
 */
function fixIndentation(content) {
  const lines = content.split('\n');
  const fixedLines = [];
  let expectedIndent = 0;
  const indentStack = [0];
  
  for (let line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      fixedLines.push(line);
      continue;
    }
    
    // Calculate current indent
    const currentIndent = line.match(/^(\s*)/)[1].length;
    
    // Detect dedent
    if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      // New section
      if (currentIndent < indentStack[indentStack.length - 1]) {
        // Pop from stack until we find the right level
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > currentIndent) {
          indentStack.pop();
        }
      }
      expectedIndent = indentStack[indentStack.length - 1];
    }
    
    // Fix tabs to spaces
    let fixedLine = line.replace(/\t/g, '  ');
    
    // Ensure proper indentation (multiples of 2)
    const properIndent = Math.round(currentIndent / INDENT_SIZE) * INDENT_SIZE;
    if (currentIndent !== properIndent) {
      const spaces = ' '.repeat(properIndent);
      fixedLine = spaces + trimmed;
    }
    
    fixedLines.push(fixedLine);
    
    // Update indent stack for next line
    if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      indentStack.push(properIndent + INDENT_SIZE);
      expectedIndent = properIndent + INDENT_SIZE;
    }
  }
  
  return fixedLines.join('\n');
}

/**
 * Add YAML anchors for repeated values
 */
function addAnchors(content) {
  // Common repeated values in workflows
  const commonValues = {
    'ubuntu-latest': '&ubuntu-latest ubuntu-latest',
    'actions/checkout@v4': '&checkout actions/checkout@v4',
    'actions/setup-node@v4': '&setup-node actions/setup-node@v4',
    'actions/upload-artifact@v4': '&upload-artifact actions/upload-artifact@v4'
  };
  
  let modifiedContent = content;
  
  // First pass: define anchors
  for (const [value, anchor] of Object.entries(commonValues)) {
    const regex = new RegExp(`(runs-on:|uses:)\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    let firstOccurrence = true;
    
    modifiedContent = modifiedContent.replace(regex, (match, prefix) => {
      if (firstOccurrence) {
        firstOccurrence = false;
        return `${prefix} ${anchor}`;
      }
      return match;
    });
  }
  
  // Second pass: use references
  for (const [value, anchor] of Object.entries(commonValues)) {
    const anchorName = anchor.split(' ')[0];
    const regex = new RegExp(`(runs-on:|uses:)\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    
    modifiedContent = modifiedContent.replace(regex, (match, prefix) => {
      // Skip if it's already an anchor definition
      if (match.includes('&')) return match;
      return `${prefix} *${anchorName.substring(1)}`;
    });
  }
  
  return modifiedContent;
}

/**
 * Process a single workflow file
 */
function processWorkflowFile(filePath) {
  console.log(`\n📝 Processing: ${path.basename(filePath)}`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  // Apply fixes
  content = fixLineLengths(content);
  content = fixIndentation(content);
  // Note: Anchors might break some workflows, so this is optional
  // content = addAnchors(content);
  
  if (content !== originalContent) {
    // Create backup
    const backupPath = `${filePath}.backup`;
    fs.writeFileSync(backupPath, originalContent);
    console.log(`  📋 Backup created: ${path.basename(backupPath)}`);
    
    // Write fixed content
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Fixed formatting violations`);
    
    // Count fixes
    const originalLines = originalContent.split('\n');
    const fixedLines = content.split('\n');
    let changedLines = 0;
    
    for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
      if (originalLines[i] !== fixedLines[i]) changedLines++;
    }
    
    console.log(`  📊 Changed ${changedLines} lines`);
  } else {
    console.log(`  ✅ No formatting issues found`);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 YAML Formatting Fix Tool');
  console.log('===========================');
  
  if (!fs.existsSync(workflowsDir)) {
    console.error('❌ Workflows directory not found:', workflowsDir);
    process.exit(1);
  }
  
  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => path.join(workflowsDir, f));
  
  console.log(`Found ${files.length} workflow files to process`);
  
  for (const file of files) {
    try {
      processWorkflowFile(file);
    } catch (error) {
      console.error(`❌ Error processing ${path.basename(file)}:`, error.message);
    }
  }
  
  console.log('\n✅ YAML formatting fixes complete');
  console.log('📋 Review the changes and test workflows before committing');
}

// Run if executed directly
if (require.main === module) {
  main();
}