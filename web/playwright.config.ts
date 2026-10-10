import { defineConfig } from '@playwright/test';

/* Test hồi quy E2E cho game. Server: serve-static phục vụ ../game — chính cây
   file được sync vào APK và OTA (npm run android:sync), nên test chạy đúng
   bản sẽ phát hành. Muốn test bản build mới nhất: npm run test:regression:full. */
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  retries: 0,
  webServer: {
    command: 'node scripts/serve-static.mjs ../game 8917',
    port: 8917,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:8917',
    viewport: { width: 1280, height: 800 },
  },
});
