/**
 * Splits SQL statements intelligently, handling:
 * - Strings with embedded semicolons
 * - Triggers, stored procedures, and other blocks
 * - Comments (both line and block style)
 * - Custom delimiter: -- migrate:break
 */
export function splitSqlStatements(sql) {
  // First check for custom delimiter approach
  if (sql.includes("-- migrate:break")) {
    return sql
      .split(/--\s*migrate:break/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Otherwise use SQL-aware splitting
  const statements = [];
  let currentStatement = "";
  let inString = false;
  let stringDelimiter = null;
  let inLineComment = false;
  let inBlockComment = false;
  let inTrigger = false;
  
  const lines = sql.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    
    while (j < line.length) {
      const char = line[j];
      const nextChar = line[j + 1];
      
      // Handle line comments
      if (!inString && !inBlockComment && char === "-" && nextChar === "-") {
        inLineComment = true;
        // Skip the rest of the line for line comments
        j = line.length;
        continue;
      }
      
      // Handle block comments
      if (!inString && !inLineComment && char === "/" && nextChar === "*") {
        inBlockComment = true;
        // Skip block comment start
        j += 2;
        continue;
      }
      
      if (inBlockComment && char === "*" && nextChar === "/") {
        inBlockComment = false;
        // Skip block comment end
        j += 2;
        continue;
      }
      
      // Skip content inside block comments
      if (inBlockComment) {
        j++;
        continue;
      }
      
      // Handle strings
      if (!inLineComment && !inBlockComment) {
        if ((char === "'" || char === '"') && !inString) {
          inString = true;
          stringDelimiter = char;
        } else if (inString && char === stringDelimiter) {
          // Check for escaped quotes
          if (nextChar === stringDelimiter) {
            currentStatement += char + nextChar;
            j += 2;
            continue;
          }
          inString = false;
          stringDelimiter = null;
        }
      }
      
      // Check for trigger/procedure keywords (case-insensitive)
      if (!inString && !inLineComment && !inBlockComment) {
        const upperLine = line.toUpperCase();
        const remainingLine = upperLine.substring(j);
        
        if (remainingLine.startsWith("CREATE TRIGGER") || 
            remainingLine.startsWith("CREATE PROCEDURE") ||
            remainingLine.startsWith("CREATE FUNCTION")) {
          inTrigger = true;
        } else if (inTrigger && remainingLine.startsWith("END;")) {
          inTrigger = false;
        }
      }
      
      // Handle statement terminator
      if (char === ";" && !inString && !inLineComment && !inBlockComment && !inTrigger) {
        const trimmed = currentStatement.trim();
        if (trimmed.length > 0 && 
            !trimmed.startsWith("--") && 
            !trimmed.startsWith("/*")) {
          statements.push(trimmed);
        }
        currentStatement = "";
      } else {
        currentStatement += char;
      }
      
      j++;
    }
    
    // Add newline at end of line (except last line)
    if (i < lines.length - 1) {
      currentStatement += "\n";
    }
    
    // Reset line comment flag at end of line
    inLineComment = false;
  }
  
  // Add any remaining statement
  const trimmed = currentStatement.trim();
  if (trimmed.length > 0 && 
      !trimmed.startsWith("--") && 
      !trimmed.startsWith("/*")) {
    statements.push(trimmed);
  }
  
  return statements;
}