import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const database = join(mkdtempSync(join(tmpdir(), 'cinema-e2e-')), 'cinema.sqlite');

export default defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: false,
    env: { DATABASE_PATH: database, HOST: '127.0.0.1', PORT: '3000' },
    timeout: 120000,
  },
});
