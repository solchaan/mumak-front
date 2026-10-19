import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4178', headless: true, viewport: { width: 1440, height: 1100 },
    permissions: ['microphone'],
    channel: process.env.PW_CHANNEL,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npm run dev -- --port 4178', url: 'http://127.0.0.1:4178', env: { VITE_API_URL: 'http://127.0.0.1:3018' }, reuseExistingServer: false },
    { command: 'node ../mumak-back/src/server.js', url: 'http://127.0.0.1:3018/api/health', env: { DATA_DIR: resolve('.test-data'), PORT: '3018', ALLOWED_ORIGINS: 'http://127.0.0.1:4178' }, reuseExistingServer: false },
  ],
});
