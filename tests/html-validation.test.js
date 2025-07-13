const validator = require('html-validator');
const fs = require('fs').promises;
const path = require('path');

describe('HTML Validation', () => {
    const pages = [
        'home.html',
        'about.html',
        'artists.html',
        'schedule.html',
        'gallery.html',
        'tickets.html',
        'donations.html'
    ];

    pages.forEach(page => {
        test(`${page} should have valid HTML`, async() => {
            const filePath = path.join(__dirname, '..', 'pages', 'typographic', page);
            const html = await fs.readFile(filePath, 'utf8');
            
            const options = {
                data: html,
                format: 'json'
            };

            const result = await validator(options);
            const errors = result.messages.filter(msg => msg.type === 'error');
            
            if (errors.length > 0) {
                console.log(`HTML validation errors in ${page}:`, errors);
            }
            
            expect(errors.length).toBe(0);
        });
    });

    test('All pages should have proper DOCTYPE', async() => {
        for (const page of pages) {
            const filePath = path.join(__dirname, '..', 'pages', 'typographic', page);
            const html = await fs.readFile(filePath, 'utf8');
            
            expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
        }
    });

    test('All pages should have lang attribute', async() => {
        for (const page of pages) {
            const filePath = path.join(__dirname, '..', 'pages', 'typographic', page);
            const html = await fs.readFile(filePath, 'utf8');
            
            expect(html).toMatch(/<html[^>]+lang="en"/);
        }
    });

    test('All pages should have meta viewport', async() => {
        for (const page of pages) {
            const filePath = path.join(__dirname, '..', 'pages', 'typographic', page);
            const html = await fs.readFile(filePath, 'utf8');
            
            expect(html).toMatch(/<meta[^>]+viewport/);
        }
    });

    test('All pages should have title tags', async() => {
        for (const page of pages) {
            const filePath = path.join(__dirname, '..', 'pages', 'typographic', page);
            const html = await fs.readFile(filePath, 'utf8');
            
            expect(html).toMatch(/<title>[^<]+<\/title>/);
        }
    });
});