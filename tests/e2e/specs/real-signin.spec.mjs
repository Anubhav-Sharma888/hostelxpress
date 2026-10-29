import {test, expect} from '@playwright/test';

// Real-mode journey against the live Supabase project and a production backend.
// Runs only when the Playwright config is invoked with HX_E2E_REAL=1 and
// STUDENT_URL points at a real-mode web bundle (EXPO_PUBLIC_SUPABASE_* in
// apps/student/.env, backend on EXPO_PUBLIC_API_URL). Creates a throwaway
// student account, signs in twice, and edits the profile name on the second session.

const email = process.env.QA_EMAIL || ('qa-' + Date.now() + '@hostelxpress.test');
const password = process.env.QA_PASSWORD || ('Hx-' + Date.now().toString(36) + '-demo');

test('student signs up, completes profile, signs out, and signs back in on the live backend', async ({page}) => {
  test.setTimeout(90000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
  await page.getByTestId('mode-toggle').click();
  await page.getByTestId('name-input').fill('QA Real User');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByRole('radio', {name: 'Hostel B'}).click();
  await page.getByTestId('sign-up-submit').click();
  await expect(page.getByTestId('booking-open').first()).toBeVisible();
  await expect(page.getByText('QA Real User').first()).toBeVisible();

  await page.getByRole('button', {name: 'Sign out'}).last().click();
  await expect(page.getByTestId('email-input')).toBeVisible();

  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByTestId('booking-open').first()).toBeVisible();
  await expect(page.getByText('QA Real User').first()).toBeVisible();

  await page.getByRole('link', {name: 'My profile'}).click();
  await page.getByTestId('profile-edit').click();
  await page.getByTestId('profile-name-input').fill('QA Real User 2');
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profile saved').first()).toBeVisible();
  await expect(page.getByText('QA Real User 2').first()).toBeVisible();

  await page.getByRole('button', {name: 'Sign out'}).last().click();
  await expect(page.getByTestId('email-input')).toBeVisible();
  expect(browserErrors, 'Browser runtime errors').toEqual([]);
  console.log('QA_REAL_ACCOUNT: ' + email);
});
