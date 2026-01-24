/**
 * Screenshot Capture Module
 * Stateless Playwright-based screenshot capture
 */

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync } from 'fs';
import { resolve } from 'path';

/** Viewport presets for common device sizes */
export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },      // iPhone 14
  tablet: { width: 768, height: 1024 },     // iPad
  desktop: { width: 1280, height: 720 },    // Standard desktop
  'desktop-lg': { width: 1920, height: 1080 } // Full HD
} as const;

export type ViewportPreset = keyof typeof VIEWPORTS;

export interface ScreenshotOptions {
  /** Viewport preset or custom dimensions */
  viewport?: ViewportPreset | { width: number; height: number };
  /** Timeout in ms (default: 30000) */
  timeout?: number;
  /** Capture full page or just viewport (default: true) */
  fullPage?: boolean;
}

export interface ScreenshotResult {
  /** PNG screenshot as Buffer */
  screenshot: Buffer;
  /** URL that was captured */
  url: string;
  /** Actual viewport used */
  viewport: { width: number; height: number };
}

/**
 * Resolve viewport from preset or custom dimensions
 */
function resolveViewport(viewport?: ScreenshotOptions['viewport']): { width: number; height: number } {
  if (!viewport) return VIEWPORTS.desktop;
  if (typeof viewport === 'string') return VIEWPORTS[viewport];
  return viewport;
}

/**
 * Capture a screenshot of a URL
 *
 * Launches headless Chromium, navigates to URL, captures screenshot, closes browser.
 * Fully stateless - no browser instance persists.
 */
export async function captureScreenshot(
  url: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const {
    viewport: viewportOption,
    timeout = 30000,
    fullPage = true
  } = options;

  const viewport = resolveViewport(viewportOption);
  let browser: Browser | null = null;

  try {
    // Launch headless browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // Navigate and wait for network idle
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout
    });

    // Extra settle time for JS rendering
    await page.waitForTimeout(1000);

    // Capture screenshot
    const screenshot = await page.screenshot({
      fullPage,
      type: 'png'
    });

    return {
      screenshot,
      url,
      viewport
    };
  } finally {
    // Always close browser (stateless)
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Capture a screenshot of a local HTML file
 *
 * Converts file path to file:// URL and captures screenshot.
 */
export async function captureHtmlFile(
  filePath: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`HTML file not found: ${absolutePath}`);
  }

  const fileUrl = `file://${absolutePath}`;
  return captureScreenshot(fileUrl, options);
}

/**
 * Capture a screenshot of a wireframe (image or HTML)
 *
 * If path is .html, screenshots it. Otherwise assumes it's an image
 * and returns null (caller should read the image file directly).
 */
export async function captureWireframe(
  wireframePath: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult | null> {
  const ext = wireframePath.toLowerCase().split('.').pop();

  if (ext === 'html' || ext === 'htm') {
    return captureHtmlFile(wireframePath, options);
  }

  // For image files (.png, .jpg), return null - caller reads file directly
  return null;
}
