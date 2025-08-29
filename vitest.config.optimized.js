import { defineConfig } from 'vitest/config';

export default defineConfig({
  "test": {
    "pool": "threads",
    "poolOptions": {
      "threads": {
        "maxWorkers": 7,
        "minWorkers": 3
      }
    },
    "isolate": false,
    "sequence": {
      "concurrent": true,
      "shuffle": false
    },
    "reporter": [
      "verbose"
    ],
    "coverage": {
      "provider": "v8",
      "reporter": [
        "text",
        "html"
      ],
      "exclude": [
        "node_modules/**",
        "tests/**",
        "**/*.config.*",
        "scripts/**"
      ]
    },
    "testTimeout": 10000,
    "hookTimeout": 5000,
    "watch": false,
    "environment": "node",
    "globals": false,
    "setupFiles": [
      "./tests/setup.js"
    ],
    "bail": 0
  }
});