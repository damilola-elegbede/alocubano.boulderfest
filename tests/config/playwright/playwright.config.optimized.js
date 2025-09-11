import { defineConfig } from '@playwright/test';

export default defineConfig({
  "workers": 7,
  "retries": 0,
  "timeout": 30000,
  "expect": {
    "timeout": 5000
  },
  "globalSetup": "../../e2e/global-setup.js",
  "globalTeardown": "../../e2e/global-teardown.js",
  "outputDir": ".tmp/playwright-results",
  "reporter": [
    [
      "list"
    ],
    [
      "html",
      {
        "outputFolder": ".tmp/playwright-report",
        "open": "on-failure"
      }
    ]
  ],
  "use": {
    "navigationTimeout": 30000,
    "actionTimeout": 15000,
    "screenshot": "off",
    "video": "off",
    "trace": "off",
    "launchOptions": {
      "args": [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding"
      ]
    }
  },
  "projects": [
    {
      "name": "chromium",
      "use": {
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    },
    {
      "name": "firefox",
      "use": {
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0"
      }
    },
    {
      "name": "webkit",
      "use": {
        "viewport": {
          "width": 1280,
          "height": 720
        },
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
      }
    }
  ]
});