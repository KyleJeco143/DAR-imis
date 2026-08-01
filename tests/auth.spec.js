const { test, expect, loginAs, fillLoginForm } = require('./support/fixtures');

test.describe('authentication', () => {
  test('successful sign-in reveals the authenticated app shell', async ({ page, supabase }) => {
    await page.goto('/index.html');
    await loginAs(page, supabase, 'officer@dar.gov.ph', 'password123');

    await expect(page.getByText('Sign out')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
  });

  test('failed sign-in shows the backend error and keeps the login form', async ({ page, supabase }) => {
    supabase.failLogin('Invalid login credentials');
    await page.goto('/index.html');
    await fillLoginForm(page, { email: 'officer@dar.gov.ph', password: 'wrong-password' });
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid login credentials')).toBeVisible();
    await expect(page.locator('.imis-shell')).toHaveCount(0);
  });

  test('empty submission shows a client-side validation message without hitting the network', async ({ page, supabase }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Enter an email and password.')).toBeVisible();
    expect(supabase.getRequests()).toHaveLength(0);
  });

  test('toggling to "Create an account" reveals the confirm-password field', async ({ page, supabase }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: /Create an account/i }).click();

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByText('Confirm password')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(2);

    await page.getByRole('button', { name: /Already have an account/i }).click();
    await expect(page.getByText('Confirm password')).toHaveCount(0);
  });
});
