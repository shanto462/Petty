import { expect, test } from './fixtures.mjs';

/** Collects console errors and failed requests so tests can assert the page stays clean. */
function watchForErrors(page) {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(`${request.failure()?.errorText} ${request.url()}`));
  return errors;
}

// A species with several tags has a tile in each of its categories
const tile = (popup, species) => popup.locator(`.pet-item[data-species="${species}"]`).first();

async function addPet(popup, species) {
  await tile(popup, species).click();
  await expect(tile(popup, species)).toHaveAttribute('aria-pressed', 'true');
}

/** Unique species ids among the visible tiles */
const visibleSpecies = (popup) =>
  popup
    .locator('.pet-item:visible')
    .evaluateAll((items) => [...new Set(items.map((item) => item.dataset.species))].sort());

test('popup lists every species once', async ({ popup }) => {
  const errors = watchForErrors(popup);
  const expected = await popup.evaluate(() => window.SPECIES_LIST.length);
  expect(expected).toBeGreaterThan(0);
  await expect(popup.locator('.pet-item')).toHaveCount(expected);
  await expect(popup.locator('#species-count')).toHaveText(String(expected));
  await expect(popup.locator('#shown-count')).toHaveText(String(expected));
  await expect(popup.locator('.pet-item img').first()).toHaveJSProperty('complete', true);
  expect(errors).toEqual([]);
});

test('a pet added from the popup moves on an open web page', async ({ extension, popup, demo }) => {
  const page = await extension.context.newPage();
  const errors = watchForErrors(page);
  await page.goto(demo.url);

  await addPet(popup, 'sparrow');
  await expect(popup.locator('#total-count')).toHaveText('1');

  const pet = page.locator('.petty-pet[data-species="sparrow"]');
  await expect(pet).toBeVisible();
  await expect(pet.locator('img')).toHaveAttribute('src', /assets\/sprites\/sparrow_[a-z]+-\d+\.png$/);

  // Physics in the tab drives the pet: it flies off
  const start = await pet.boundingBox();
  await page.waitForTimeout(1500);
  const later = await pet.boundingBox();
  expect(later.y !== start.y || later.x !== start.x).toBe(true);

  // Only real frames are requested: no 404 probing, no errors in the host page
  expect(errors).toEqual([]);
});

test('pets already exist in a tab opened later', async ({ extension, popup, demo }) => {
  await addPet(popup, 'robin');
  const page = await extension.context.newPage();
  await page.goto(demo.url);
  await expect(page.locator('.petty-pet[data-species="robin"]')).toBeVisible();
});

test('pets can be dragged', async ({ extension, popup, demo }) => {
  await addPet(popup, 'tree_oak'); // Stationary scenery: easy to grab
  const page = await extension.context.newPage();
  await page.goto(demo.url);

  const pet = page.locator('.petty-pet[data-species="tree_oak"]');
  await expect(pet).toBeVisible();
  await page.waitForTimeout(500);
  const box = await pet.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y - 150, { steps: 8 });
  await expect(pet).toHaveClass(/dragging/);
  const dragged = await pet.boundingBox();
  expect(dragged.x).toBeLessThan(box.x - 100);
  await page.mouse.up();
  await expect(pet).not.toHaveClass(/dragging/);
});

test('birds fly instead of falling, and trees stand on the ground', async ({ extension, popup, demo }) => {
  await addPet(popup, 'tree_oak');
  await addPet(popup, 'sparrow');
  const page = await extension.context.newPage();
  const errors = watchForErrors(page);
  await page.goto(demo.url);

  const tree = page.locator('.petty-pet[data-species="tree_oak"]');
  const bird = page.locator('.petty-pet[data-species="sparrow"]');
  await expect(bird.locator('img')).toHaveAttribute('src', /sparrow_fly-\d+\.png$/);
  await page.waitForTimeout(1500);

  const { height } = page.viewportSize();
  const treeBox = await tree.boundingBox();
  expect(Math.round(treeBox.y + treeBox.height)).toBe(height);
  expect(treeBox.height).toBeGreaterThan(200); // Drawn at its own size, taller than a pet
  // Birds cruise for several seconds before they land anywhere
  const birdBox = await bird.boundingBox();
  expect(birdBox.y + birdBox.height).toBeLessThan(height - 50);

  // The heron is a big bird: drawn at twice the size of a pet
  await addPet(popup, 'heron');
  const heron = page.locator('.petty-pet[data-species="heron"]');
  await expect(heron.locator('img')).toHaveAttribute('src', /heron_fly-\d+\.png$/);
  await expect.poll(async () => Math.round((await heron.boundingBox()).width)).toBe(150);
  expect(errors).toEqual([]);
});

test('the storm cloud random event follows a pet with our own animated cloud', async ({ extension, popup, demo }) => {
  await addPet(popup, 'sparrow');
  const page = await extension.context.newPage();
  const errors = watchForErrors(page);
  await page.goto(demo.url);
  await expect(page.locator('.petty-pet[data-species="sparrow"]')).toBeVisible();

  await extension.worker.evaluate(async () => {
    for (const tab of await chrome.tabs.query({})) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_CLOUD_EVENT' }).catch(() => {});
    }
  });
  const cloud = page.locator('.petty-ephemeral[data-entity-type="storm"] img');
  await expect(cloud).toHaveAttribute('src', /assets\/sprites\/effect_storm-\d+\.png$/);
  const first = await cloud.getAttribute('src');
  await expect.poll(() => cloud.getAttribute('src')).not.toBe(first); // It rains: the frames change
  expect(errors).toEqual([]);
});

