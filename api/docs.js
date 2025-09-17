import { marked } from 'marked';
import { embeddedDocs, availableDocs } from './embedded-docs.js';

/**
 * Serves markdown documentation files as HTML
 * Uses embedded content for reliable Vercel deployment
 */
export default async function handler(req, res) {
  // Get the path from the query parameter
  const pathSegments = req.query.path;

  if (!pathSegments || pathSegments.length === 0) {
    // If no path specified, show index of available docs
    return serveDocsIndex(res);
  }

  // Reconstruct the file path
  const requestedPath = Array.isArray(pathSegments)
    ? pathSegments.join('/')
    : pathSegments;

  // Security: Prevent directory traversal
  if (requestedPath.includes('..') || requestedPath.includes('~')) {
    return res.status(403).json({ error: 'Invalid path' });
  }

  // Ensure it ends with .md
  const mdPath = requestedPath.endsWith('.md')
    ? requestedPath
    : `${requestedPath}.md`;

  // Get the embedded content
  const markdown = embeddedDocs[mdPath];

  if (!markdown) {
    return res.status(404).json({
      error: 'Documentation not found',
      requested: mdPath,
      available: availableDocs
    });
  }

  try {
    // Convert markdown to HTML
    const htmlContent = marked(markdown);

    // Create a complete HTML document with styling
    const html = `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mdPath.replace('.md', '').replace(/_/g, ' ')} - Documentation</title>
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/typography.css">
  <style>
    body {
      font-family: var(--font-sans);
      line-height: 1.6;
      color: var(--color-text-primary);
      background: var(--color-background-primary);
      max-width: 900px;
      margin: 0 auto;
      padding: var(--space-xl);
    }

    .doc-header {
      background: linear-gradient(135deg, var(--color-blue) 0%, var(--color-red) 100%);
      color: white;
      padding: var(--space-2xl);
      margin: calc(-1 * var(--space-xl)) calc(-1 * var(--space-xl)) var(--space-2xl);
      text-align: center;
    }

    .doc-nav {
      margin-bottom: var(--space-xl);
      padding-bottom: var(--space-lg);
      border-bottom: 2px solid var(--color-border);
    }

    .doc-nav a {
      color: var(--color-blue);
      text-decoration: none;
      margin-right: var(--space-lg);
    }

    .doc-nav a:hover {
      text-decoration: underline;
    }

    .doc-content {
      background: var(--color-surface);
      padding: var(--space-xl);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
    }

    .doc-content h1 {
      color: var(--color-text-primary);
      border-bottom: 2px solid var(--color-border);
      padding-bottom: var(--space-md);
      margin-bottom: var(--space-lg);
      font-family: var(--font-display);
    }

    .doc-content h2 {
      color: var(--color-text-primary);
      margin-top: var(--space-xl);
      margin-bottom: var(--space-md);
      font-family: var(--font-display);
    }

    .doc-content h3 {
      color: var(--color-text-secondary);
      margin-top: var(--space-lg);
      margin-bottom: var(--space-sm);
    }

    .doc-content code {
      background: var(--color-background-secondary);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 0.9em;
    }

    .doc-content pre {
      background: var(--color-background-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
      overflow-x: auto;
    }

    .doc-content pre code {
      background: none;
      padding: 0;
    }

    .doc-content blockquote {
      border-left: 4px solid var(--color-blue);
      padding-left: var(--space-lg);
      margin: var(--space-lg) 0;
      color: var(--color-text-secondary);
      font-style: italic;
    }

    .doc-content a {
      color: var(--color-blue);
      text-decoration: none;
    }

    .doc-content a:hover {
      text-decoration: underline;
    }

    .doc-content ul, .doc-content ol {
      margin: var(--space-md) 0;
      padding-left: var(--space-xl);
    }

    .doc-content li {
      margin: var(--space-sm) 0;
    }

    .doc-content table {
      width: 100%;
      border-collapse: collapse;
      margin: var(--space-lg) 0;
    }

    .doc-content th, .doc-content td {
      border: 1px solid var(--color-border);
      padding: var(--space-sm);
      text-align: left;
    }

    .doc-content th {
      background: var(--color-background-secondary);
      font-weight: bold;
    }

    @media (max-width: 768px) {
      body {
        padding: var(--space-md);
      }

      .doc-header {
        margin: calc(-1 * var(--space-md)) calc(-1 * var(--space-md)) var(--space-lg);
        padding: var(--space-lg);
      }

      .doc-content {
        padding: var(--space-lg);
      }
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <h1>A Lo Cubano Boulder Fest</h1>
    <p>Documentation</p>
  </div>

  <nav class="doc-nav">
    <a href="/api/docs">← All Docs</a>
    <a href="/admin">Admin Portal</a>
    <a href="/">Main Site</a>
  </nav>

  <div class="doc-content">
    ${htmlContent}
  </div>

  <script type="module" src="/js/theme-manager.js"></script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error serving documentation:', error);
    return res.status(500).json({
      error: 'Failed to render documentation',
      details: error.message
    });
  }
}

/**
 * Serve an index of available documentation
 */
function serveDocsIndex(res) {
  try {
    // Group files by category
    const categorized = {
      admin: [],
      api: [],
      system: [],
      architecture: []
    };

    for (const file of availableDocs) {
      const name = file.replace('.md', '').replace('architecture/', '');
      const item = {
        name: name.replace(/_/g, ' '),
        path: file,
        url: `/api/docs?path=${file}`
      };

      if (file.startsWith('architecture/')) {
        categorized.architecture.push(item);
      } else if (name.toLowerCase().includes('admin')) {
        categorized.admin.push(item);
      } else if (name.toLowerCase().includes('api')) {
        categorized.api.push(item);
      } else if (name.toLowerCase().includes('system') || name.toLowerCase().includes('theme')) {
        categorized.system.push(item);
      } else {
        categorized.system.push(item);
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation Index - A Lo Cubano Boulder Fest</title>
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/typography.css">
  <style>
    body {
      font-family: var(--font-sans);
      background: linear-gradient(135deg, var(--color-blue) 0%, var(--color-red) 100%);
      min-height: 100vh;
      padding: var(--space-xl);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      color: white;
      margin-bottom: var(--space-2xl);
    }

    .header h1 {
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      margin-bottom: var(--space-md);
    }

    .docs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--space-lg);
    }

    .docs-category {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-xl);
      border: 2px solid var(--color-border);
    }

    .docs-category h2 {
      font-family: var(--font-display);
      color: var(--color-text-primary);
      margin-bottom: var(--space-lg);
      padding-bottom: var(--space-sm);
      border-bottom: 2px solid var(--color-border);
    }

    .docs-list {
      list-style: none;
      padding: 0;
    }

    .docs-list li {
      margin-bottom: var(--space-sm);
    }

    .docs-list a {
      color: var(--color-blue);
      text-decoration: none;
      display: block;
      padding: var(--space-sm);
      border-radius: var(--radius-sm);
      transition: all var(--transition-base);
    }

    .docs-list a:hover {
      background: var(--color-background-secondary);
      text-decoration: underline;
    }

    .back-link {
      display: inline-block;
      color: white;
      text-decoration: none;
      margin-bottom: var(--space-lg);
      padding: var(--space-sm) var(--space-md);
      background: rgba(255,255,255,0.1);
      border-radius: var(--radius-md);
    }

    .back-link:hover {
      background: rgba(255,255,255,0.2);
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/admin" class="back-link">← Back to Admin Portal</a>

    <div class="header">
      <h1>Documentation Index</h1>
      <p>A Lo Cubano Boulder Fest - Technical Documentation</p>
    </div>

    <div class="docs-grid">
      ${categorized.admin.length > 0 ? `
      <div class="docs-category">
        <h2>Admin Documentation</h2>
        <ul class="docs-list">
          ${categorized.admin.map(doc => `
            <li><a href="${doc.url}">${doc.name}</a></li>
          `).join('')}
        </ul>
      </div>` : ''}

      ${categorized.api.length > 0 ? `
      <div class="docs-category">
        <h2>API Documentation</h2>
        <ul class="docs-list">
          ${categorized.api.map(doc => `
            <li><a href="${doc.url}">${doc.name}</a></li>
          `).join('')}
        </ul>
      </div>` : ''}

      ${categorized.system.length > 0 ? `
      <div class="docs-category">
        <h2>System Documentation</h2>
        <ul class="docs-list">
          ${categorized.system.map(doc => `
            <li><a href="${doc.url}">${doc.name}</a></li>
          `).join('')}
        </ul>
      </div>` : ''}

      ${categorized.architecture.length > 0 ? `
      <div class="docs-category">
        <h2>Architecture Documentation</h2>
        <ul class="docs-list">
          ${categorized.architecture.map(doc => `
            <li><a href="${doc.url}">${doc.name}</a></li>
          `).join('')}
        </ul>
      </div>` : ''}
    </div>
  </div>

  <script type="module" src="/js/theme-manager.js"></script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error generating docs index:', error);
    return res.status(500).json({
      error: 'Failed to generate documentation index',
      details: error.message
    });
  }
}