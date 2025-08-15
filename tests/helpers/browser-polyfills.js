/**
 * Browser API Polyfills for JSDOM Testing Environment
 * 
 * This module provides comprehensive polyfills for browser APIs that are not
 * available in JSDOM but are used by our frontend code.
 */

/**
 * Setup all browser polyfills for a JSDOM window object
 * @param {Window} window - The JSDOM window object to polyfill
 */
export function setupBrowserPolyfills(window) {
  const document = window.document;
  const global = window;

  // PageTransition API Polyfill
  if (!window.PageTransition) {
    window.PageTransition = class PageTransition {
      constructor() {
        this.activation = null;
        this.finished = Promise.resolve();
      }
    };
    
    window.PageTransitionEvent = class PageTransitionEvent extends Event {
      constructor(type, eventInitDict = {}) {
        super(type, eventInitDict);
        this.persisted = eventInitDict.persisted || false;
      }
    };
  }

  // ViewTransition API Polyfill
  if (!window.ViewTransition) {
    window.ViewTransition = class ViewTransition {
      constructor() {
        this.finished = Promise.resolve();
        this.ready = Promise.resolve();
        this.updateCallbackDone = Promise.resolve();
      }
      
      skipTransition() {
        // Simulate skipping the transition
      }
    };
    
    // Add startViewTransition to document
    if (!document.startViewTransition) {
      document.startViewTransition = function(callback) {
        const transition = new window.ViewTransition();
        if (callback) {
          try {
            const result = callback();
            if (result && typeof result.then === 'function') {
              result.then(
                () => transition.updateCallbackDone,
                () => transition.updateCallbackDone
              );
            }
          } catch (error) {
            // Handle synchronous errors
          }
        }
        return transition;
      };
    }
  }

  // IntersectionObserver Polyfill
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class IntersectionObserver {
      constructor(callback, options = {}) {
        this.callback = callback;
        this.options = options;
        this.elements = new Set();
        this.rootMargin = options.rootMargin || '0px';
        this.threshold = options.threshold || 0;
      }

      observe(element) {
        if (element) {
          this.elements.add(element);
          // Simulate immediate intersection for testing
          setTimeout(() => {
            if (this.callback) {
              const entries = [{
                target: element,
                isIntersecting: true,
                intersectionRatio: 1,
                boundingClientRect: element.getBoundingClientRect ? element.getBoundingClientRect() : {},
                intersectionRect: {},
                rootBounds: {},
                time: Date.now()
              }];
              this.callback(entries, this);
            }
          }, 0);
        }
      }

      unobserve(element) {
        this.elements.delete(element);
      }

      disconnect() {
        this.elements.clear();
      }

      takeRecords() {
        return [];
      }
    };

    window.IntersectionObserverEntry = class IntersectionObserverEntry {
      constructor(entry) {
        Object.assign(this, entry);
      }
    };
  }

  // ResizeObserver Polyfill
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.elements = new Set();
      }

      observe(element) {
        if (element) {
          this.elements.add(element);
        }
      }

      unobserve(element) {
        this.elements.delete(element);
      }

      disconnect() {
        this.elements.clear();
      }
    };

    window.ResizeObserverEntry = class ResizeObserverEntry {
      constructor(target) {
        this.target = target;
        this.contentRect = {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        };
        this.borderBoxSize = [{ blockSize: 0, inlineSize: 0 }];
        this.contentBoxSize = [{ blockSize: 0, inlineSize: 0 }];
        this.devicePixelContentBoxSize = [{ blockSize: 0, inlineSize: 0 }];
      }
    };
  }

  // matchMedia Polyfill
  if (!window.matchMedia) {
    window.matchMedia = function(media) {
      return {
        matches: false,
        media: media,
        onchange: null,
        addListener: function(listener) {
          // Deprecated but still used in some code
        },
        removeListener: function(listener) {
          // Deprecated but still used in some code
        },
        addEventListener: function(type, listener) {
          // Modern API
        },
        removeEventListener: function(type, listener) {
          // Modern API
        },
        dispatchEvent: function(event) {
          return true;
        }
      };
    };
  }

  // requestAnimationFrame Polyfill
  if (!window.requestAnimationFrame) {
    let lastTime = 0;
    window.requestAnimationFrame = function(callback) {
      const currTime = new Date().getTime();
      const timeToCall = Math.max(0, 16 - (currTime - lastTime));
      const id = window.setTimeout(function() {
        callback(currTime + timeToCall);
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
  }

  // Performance API enhancements
  if (!window.performance || !window.performance.now) {
    const performanceObj = {
      now: function() {
        return Date.now();
      },
      mark: function(name) {
        // Mock implementation
      },
      measure: function(name, startMark, endMark) {
        // Mock implementation
      },
      getEntriesByType: function(type) {
        return [];
      },
      getEntriesByName: function(name) {
        return [];
      },
      clearMarks: function() {
        // Mock implementation
      },
      clearMeasures: function() {
        // Mock implementation
      },
      timing: {
        navigationStart: Date.now()
      },
      navigation: {
        type: 0
      }
    };
    
    // Try to define performance property, handle read-only case
    try {
      Object.defineProperty(window, 'performance', {
        value: performanceObj,
        writable: true,
        configurable: true
      });
    } catch (e) {
      // If performance is read-only, try to extend it
      if (window.performance) {
        Object.assign(window.performance, performanceObj);
      }
    }
  }

  // Web Storage API enhancements (if not already present)
  if (!window.localStorage) {
    const storage = {};
    window.localStorage = {
      getItem: function(key) {
        return storage[key] || null;
      },
      setItem: function(key, value) {
        storage[key] = String(value);
      },
      removeItem: function(key) {
        delete storage[key];
      },
      clear: function() {
        Object.keys(storage).forEach(key => delete storage[key]);
      },
      get length() {
        return Object.keys(storage).length;
      },
      key: function(index) {
        const keys = Object.keys(storage);
        return keys[index] || null;
      }
    };
  }

  if (!window.sessionStorage) {
    const storage = {};
    window.sessionStorage = {
      getItem: function(key) {
        return storage[key] || null;
      },
      setItem: function(key, value) {
        storage[key] = String(value);
      },
      removeItem: function(key) {
        delete storage[key];
      },
      clear: function() {
        Object.keys(storage).forEach(key => delete storage[key]);
      },
      get length() {
        return Object.keys(storage).length;
      },
      key: function(index) {
        const keys = Object.keys(storage);
        return keys[index] || null;
      }
    };
  }

  // Crypto API (basic polyfill)
  if (!window.crypto) {
    window.crypto = {
      getRandomValues: function(array) {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      randomUUID: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
    };
  }

  // URL and URLSearchParams (if needed)
  if (!window.URL) {
    window.URL = URL;
  }
  
  if (!window.URLSearchParams) {
    window.URLSearchParams = URLSearchParams;
  }

  // Scroll behavior polyfill
  if (!window.scrollTo) {
    window.scrollTo = function(x, y) {
      if (typeof x === 'object') {
        // Handle ScrollToOptions
        window.scrollX = x.left || 0;
        window.scrollY = x.top || 0;
      } else {
        window.scrollX = x || 0;
        window.scrollY = y || 0;
      }
    };
  }

  // Element.scrollIntoView polyfill
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function(options) {
      // Mock implementation
      const rect = this.getBoundingClientRect();
      window.scrollTo({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        behavior: options && options.behavior || 'auto'
      });
    };
  }

  // Custom Event constructor polyfill
  if (typeof window.CustomEvent !== 'function') {
    window.CustomEvent = function(event, params = {}) {
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(event, params.bubbles || false, params.cancelable || false, params.detail);
      return evt;
    };
    window.CustomEvent.prototype = window.Event.prototype;
  }

  // MutationObserver (if not present)
  if (!window.MutationObserver) {
    window.MutationObserver = class MutationObserver {
      constructor(callback) {
        this.callback = callback;
      }
      
      observe(target, options) {
        // Mock implementation
      }
      
      disconnect() {
        // Mock implementation
      }
      
      takeRecords() {
        return [];
      }
    };
  }

  // Add global reference for tests
  if (typeof global !== 'undefined') {
    // Define properties individually to handle read-only cases
    const globalProperties = {
      PageTransition: window.PageTransition,
      ViewTransition: window.ViewTransition,
      IntersectionObserver: window.IntersectionObserver,
      ResizeObserver: window.ResizeObserver,
      matchMedia: window.matchMedia,
      requestAnimationFrame: window.requestAnimationFrame,
      cancelAnimationFrame: window.cancelAnimationFrame,
      performance: window.performance,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      crypto: window.crypto,
      URL: window.URL,
      URLSearchParams: window.URLSearchParams,
      CustomEvent: window.CustomEvent,
      MutationObserver: window.MutationObserver
    };
    
    for (const [key, value] of Object.entries(globalProperties)) {
      if (value !== undefined) {
        try {
          if (global[key] === undefined || global[key] === null) {
            global[key] = value;
          } else if (typeof global[key] === 'object' && typeof value === 'object') {
            // If property exists and is an object, extend it
            Object.assign(global[key], value);
          }
        } catch (e) {
          // If we can't set the property, try defineProperty
          try {
            Object.defineProperty(global, key, {
              value: value,
              writable: true,
              configurable: true
            });
          } catch (defineError) {
            // If all else fails, continue without this property
            console.warn(`Could not set global.${key}:`, defineError.message);
          }
        }
      }
    }
  }

  return window;
}

/**
 * Check if required browser APIs are available
 * @param {Window} window - The window object to check
 * @returns {Object} - Object with API availability status
 */
export function checkBrowserAPIs(window) {
  return {
    pageTransition: !!window.PageTransition,
    viewTransition: !!window.ViewTransition,
    intersectionObserver: !!window.IntersectionObserver,
    resizeObserver: !!window.ResizeObserver,
    matchMedia: !!window.matchMedia,
    requestAnimationFrame: !!window.requestAnimationFrame,
    performance: !!window.performance,
    localStorage: !!window.localStorage,
    sessionStorage: !!window.sessionStorage,
    crypto: !!window.crypto,
    mutationObserver: !!window.MutationObserver
  };
}

export default setupBrowserPolyfills;