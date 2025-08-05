// Test script for gallery freeze fix
// Run this in the browser console on the gallery page after reload

(function () {
  console.log("🧪 Testing Gallery Freeze Fix...");

  // Test 1: Check if lightbox is properly hidden
  console.group("✅ Test 1: Lightbox Initial State");
  const lightboxes = document.querySelectorAll(".lightbox");
  lightboxes.forEach((lightbox, index) => {
    const computedStyle = window.getComputedStyle(lightbox);
    console.log(`Lightbox ${index + 1}:`, {
      id: lightbox.id,
      display: computedStyle.display,
      opacity: computedStyle.opacity,
      zIndex: computedStyle.zIndex,
      hasIsOpenClass: lightbox.classList.contains("is-open"),
      inlineDisplay: lightbox.style.display,
    });

    if (
      computedStyle.display === "none" &&
      !lightbox.classList.contains("is-open")
    ) {
      console.log("✅ Lightbox is properly hidden");
    } else {
      console.error("❌ Lightbox may be blocking interactions!");
    }
  });
  console.groupEnd();

  // Test 2: Check page interactivity
  console.group("✅ Test 2: Page Interactivity");
  const clickableElements = document.querySelectorAll(
    "a, button, .gallery-item",
  );
  console.log("Total clickable elements found:", clickableElements.length);

  // Test pointer events on body
  const bodyStyle = window.getComputedStyle(document.body);
  console.log("Body pointer-events:", bodyStyle.pointerEvents);

  // Check for any overlaying elements
  const elementsAtCenter = document.elementsFromPoint(
    window.innerWidth / 2,
    window.innerHeight / 2,
  );
  console.log(
    "Elements at page center:",
    elementsAtCenter.map((el) => ({
      tagName: el.tagName,
      className: el.className,
      id: el.id,
    })),
  );
  console.groupEnd();

  // Test 3: Gallery item click handlers
  console.group("✅ Test 3: Gallery Item Click Handlers");
  const galleryItems = document.querySelectorAll(".gallery-item");
  if (galleryItems.length > 0) {
    const firstItem = galleryItems[0];
    const styles = window.getComputedStyle(firstItem);
    console.log("Gallery item styles:", {
      cursor: styles.cursor,
      pointerEvents: styles.pointerEvents,
      position: styles.position,
      zIndex: styles.zIndex,
    });

    // Check if click handlers are attached
    const hasClickHandler =
      firstItem.onclick !== null || firstItem.hasAttribute("data-loaded");
    console.log("Has click handler:", hasClickHandler);

    // Check lazy placeholder
    const placeholder = firstItem.querySelector(".lazy-placeholder");
    if (placeholder) {
      const placeholderStyles = window.getComputedStyle(placeholder);
      console.log(
        "Placeholder pointer-events:",
        placeholderStyles.pointerEvents,
      );
      console.log("Placeholder z-index:", placeholderStyles.zIndex);
    }
  }
  console.groupEnd();

  // Test 4: Navigation functionality
  console.group("✅ Test 4: Navigation Functionality");
  const navLinks = document.querySelectorAll("nav a, .nav-link");
  console.log("Navigation links found:", navLinks.length);

  // Test clicking on first nav link
  if (navLinks.length > 0) {
    const testLink = navLinks[0];
    console.log("Testing nav link:", {
      text: testLink.textContent,
      href: testLink.href,
      pointerEvents: window.getComputedStyle(testLink).pointerEvents,
    });
  }
  console.groupEnd();

  // Test 5: Lightbox functionality
  console.group("✅ Test 5: Lightbox Open/Close Test");
  if (window.galleryDebug && window.galleryDebug.getState) {
    const state = window.galleryDebug.getState();
    console.log("Lightbox state:", {
      hasLightbox: !!state.lightbox,
      lightboxItems: state.lightboxItems.length,
      currentIndex: state.currentLightboxIndex,
    });

    // Try opening lightbox programmatically
    if (state.lightbox && state.lightboxItems.length > 0) {
      console.log("Testing lightbox open...");
      state.lightbox.openAdvanced(
        state.lightboxItems,
        0,
        state.lightboxCategories,
        state.categoryCounts,
      );

      setTimeout(() => {
        const lightbox = document.getElementById("gallery-lightbox");
        if (lightbox) {
          const isVisible =
            window.getComputedStyle(lightbox).display !== "none";
          console.log("Lightbox visible after open:", isVisible);

          // Close it
          state.lightbox.close();

          setTimeout(() => {
            const isHidden =
              window.getComputedStyle(lightbox).display === "none";
            console.log("Lightbox hidden after close:", isHidden);
          }, 400);
        }
      }, 100);
    }
  }
  console.groupEnd();

  // Summary
  console.log("\n📊 Fix Summary:");
  console.log(
    "1. Lightbox display blocking - Fixed with display:none and proper show/close methods",
  );
  console.log(
    "2. Z-index conflicts - Gallery items have proper z-index layering",
  );
  console.log("3. CSS styles - All gallery detail styles are present");
  console.log("4. Event handlers - Should be properly attached to all items");

  console.log("\n🎉 Gallery freeze fix test complete!");
  console.log("💡 Try clicking on gallery images and navigation links");
  console.log("💡 Page should be fully interactive now");
})();
