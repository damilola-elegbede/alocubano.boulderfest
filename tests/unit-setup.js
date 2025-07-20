// Jest setup file for unit tests (no Puppeteer)
beforeAll(() => {
    // Set longer timeout for CI environments
    jest.setTimeout(10000);
    
    // Mock DOM globals
    global.document = {
        getElementById: jest.fn(),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(),
        createElement: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        body: {
            style: {},
            classList: {
                add: jest.fn(),
                remove: jest.fn()
            }
        }
    };
    
    global.window = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        IntersectionObserver: jest.fn()
    };
    
    global.Image = jest.fn();
    
    // Mock console for cleaner test output
    global.console = {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
    };
});

afterAll(() => {
    // Clean up any resources
    jest.clearAllMocks();
});