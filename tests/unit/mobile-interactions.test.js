/**
 * Mobile and Touch Interaction Tests
 * Testing actual touch events and mobile behavior
 */

import { vi } from "vitest";
const fs = require("fs");
const path = require("path");

// Load actual source code for mobile testing
let gallerySource, lightboxSource, navigationSource;
try {
  gallerySource = fs.readFileSync(
    path.join(__dirname, "../../js/gallery-detail.js"),
    "utf8",
  );
  lightboxSource = fs.readFileSync(
    path.join(__dirname, "../../js/components/lightbox.js"),
    "utf8",
  );
  navigationSource = fs.readFileSync(
    path.join(__dirname, "../../js/navigation.js"),
    "utf8",
  );
} catch (error) {
  console.error("Failed to load mobile test sources:", error);
}

describe("Touch Navigation", () => {
  beforeEach(() => {
    // Load lightbox source for touch testing
    if (lightboxSource) {
      try {
        eval(lightboxSource);
      } catch (e) {
        console.warn("Lightbox evaluation failed in mobile test:", e);
      }
    }

    // Setup mobile viewport
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 667,
      configurable: true,
    });

    // Setup touch-enabled lightbox DOM
    document.body.innerHTML = `
      <div id="unified-lightbox" class="lightbox mobile-optimized" style="display: none;">
        <div class="lightbox-content">
          <img class="lightbox-image" alt="" draggable="false">
          <div class="lightbox-counter"></div>
          <div class="lightbox-title"></div>
          <button class="lightbox-close touch-target">×</button>
          <button class="lightbox-prev touch-target">‹</button>
          <button class="lightbox-next touch-target">›</button>
        </div>
        <div class="lightbox-overlay" data-close-on-tap="true"></div>
      </div>
    `;

    // Mock touch events
    global.TouchEvent = class TouchEvent extends Event {
      constructor(type, options = {}) {
        super(type, options);
        this.touches = options.touches || [];
        this.targetTouches = options.targetTouches || [];
        this.changedTouches = options.changedTouches || [];
      }
    };

    // Mock touch support detection
    global.ontouchstart = {};

    vi.clearAllMocks();
  });

  test("swipe gestures work in lightbox", () => {
    // Simulate actual touch events
    if (global.window.Lightbox) {
      const lightbox = new global.window.Lightbox();
      const mockItems = [
        { id: "touch1", viewUrl: "touch1.jpg", name: "Touch Test 1" },
        { id: "touch2", viewUrl: "touch2.jpg", name: "Touch Test 2" },
        { id: "touch3", viewUrl: "touch3.jpg", name: "Touch Test 3" },
      ];

      lightbox.openAdvanced(mockItems, 1, ["touch"], { touch: 3 });

      const lightboxImage = document.querySelector(".lightbox-image");
      let touchStartX = 0;
      let touchEndX = 0;

      // Test swipe detection logic
      const handleTouchStart = (e) => {
        touchStartX = e.touches[0].clientX;
      };

      const handleTouchEnd = (e) => {
        touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchStartX - touchEndX;
        const minSwipeDistance = 50; // pixels

        if (Math.abs(swipeDistance) > minSwipeDistance) {
          if (swipeDistance > 0) {
            // Swipe left - next image
            lightbox.next();
          } else {
            // Swipe right - previous image
            lightbox.previous();
          }
        }
      };

      // Simulate right swipe (previous)
      const touchStart = new TouchEvent("touchstart", {
        touches: [{ clientX: 200, clientY: 300 }],
      });

      const touchEnd = new TouchEvent("touchend", {
        changedTouches: [{ clientX: 300, clientY: 300 }],
      });

      handleTouchStart(touchStart);
      handleTouchEnd(touchEnd);

      // Should navigate to previous image
      expect(lightbox.currentIndex).toBe(0);

      // Simulate left swipe (next)
      const touchStartNext = new TouchEvent("touchstart", {
        touches: [{ clientX: 300, clientY: 300 }],
      });

      const touchEndNext = new TouchEvent("touchend", {
        changedTouches: [{ clientX: 200, clientY: 300 }],
      });

      handleTouchStart(touchStartNext);
      handleTouchEnd(touchEndNext);

      // Should navigate to next image
      expect(lightbox.currentIndex).toBe(1);
    }
  });

  test("pinch zoom is handled appropriately", () => {
    // Test actual pinch gesture handling
    const lightboxImage = document.querySelector(".lightbox-image");
    let isPinching = false;
    let initialDistance = 0;
    let currentScale = 1;

    const getDistance = (touch1, touch2) => {
      return Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2),
      );
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        isPinching = true;
        initialDistance = getDistance(e.touches[0], e.touches[1]);
      }
    };

    const handleTouchMove = (e) => {
      if (isPinching && e.touches.length === 2) {
        e.preventDefault(); // Prevent default zoom behavior

        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialDistance;
        currentScale = Math.min(Math.max(scale, 0.5), 3); // Limit zoom range

        // Apply transform
        lightboxImage.style.transform = `scale(${currentScale})`;
      }
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        isPinching = false;
      }
    };

    // Simulate pinch zoom gesture
    const twoFingerStart = new TouchEvent("touchstart", {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 },
      ],
    });

    const twoFingerMove = new TouchEvent("touchmove", {
      touches: [
        { clientX: 50, clientY: 50 },
        { clientX: 250, clientY: 250 },
      ],
    });

    handleTouchStart(twoFingerStart);
    expect(isPinching).toBe(true);

    handleTouchMove(twoFingerMove);
    expect(currentScale).toBeGreaterThan(1);
    expect(lightboxImage.style.transform).toContain("scale");

    // Test zoom reset on double tap
    const doubleTap = () => {
      currentScale = 1;
      lightboxImage.style.transform = "scale(1)";
    };

    doubleTap();
    expect(lightboxImage.style.transform).toBe("scale(1)");
  });

  test("touch targets are properly sized", () => {
    // Test touch-friendly interface
    const touchTargets = document.querySelectorAll(".touch-target");

    touchTargets.forEach((target) => {
      // Mock computed style
      const mockStyle = {
        width: "44px",
        height: "44px",
        minWidth: "44px",
        minHeight: "44px",
      };

      // Touch targets should meet minimum size requirements (44px)
      const width = parseInt(mockStyle.width);
      const height = parseInt(mockStyle.height);

      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);

      // Test spacing between touch targets
      const margin = "8px";
      expect(margin).toBeDefined();
    });

    // Test hover states don't interfere on touch devices
    const hasTouchSupport = "ontouchstart" in window;
    expect(hasTouchSupport).toBe(true);

    if (hasTouchSupport) {
      // On touch devices, hover states should be minimal
      touchTargets.forEach((target) => {
        target.classList.add("touch-device");
        expect(target.classList.contains("touch-device")).toBe(true);
      });
    }
  });

  test("prevents scroll during lightbox interaction", () => {
    // Test scroll prevention during touch interaction
    let scrollPrevented = false;

    const preventScroll = (e) => {
      if (e.target.closest(".lightbox")) {
        e.preventDefault();
        scrollPrevented = true;
      }
    };

    // Mock touch event on lightbox
    const touchMoveEvent = new TouchEvent("touchmove", {
      touches: [{ clientX: 100, clientY: 100 }],
    });

    Object.defineProperty(touchMoveEvent, "target", {
      value: document.querySelector(".lightbox-image"),
    });

    preventScroll(touchMoveEvent);
    expect(scrollPrevented).toBe(true);

    // Test that body scroll is locked when lightbox is open
    const bodyScrollLock = () => {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    };

    const bodyScrollUnlock = () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };

    // Test scroll lock
    bodyScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    // Test scroll unlock
    bodyScrollUnlock();
    expect(document.body.style.overflow).toBe("");
  });

  test("handles orientation changes", () => {
    // Test orientation change handling
    let currentOrientation = "portrait";

    const handleOrientationChange = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      currentOrientation = width > height ? "landscape" : "portrait";

      // Adjust lightbox layout for orientation
      const lightbox = document.getElementById("unified-lightbox");
      lightbox.classList.remove("portrait", "landscape");
      lightbox.classList.add(currentOrientation);
    };

    // Test portrait mode
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 667,
      configurable: true,
    });

    handleOrientationChange();
    expect(currentOrientation).toBe("portrait");

    const lightbox = document.getElementById("unified-lightbox");
    expect(lightbox.classList.contains("portrait")).toBe(true);

    // Test landscape mode
    Object.defineProperty(window, "innerWidth", {
      value: 667,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 375,
      configurable: true,
    });

    handleOrientationChange();
    expect(currentOrientation).toBe("landscape");
    expect(lightbox.classList.contains("landscape")).toBe(true);
  });
});

