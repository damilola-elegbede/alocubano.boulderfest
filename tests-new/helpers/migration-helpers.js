/**
 * Migration Test Helpers
 * Provides utilities for testing database migration integrity and checksum validation
 */
import crypto from 'crypto';

/**
 * Calculate checksum for migration content that matches production logic
 * This ensures test checksums match production migration system checksums
 */
export function calculateMigrationChecksum(content) {
  // Normalize line endings to LF (Unix style) to ensure platform consistency
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Important: Don't trim content - match production behavior exactly
  // Production system uses content directly without trimming
  return crypto.createHash('sha256').update(normalizedContent).digest('hex');
}

/**
 * Normalize migration content for consistent processing
 * Handles platform-specific line endings and whitespace
 */
export function normalizeMigrationContent(content) {
  // Convert all line endings to LF (Unix style)
  let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Normalize whitespace at end of lines but preserve overall structure
  normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
  
  return normalized;
}

/**
 * Parse migration metadata from content
 * Extracts description from comments while handling various comment formats
 */
export function parseMigrationDescription(content) {
  const lines = content.split('\n');
  
  // Look for the first non-empty comment line that contains description
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and migration header comments
    if (!trimmedLine || !trimmedLine.startsWith('--')) {
      continue;
    }
    
    // Skip generic "Migration:" prefixed lines
    if (trimmedLine.includes('Migration:')) {
      continue;
    }
    
    // Extract the actual description
    const description = trimmedLine.replace(/^--\s*/, '').trim();
    if (description && description.length > 0) {
      return description;
    }
  }
  
  return 'No description';
}

/**
 * Extract SQL statements from migration content
 * Handles comments and statement separation consistently with production
 */
export function extractMigrationStatements(content) {
  // Use the same logic as production migration system
  const statements = [];
  let currentStatement = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inComment = false;
  let inMultiLineComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';
    const prevChar = content[i - 1] || '';

    // Handle multi-line comments /* */
    if (char === '/' && nextChar === '*' && !inSingleQuote && !inDoubleQuote) {
      inMultiLineComment = true;
      currentStatement += char;
      continue;
    }

    if (char === '*' && nextChar === '/' && inMultiLineComment) {
      inMultiLineComment = false;
      currentStatement += char;
      continue;
    }

    if (inMultiLineComment) {
      currentStatement += char;
      continue;
    }

    // Handle single line comments --
    if (char === '-' && nextChar === '-' && !inSingleQuote && !inDoubleQuote) {
      inComment = true;
      currentStatement += char;
      continue;
    }

    if (inComment && char === '\n') {
      inComment = false;
      currentStatement += char;
      continue;
    }

    if (inComment) {
      currentStatement += char;
      continue;
    }

    // Handle string literals
    if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
    }

    if (char === '"' && !inSingleQuote && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    }

    // Handle statement separation
    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      currentStatement += char;
      statements.push(currentStatement.trim());
      currentStatement = '';
      continue;
    }

    currentStatement += char;
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  // Filter out empty statements and clean up formatting
  return statements
    .filter(stmt => stmt.length > 0)
    .map(stmt => {
      // Remove leading/trailing whitespace but preserve internal formatting
      const lines = stmt.split('\n');
      const cleanedLines = lines.map(line => line.trimEnd());
      // Remove empty lines from start and end
      while (cleanedLines.length > 0 && cleanedLines[0].trim() === '') {
        cleanedLines.shift();
      }
      while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
        cleanedLines.pop();
      }
      return cleanedLines.join('\n');
    });
}

/**
 * Validate migration file format and content
 */
export function validateMigrationFile(filename, content) {
  const issues = [];

  // Check filename format
  if (!/^\d{3}_[\w_]+\.sql$/.test(filename)) {
    issues.push('Invalid filename format. Expected: ###_description.sql');
  }

  // Check for required content
  if (!content || content.trim().length === 0) {
    issues.push('Migration file is empty');
  }

  // Check for SQL statements
  const statements = extractMigrationStatements(content);
  if (statements.length === 0) {
    issues.push('No SQL statements found in migration');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Create migration metadata object consistent with production format
 */
export function createMigrationMetadata(filename, content) {
  const normalized = normalizeMigrationContent(content);
  
  return {
    filename,
    version: extractVersionFromFilename(filename),
    description: parseMigrationDescription(content),
    checksum: calculateMigrationChecksum(normalized),
    statements: extractMigrationStatements(normalized),
    size: normalized.length,
    createdAt: new Date().toISOString()
  };
}

/**
 * Extract version from migration filename
 */
export function extractVersionFromFilename(filename) {
  const match = filename.match(/^(\d{3})_/);
  return match ? match[1] : filename.replace('.sql', '');
}