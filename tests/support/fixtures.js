const base = require('@playwright/test');
const { mockVendorAssets } = require('./vendor');
const { SupabaseMock } = require('./supabase-mock');

const test = base.test.extend({
  // Every test gets vendor CDN assets mocked automatically.
  page: async ({ page }, use) => {
    await mockVendorAssets(page);
    await use(page);
  },

  supabase: async ({ page }, use) => {
    const mock = new SupabaseMock(page);
    await mock.install();
    await use(mock);
  },
});

const expect = base.expect;

/** Fills the login form and submits it. Assumes the login screen is visible. */
async function fillLoginForm(page, { email, password, mode = 'signin' }) {
  if (mode === 'signup') {
    const isSignup = await page.getByText('Create your account').isVisible().catch(() => false);
    if (!isSignup) await page.getByRole('button', { name: /Create an account/i }).click();
  }
  await page.getByPlaceholder('name@agency.gov.ph').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
}

/** Logs in through the real login form against a mocked Supabase backend. */
async function loginAs(page, supabase, email = 'officer@dar.gov.ph', password = 'password123') {
  supabase.succeedLogin(email);
  await fillLoginForm(page, { email, password });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.imis-shell')).toBeVisible();
}

module.exports = { test, expect, fillLoginForm, loginAs };