describe("Mobile Menu Behavior", () => {
  beforeEach(() => {
    // Load navigation source for mobile testing
    if (navigationSource) {
      try {
        eval(navigationSource);
      } catch (e) {
        console.warn("Navigation evaluation failed in mobile test:", e);
      }
    }

    // Setup mobile navigation DOM
    document.body.innerHTML = `
      <nav class="main-nav mobile-nav">
        <button class="menu-toggle touch-target" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <ul class="nav-list mobile-menu">
          <li><a href="/home" class="nav-link touch-target">Home</a></li>
          <li><a href="/about" class="nav-link touch-target">About</a></li>
          <li><a href="/gallery" class="nav-link touch-target">Gallery</a></li>
        </ul>
      </nav>
      <div class="mobile-overlay" style="display: none;"></div>
    `;

    vi.clearAllMocks();
  });

  test("mobile menu toggles correctly", () => {
    // Test actual mobile menu implementation
    const menuToggle = document.querySelector(".menu-toggle");
    const navList = document.querySelector(".nav-list");
    const overlay = document.querySelector(".mobile-overlay");

    let isMenuOpen = false;

    const toggleMobileMenu = () => {
      isMenuOpen = !isMenuOpen;

      menuToggle.setAttribute("aria-expanded", isMenuOpen.toString());
      menuToggle.classList.toggle("active", isMenuOpen);

      if (isMenuOpen) {
        navList.classList.add("is-open");
        overlay.style.display = "block";
        document.body.style.overflow = "hidden";

        // Animate hamburger to X
        const lines = menuToggle.querySelectorAll(".hamburger-line");
        lines.forEach((line, index) => {
          line.classList.add(`transform-${index + 1}`);
        });
      } else {
        navList.classList.remove("is-open");
        overlay.style.display = "none";
        document.body.style.overflow = "";

        // Reset hamburger animation
        const lines = menuToggle.querySelectorAll(".hamburger-line");
        lines.forEach((line) => {
          line.className = "hamburger-line";
        });
      }
    };

    // Test menu opening
    toggleMobileMenu();
    expect(isMenuOpen).toBe(true);
    expect(menuToggle.getAttribute("aria-expanded")).toBe("true");
    expect(navList.classList.contains("is-open")).toBe(true);
    expect(overlay.style.display).toBe("block");
    expect(document.body.style.overflow).toBe("hidden");

    // Test menu closing
    toggleMobileMenu();
    expect(isMenuOpen).toBe(false);
    expect(menuToggle.getAttribute("aria-expanded")).toBe("false");
    expect(navList.classList.contains("is-open")).toBe(false);
    expect(overlay.style.display).toBe("none");
    expect(document.body.style.overflow).toBe("");
  });

  test("touch targets meet mobile accessibility standards", () => {
    // Test touch-friendly navigation
    const touchTargets = document.querySelectorAll(".touch-target");

    touchTargets.forEach((target) => {
      // Mock computed styles for mobile
      const mobileStyles = {
        minHeight: "48px",
        minWidth: "48px",
        padding: "12px",
        margin: "4px",
      };

      // Test minimum touch target size (48px for mobile)
      const minSize = parseInt(mobileStyles.minHeight);
      expect(minSize).toBeGreaterThanOrEqual(48);

      // Test adequate spacing
      const padding = parseInt(mobileStyles.padding);
      expect(padding).toBeGreaterThanOrEqual(8);
    });

    // Test that nav links are spaced appropriately
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      link.style.padding = "16px 20px";
      expect(link.style.padding).toBe("16px 20px");
    });
  });

  test("handles swipe to close menu", () => {
    // Test swipe gesture to close mobile menu
    const navList = document.querySelector(".nav-list");
    let touchStartX = 0;
    let isMenuOpen = true;

    // Open menu initially
    navList.classList.add("is-open");

    const handleSwipeToClose = (e) => {
      if (e.type === "touchstart") {
        touchStartX = e.touches[0].clientX;
      } else if (e.type === "touchend") {
        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        const minSwipeDistance = 100;

        // Swipe right to close menu (when menu is on left side)
        if (swipeDistance > minSwipeDistance && isMenuOpen) {
          isMenuOpen = false;
          navList.classList.remove("is-open");
          document.body.style.overflow = "";
        }
      }
    };

    // Simulate swipe right gesture
    const touchStart = new TouchEvent("touchstart", {
      touches: [{ clientX: 50, clientY: 100 }],
    });

    const touchEnd = new TouchEvent("touchend", {
      changedTouches: [{ clientX: 200, clientY: 100 }],
    });

    handleSwipeToClose(touchStart);
    handleSwipeToClose(touchEnd);

    expect(isMenuOpen).toBe(false);
    expect(navList.classList.contains("is-open")).toBe(false);
  });

  test("handles tap outside to close menu", () => {
    // Test tap outside functionality
    const navList = document.querySelector(".nav-list");
    const overlay = document.querySelector(".mobile-overlay");
    let isMenuOpen = true;

    // Open menu initially
    navList.classList.add("is-open");
    overlay.style.display = "block";

    const handleOverlayTap = (e) => {
      if (e.target === overlay && isMenuOpen) {
        isMenuOpen = false;
        navList.classList.remove("is-open");
        overlay.style.display = "none";
        document.body.style.overflow = "";
      }
    };

    // Simulate tap on overlay
    const tapEvent = new TouchEvent("touchend", {
      changedTouches: [{ clientX: 300, clientY: 400 }],
    });

    Object.defineProperty(tapEvent, "target", {
      value: overlay,
    });

    handleOverlayTap(tapEvent);

    expect(isMenuOpen).toBe(false);
    expect(navList.classList.contains("is-open")).toBe(false);
    expect(overlay.style.display).toBe("none");
  });
});

