// Captures the README screenshots from the built extension (dist/petty).
// Writes docs/images/demo.png, docs/images/popup.png and, when ffmpeg is installed,
// docs/images/demo.gif and docs/images/birds.gif.
//
// Usage: npm run build && npm run screenshots
//        npm run build && npm run screenshots -- --birds   (only birds.gif)

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

// Birds need a few seconds of flying before they perch or fish, so that part is skipped
const BIRDS = ['tree_oak', 'pond', 'tree_cherry', 'sparrow', 'robin', 'bluebird', 'kingfisher'];
const BIRDS_SECONDS = 38;
const BIRDS_SKIP_SECONDS = 9;
const BIRDS_CLIP = { x: 0, y: 120, width: VIEWPORT.width, height: 600 };

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Opens the popup and clicks a tile for every species. */
async function addPets(context, extensionId, species) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 420, height: 600 }); // The popup's own size
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  for (const id of species) {
    await popup.locator(`.pet-item[data-species="${id}"]`).first().click();
  }
  await popup
    .locator('#total-count')
    .filter({ hasText: String(species.length) })
    .waitFor();
  return popup;
}

/**
 * Takes screenshots for `seconds` (a screenshot sequence is more reliable than video
 * recording in headless mode). Returns the capture rate in frames per second.
 */
async function captureFrames(page, seconds, clip) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'petty-frames-'));
  const started = Date.now();
  let frame = 0;
  while (Date.now() - started < seconds * 1000) {
    const png = await page.screenshot({ clip });
    await writeFile(path.join(dir, `frame-${String(frame++).padStart(4, '0')}.png`), png);
  }
  return { dir, fps: frame / ((Date.now() - started) / 1000) };
}

function writeGif({ dir, fps }, file, { skipSeconds = 0, colors = 96 } = {}) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      fps.toFixed(2),
      '-start_number',
      String(Math.round(skipSeconds * fps)),
      '-i',
      path.join(dir, 'frame-%04d.png'),
      '-vf',
      `fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop',
      '0',
      path.join(OUT, file),
    ],
    { stdio: 'inherit' },
  );
  console.log(`Wrote docs/images/${file}`);
}

/** The popup screenshots, demo.png and demo.gif (with the UFO event). */
async function captureDemo(demo) {
  const { context, extensionId, worker } = await launchWithExtension({ viewport: VIEWPORT });
  let frames = null;
  try {
    const page = await context.newPage();
    await page.goto(demo.url);

    const popup = await addPets(context, extensionId, PETS);
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
      frames = await captureFrames(page, GIF_SECONDS, GIF_CLIP);
    }
  } finally {
    await context.close();
  }
  if (frames) {
    writeGif(frames, 'demo.gif');
    await rm(frames.dir, { recursive: true, force: true });
  }
}

/** birds.gif: birds perching on two trees and a kingfisher fishing in the pond. */
async function captureBirds(demo) {
  const { context, extensionId } = await launchWithExtension({ viewport: VIEWPORT });
  let frames;
  try {
    const page = await context.newPage();
    await page.goto(demo.url);
    const popup = await addPets(context, extensionId, BIRDS);
    // A second kingfisher (its popup tile is already on, so ask the background directly)
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'ADD_PET', species: 'kingfisher' }));
    await popup.close();
    await page.bringToFront();
    await page.waitForTimeout(1500);

    // Spread the scenery along the bottom: oak on the left, pond in the middle, cherry on the right
    for (const [species, x] of [
      ['tree_oak', 180],
      ['pond', 640],
      ['tree_cherry', 1090],
    ]) {
      const box = await page.locator(`.petty-pet[data-species="${species}"]`).first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
    }
    frames = await captureFrames(page, BIRDS_SECONDS, BIRDS_CLIP);
  } finally {
    await context.close();
  }
  writeGif(frames, 'birds.gif', { skipSeconds: BIRDS_SKIP_SECONDS, colors: 128 });
  await rm(frames.dir, { recursive: true, force: true });
}

await mkdir(OUT, { recursive: true });
const demo = await startDemoServer();
try {
  if (!process.argv.includes('--birds')) await captureDemo(demo);
  if (hasFfmpeg) await captureBirds(demo);
  else console.log('ffmpeg not found: skipped docs/images/demo.gif and birds.gif');
} finally {
  await demo.close();
}
