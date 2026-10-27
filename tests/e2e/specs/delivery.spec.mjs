import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

async function capture(page, path) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight + 20) element.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });
  await page.screenshot({path, fullPage: true});
}

test('student can book, track, pay in demo, and confirm collection', async ({page}, testInfo) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
  await page.getByTestId('name-input').fill('Preview Student');
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByTestId('booking-open').first()).toBeVisible();
  await mkdir('../../docs/preview', {recursive: true});
  await capture(page, '../../docs/preview/' + testInfo.project.name + '-home.png');

  await page.getByTestId('booking-open').first().click();
  await page.getByTestId('booking-label').fill('Lunch from Gate 2');
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('demo-next-action')).toBeVisible();
  await expect(page.getByTestId('demo-next-action')).toHaveAccessibleName('Simulate rider loading');
  await page.getByTestId('demo-next-action').click();
  await expect(page.getByTestId('demo-next-action')).toHaveAccessibleName('Advance demo clock & dispatch');
  await page.getByTestId('demo-next-action').click();
  await expect(page.getByTestId('demo-next-action')).toHaveAccessibleName('Simulate hostel arrival');
  await capture(page, '../../docs/preview/' + testInfo.project.name + '-tracking.png');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow, 'The student UI must fit the viewport without horizontal overflow').toBeFalsy();
  await page.getByTestId('demo-next-action').click();
  await expect(page.getByTestId('payment-create')).toBeVisible();
  await page.getByTestId('payment-create').click();
  await expect(page.getByTestId('demo-next-action')).toHaveAccessibleName('Simulate ₹10 payment');
  await capture(page, '../../docs/preview/' + testInfo.project.name + '-payment.png');
  await page.getByTestId('demo-next-action').click();
  await expect(page.getByTestId('demo-next-action')).toHaveAccessibleName('Simulate collection & lid closed');
  await page.getByTestId('demo-next-action').click();
  await expect(page.getByText('Delivered. Day made.', {exact: true})).toBeVisible();
  await expect(page.getByTestId('demo-next-action')).toHaveCount(0);
  await page.getByRole('link', {name: 'My deliveries', exact: true}).click();
  await page.getByRole('tab', {name: 'Completed deliveries'}).click();
  await expect(page.getByText('Lunch from Gate 2', {exact: true})).toBeVisible();
  await page.getByRole('link', {name: 'My profile', exact: true}).click();
  await expect(page.getByText('Right at home.', {exact: true})).toBeVisible();
  const helpName = testInfo.project.name === 'desktop' ? 'Help & support' : 'Help and support';
  await page.getByRole('link', {name: helpName, exact: true}).click();
  await page.getByRole('button', {name: 'When do I pay the ₹10 fee?', exact: true}).click();
  await expect(page.getByText(/In the current demo the QR is nonpayable/)).toBeVisible();
  await page.getByRole('link', {name: 'My profile', exact: true}).click();
  await page.getByRole('button', {name: 'Sign out', exact: true}).last().click();
  await expect(page.getByTestId('sign-in-submit')).toBeVisible();
  expect(browserErrors, 'Browser runtime errors').toEqual([]);
});

test('student sees a failed refresh and recovers when the API returns', async ({page}) => {
  await page.route('**/v1/orders', route => route.abort('failed'));
  await page.goto('/');
  await page.getByTestId('name-input').fill('Offline Check');
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByText('Cannot reach the server. Check your connection and try again.', {exact: true})).toBeVisible();
  await page.unroute('**/v1/orders');
  await expect(page.getByText('Cannot reach the server. Check your connection and try again.', {exact: true})).toBeHidden();
  await expect(page.getByTestId('booking-open').first()).toBeVisible();
});
