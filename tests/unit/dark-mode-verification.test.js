/**
 * Dark Mode Verification Tests
 * Tests all dark mode fixes across admin pages for WCAG AA compliance
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Utility function to calculate contrast ratio
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(color1, color2) {
  const lum1 = luminance(...color1);
  const lum2 = luminance(...color2);
  const bright = Math.max(lum1, lum2);
  const dark = Math.min(lum1, lum2);
  return (bright + 0.05) / (dark + 0.05);
}

// Color utility functions
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

// CSS color constants from base.css
const colors = {
  // Gray scale
  'gray-900': [17, 17, 17],      // #111111
  'gray-800': [51, 51, 51],      // #333333
  'gray-700': [85, 85, 85],      // #555555
  'gray-600': [102, 102, 102],   // #666666
  'gray-500': [136, 136, 136],   // #888888
  'gray-400': [153, 153, 153],   // #999999
  'gray-300': [187, 187, 187],   // #bbbbbb
  'gray-200': [221, 221, 221],   // #dddddd
  'gray-100': [245, 245, 245],   // #f5f5f5
  'white': [255, 255, 255],      // #ffffff
  'black': [0, 0, 0],            // #000000

  // Brand colors
  'blue': [91, 107, 181],        // #5b6bb5
  'red': [204, 41, 54],          // #cc2936
};

// Dark mode color mappings from base.css
const darkModeColors = {
  'background': colors['gray-900'],
  'background-secondary': colors['gray-800'],
  'surface': colors['gray-800'],
  'text-primary': colors['white'],
  'text-secondary': colors['gray-300'],
  'text-tertiary': colors['gray-400'],
  'text-muted': colors['gray-400'],
  'border': colors['gray-600'],
  'border-light': colors['gray-700'],
};

describe("Dark Mode Verification Tests", () => {
  let baseCss, formsCss, navigationCss;

  beforeEach(() => {
    // Read CSS files
    baseCss = readFileSync(join(process.cwd(), "css/base.css"), "utf8");
    formsCss = readFileSync(join(process.cwd(), "css/forms.css"), "utf8");
    navigationCss = readFileSync(join(process.cwd(), "css/navigation.css"), "utf8");
  });

  describe("1. Muted Text Contrast (--color-gray-400)", () => {
    it("should use --color-gray-400 (#999999) for muted text", () => {
      expect(baseCss).toContain("--color-gray-400: #999999");
      expect(baseCss).toContain("--color-text-muted: var(--color-gray-400)");
    });

    it("should meet WCAG AA contrast ratio for muted text on dark backgrounds", () => {
      const mutedText = colors['gray-400']; // #999999
      const darkBackground = colors['gray-900']; // #111111

      const ratio = contrastRatio(mutedText, darkBackground);
      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA for normal text
    });

    it("should have proper contrast for muted text in dark mode", () => {
      // In dark mode, muted text (#999999) on dark background (#111111)
      const mutedColor = colors['gray-400'];
      const bgColor = colors['gray-900'];
      const ratio = contrastRatio(mutedColor, bgColor);

      // Should meet WCAG AA standards (4.5:1 for normal text)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(6.63, 1); // Actual ratio for #999999 on #111111
    });
  });

  describe("2. Form Border Contrast (--color-gray-600)", () => {
    it("should use --color-gray-600 (#666666) for form borders", () => {
      expect(baseCss).toContain("--color-gray-600: #666666");
      expect(baseCss).toContain("--color-border: var(--color-gray-600)");
    });

    it("should meet WCAG AA contrast ratio for form borders", () => {
      const borderColor = colors['gray-600']; // #666666
      const darkBackground = colors['gray-900']; // #111111

      const ratio = contrastRatio(borderColor, darkBackground);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // WCAG AA for UI components
    });

    it("should have sufficient contrast for form elements in dark mode", () => {
      // Check border contrast
      const borderColor = colors['gray-600'];
      const bgColor = colors['gray-900'];
      const ratio = contrastRatio(borderColor, bgColor);

      // UI components need 3:1 minimum
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(ratio).toBeCloseTo(3.29, 1); // Actual ratio for #666666 on #111111
    });
  });

  describe("3. Navigation Hamburger Menu Visibility", () => {
    it("should have visible hamburger menu styles in dark mode", () => {
      expect(navigationCss).toContain("[data-theme=\"dark\"] .menu-icon span");
      expect(navigationCss).toContain("background-color: var(--color-gray-200)");
    });

    it("should have proper contrast for hamburger menu lines", () => {
      const menuColor = colors['gray-200']; // Used in dark mode
      const darkBackground = colors['gray-900'];

      const ratio = contrastRatio(menuColor, darkBackground);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // UI components
    });

    it("should have hover states for hamburger menu", () => {
      expect(navigationCss).toContain("[data-theme=\"dark\"] .menu-toggle:hover .menu-icon span");
      expect(navigationCss).toContain("background-color: var(--color-gray-100)");
    });
  });

  describe("4. Disabled Form States", () => {
    it("should have proper disabled form styling", () => {
      // Check disabled input styles
      expect(formsCss).toContain("input[type=\"text\"]:disabled");
      expect(formsCss).toContain("background-color: var(--color-background-secondary)");
      expect(formsCss).toContain("color: var(--color-text-muted)");
      expect(formsCss).toContain("border-color: var(--color-border-light)");
    });

    it("should have disabled button styles", () => {
      expect(formsCss).toContain(".btn:disabled");
      expect(formsCss).toContain("background-color: var(--color-background-secondary)");
      expect(formsCss).toContain("color: var(--color-text-muted)");
    });

    it("should meet contrast requirements for disabled states", () => {
      // Disabled text should still be readable
      const disabledText = colors['gray-400']; // text-muted
      const disabledBg = colors['gray-800']; // background-secondary

      const ratio = contrastRatio(disabledText, disabledBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // Relaxed for disabled elements
    });
  });

  describe("5. Placeholder Text Contrast", () => {
    it("should use semantic color variable for placeholders", () => {
      // Check that placeholders use the semantic --color-input-placeholder variable
      expect(formsCss).toContain("color: var(--color-input-placeholder)");

      // Verify the variable is defined in base.css to use --color-text-secondary
      expect(baseCss).toContain("--color-input-placeholder: var(--color-text-secondary)");
    });

    it("should have dark mode specific placeholder styles", () => {
      expect(formsCss).toContain("[data-theme=\"dark\"] .form-input::placeholder");
      expect(formsCss).toContain("color: var(--color-input-placeholder)");
    });

    it("should meet contrast requirements for placeholder text", () => {
      // Placeholder uses text-secondary which is gray-300 in dark mode
      const placeholderColor = colors['gray-300'];
      const inputBg = colors['gray-800']; // background-secondary

      const ratio = contrastRatio(placeholderColor, inputBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA for normal text
    });
  });

  describe("6. Mobile Login Screen Colors", () => {
    let loginHtml;

    beforeEach(() => {
      loginHtml = readFileSync(join(process.cwd(), "pages/admin/login.html"), "utf8");
    });

    it("should use CSS variables instead of hardcoded colors", () => {
      // Check that login page uses CSS variables
      expect(loginHtml).toContain("var(--color-surface)");
      expect(loginHtml).toContain("var(--color-text-primary)");
      expect(loginHtml).toContain("var(--color-text-secondary)");
      expect(loginHtml).toContain("var(--color-background-secondary)");

      // Should not have hardcoded colors for text and backgrounds
      expect(loginHtml).not.toMatch(/#[0-9a-f]{6}/gi); // No hardcoded hex colors in styles
    });

    it("should have proper dark theme enforcement", () => {
      expect(loginHtml).toContain('data-theme="dark"');
      expect(loginHtml).toContain("Theme Manager for Dark Mode");
    });
  });

  describe("7. Chart.js Theme Integration", () => {
    let analyticsHtml;

    beforeEach(() => {
      analyticsHtml = readFileSync(join(process.cwd(), "pages/admin/analytics.html"), "utf8");
    });

    it("should have theme-aware color management functions", () => {
      expect(analyticsHtml).toContain("getThemeColor(cssVar)");
      expect(analyticsHtml).toContain("getThemeColors()");
      expect(analyticsHtml).toContain("updateChartColors()");
    });

    it("should listen for theme changes", () => {
      expect(analyticsHtml).toContain("MutationObserver");
      expect(analyticsHtml).toContain("data-theme");
      expect(analyticsHtml).toContain("updateChartColors()");
    });

    it("should use CSS variables for chart colors", () => {
      expect(analyticsHtml).toContain("--color-primary");
      expect(analyticsHtml).toContain("--boulder-fest-secondary");
      expect(analyticsHtml).toContain("getThemeColorWithAlpha");
    });
  });

  describe("8. Comprehensive Color Usage Validation", () => {
    it("should have consistent dark mode color mappings", () => {
      // Check that all dark mode color overrides exist
      expect(baseCss).toContain("[data-theme=\"dark\"]");
      expect(baseCss).toContain("--color-background: var(--color-gray-900)");
      expect(baseCss).toContain("--color-text-primary: var(--color-white)");
      expect(baseCss).toContain("--color-text-secondary: var(--color-gray-300)");
      expect(baseCss).toContain("--color-text-muted: var(--color-gray-400)");
      expect(baseCss).toContain("--color-border: var(--color-gray-600)");
    });

    it("should have system preference support", () => {
      expect(baseCss).toContain("@media (prefers-color-scheme: dark)");
      expect(baseCss).toContain("[data-theme=\"auto\"]");
    });
  });

  describe("9. Admin Page Specific Tests", () => {
    let dashboardHtml, checkinHtml;

    beforeEach(() => {
      dashboardHtml = readFileSync(join(process.cwd(), "pages/admin/dashboard.html"), "utf8");
      checkinHtml = readFileSync(join(process.cwd(), "pages/admin/checkin.html"), "utf8");
    });

    it("should enforce dark theme on all admin pages", () => {
      expect(dashboardHtml).toContain('data-theme="dark"');
      expect(checkinHtml).toContain('data-theme="dark"');
    });

    it("should include theme manager on all admin pages", () => {
      expect(dashboardHtml).toContain("theme-manager.js");
      expect(checkinHtml).toContain("theme-manager.js");
    });

    it("should use consistent CSS imports", () => {
      const expectedCSS = [
        "/css/base.css",
        "/css/forms.css",
        "/css/admin-overrides.css"
      ];

      expectedCSS.forEach(css => {
        expect(dashboardHtml).toContain(css);
        expect(checkinHtml).toContain(css);
      });
    });
  });

  describe("10. Actual Contrast Ratio Calculations", () => {
    it("should calculate exact contrast ratios for critical combinations", () => {
      const testCases = [
        {
          name: "Muted text on dark background",
          foreground: colors['gray-400'], // #999999
          background: colors['gray-900'], // #111111
          expected: 6.63,
          minRequired: 4.5
        },
        {
          name: "Primary text on dark background",
          foreground: colors['white'], // #ffffff
          background: colors['gray-900'], // #111111
          expected: 18.88,
          minRequired: 4.5
        },
        {
          name: "Secondary text on dark background",
          foreground: colors['gray-300'], // #bbbbbb
          background: colors['gray-900'], // #111111
          expected: 9.84,
          minRequired: 4.5
        },
        {
          name: "Border on dark background",
          foreground: colors['gray-600'], // #666666
          background: colors['gray-900'], // #111111
          expected: 3.29,
          minRequired: 3.0
        },
        {
          name: "Form input text on input background",
          foreground: colors['white'], // #ffffff
          background: colors['gray-800'], // #333333
          expected: 12.63,
          minRequired: 4.5
        },
        {
          name: "Placeholder text contrast",
          foreground: colors['gray-300'], // #bbbbbb
          background: colors['gray-800'], // #333333
          expected: 6.58,
          minRequired: 4.5
        }
      ];

      testCases.forEach(({ name, foreground, background, expected, minRequired }) => {
        const ratio = contrastRatio(foreground, background);

        expect(ratio, `${name} should meet minimum contrast`).toBeGreaterThanOrEqual(minRequired);
        expect(ratio, `${name} should have expected contrast ratio`).toBeCloseTo(expected, 1);
      });
    });
  });

  describe("11. Navigation Dark Mode Fixes", () => {
    it("should have dark mode mobile menu backdrop opacity", () => {
      expect(navigationCss).toContain("[data-theme=\"dark\"] .nav-list");
      expect(navigationCss).toContain("opacity: 0.95");
    });

    it("should have dark mode dropdown link contrast", () => {
      expect(navigationCss).toContain("[data-theme=\"dark\"] .nav-dropdown-link");
      expect(navigationCss).toContain("color: var(--color-gray-200)");
    });

    it("should have proper hover states for dark mode", () => {
      expect(navigationCss).toContain("[data-theme=\"dark\"] .nav-dropdown-link:hover");
      expect(navigationCss).toContain("color: var(--color-white)");
    });
  });
});

describe("Form Validation - Disabled State Tests", () => {
  let formsCss;

  beforeEach(() => {
    formsCss = readFileSync(join(process.cwd(), "css/forms.css"), "utf8");
  });

  it("should have comprehensive disabled form element coverage", () => {
    const disabledElements = [
      "input[type=\"text\"]:disabled",
      "input[type=\"email\"]:disabled",
      "input[type=\"password\"]:disabled",
      "input[type=\"number\"]:disabled",
      "input[type=\"tel\"]:disabled",
      "select:disabled",
      "textarea:disabled",
      ".btn:disabled",
      "button:disabled"
    ];

    disabledElements.forEach(selector => {
      expect(formsCss).toContain(selector);
    });
  });

  it("should have disabled state styling properties", () => {
    expect(formsCss).toContain("background-color: var(--color-background-secondary)");
    expect(formsCss).toContain("color: var(--color-text-muted)");
    expect(formsCss).toContain("border-color: var(--color-border-light)");
    expect(formsCss).toContain("opacity: 0.6");
    expect(formsCss).toContain("cursor: not-allowed");
  });

  it("should prevent hover effects on disabled elements", () => {
    expect(formsCss).toContain(".btn:disabled:hover");
    expect(formsCss).toContain("transform: none");
    expect(formsCss).toContain("box-shadow: none");
  });
});

describe("CSS Variable Consistency Tests", () => {
  let baseCss;

  beforeEach(() => {
    baseCss = readFileSync(join(process.cwd(), "css/base.css"), "utf8");
  });

  it("should have all required gray scale variables", () => {
    const grayVars = [
      "--color-gray-900: #111111",
      "--color-gray-800: #333333",
      "--color-gray-700: #555555",
      "--color-gray-600: #666666",
      "--color-gray-500: #888888",
      "--color-gray-400: #999999",
      "--color-gray-300: #bbbbbb",
      "--color-gray-200: #dddddd",
      "--color-gray-100: #f5f5f5"
    ];

    grayVars.forEach(varDeclaration => {
      expect(baseCss).toContain(varDeclaration);
    });
  });

  it("should have proper semantic color mappings", () => {
    const semanticVars = [
      "--color-text-muted: var(--color-gray-400)",
      "--color-border: var(--color-gray-600)",
      "--color-border-light: var(--color-gray-700)",
      "--color-text-secondary: var(--color-gray-300)",
      "--color-text-tertiary: var(--color-gray-400)"
    ];

    semanticVars.forEach(varDeclaration => {
      expect(baseCss).toContain(varDeclaration);
    });
  });
});