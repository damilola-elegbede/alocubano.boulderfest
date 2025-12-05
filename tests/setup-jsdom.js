/**
 * JSDOM Environment Setup
 *
 * This file provides localStorage/sessionStorage mocks for jsdom environment.
 * It must be loaded as a setup file and will polyfill missing storage APIs.
 */

// Create a proper Web Storage mock
function createStorageMock() {
  let store = {};
  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key(index) {
      return Object.keys(store)[index] || null;
    },
  };
}

// Apply localStorage mock if needed
if (typeof globalThis.localStorage === 'undefined' ||
    typeof globalThis.localStorage.getItem !== 'function') {
  const localStorageMock = createStorageMock();

  // Set on globalThis
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  // Also set on window if it exists
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  }
}

// Apply sessionStorage mock if needed
if (typeof globalThis.sessionStorage === 'undefined' ||
    typeof globalThis.sessionStorage.getItem !== 'function') {
  const sessionStorageMock = createStorageMock();

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true,
    configurable: true,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
      configurable: true,
    });
  }
}

// Mock matchMedia if it doesn't exist (needed by theme-manager)
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
