const { test, expect } = require('./support/fixtures');

test.describe('smoke', () => {
  test('loads without console/page errors and shows the login screen', async ({ page, supabase }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/index.html');

    await expect(page).toHaveTitle(/Infrastructure Monitoring & Information System/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('name@agency.gov.ph')).toBeVisible();

    expect(pageErrors, `Uncaught page errors: ${pageErrors.map((e) => e.message).join('; ')}`).toHaveLength(0);
  });

  test('never shows the "could not load Supabase library" fallback once vendor assets are mocked', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.getByText("Couldn't load the Supabase library")).toHaveCount(0);
  });
});
