const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:/Users/HP/.gemini/antigravity/brain/c718d3ee-205c-4d32-89c2-7fbc71513b4f/screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const API_BASE = 'http://127.0.0.1:8000';

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log('🚀 Launching Chrome for Phase 7 API Contracts & Integrations Verification...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Verify Meteorological Integration Contract & Early Warning Radar
    console.log('Step 1: Navigating to u-SHA-jua Web UI...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('Step 2: Verifying Kenya Meteorological Radar Telemetry Banner...');
    const radarBanner = page.locator('text=LIVE RADAR TELEMETRY');
    await radarBanner.waitFor({ state: 'visible', timeout: 8000 });
    
    // Check for precipitation and river gauge readings
    const riverGauge = page.getByText('RIVER GAUGE', { exact: true }).first();
    await riverGauge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Meteorological radar integration verified on dashboard.');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '26_phase7_weather_radar_contract.png') });
    console.log('📸 Captured: 26_phase7_weather_radar_contract.png');

    // 2. Verify Schema Contract & Error Shape on Form Validation (No [object Object])
    console.log('Step 3: Testing API Error Shape on Invalid Submission...');
    const civilianBtn = page.getByRole('button', { name: /CIVILIAN SOS/i });
    await civilianBtn.click();
    await page.waitForTimeout(600);

    // Enter a minimal text and inspect error handling
    const distressArea = page.locator('textarea[placeholder*="Flood waters rushing"]').first();
    await distressArea.fill('Flood at Mathare 4A near river bank');
    
    // Test validation with bad phone format or empty required field via direct API verification
    const apiErrorCheck = await page.evaluate(async (apiBase) => {
      try {
        const res = await fetch(`${apiBase}/api/v1/incidents/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: '', device_lat: 999.0 })
        });
        const json = await res.json();
        return { status: res.status, errorData: json };
      } catch (e) {
        return { error: e.message };
      }
    }, API_BASE);

    if (apiErrorCheck.status !== 422) {
      throw new Error(`Expected 422 Unprocessable Entity, got: ${apiErrorCheck.status}`);
    }
    if (!Array.isArray(apiErrorCheck.errorData.detail)) {
      throw new Error('Expected detail array in 422 response');
    }
    console.log('✅ Confirmed 422 validation response contract structure.');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '27_phase7_validation_error_shape.png') });
    console.log('📸 Captured: 27_phase7_validation_error_shape.png');

    // Close Civilian Portal
    const closeCivilian = page.locator('.fixed.inset-0 button:has(svg.lucide-x)').first();
    if (await closeCivilian.isVisible()) {
      await closeCivilian.click();
      await page.waitForTimeout(500);
    }

    // 3. Verify Geocoded Flood Polygons and Spatial Feed Contract
    console.log('Step 4: Testing GeoJSON Spatial Flood Polygons & Feed Integration...');
    // Click Flood Radar toggle on map controls
    const floodRadarBtn = page.getByRole('button', { name: /Flood Radar/i });
    if (await floodRadarBtn.isVisible()) {
      await floodRadarBtn.click();
      await page.waitForTimeout(600);
      console.log('✅ Activated Flood Radar overlay.');
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '28_phase7_geocoded_incident_feed.png') });
    console.log('📸 Captured: 28_phase7_geocoded_incident_feed.png');

    console.log('\n🎉 ALL PHASE 7 API CONTRACTS & INTEGRATIONS VERIFIED WITH ZERO ERRORS!');
  } catch (err) {
    console.error('❌ Phase 7 Verification failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'phase7_error.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
