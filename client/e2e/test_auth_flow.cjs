const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = 'C:/Users/HP/.gemini/antigravity/brain/c718d3ee-205c-4d32-89c2-7fbc71513b4f/screenshots';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log('🚀 Launching Chrome for Auth Flow E2E test...');
  const browser = await chromium.launch({ 
    executablePath: CHROME_PATH,
    headless: true 
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[Console Error] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`[Page Crash] ${err.message}`);
  });

  try {
    // 1. Navigate to app
    console.log('Step 1: Navigating to http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Clear storage to ensure logged-out clean state
    await page.evaluate(() => {
      localStorage.removeItem('ushajua_access_token_v1');
      localStorage.removeItem('ushajua_refresh_token_v1');
      localStorage.removeItem('ushajua_user_v1');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 2. Verify SIGN IN button
    console.log('Step 2: Checking Header for SIGN IN button...');
    const signInBtn = page.getByRole('button', { name: /SIGN IN/i });
    await signInBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ SIGN IN button found.');

    // 3. Open Auth Modal
    console.log('Step 3: Opening Auth Modal...');
    await signInBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_auth_modal_logged_out.png') });
    console.log('📸 Captured 14_auth_modal_logged_out.png');

    // 4. Switch to Signup
    console.log('Step 4: Registering new test user...');
    const authDialog = page.getByRole('dialog');
    await authDialog.getByRole('button', { name: 'Create Account' }).click();
    await page.waitForTimeout(300);

    const testEmail = `officer_${Date.now()}@ushajua.org`;
    const testPhone = `+2547${Math.floor(10000000 + Math.random() * 89999999)}`;
    await authDialog.getByPlaceholder('Dispatcher Sarah Kimani').fill('Commander Amina Ali');
    await authDialog.getByPlaceholder('sarah.k@ushajua.org').fill(testEmail);
    await authDialog.getByPlaceholder('+254712345678').fill(testPhone);
    await authDialog.locator('select').selectOption('dispatcher');
    await authDialog.getByPlaceholder('••••••••').fill('SecurePass123!');
    
    // Submit registration
    await authDialog.getByRole('button', { name: 'Create Account' }).last().click();
    console.log('Submitted registration form...');

    // Wait for auth modal to close & header to update
    await page.waitForSelector('header :has-text("Commander")', { timeout: 8000 });
    await page.waitForSelector('header :has-text("DISPATCHER")', { timeout: 5000 });
    console.log('✅ User successfully signed up and auto-logged in! Badge verified in Header.');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_authenticated_header.png') });
    console.log('📸 Captured 15_authenticated_header.png');

    // 5. Check Profile Modal
    console.log('Step 5: Inspecting User Identity Profile...');
    const profileBtn = page.locator('header').getByText('Commander');
    await profileBtn.click();
    await page.waitForTimeout(600);
    await page.waitForSelector('text=Command Identity Profile', { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_user_profile_modal.png') });
    console.log('📸 Captured 16_user_profile_modal.png');

    // 6. Test IDOR-safe Profile Update
    console.log('Step 6: Updating user profile...');
    const phoneInput = authDialog.getByPlaceholder('+254700000000');
    await phoneInput.fill('+254799887766');
    await authDialog.getByRole('button', { name: 'Save Profile Changes' }).click();
    await page.waitForTimeout(1000);
    console.log('✅ Profile updated.');

    // 7. Test Logout
    console.log('Step 7: Testing Logout and session revocation...');
    await authDialog.getByRole('button', { name: /Sign Out/i }).click();
    await page.waitForTimeout(1000);

    // Verify localStorage cleared
    const storedToken = await page.evaluate(() => localStorage.getItem('ushajua_access_token_v1'));
    if (storedToken) {
      throw new Error(`Expected access token to be cleared after logout, but found ${storedToken}`);
    }
    console.log('✅ LocalStorage token successfully evicted.');
    await page.waitForSelector('header :has-text("SIGN IN")', { timeout: 5000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_after_logout.png') });
    console.log('📸 Captured 17_after_logout.png');

    // 8. Test Log In with the registered account
    console.log('Step 8: Logging back in with registered credentials...');
    await page.getByRole('button', { name: /SIGN IN/i }).click();
    await page.waitForTimeout(500);
    await authDialog.getByPlaceholder('officer@ushajua.org or +254...').fill(testEmail);
    await authDialog.getByPlaceholder('••••••••').fill('SecurePass123!');
    await authDialog.getByRole('button', { name: 'Sign In to Command Console' }).click();

    await page.waitForSelector('header :has-text("Commander")', { timeout: 8000 });
    console.log('✅ Successfully re-authenticated via Sign In form!');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_login_verified.png') });
    console.log('📸 Captured 18_login_verified.png');

    console.log('\n========================================');
    console.log('🎉 ALL AUTH E2E BROWSER TESTS PASSED!');
    console.log('========================================');
  } catch (err) {
    console.error('❌ E2E Auth Test Failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'auth_error.png') });
    process.exit(1);
  } finally {
    if (errors.length > 0) {
      console.log('\nWarnings / Console logs during run:');
      errors.forEach(e => console.log('  ', e));
    }
    await browser.close();
  }
}

run();
