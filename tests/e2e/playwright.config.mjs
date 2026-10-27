import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './specs',
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
