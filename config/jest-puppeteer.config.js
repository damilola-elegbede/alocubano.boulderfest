module.exports = {
  launch: {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
  server: {
    command: "npx vercel dev --listen 8000",
    port: 8000,
    launchTimeout: 30000, // Increased for Vercel startup
    debug: true,
  },
};
