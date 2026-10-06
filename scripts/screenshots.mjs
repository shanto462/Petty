// Captures the README screenshots from the built extension (dist/petty).
// Writes docs/images/demo.png, docs/images/popup.png and, when ffmpeg is installed,
// docs/images/demo.gif.
//
// Usage: npm run build && npm run screenshots

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchWithExtension, startDemoServer } from '../test/e2e/fixtures.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'images');
const VIEWPORT = { width: 1280, height: 720 };
const PETS = ['cat', 'trex_blue', 'frog', 'panda', 'sheep', 'crow', 'gazebo', 'koala'];
const GIF_SECONDS = 10;
// The lower part of the page, where pets walk and the UFO swoops in
const GIF_CLIP = { x: 0, y: 220, width: VIEWPORT.width, height: 500 };

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

await mkdir(OUT, { recursive: true });
const framesDir = await mkdtemp(path.join(os.tmpdir(), 'petty-frames-'));
const demo = await startDemoServer();
const { context, extensionId, worker } = await launchWithExtension({ viewport: VIEWPORT });

let gifFps = 0;
try {
  const page = await context.newPage();
  await page.goto(demo.url);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 420, height: 600 }); // The popup's own size
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  for (const species of PETS) {
    await popup.locator(`.pet-item[data-species="${species}"]`).first().click();
  }
  await popup
    .locator('#total-count')
    .filter({ hasText: String(PETS.length) })
    .waitFor();
  // Reset scroll and hover from the clicks, then let transitions finish
  await popup.mouse.move(0, 0);
  await popup.locator('#species-grid').evaluate((grid) => grid.scrollTo(0, 0));
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: path.join(OUT, 'popup.png') });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: path.join(OUT, 'popup-dark.png') });
  console.log('Wrote docs/images/popup.png and popup-dark.png');
  await popup.close();

  await page.bringToFront();
  await page.waitForTimeout(5000); // Let the pets land and start walking
  await page.screenshot({ path: path.join(OUT, 'demo.png') });
  console.log('Wrote docs/images/demo.png');

  if (hasFfmpeg) {
    // Trigger the UFO random event so the GIF shows something happening
    await worker.evaluate(async () => {
      for (const tab of await chrome.tabs.query({})) {
        chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_UFO_ABDUCTION' }).catch(() => {});
      }
    });

    // A screenshot sequence is more reliable than video recording in headless mode
    const started = Date.now();
    let frame = 0;
    while (Date.now() - started < GIF_SECONDS * 1000) {
      const png = await page.screenshot({ clip: GIF_CLIP });
      await writeFile(path.join(framesDir, `frame-${String(frame++).padStart(4, '0')}.png`), png);
    }
    gifFps = frame / ((Date.now() - started) / 1000);
  }
} finally {
  await context.close(); // Flushes the video to disk
  await demo.close();
}

if (gifFps > 0) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      gifFps.toFixed(2),
      '-i',
      path.join(framesDir, 'frame-%04d.png'),
      '-vf',
      'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
      '-loop',
      '0',
      path.join(OUT, 'demo.gif'),
    ],
    { stdio: 'inherit' },
  );
  console.log('Wrote docs/images/demo.gif');
} else {
  console.log('ffmpeg not found: skipped docs/images/demo.gif');
}

await rm(framesDir, { recursive: true, force: true });