test('remove all clears pets from every tab', async ({ extension, popup, demo }) => {
  await addPet(popup, 'sparrow');
  await addPet(popup, 'robin');
  const page = await extension.context.newPage();
  await page.goto(demo.url);
  await expect(page.locator('.petty-pet')).toHaveCount(2);

  // First click asks for confirmation, second click clears
  await popup.locator('#remove-all').click();
  await expect(popup.locator('#remove-all')).toHaveText('Click again to clear');
  await expect(page.locator('.petty-pet')).toHaveCount(2);
  await popup.locator('#remove-all').click();

  await expect(popup.locator('#total-count')).toHaveText('0');
  await expect(page.locator('.petty-pet')).toHaveCount(0);
});

test('pet tiles work from the keyboard', async ({ popup }) => {
  const bluebird = tile(popup, 'bluebird');
  await bluebird.focus();
  await popup.keyboard.press('Enter');
  await expect(bluebird).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator('.active-pet-badge')).toHaveCount(1);
});

test('search and tag filters narrow the list', async ({ popup }) => {
  await popup.locator('#search').fill('tree');
  await expect.poll(() => visibleSpecies(popup)).toEqual(['tree_cherry', 'tree_oak']);
  await expect(popup.locator('#shown-count')).toHaveText('2');

  await popup.locator('#search').fill('');
  await popup.locator('.tag-filter-btn[data-tag="birds"]').click();
  await expect.poll(async () => (await visibleSpecies(popup)).length).toBe(5);
  await expect(popup.locator('#shown-count')).toHaveText('5');

  // Category and search combine
  await popup.locator('#search').fill('fisher');
  await expect.poll(() => visibleSpecies(popup)).toEqual(['kingfisher']);

  await popup.locator('#search').fill('zzz');
  await expect(popup.locator('#empty-results')).toBeVisible();
});

test('reloading the extension clears frozen pets from tabs that were already open', async ({
  extension,
  popup,
  demo,
}) => {
  await addPet(popup, 'sparrow');
  const page = await extension.context.newPage();
  await page.goto(demo.url);
  await expect(page.locator('.petty-pet')).toHaveCount(1);

  const errors = watchForErrors(page);

  // Same thing Chrome does on a Web Store auto-update
  await extension.worker.evaluate(() => chrome.runtime.reload()).catch(() => {});

  await expect(page.locator('.petty-pet')).toHaveCount(0);

  // Switching away and back used to log "Cannot read properties of undefined (reading 'sendMessage')"
  const other = await extension.context.newPage();
  await other.bringToFront();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

/** Average horizontal speed of the first pet on the page, in px/s */
async function measureSpeed(page, seconds) {
  const pet = page.locator('.petty-pet').first();
  let travel = 0;
  let last = (await pet.boundingBox()).x;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await page.waitForTimeout(100);
    const x = (await pet.boundingBox()).x;
    travel += Math.abs(x - last);
    last = x;
  }
  return travel / seconds;
}

test('pets keep full speed when no extension page is open', async ({ extension, popup, demo }) => {
  const page = await extension.context.newPage();
  await page.goto(demo.url);
  await addPet(popup, 'robin');
  await popup.close(); // Chrome lowers the extension's priority once its pages close
  await page.bringToFront();
  await page.waitForTimeout(1500); // Take off and start cruising

  // A cruising robin flies about 145 px/s; the old service-worker loop ran at a fifth of the speed
  expect(await measureSpeed(page, 3)).toBeGreaterThan(100);
});

test('a tab you switch to continues from where the pet was', async ({ extension, popup, demo }) => {
  const first = await extension.context.newPage();
  await first.goto(demo.url);
  await addPet(popup, 'tree_oak'); // Stationary, so its position is easy to compare
  await popup.close();
  await first.bringToFront();

  const pet = first.locator('.petty-pet');
  await expect(pet).toBeVisible();
  await first.waitForTimeout(500);
  const box = await pet.boundingBox();
  await first.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await first.mouse.down();
  await first.mouse.move(200, box.y + box.height / 2, { steps: 5 });
  await first.mouse.up();
  const dropped = await pet.boundingBox();

  const second = await extension.context.newPage();
  await second.goto(demo.url);
  await second.bringToFront();
  const other = second.locator('.petty-pet');
  await expect(other).toBeVisible();
  await expect.poll(async () => Math.round((await other.boundingBox()).x)).toBe(Math.round(dropped.x));
});

test('the theme switch applies and remembers Light, Dark and Auto', async ({ extension, popup }) => {
  const html = popup.locator('html');
  await popup.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');

  await popup.locator('[data-theme-choice="dark"]').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(popup.locator('[data-theme-choice="dark"]')).toHaveAttribute('aria-pressed', 'true');

  // The choice survives closing and reopening the popup
  const reopened = await extension.context.newPage();
  await reopened.emulateMedia({ colorScheme: 'light' });
  await reopened.goto(popup.url());
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Auto follows the system setting
  await reopened.locator('[data-theme-choice="auto"]').click();
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light');
  await reopened.emulateMedia({ colorScheme: 'dark' });
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('horizontal rows show a scrollbar and scroll with a normal mouse wheel', async ({ popup }) => {
  // Fill the "On screen" row so it overflows too
  for (const species of ['sparrow', 'robin', 'bluebird', 'kingfisher', 'heron', 'tree_oak', 'tree_cherry', 'pond']) {
    await addPet(popup, species);
  }

  for (const selector of ['#tag-filters', '#active-pets-list']) {
    const row = popup.locator(selector);
    // A visible horizontal scrollbar takes up height below the content
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await row.evaluate((el) => el.offsetHeight - el.clientHeight)).toBeGreaterThan(0);

    await row.hover();
    await popup.mouse.wheel(0, 400);
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
});
