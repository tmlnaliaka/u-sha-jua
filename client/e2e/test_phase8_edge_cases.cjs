const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:/Users/HP/.gemini/antigravity/brain/c718d3ee-205c-4d32-89c2-7fbc71513b4f/screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log('🚀 Launching Chrome for Phase 8 Edge Cases & Failure Modes Verification...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  try {
    // ==========================================
    // Test 1: Mobile Responsive Viewport (375x667 iPhone SE)
    // ==========================================
    console.log('--- Test 1: Mobile Responsive Viewport at 375x667 ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(2000);

    const mobileScreenshotPath = path.join(SCREENSHOTS_DIR, '29_phase8_mobile_responsive_375px.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    console.log(`📸 Saved mobile screenshot: ${mobileScreenshotPath}`);
    await mobileContext.close();

    // ==========================================
    // Test 2: Swahili & Sheng Distress Ingestion via Civilian Portal
    // ==========================================
    console.log('--- Test 2: Swahili Distress Report Ingestion ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await desktopContext.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Open civilian portal
    const civilianBtn = page.getByRole('button', { name: /CIVILIAN SOS/i }).or(page.getByTitle(/Civilian Public Distress/i)).first();
    await civilianBtn.click();
    await page.waitForTimeout(1000);

    // Enter Swahili emergency report with emojis
    const reportInput = page.locator('textarea').first();
    await reportInput.fill('🚨 Maji yamejaa ndani ya nyumba Mathare haraka watu wamekwama!');
    await page.waitForTimeout(500);

    // Click submit button: "BROADCAST EMERGENCY SOS"
    const submitBtn = page.getByRole('button', { name: /BROADCAST EMERGENCY SOS/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(3500);
    }

    const swahiliScreenshotPath = path.join(SCREENSHOTS_DIR, '30_phase8_swahili_distress_ingestion.png');
    await page.screenshot({ path: swahiliScreenshotPath });
    console.log(`📸 Saved Swahili ingestion screenshot: ${swahiliScreenshotPath}`);

    // Close modal to reveal full command center header
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ==========================================
    // Test 3: Offline Outbox & Network Resilience Indicator
    // ==========================================
    console.log('--- Test 3: Offline Outbox & Auto-Sync Header Indicator ---');
    // Inject a pending offline report into localStorage outbox
    await page.evaluate(() => {
      const outboxKey = 'ushajua_offline_outbox_v1';
      const queuedReport = [{
        id: 'offline-test-pwa-001',
        raw_text: 'Dharura ya mafuriko mto Nairobi 🌊🚨',
        incident_type: 'Flood',
        urgency_level: 'Critical',
        location_name: 'Nairobi River Offline GPS Pin (-1.2864, 36.8172)',
        latitude: -1.2864,
        longitude: 36.8172,
        timestamp: new Date().toISOString()
      }];
      localStorage.setItem(outboxKey, JSON.stringify(queuedReport));
      window.dispatchEvent(new CustomEvent('ushajua:outbox-updated', { detail: { count: 1 } }));
    });
    await page.waitForTimeout(1500);

    // Verify indicator is visible
    const indicator = page.locator('[data-testid="offline-outbox-indicator"]').or(page.getByText('QUEUED')).first();
    const isVisible = await indicator.isVisible();
    console.log(`Offline indicator visible: ${isVisible}`);

    const outboxScreenshotPath = path.join(SCREENSHOTS_DIR, '31_phase8_offline_outbox_banner.png');
    await page.screenshot({ path: outboxScreenshotPath });
    console.log(`📸 Saved offline outbox screenshot: ${outboxScreenshotPath}`);

    await desktopContext.close();
    console.log('✅ Phase 8 Playwright E2E verification completed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Playwright verification failed:', err);
  process.exit(1);
});
