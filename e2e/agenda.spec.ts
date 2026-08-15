import { test, expect } from '@playwright/test';

const PASSWORD = process.env.E2E_ADMIN_TOKEN || 'babyshower-admin-2026';

// Desktop-only: the admin sidebar is a drawer on mobile and dnd-kit drag
// gestures are desktop-oriented.
test.skip(({ isMobile }) => isMobile, 'admin sidebar + drag interactions target desktop');

test('agenda tab: kanban, task creation, calendar, reminders', async ({ page }) => {
  await page.goto('/login');
  // Switch the UI to English so assertions are ASCII-stable
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/admin/);
  await expect(page.locator('aside')).toBeVisible();

  // Open the Agenda tab from the sidebar
  await page.locator('aside').getByRole('button', { name: /agenda/i }).click();
  await expect(page.locator('main').getByText('To Do', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByText('In Progress', { exact: true })).toBeVisible();
  await expect(page.locator('main').getByText('Done', { exact: true })).toBeVisible();

  // Create a task via the modal
  await page.getByRole('button', { name: /add task/i }).click();
  await page.fill('form#agenda-task-form input[type=text]', 'Order decorations');
  await page.fill('form#agenda-task-form input[type=date]', '2026-09-20');
  await page.fill('form#agenda-task-form input[type=time]', '10:00');
  await page.getByRole('button', { name: /save task/i }).click();
  await expect(page.getByText('Order decorations').first()).toBeVisible({ timeout: 8000 });

  // Switch to calendar view
  await page.getByRole('button', { name: /calendar/i }).click();
  await expect(page.getByText(/august 2026/i).first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByText(/september 2026/i).first()).toBeVisible();
  await expect(page.getByText('Order decorations').first()).toBeVisible();

  // Open the task from the calendar and delete it
  await page.getByText('Order decorations').first().click();
  await page.getByRole('button', { name: 'Delete Task', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete Task', exact: true }).last().click();
  await expect(page.getByText('Order decorations')).toHaveCount(0, { timeout: 8000 });

  // Reminder settings panel is present
  await expect(page.getByText(/reminder settings/i).first()).toBeVisible();
});

test('agenda kanban drag moves a task between columns', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/admin/);
  await page.locator('aside').getByRole('button', { name: /agenda/i }).click();

  await page.getByRole('button', { name: /add task/i }).click();
  await page.fill('form#agenda-task-form input[type=text]', 'Drag me task');
  await page.getByRole('button', { name: /save task/i }).click();
  const card = page.getByText('Drag me task').first();
  await expect(card).toBeVisible({ timeout: 8000 });

  // Drag the card's grip handle from To Do onto the In Progress column
  // (manual mouse steps: Playwright's dragTo doesn't trigger dnd-kit sensors)
  await expect(page.locator('form#agenda-task-form')).toHaveCount(0);
  const grip = page.getByRole('button', { name: 'Drag task', exact: true }).first();
  const inProgressColumn = page.locator('main').getByText('In Progress', { exact: true }).locator('xpath=../..');
  const from = (await grip.boundingBox())!;
  const to = (await inProgressColumn.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('main').getByText('In Progress', { exact: true })).toBeVisible();

  // Status persisted server-side
  await page.waitForTimeout(1200);
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/agenda');
    return (await r.json()).tasks;
  });
  const moved = res.find((t: { title: string }) => t.title === 'Drag me task');
  expect(moved?.status).toBe('in_progress');

  // Cleanup
  await page.evaluate(async (id: string) => {
    const t = sessionStorage.getItem('admin_token');
    await fetch(`/api/agenda/${id}`, { method: 'DELETE', headers: { 'x-admin-token': t || '' } });
  }, moved.id);
});
