module.exports = {
    launch: {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    },
    server: {
        command: 'python3 -m http.server 8000',
        port: 8000,
        launchTimeout: 10000,
        debug: true
    }
};