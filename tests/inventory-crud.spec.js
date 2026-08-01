const { test, expect, loginAs } = require('./support/fixtures');

test.describe('inventory CRUD', () => {
  test.beforeEach(async ({ page, supabase }) => {
    supabase.seed('projects', [
      {
        id: 'seed-1',
        code: 'FMR-2025-001',
        name: 'Existing Seeded Road Project',
        barangay: 'Barangay A',
        municipality: 'Sta. Barbara',
        status: 'Ongoing',
        category: 'fmr',
      },
    ]);
    await page.goto('/index.html');
    await loginAs(page, supabase);
    await page.getByRole('button', { name: 'Farm-to-Market Roads' }).click();
  });

  test('renders seeded projects fetched from Supabase', async ({ page }) => {
    await expect(page.getByText('Existing Seeded Road Project')).toBeVisible();
  });

  test('adding a project submits the right payload and appears in the table', async ({ page, supabase }) => {
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.getByPlaceholder('FMR-2026-000')).toBeVisible();

    await page.getByPlaceholder('FMR-2026-000').fill('FMR-2026-042');
    await page.getByPlaceholder('e.g. San Isidro Farm Road Concreting').fill('Test Barangay Road Concreting');

    await page.getByRole('button', { name: 'Save project' }).click();

    await expect(page.getByText('Test Barangay Road Concreting')).toBeVisible();

    const writes = supabase.getRequests('projects').filter((r) => r.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0].body[0]).toMatchObject({
      code: 'FMR-2026-042',
      name: 'Test Barangay Road Concreting',
    });
  });

  test('a failed save surfaces the backend error via an alert', async ({ page, supabase }) => {
    supabase.queueWriteFailure('connection reset');

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByPlaceholder('FMR-2026-000').fill('FMR-2026-043');
    await page.getByPlaceholder('e.g. San Isidro Farm Road Concreting').fill('Project That Fails To Save');
    await page.getByRole('button', { name: 'Save project' }).click();

    await expect.poll(() => dialogMessage).toContain("Couldn't save to the shared database");
  });
});
