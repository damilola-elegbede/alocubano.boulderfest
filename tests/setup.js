// Jest setup file
beforeAll(async() => {
    // Set longer timeout for CI environments
    jest.setTimeout(30000);
});

afterAll(async() => {
    // Clean up any resources
});