// Jest setup file
beforeAll(async () => {
  // Set longer timeout for CI environments
  jest.setTimeout(30000);

  // Setup puppeteer environment
  if (global.page) {
    await global.page.setViewport({ width: 1280, height: 800 });

    // Mock console to capture logs
    global.page.on("console", (msg) => {
      if (process.env.DEBUG_TESTS) {
        console.log("Browser console:", msg.text());
      }
    });

    // Log any page errors
    global.page.on("error", (err) => {
      console.error("Browser error:", err);
    });
  }
});

afterAll(async () => {
  // Clean up any resources
  if (global.browser) {
    await global.browser.close();
  }
});
