#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📦 Preparing files for Vercel deployment...');

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy index.html to public (root route)
const indexSrc = path.join(__dirname, 'index.html');
const indexDest = path.join(publicDir, 'index.html');
if (fs.existsSync(indexSrc)) {
  fs.copyFileSync(indexSrc, indexDest);
  console.log('✅ Copied index.html to public/');
}

// Copy all files from pages/ to public/
const pagesDir = path.join(__dirname, 'pages');
if (fs.existsSync(pagesDir)) {
  const copyRecursive = (src, dest) => {
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
  
  copyRecursive(pagesDir, publicDir);
  console.log('✅ Copied pages/ to public/');
}

// Copy static assets
const assetDirs = ['css', 'js', 'images'];
assetDirs.forEach(dir => {
  const srcDir = path.join(__dirname, dir);
  const destDir = path.join(publicDir, dir);
  if (fs.existsSync(srcDir)) {
    const copyRecursive = (src, dest) => {
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
    copyRecursive(srcDir, destDir);
    console.log(`✅ Copied ${dir}/ to public/`);
  }
});

// Copy root files
const rootFiles = ['robots.txt', 'sitemap.xml', 'browserconfig.xml'];
rootFiles.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${file} to public/`);
  }
});

console.log('🎉 Build complete! Static files prepared in public/');