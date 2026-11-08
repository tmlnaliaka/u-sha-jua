const { chromium } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:/Users/HP/.gemini/antigravity/brain/c718d3ee-205c-4d32-89c2-7fbc71513b4f/screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log('🚀 Starting Phase 9: Viewport Matrix & axe-core Accessibility Audit...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  try {
    // ----------------------------------------------------
    // 1. Desktop 1080p Viewport (1920x1080)
    // ----------------------------------------------------
    console.log('\n--- Viewport 1: Desktop 1080p (1920x1080) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await desktopPage.waitForTimeout(2000);

    const desktopScreenshotPath = path.join(SCREENSHOTS_DIR, '32_phase9_desktop_1920x1080.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath });
    console.log(`📸 Saved Desktop 1080p screenshot: ${desktopScreenshotPath}`);

    // Run axe-core accessibility audit on main dashboard
    console.log('\n🔍 Running axe-core WCAG 2.1 AA audit on Desktop Command Center...');
    const desktopAxeResults = await new AxeBuilder({ page: desktopPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    console.log(`✅ Desktop Violations Count: ${desktopAxeResults.violations.length}`);
    for (const v of desktopAxeResults.violations) {
      console.log(`\n[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(` - Target: ${node.target.join(' ')}`);
        console.log(`   Failure: ${node.failureSummary}`);
      }
    }

    // ----------------------------------------------------
    // 2. Audit Modals (Civilian Portal, Auth Modal)
    // ----------------------------------------------------
    console.log('\n🔍 Auditing Civilian SOS Modal with axe-core...');
    const civilianBtn = desktopPage.getByRole('button', { name: /CIVILIAN SOS/i }).first();
    await civilianBtn.click();
    await desktopPage.waitForTimeout(1000);

    const modalAxeResults = await new AxeBuilder({ page: desktopPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    console.log(`✅ Civilian SOS Modal Violations: ${modalAxeResults.violations.length}`);
    for (const v of modalAxeResults.violations) {
      console.log(`[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`);
    }

    const a11yScreenshotPath = path.join(SCREENSHOTS_DIR, '35_phase9_accessibility_audit_remediated.png');
    await desktopPage.screenshot({ path: a11yScreenshotPath });
    console.log(`📸 Saved Accessibility Audit Remediated screenshot: ${a11yScreenshotPath}`);

    await desktopPage.keyboard.press('Escape');
    await desktopPage.waitForTimeout(500);

    // ----------------------------------------------------
    // 3. Laptop Viewport (1366x768)
    // ----------------------------------------------------
    console.log('\n--- Viewport 2: Laptop (1366x768) ---');
    const laptopContext = await browser.newContext({
      viewport: { width: 1366, height: 768 }
    });
    const laptopPage = await laptopContext.newPage();
    await laptopPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await laptopPage.waitForTimeout(2000);

    const laptopScreenshotPath = path.join(SCREENSHOTS_DIR, '33_phase9_laptop_1366x768.png');
    await laptopPage.screenshot({ path: laptopScreenshotPath });
    console.log(`📸 Saved Laptop screenshot: ${laptopScreenshotPath}`);
    await laptopContext.close();

    // ----------------------------------------------------
    // 4. Tablet iPad Viewport (768x1024)
    // ----------------------------------------------------
    console.log('\n--- Viewport 3: Tablet iPad (768x1024) ---');
    const tabletContext = await browser.newContext({
      viewport: { width: 768, height: 1024 }
    });
    const tabletPage = await tabletContext.newPage();
    await tabletPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await tabletPage.waitForTimeout(2000);

    const tabletScreenshotPath = path.join(SCREENSHOTS_DIR, '34_phase9_tablet_768x1024.png');
    await tabletPage.screenshot({ path: tabletScreenshotPath });
    console.log(`📸 Saved Tablet screenshot: ${tabletScreenshotPath}`);
    await tabletContext.close();

    await desktopContext.close();
    console.log('\n🎉 Phase 9 Viewports & Accessibility Audit completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Phase 9 audit run failed:', err);
  process.exit(1);
});