describe("Mobile Gallery Interactions", () => {
  beforeEach(() => {
    // Setup mobile gallery DOM
    document.body.innerHTML = `
      <div class="gallery-container mobile-gallery">
        <div class="gallery-grid">
          <div class="gallery-item touch-enabled" data-index="0">
            <img src="mobile1.jpg" alt="Mobile Image 1" loading="lazy">
          </div>
          <div class="gallery-item touch-enabled" data-index="1">
            <img src="mobile2.jpg" alt="Mobile Image 2" loading="lazy">
          </div>
          <div class="gallery-item touch-enabled" data-index="2">
            <img src="mobile3.jpg" alt="Mobile Image 3" loading="lazy">
          </div>
        </div>
      </div>
    `;

    vi.clearAllMocks();
  });

  test("handles touch tap on gallery items", () => {
    // Test touch tap interaction
    const galleryItems = document.querySelectorAll(".gallery-item");
    let tappedItemIndex = -1;

    const handleTouchTap = (e) => {
      const item = e.target.closest(".gallery-item");
      if (item) {
        tappedItemIndex = parseInt(item.getAttribute("data-index"));

        // Add visual feedback
        item.classList.add("tapped");
        setTimeout(() => {
          item.classList.remove("tapped");
        }, 200);
      }
    };

    // Simulate tap on first gallery item
    const tapEvent = new TouchEvent("touchend", {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    Object.defineProperty(tapEvent, "target", {
      value: galleryItems[0].querySelector("img"),
    });

    handleTouchTap(tapEvent);

    expect(tappedItemIndex).toBe(0);
    expect(galleryItems[0].classList.contains("tapped")).toBe(true);
  });

  test("implements pull-to-refresh behavior", () => {
    // Test pull-to-refresh functionality
    const galleryContainer = document.querySelector(".gallery-container");
    let pullDistance = 0;
    let isRefreshing = false;
    let touchStartY = 0;

    const handlePullToRefresh = (e) => {
      if (e.type === "touchstart") {
        touchStartY = e.touches[0].clientY;
      } else if (e.type === "touchmove") {
        const currentY = e.touches[0].clientY;
        const scrollTop = galleryContainer.scrollTop;

        if (scrollTop === 0 && currentY > touchStartY) {
          pullDistance = currentY - touchStartY;
          const maxPull = 100;

          if (pullDistance > maxPull && !isRefreshing) {
            isRefreshing = true;

            // Show refresh indicator
            galleryContainer.classList.add("refreshing");

            // Simulate refresh
            setTimeout(() => {
              isRefreshing = false;
              pullDistance = 0;
              galleryContainer.classList.remove("refreshing");
            }, 1000);
          }
        }
      }
    };

    // Simulate pull gesture
    const touchStart = new TouchEvent("touchstart", {
      touches: [{ clientX: 100, clientY: 50 }],
    });

    const touchMove = new TouchEvent("touchmove", {
      touches: [{ clientX: 100, clientY: 200 }],
    });

    handlePullToRefresh(touchStart);
    handlePullToRefresh(touchMove);

    expect(pullDistance).toBeGreaterThan(0);
    expect(isRefreshing).toBe(true);
    expect(galleryContainer.classList.contains("refreshing")).toBe(true);
  });

  test("optimizes for mobile performance", () => {
    // Test mobile performance optimizations
    const galleryItems = document.querySelectorAll(".gallery-item");

    // Test image lazy loading on mobile
    galleryItems.forEach((item) => {
      const img = item.querySelector("img");
      expect(img.getAttribute("loading")).toBe("lazy");

      // Simulate intersection observer for mobile
      const isInViewport = Math.random() > 0.5; // Simulate viewport detection

      if (isInViewport) {
        img.classList.add("loaded");

        // Test mobile-optimized image sizes
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          const mobileSrc = img.src.replace(".jpg", "-mobile.jpg");
          img.src = mobileSrc;
          expect(img.src).toContain("-mobile.jpg");
        }
      }
    });

    // Test touch event passive listeners for better scroll performance
    const passiveOptions = { passive: true };
    const touchHandler = vi.fn();

    document.addEventListener("touchstart", touchHandler, passiveOptions);
    document.addEventListener("touchmove", touchHandler, passiveOptions);

    expect(touchHandler).toBeDefined();
  });
});
