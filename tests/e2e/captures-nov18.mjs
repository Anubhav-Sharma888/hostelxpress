// Overnight 18 Nov paired captures: web captures of the four Stitch screens
// plus the pickup states. Not a Playwright test; run manually:
//   node captures-nov18.mjs <baseURL> demo|qa
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const OUT = '../../.tools/captures-nov18/raw';
const base = process.argv[2] || 'http://localhost:8081';
const mode = process.argv[3] || 'demo';
await mkdir(OUT, {recursive: true});

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight + 20) element.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });
  await page.screenshot({path: `${OUT}/${mode}-${name}.png`, fullPage: true});
  console.log(`captured ${mode}-${name}`);
};
const expectName = async name => {
  await page.waitForFunction(
    label => document.body.innerText.includes(label), name, {timeout: 15000});
};

await page.goto(base + '/');
if (mode === 'demo') {
  await page.getByTestId('name-input').fill('Preview Student');
  await page.getByTestId('sign-in-submit').click();
} else {
  await page.getByTestId('qa-skip-sign-in').click();
}
await page.getByTestId('booking-open').first().waitFor({state: 'visible', timeout: 20000});
await page.waitForTimeout(400);
await shot('home-idle');

if (mode === 'demo') {
  await page.getByTestId('booking-open').first().click();
  await page.getByTestId('room-input').fill('Room 304, Wing A');
  await page.getByTestId('booking-label').fill('Lunch from Gate 2');
  await page.waitForTimeout(400);
  await shot('booking-form');
  await page.getByTestId('booking-submit').click();
  await expectName('Rover Live Tracking');
  await page.getByTestId('demo-next-action').waitFor({state: 'visible', timeout: 15000});
  await page.getByTestId('demo-next-action').click();
  await page.getByTestId('demo-next-action').click();
  await expectName('ROVER EN ROUTE TO');
  await page.waitForTimeout(400);
  await shot('tracking-transit');
  await page.getByTestId('demo-next-action').click();
  await page.getByTestId('payment-create').waitFor({state: 'visible', timeout: 15000});
  await page.getByTestId('payment-create').click();
  await page.waitForTimeout(600);
  await shot('pickup-arrived');
  await page.getByTestId('demo-next-action').click();
  await expectName('Simulate collection');
  await page.waitForTimeout(400);
  await shot('pickup-paid');
  await page.getByTestId('demo-next-action').click();
  await expectName('Delivery Complete');
  await page.waitForTimeout(400);
  await shot('pickup-done');
} else {
  // QA preview: sample Transit order drives tracking; preview buttons cover the pickup states.
  await page.getByRole('button', {name: 'Open active delivery'}).first().click();
  await expectName('ROVER EN ROUTE TO');
  await page.waitForTimeout(400);
  await shot('tracking-transit');
  for (const [stage, name, marker] of [
    [0, 'pickup-arrived', 'Awaiting payment'],
    [1, 'pickup-waiting', 'Waiting for Unlock'],
    [2, 'pickup-ready', 'Ready to Collect'],
    [3, 'pickup-done', 'Delivery Complete'],
  ]) {
    await page.getByRole('button', {name: 'Toggle offline sample states'}).click();
    await page.getByTestId('qa-pickup-' + stage).click();
    await expectName(marker);
    await page.waitForTimeout(400);
    await shot(name);
  }
}
if (errors.length) {
  console.error('BROWSER_ERRORS: ' + JSON.stringify(errors));
  process.exitCode = 1;
}
await browser.close();
