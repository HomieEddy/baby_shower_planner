import { test, expect } from '@playwright/test';

test('guest home renders the event page', async ({ page }) => {
  await page.goto('/rsvp');
  await expect(page.getByText(/Baby Shower for Baby/i).first()).toBeVisible();
  await expect(page.getByText('Event details coming soon')).toHaveCount(0);
});

test('admin login gates and dashboard loads', async ({ page }) => {
  // wrong password is rejected
  await page.goto('/login');
  await page.fill('input[type=password]', 'wrong-password');
  await page.click('button[type=submit]');
  await expect(page.getByText('Wrong password')).toBeVisible();

  // correct password enters the dashboard with the sidebar nav
  await page.fill('input[type=password]', 'babyshower-admin-2026');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.locator('aside button:visible').first()).toBeVisible();
});

test('guestbook locks guests out before the event window', async ({ page }) => {
  await page.goto('/guestbook');
  await expect(page.getByText(/guestbook opens when the event begins|livre d'or ouvre au début/i).first()).toBeVisible();
});
