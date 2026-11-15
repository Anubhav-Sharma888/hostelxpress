import {test, expect} from '@playwright/test';

// After Hours pilot browser journey on the local demo stack. The seed step
// (run before this spec) opens the schedule window and provisions two
// merchants with staff tokens; capacities and expiry are server-owned, so the
// full-departure and expired-quote cases stay covered by the API suite.
const tokens = {tuck: 'demo-staff-tuck', hot: 'demo-staff-hot'};

test('@full after hours pilot: order, pay, and merchant actions stay scoped', async ({page}) => {
  test.setTimeout(150000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('response', response => { if (response.url().includes('/v1/pilot/merchant')) console.log('MERCHANT_RESP', response.status(), response.url()); });
  page.on('requestfailed', request => { if (request.url().includes('/v1/pilot/merchant')) console.log('MERCHANT_FAILED', request.url(), request.failure()?.errorText); });
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pilot Student');
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByTestId('afterhours-open')).toBeVisible();
  await page.getByTestId('afterhours-open').click();
  await page.getByRole('heading', {name: 'Midnight cravings.', exact: true}).waitFor();
  await expect(page.getByText('After Hours window is open')).toBeVisible();

  // Tuck shop: browse, add, quote, confirm, simulated payment. Merchants sort
  // by kind then name, so the tuck shop is the second card in the list.
  await page.getByRole('button', {name: 'Browse and order'}).nth(1).click();
  await page.getByText('Departure').first().waitFor();
  await page.getByLabel('Add one Test paratha').click();
  await expect(page.getByText('Delivery fee')).toBeVisible();
  await expect(page.getByText('₹10')).toBeVisible();
  // Step one - requesting a quote only prices the cart; it never places an order.
  await page.getByRole('button', {name: 'Get quote'}).click();
  await expect(page.getByText('Quote locked for')).toBeVisible({timeout: 20000});
  await expect(page.getByText('Order placed.')).toHaveCount(0);
  await expect(page.getByText('₹60', {exact: true})).toBeVisible();
  // Changing the cart invalidates the stored quote and requires a fresh one.
  await page.getByLabel('Add one Test paratha').click();
  await expect(page.getByText('Your cart changed.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Confirm this order'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Get quote'}).click();
  await expect(page.getByText('Quote locked for')).toBeVisible({timeout: 20000});
  await expect(page.getByText('₹110', {exact: true})).toBeVisible();
  // Step two - explicit confirmation places the order against that quote.
  await page.getByRole('button', {name: 'Confirm this order'}).click();
  await expect(page.getByText('Order placed.')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Simulate payment'}).click();
  await expect(page.getByText('Payment confirmed · waiting for the merchant.')).toBeVisible();

  // Merchant queue with the tuck token: full action chain. Back to After
  // Hours first - that is where the merchant queue link lives.
  await page.getByRole('button', {name: 'After Hours home'}).click();
  await page.getByRole('button', {name: 'Open merchant queue'}).click();
  await page.getByLabel('Merchant staff token').fill(tokens.tuck);
  await expect(page.getByText('Test paratha × 2')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Accept'}).first().click();
  await expect(page.getByText('Accepted').first()).toBeVisible();
  await page.getByRole('button', {name: 'Mark ready'}).first().click();
  await page.getByRole('button', {name: 'Request rover'}).first().click();
  await page.getByRole('button', {name: 'Confirm loaded'}).first().click();
  await expect(page.getByText('Loaded').first()).toBeVisible();

  // A different merchant's token must not see this order.
  await page.getByLabel('Merchant staff token').fill(tokens.hot);
  await expect(page.getByText('No orders yet tonight.')).toBeVisible({timeout: 20000});

  // Hot food checkout shows the ₹20 delivery fee with the insulated bay badge
  // only after backend assignment (the seed leaves it unassigned).
  await page.getByRole('button', {name: 'After Hours'}).click();
  await page.getByRole('button', {name: 'Browse and order'}).first().click();
  await page.getByText('Departure').first().waitFor();
  await page.getByLabel('Add one Hot chai').click();
  await page.getByLabel('Add one Midnight maggi').click();
  await expect(page.getByText('₹20')).toBeVisible();
  await expect(page.getByText('Bay 01 · Insulated')).toHaveCount(0);
  await page.getByRole('button', {name: 'Get quote'}).click();
  await expect(page.getByText('Quote locked for')).toBeVisible({timeout: 20000});
  await expect(page.getByText('₹280', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Confirm this order'}).click();
  await expect(page.getByText('Order placed.')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Simulate payment'}).click();
  await page.getByRole('button', {name: 'After Hours home'}).click();
  await page.getByRole('button', {name: 'Open merchant queue'}).click();
  await page.getByLabel('Merchant staff token').fill(tokens.hot);
  await expect(page.getByText('Hot chai × 1')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Accept'}).first().click();
  await expect(page.getByText('Bay 01 · Insulated').first()).toBeVisible();
  expect(browserErrors, 'Browser runtime errors').toEqual([]);
});

test('@student student gets a quote, explicitly confirms it, and pays', async ({page}) => {
  test.setTimeout(180000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
  await page.getByTestId('name-input').fill('Pilot Student');
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByTestId('afterhours-open')).toBeVisible();
  await page.getByTestId('afterhours-open').click();
  await page.getByRole('heading', {name: 'Midnight cravings.', exact: true}).waitFor();
  await expect(page.getByText('After Hours window is open')).toBeVisible();
  await page.getByRole('button', {name: 'Browse and order'}).nth(1).click();
  await page.getByText('Departure').first().waitFor();
  await page.getByLabel('Add one Test paratha').click();
  await expect(page.getByText('Delivery fee')).toBeVisible();
  await expect(page.getByText('₹10', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Get quote'}).click();
  await expect(page.getByText('Quote locked for')).toBeVisible({timeout: 20000});
  await expect(page.getByText('Order placed.')).toHaveCount(0);
  await expect(page.getByText('₹60', {exact: true})).toBeVisible();
  await page.getByLabel('Add one Test paratha').click();
  await expect(page.getByText('Your cart changed.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Confirm this order'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Get quote'}).click();
  await expect(page.getByText('Quote locked for')).toBeVisible({timeout: 20000});
  await expect(page.getByText('₹110', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Confirm this order'}).click();
  await expect(page.getByText('Order placed.')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Simulate payment'}).click();
  await expect(page.getByText('Payment confirmed · waiting for the merchant.')).toBeVisible();
  expect(browserErrors, 'Browser runtime errors').toEqual([]);
});

test('@merchant merchant accepts, readies, and confirms loading on its own orders', async ({page}) => {
  test.setTimeout(180000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  // A staff session starts from the demo sign-in, then navigates client-side.
  await page.goto('/');
  await page.getByTestId('name-input').fill('Merchant Staff');
  await page.getByTestId('sign-in-submit').click();
  await expect(page.getByTestId('afterhours-open')).toBeVisible();
  await page.getByTestId('afterhours-open').click();
  await page.getByRole('button', {name: 'Open merchant queue'}).click();
  await page.getByLabel('Merchant staff token').fill(tokens.tuck);
  await expect(page.getByText('Test paratha × 2')).toBeVisible({timeout: 20000});
  await page.getByRole('button', {name: 'Accept'}).first().click();
  await expect(page.getByText('Accepted').first()).toBeVisible();
  await page.getByRole('button', {name: 'Mark ready'}).first().click();
  await page.getByRole('button', {name: 'Request rover'}).first().click();
  await page.getByRole('button', {name: 'Confirm loaded'}).first().click();
  await expect(page.getByText('Loaded').first()).toBeVisible();
  await page.getByLabel('Merchant staff token').fill(tokens.hot);
  await expect(page.getByText('No orders yet tonight.')).toBeVisible({timeout: 20000});
  expect(browserErrors, 'Browser runtime errors').toEqual([]);
});
