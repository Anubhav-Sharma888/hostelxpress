// Compose side-by-side Stitch|app sheets from the 18 Nov captures.
//   node compose-sheets-nov18.mjs <rawDir> <outDir>
import {chromium} from 'playwright';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const RAW = resolve(process.argv[2] || '../../.tools/captures-nov18/raw');
const OUT = resolve(process.argv[3] || '../../.tools/captures-nov18/sheets');
await mkdir(OUT, {recursive: true});

const pairs = [
  ['home-idle', 'Stitch Home / Active Orders', 'ref-home.png', 'demo-home-idle.png'],
  ['booking-top', 'Stitch Book Gate 2 Delivery', 'ref-booking.png', 'demo-booking-form.png'],
  ['tracking', 'Stitch Live Rover Tracking', 'ref-tracking.png', 'qa-tracking-transit.png'],
  ['pickup-arrived', 'Stitch Pickup · Pay Due stage', 'ref-pickup.png', 'demo-pickup-arrived.png'],
  ['arrival-waiting', 'Nov 12 export arrival ref (older lime language) · Waiting for unlock', 'ref-arrival-waiting.png', 'qa-pickup-waiting.png'],
  ['arrival-ready', 'Nov 12 export arrival refs (older lime language) · Ready to collect', 'ref-arrival-ready.png', 'qa-pickup-ready.png'],
  ['arrival-done', 'Nov 12 export success ref (older lime language) · Completed', 'ref-arrival-done.png', 'qa-pickup-done.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 830, height: 900}});
for (const [name, caption, ref, app] of pairs) {
  const [refB64, appB64] = await Promise.all([
    readFile(`${RAW}/${ref}`).then(b => b.toString('base64')),
    readFile(`${RAW}/${app}`).then(b => b.toString('base64')),
  ]);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#e8ebf5;font-family:sans-serif">
  <div style="padding:10px;font-size:13px;color:#0B1C30">${name}: ${caption}</div>
  <div style="display:flex;gap:8px;padding:0 10px 10px;align-items:flex-start">
    <img src="data:image/png;base64,${refB64}" style="width:390px">
    <img src="data:image/png;base64,${appB64}" style="width:390px">
  </div></body></html>`, {waitUntil: 'load'});
  await page.screenshot({path: `${OUT}/compare-${name}.png`, fullPage: true});
  console.log('sheet compare-' + name);
}
await browser.close();
