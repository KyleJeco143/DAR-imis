const { test, expect, loginAs } = require('./support/fixtures');

test.describe('sidebar navigation', () => {
  test.beforeEach(async ({ page, supabase }) => {
    await page.goto('/index.html');
    await loginAs(page, supabase);
  });

  const sections = [
    { navLabel: 'Inventory', title: 'Consolidated Inventory' },
    { navLabel: 'Documents & reports', title: 'Documents and Reports' },
    { navLabel: 'Calendar', title: 'Project Calendar' },
    { navLabel: 'SME monitoring', title: 'Sustainability Monitoring & Evaluation' },
    { navLabel: 'ARC Map', title: 'Agrarian Reform Communities' },
    { navLabel: 'Overview', title: 'Overview' },
  ];

  for (const { navLabel, title } of sections) {
    test(`clicking "${navLabel}" shows the ${title} view`, async ({ page }) => {
      await page.getByRole('button', { name: navLabel }).click();
      await expect(page.locator('.imis-titleblock')).toContainText(title);
    });
  }
});
