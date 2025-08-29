const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const distDir = path.join(projectRoot, 'dist');

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir);

// Copy static files to dist
const copyRecursive = (src, dest) => {
  if (!fs.existsSync(src)) return;
  
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

// Copy pages to root of dist
const pagesDir = path.join(projectRoot, 'pages');
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir).forEach(file => {
    const src = path.join(pagesDir, file);
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      // Copy subdirectories as-is (like admin/)
      copyRecursive(src, path.join(distDir, file));
    } else if (file.endsWith('.html')) {
      // Copy HTML files to root
      fs.copyFileSync(src, path.join(distDir, file));
    }
  });
}

// Copy API directory for serverless functions
const apiDir = path.join(projectRoot, 'api');
const apiDestDir = path.join(distDir, 'api');
copyRecursive(apiDir, apiDestDir);

// Copy other static directories
['css', 'js', 'images', 'public'].forEach(dir => {
  const srcDir = path.join(projectRoot, dir);
  const destDir = path.join(distDir, dir);
  copyRecursive(srcDir, destDir);
});

// Copy root files
['robots.txt', 'sitemap.xml'].forEach(file => {
  const src = path.join(projectRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
});

console.log('✅ Build complete: static files and API functions copied to dist/');