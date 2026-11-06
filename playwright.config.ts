import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  outputDir: 'test-results/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4319',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 960 } } },
  ],
  webServer: {
    command: 'BOARD_DATA_DIR=test-results/e2e-data BOARD_SEED=0 PORT=4319 npm start',
    url: 'http://127.0.0.1:4319/api/bootstrap',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
