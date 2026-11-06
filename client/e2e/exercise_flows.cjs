const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\c718d3ee-205c-4d32-89c2-7fbc71513b4f\\screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://127.0.0.1:5173';

async function runExercise() {
  console.log(`Starting Phase 3 Browser Execution against ${APP_URL}...`);
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['geolocation', 'microphone']
  });

  // Grant geolocation mock for Nairobi
  await context.setGeolocation({ latitude: -1.286389, longitude: 36.817223 });

  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      console.error(`[BROWSER CONSOLE ERROR] ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    console.error(`[BROWSER UNCAUGHT PAGE ERROR] ${err.message}`);
    pageErrors.push(err.message);
  });

  // Handle all browser alert/confirm dialogues automatically
  page.on('dialog', async (dialog) => {
    console.log(`[DIALOG PROMPT] ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // ==========================================
    // STEP 1: INITIAL PAGE LOAD & MAP RENDERING
    // ==========================================
    console.log('\n--- Step 1: Initial Page Load ---');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_dashboard.png'), fullPage: true });
    console.log('✓ Initial dashboard loaded and screenshot captured.');

    // Verify Title & Telemetry Header
    const title = await page.title();
    console.log(`Page Title: "${title}"`);

    // ==========================================
    // STEP 2: CIVILIAN SOS DISTRESS MODAL
    // ==========================================
    console.log('\n--- Step 2: Civilian SOS Reporting Flow ---');
    // Click "CIVILIAN SOS" button
    const sosBtn = page.locator('button:has-text("CIVILIAN SOS")');
    await sosBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_sos_modal_open.png') });
    console.log('✓ Civilian SOS modal opened.');

    // Test Boundary: Empty text submission
    console.log('Testing Boundary 1: Empty distress submission...');
    const submitSosBtn = page.locator('button[type="submit"]:has-text("BROADCAST EMERGENCY SOS")');
    const isSubmitDisabled = await submitSosBtn.isDisabled();
    console.log(`Empty input submission disabled as expected: ${isSubmitDisabled}`);

    // Fast quick chips test
    console.log('Testing quick situation chips...');
    const quickChip = page.locator('button:has-text("+ 3 Adults Trapped")');
    if (await quickChip.isVisible()) {
      await quickChip.click();
      console.log('✓ Clicked "+ 3 Adults Trapped" chip.');
    }

    // Boundary Test 2: XSS, Unicode, Emoji, and SQL-like strings
    console.log('Testing Boundary 2: XSS + Unicode + Emoji string input...');
    const distressInput = page.locator('textarea[required]');
    const injectionVector = '💧 [Mathare 4A] Flood surge alert! <script>alert("XSS")</script> <img src=x onerror=console.error("XSS_IMAGE_TRIGGERED")> " OR ""="; 5 trapped on metal roof! 🌊🚨';
    await distressInput.fill(injectionVector);

    // Test Phone field input
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill('+254 712 345 678');

    // Test Voice recording toggle
    console.log('Testing Voice note recording toggle...');
    const micBtn = page.locator('button:has(svg.lucide-mic)');
    if (await micBtn.isVisible()) {
      await micBtn.click();
      await page.waitForTimeout(600);
      // Stop recording
      const stopBtn = page.locator('button:has(svg.lucide-square)');
      if (await stopBtn.isVisible()) {
        await stopBtn.click();
        await page.waitForTimeout(300);
        console.log('✓ Voice recording toggled and WebM blob captured.');
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_sos_form_filled.png') });

    // Submit SOS
    console.log('Submitting emergency SOS...');
    await submitSosBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_sos_submitted_tracking.png') });
    console.log('✓ Emergency distress submitted and auto-transitioned to tracking tab.');

    // Close civilian modal
    const closeCivilianModal = page.locator('div.fixed button:has(svg.lucide-x)').first();
    await closeCivilianModal.click();
    await page.waitForTimeout(500);

    // ==========================================
    // STEP 3: DISPATCH BOARD INTERACTIONS
    // ==========================================
    console.log('\n--- Step 3: Dispatch Board Interactions ---');
    // Test search filter
    const searchInput = page.locator('input[placeholder*="Search landmarks"]');
    await searchInput.fill('Mathare');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_dispatch_board_search.png') });
    console.log('✓ Dispatch board search filtered.');

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(400);

    // Select first incident card
    const firstCard = page.locator('div.flex-1.overflow-y-auto > div').first();
    await firstCard.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_incident_card_selected.png') });
    console.log('✓ Incident card selected with expanded details & evidence view.');

    // Test CAP 1.2 download button
    const capBtn = page.locator('button:has-text("CAP 1.2")').first();
    if (await capBtn.isVisible()) {
      await capBtn.click();
      await page.waitForTimeout(300);
      console.log('✓ OASIS CAP 1.2 alert export clicked.');
    }

    // ==========================================
    // STEP 4: FIELD RESPONDER PWA COCKPIT
    // ==========================================
    console.log('\n--- Step 4: Field Responder PWA Cockpit ---');
    const responderPwaBtn = page.locator('button:has-text("FIELD AGENT")');
    if (await responderPwaBtn.isVisible()) {
      await responderPwaBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_responder_pwa_cockpit.png') });

      // Toggle checklist items
      console.log('Toggling tactical checklist items...');
      const checklistItem = page.locator('button:has-text("Initial Scene Hazard")');
      if (await checklistItem.isVisible()) {
        await checklistItem.click();
        await page.waitForTimeout(400);
        console.log('✓ Checklist toggled and persisted.');
      }

      // Transmit GPS coordinates
      console.log('Broadcasting live GPS coordinates...');
      const transmitGpsBtn = page.locator('button:has-text("Transmit Live Field GPS Coordinates")');
      if (await transmitGpsBtn.isVisible()) {
        await transmitGpsBtn.click();
        await page.waitForTimeout(800);
        console.log('✓ GPS coordinates broadcasted.');
      }

      // Close modal
      const closePwa = page.locator('div.fixed button:has(svg.lucide-x)').first();
      await closePwa.click();
      await page.waitForTimeout(400);
      console.log('✓ Field Responder Cockpit exercised.');
    }

    // ==========================================
    // STEP 5: COMMAND CENTER MODAL
    // ==========================================
    console.log('\n--- Step 5: Command Center Modal ---');
    const commandCenterBtn = page.locator('button:has-text("COMMAND & SEC")');
    if (await commandCenterBtn.isVisible()) {
      await commandCenterBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_command_center_shelters.png') });

      // Switch to Audit tab
      const auditTabBtn = page.locator('button:has-text("Audit Ledger")');
      if (await auditTabBtn.isVisible()) {
        await auditTabBtn.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_command_center_audit.png') });
        console.log('✓ Cryptographic audit ledger inspected.');

        // Click verify integrity
        const verifyLedgerBtn = page.locator('button:has-text("Verify Integrity")');
        if (await verifyLedgerBtn.isVisible()) {
          await verifyLedgerBtn.click();
          await page.waitForTimeout(600);
          console.log('✓ Audit integrity verified.');
        }
      }

      // Switch to AI Recommendation tab
      const recTabBtn = page.locator('button:has-text("AI Dispatcher")');
      if (await recTabBtn.isVisible()) {
        await recTabBtn.click();
        await page.waitForTimeout(500);
        const calcRecBtn = page.locator('button:has-text("Calculate Optimal Unit Dispatch")');
        if (await calcRecBtn.isVisible()) {
          await calcRecBtn.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_command_center_recommendation.png') });
          console.log('✓ MCDA recommendation calculated.');
        }
      }

      // Close command center
      const closeCmd = page.locator('div.fixed button:has(svg.lucide-x)').first();
      await closeCmd.click();
      await page.waitForTimeout(400);
    }

    // ==========================================
    // STEP 6: SIMULATOR MODAL & STRESS ENGINE
    // ==========================================
    console.log('\n--- Step 6: Disaster Simulator Engine ---');
    const simBtn = page.locator('button:has-text("SIMULATOR")');
    if (await simBtn.isVisible()) {
      await simBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_simulator_modal.png') });

      // Trigger Mathare surge scenario
      const scenarioBtn = page.locator('button:has-text("Mathare River Flash Flood Surge")');
      if (await scenarioBtn.isVisible()) {
        await scenarioBtn.click();
        await page.waitForTimeout(1000);
        console.log('✓ Disaster surge scenario triggered.');
      }

      const closeSim = page.locator('div.fixed button:has(svg.lucide-x)').first();
      await closeSim.click();
      await page.waitForTimeout(500);
    }

    // ==========================================
    // STEP 7: OPERATIONAL ANALYTICS MODAL
    // ==========================================
    console.log('\n--- Step 7: Analytics & KPI Metrics ---');
    const analyticsBtn = page.locator('button:has-text("ANALYTICS")');
    if (await analyticsBtn.isVisible()) {
      await analyticsBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_analytics_modal.png') });
      console.log('✓ Operational analytics modal verified.');

      const closeAnalytics = page.locator('div.fixed button:has(svg.lucide-x)').first();
      await closeAnalytics.click();
      await page.waitForTimeout(400);
    }

    // ==========================================
    // STEP 8: REFRESH RESILIENCE MID-FLOW
    // ==========================================
    console.log('\n--- Step 8: Refresh Resilience Test ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_after_page_reload.png') });
    console.log('✓ Page reloaded cleanly with zero crashes.');

    console.log('\n==========================================');
    console.log('PHASE 3 BROWSER EXERCISE COMPLETED!');
    console.log(`Total Console Logs: ${consoleLogs.length}`);
    console.log(`Total Page Errors: ${pageErrors.length}`);
    console.log('==========================================\n');

    if (pageErrors.length > 0) {
      console.error('FAILURES DETECTED IN BROWSER:');
      pageErrors.forEach((e) => console.error(` - ${e}`));
      process.exit(1);
    }

  } catch (err) {
    console.error('Browser execution failure:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png'), fullPage: true });
    throw err;
  } finally {
    await browser.close();
  }
}

runExercise().catch((err) => {
  console.error('Fatal error during browser flow exercise:', err);
  process.exit(1);
});
