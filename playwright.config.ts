import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
      args: ['--enable-gpu', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
