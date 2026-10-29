import {defineConfig} from '@playwright/test';

// Demo and real modes are mutually exclusive selections. Default runs only
// the demo journeys against the local demo stack. HX_E2E_REAL=1 runs only
// real-signin.spec.mjs, which signs up a throwaway account on the live
// Supabase project and needs STUDENT_URL pointed at a real-mode web bundle.
const realMode = process.env.HX_E2E_REAL === '1';

export default defineConfig({
  testDir: './specs',
  testIgnore: realMode ? ['**/delivery.spec.mjs'] : ['**/real-signin.spec.mjs'],
  timeout: 90000,
  expect: {timeout: 15000},
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: '../../.tools/e2e-results',
  use: {
    baseURL: process.env.STUDENT_URL || 'http://localhost:8081',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {name: 'desktop', use: {viewport: {width: 1440, height: 1000}}},
    {name: 'tablet', use: {viewport: {width: 820, height: 1180}, hasTouch: true}},
    {name: 'mobile', use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1}},
  ],
});
