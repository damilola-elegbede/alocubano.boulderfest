#!/usr/bin/env node

// Simulate Vercel build process to test ES module compatibility
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('🔨 Simulating Vercel Build Process...\n');

// Step 1: Install dependencies (simulate npm ci)
console.log('📦 Step 1: Installing dependencies...');
const installProcess = spawn('npm', ['ci'], {
    cwd: projectRoot,
    stdio: 'inherit'
});

installProcess.on('close', (code) => {
    if (code !== 0) {
        console.error('❌ Dependency installation failed');
        process.exit(1);
    }
    
    console.log('✅ Dependencies installed successfully\n');
    
    // Step 2: Run prebuild (this is where the ES module issue occurred)
    console.log('🏗️  Step 2: Running prebuild scripts...');
    const prebuildProcess = spawn('npm', ['run', 'prebuild'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: 'production'
        }
    });
    
    prebuildProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('❌ Prebuild failed - this is where the ES module error occurred');
            process.exit(1);
        }
        
        console.log('✅ Prebuild completed successfully\n');
        
        // Step 3: Run build
        console.log('🔧 Step 3: Running build...');
        const buildProcess = spawn('npm', ['run', 'build'], {
            cwd: projectRoot,
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'production'
            }
        });
        
        buildProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('❌ Build failed');
                process.exit(1);
            }
            
            console.log('✅ Build completed successfully\n');
            
            // Step 4: Validate output
            console.log('🔍 Step 4: Validating build output...');
            
            const checks = [
                {
                    name: 'Gallery data generated',
                    file: 'public/gallery-data/2025.json',
                    required: true
                },
                {
                    name: 'Featured photos generated', 
                    file: 'public/featured-photos.json',
                    required: true
                },
                {
                    name: 'Main pages exist',
                    file: 'pages/about.html',
                    required: true
                },
                {
                    name: 'CSS files exist',
                    file: 'css/typography.css',
                    required: true
                },
                {
                    name: 'JavaScript files exist',
                    file: 'js/main.js',
                    required: true
                }
            ];
            
            let allPassed = true;
            
            checks.forEach(check => {
                const filePath = path.join(projectRoot, check.file);
                const exists = fs.existsSync(filePath);
                
                if (exists) {
                    console.log(`  ✅ ${check.name}`);
                } else {
                    console.log(`  ${check.required ? '❌' : '⚠️'}  ${check.name}`);
                    if (check.required) allPassed = false;
                }
            });
            
            console.log('\n🏁 Build Simulation Complete!');
            
            if (allPassed) {
                console.log('🎉 All checks passed - Vercel deployment should work!');
                
                // Show some stats
                const galleryData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/gallery-data/2025.json'), 'utf8'));
                const featuredData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/featured-photos.json'), 'utf8'));
                
                console.log('\n📊 Build Stats:');
                console.log(`  Gallery items: ${galleryData.totalCount}`);
                console.log(`  Featured photos: ${featuredData.totalCount}`);
                console.log(`  Categories: ${Object.keys(galleryData.categories).length}`);
                
                process.exit(0);
            } else {
                console.log('💥 Some checks failed - fix before deploying');
                process.exit(1);
            }
        });
    });
});