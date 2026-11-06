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

  console.log('🚀 Launching Chrome for Phase 5 Data Integrity & Persistence Verification...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Create entities via API
    const runId = Date.now().toString().slice(-5);
    const testCallsign = `AIR-AMB-${runId}`;
    const testShelterName = `Kasarani Stadium Safe Haven ${runId}`;
    const testLocation = `Ruaraka Breweries Zone ${runId}`;

    console.log(`Step 1: Creating test entities with run ID ${runId}...`);
    // Create Responder
    const respRes = await fetch(`${API_BASE}/api/v1/responders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'ushajua-dev-dispatcher-key' },
      body: JSON.stringify({
        callsign: testCallsign,
        unit_type: 'Ambulance',
        base_station: 'Kenyatta National Hospital Heliport',
        coordinates: { latitude: -1.3005, longitude: 36.8060 }
      })
    });
    if (!respRes.ok) throw new Error(`Failed to create test responder: ${await respRes.text()}`);
    const createdResp = await respRes.json();
    console.log(`✅ Created test responder: ${createdResp.callsign} (${createdResp.id})`);

    // Create Shelter
    const shelterRes = await fetch(`${API_BASE}/api/v1/shelters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'ushajua-dev-dispatcher-key' },
      body: JSON.stringify({
        name: testShelterName,
        location_name: 'Kasarani Complex, Nairobi',
        coordinates: { latitude: -1.2220, longitude: 36.8950 },
        capacity_total: 1500,
        occupancy_current: 120,
        water_supply_status: 'Operational',
        medical_post_available: true,
        contact_phone: '+254700112233'
      })
    });
    if (!shelterRes.ok) throw new Error(`Failed to create test shelter: ${await shelterRes.text()}`);
    const createdShelter = await shelterRes.json();
    console.log(`✅ Created test shelter: ${createdShelter.name} (${createdShelter.id})`);

    // Create Incident
    const incRes = await fetch(`${API_BASE}/api/v1/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'ushajua-dev-dispatcher-key' },
      body: JSON.stringify({
        raw_text: `Critical chemical leak and flash surge at Ruaraka near factory ${runId}`,
        incident_type: 'Flood',
        urgency_level: 'Critical',
        location_name: testLocation,
        coordinates: { latitude: -1.2400, longitude: 36.8800 },
        status: 'Pending'
      })
    });
    if (!incRes.ok) throw new Error(`Failed to create test incident: ${await incRes.text()}`);
    const createdInc = await incRes.json();
    console.log(`✅ Created test incident: ${createdInc.location_name} (${createdInc.id})`);

    // 2. Open frontend and verify entities appear
    console.log('Step 2: Navigating to frontend...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify incident appears in Dispatch Board list
    await page.waitForSelector(`text=${testLocation}`, { timeout: 8000 });
    console.log(`✅ Verified test incident card rendered in Dispatch Board.`);

    // Open CommandCenter modal to verify Shelters
    console.log('Step 3: Checking shelters in Command Center modal...');
    await page.getByRole('button', { name: /COMMAND & SEC/i }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Evacuation Shelters/i }).click();
    await page.waitForTimeout(600);
    await page.waitForSelector(`text=${testShelterName}`, { timeout: 8000 });
    console.log(`✅ Verified test shelter rendered in Command Center shelters list.`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_phase5_created_entities.png') });
    console.log('📸 Captured 19_phase5_created_entities.png');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 3. Test persistence across page reload
    console.log('Step 4: Reloading page to verify database persistence across reloads...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify incident still exists after reload
    await page.waitForSelector(`text=${testLocation}`, { timeout: 8000 });
    console.log(`✅ Incident persisted after page reload!`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_phase5_after_reload_persistence.png') });
    console.log('📸 Captured 20_phase5_after_reload_persistence.png');

    // 4. Test Dispatch & Orphan Prevention
    console.log('Step 5: Testing Dispatch and Orphan Prevention on Delete...');
    // Dispatch our created unit to the incident
    const dispatchRes = await fetch(`${API_BASE}/api/v1/responders/${createdResp.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'ushajua-dev-dispatcher-key' },
      body: JSON.stringify({ incident_id: createdInc.id })
    });
    if (!dispatchRes.ok) throw new Error('Dispatch failed');
    console.log(`✅ Dispatched unit ${testCallsign} to ${testLocation}`);

    // Now delete the incident
    console.log('Step 6: Deleting incident...');
    const delRes = await fetch(`${API_BASE}/api/v1/incidents/${createdInc.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': 'ushajua-dev-dispatcher-key' }
    });
    if (!delRes.ok) throw new Error('Incident delete failed');
    console.log(`✅ Deleted incident ${createdInc.id}`);

    // Verify disengagement of responder unit
    const checkRespRes = await fetch(`${API_BASE}/api/v1/responders/${createdResp.id}?_t=${Date.now()}`);
    // Check all responders
    const allResp = await (await fetch(`${API_BASE}/api/v1/responders`)).json();
    const unitState = allResp.find(r => r.id === createdResp.id);
    if (!unitState) throw new Error('Unit not found');
    if (unitState.assigned_incident_id !== null) {
      throw new Error(`Orphan detected! Unit still assigned to ${unitState.assigned_incident_id}`);
    }
    console.log(`✅ Verified responder ${testCallsign} disengaged cleanly (assigned_incident_id is null).`);

    // Clean up created shelter & responder
    await fetch(`${API_BASE}/api/v1/responders/${createdResp.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': 'ushajua-dev-dispatcher-key' }
    });
    await fetch(`${API_BASE}/api/v1/shelters/${createdShelter.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': 'ushajua-dev-dispatcher-key' }
    });
    console.log('✅ Cleaned up temporary test entities.');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_phase5_after_cleanup.png') });
    console.log('📸 Captured 21_phase5_after_cleanup.png');

    console.log('\n======================================================');
    console.log('🎉 PHASE 5 BROWSER & PERSISTENCE VERIFICATION PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Phase 5 Verification Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();

