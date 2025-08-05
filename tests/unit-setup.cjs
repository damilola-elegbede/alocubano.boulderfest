// Jest setup file for unit tests with jsdom environment
beforeAll(() => {
  // Set longer timeout for CI environments
  jest.setTimeout(10000);

  // jsdom provides real DOM globals, only mock specific APIs that need it
  global.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));

  // Mock console for cleaner test output
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };
});

afterAll(() => {
  // Clean up any resources
  jest.clearAllMocks();
});
