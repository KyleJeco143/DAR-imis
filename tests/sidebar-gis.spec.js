// Regression tests for the GIS / ARBO buttons that gis-module.js and
// arbo-nav.js inject into the React sidebar after login.
const { test, expect, loginAs } = require('./support/fixtures');

const ACTIVE_BG = 'rgb(14, 77, 43)';

test.describe('injected GIS & ARBO sidebar buttons', () => {
  test.beforeEach(async ({ page, supabase }) => {
    await page.goto('/index.html');
    await loginAs(page, supabase);
    await expect(page.locator('#gis-nav-button')).toBeVisible();
    await expect(page.locator('#arbo-nav-button')).toBeVisible();
  });

  test('are not highlighted as active until opened', async ({ page }) => {
    for (const id of ['#gis-nav-button', '#arbo-nav-button']) {
      const bg = await page.locator(id).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg, `${id} should look inactive`).not.toBe(ACTIVE_BG);
    }
  });

  test('GIS group stays below every core menu item and above the account block', async ({ page }) => {
    await page.waitForTimeout(500);
    const order = await page.evaluate(() => {
      const side = document.querySelector('.imis-sidebar');
      const group = document.getElementById('gis-nav-group');
      const after = [];
      let el = group.nextElementSibling;
      while (el) { after.push(el.innerText.trim().split('\n')[0]); el = el.nextElementSibling; }
      return { parentIsSide: group.parentElement === side, after };
    });
    expect(order.parentIsSide).toBe(true);
    // Only the account block (starts with "ACCOUNT") may follow the GIS group.
    expect(order.after.length).toBe(1);
    expect(order.after[0].toUpperCase()).toBe('ACCOUNT');
  });

  test('opening the map highlights its button, and any other menu item closes it', async ({ page }) => {
    await page.locator('#gis-nav-button').click();
    await expect(page.locator('#gis-workspace')).toBeVisible();
    await expect(page.locator('#gis-nav-button')).toHaveAttribute('aria-current', 'page');
    const bg = await page.locator('#gis-nav-button').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(ACTIVE_BG);

    // Inventory renders after the GIS module installs — it must still close the map.
    await page.getByRole('button', { name: /^Inventory/ }).click();
    await expect(page.locator('#gis-workspace')).toHaveCount(0);
    await expect(page.locator('.imis-titleblock')).toBeVisible();
    await expect(page.locator('.imis-titleblock')).toContainText('Consolidated Inventory');
    await expect(page.locator('#gis-nav-button')).not.toHaveAttribute('aria-current', 'page');
  });

  test('switching between the map and the ARBO page shows only one panel', async ({ page }) => {
    await page.locator('#gis-nav-button').click();
    await expect(page.locator('#gis-workspace')).toBeVisible();

    await page.locator('#arbo-nav-button').click();
    await expect(page.locator('.imis-main iframe[src="arbo-map.html"]')).toBeVisible();
    await expect(page.locator('#gis-workspace')).toHaveCount(0);
    await expect(page.locator('#gis-nav-button')).not.toHaveAttribute('aria-current', 'page');

    await page.locator('#gis-nav-button').click();
    await expect(page.locator('#gis-workspace')).toBeVisible();
    await expect(page.locator('.imis-main iframe[src="arbo-map.html"]')).toHaveCount(0);
    await expect(page.locator('#arbo-nav-button')).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('sidebar highlight & mobile behaviour', () => {
  test('only one sidebar item looks selected while the map is open', async ({ page, supabase }) => {
    await page.goto('/index.html');
    await loginAs(page, supabase);
    await page.locator('#gis-nav-button').click();
    await expect(page.locator('#gis-workspace')).toBeVisible();
    const selected = await page.$$eval('.imis-sidebar button', (bs) =>
      bs.filter((b) => getComputedStyle(b).backgroundColor === 'rgb(14, 77, 43)').map((b) => b.innerText.trim()));
    expect(selected).toEqual(['Interactive Map QGIS']);

    await page.getByRole('button', { name: /^Calendar/ }).click();
    await expect(page.locator('.imis-titleblock')).toContainText('Project Calendar');
    const after = await page.$$eval('.imis-sidebar button', (bs) =>
      bs.filter((b) => getComputedStyle(b).backgroundColor === 'rgb(14, 77, 43)').map((b) => b.innerText.trim().split('\n')[0]));
    expect(after).toEqual(['Calendar']);
  });

  test('on a phone, tapping a menu item scrolls to the content', async ({ page, supabase }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await loginAs(page, supabase);
    const btn = page.getByRole('button', { name: /^Calendar/ });
    await btn.click();
    await expect(page.locator('.imis-titleblock')).toContainText('Project Calendar');
    await expect.poll(() => page.evaluate(() => document.querySelector('.imis-main').getBoundingClientRect().top), { timeout: 3000 })
      .toBeLessThan(80);
  });
});
