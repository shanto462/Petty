// Playwright fixtures that launch Chromium with the built extension loaded.

import { test as base, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const EXTENSION_PATH = path.join(ROOT, 'dist', 'petty');
const DEMO_PAGE = path.join(import.meta.dirname, 'fixtures', 'demo.html');

/** Serves the demo page over http (content scripts do not run on file:// by default). */
export async function startDemoServer() {
  const html = await readFile(DEMO_PAGE);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections(); // The browser keeps idle keep-alive sockets open
      }),
  };
}

/** Launches Chromium with the extension and returns the context plus extension id. */
export async function launchWithExtension(options = {}) {
  if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error('dist/petty not found. Run `npm run build` first.');
  }
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // New headless mode, which supports extensions
    ignoreDefaultArgs: ['--hide-scrollbars'], // Render scrollbars like a real browser
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    ...options,
  });
  // Listen before checking, so a worker that starts in between is not missed
  const started = context.waitForEvent('serviceworker', { timeout: 20_000 }).catch(() => null);
  const worker = context.serviceWorkers()[0] ?? (await started) ?? context.serviceWorkers()[0];
  if (!worker) throw new Error('The extension service worker did not start');
  const extensionId = new URL(worker.url()).host;
  return { context, extensionId, worker };
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  demo: async ({}, use) => {
    const server = await startDemoServer();
    await use(server);
    await server.close();
  },
  // eslint-disable-next-line no-empty-pattern
  extension: async ({}, use) => {
    const launched = await launchWithExtension();
    await use(launched);
    await launched.context.close();
  },
  popup: async ({ extension }, use) => {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/popup/popup.html`);
    await page.locator('body[data-ready]').waitFor(); // Species and pets are loaded
    await use(page);
  },
});

export { expect } from '@playwright/test';
