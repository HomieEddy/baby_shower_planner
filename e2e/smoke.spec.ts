import { test, expect } from '@playwright/test';

test('landing page shows guest, host, and event details entry buttons', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Guest Login|Connexion Invité/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Host Login|Connexion Hôte/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Event Details|Détails de l'événement/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);

  // event details live on their own page
  await page.getByRole('button', { name: /Event Details|Détails de l'événement/i }).click();
  await expect(page).toHaveURL(/\/event$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/Event details coming soon|détails de l'événement arrivent bientôt/i)).toHaveCount(0);

  // legacy /rsvp links land on the new landing page
  await page.goto('/rsvp');
  await expect(page).toHaveURL(/\/$/);
});

test('guest portal rejects bad input and unknown codes', async ({ page }) => {
  await page.goto('/portal');

  // not a code and not a link
  await page.fill('input[type=text]', 'hello');
  await page.click('button[type=submit]');
  await expect(page.getByText(/Enter your 4-digit reservation code|code de réservation à 4 chiffres/i)).toBeVisible();

  // plausible but unknown code
  await page.fill('input[type=text]', '0000');
  await page.click('button[type=submit]');
  await expect(page.getByText(/couldn't find a reservation|Aucune réservation trouvée/i)).toBeVisible();

  // pasted magic link goes straight to the RSVP page
  await page.fill('input[type=text]', `${page.url()}rsvp/token-abc123`);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/rsvp\/token-abc123$/);
});

test('admin login gates and dashboard loads', async ({ page }) => {
  // wrong password is rejected
  await page.goto('/login');
  await page.fill('input[type=password]', 'wrong-password');
  await page.click('button[type=submit]');
  await expect(page.getByText(/Wrong password|Mot de passe incorrect/i)).toBeVisible();

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
