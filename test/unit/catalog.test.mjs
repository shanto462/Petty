import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CATALOG_FILE, generateCatalogSource } from '../../scripts/lib/catalog.mjs';
import { SHARED, SRC, loadScripts } from './helpers.mjs';

const ctx = loadScripts(SHARED, { chrome: { runtime: { getURL: (p) => p } } });
const { species, frames } = ctx.PettyCatalog;

test('catalog.js is up to date with species/ and the sprite folder', async () => {
  assert.equal(
    readFileSync(CATALOG_FILE, 'utf8'),
    await generateCatalogSource(),
    'Run `npm run generate` and commit the result',
  );
});

test('catalog ships at least one species', () => {
  assert.ok(ctx.SPECIES_LIST.length > 0);
  assert.equal(ctx.PettyConfig.SPECIES.EXPECTED_COUNT, ctx.SPECIES_LIST.length);
});

for (const [id, data] of Object.entries(species)) {
  test(`species "${id}" is valid and has sprites for every animation it uses`, () => {
    const result = ctx.SpeciesValidator.validateSpeciesData(data, id);
    assert.deepEqual([...result.errors], []);

    const required = new Set([data.movementPath, 'front', ...data.animations.map((a) => a.id)]);
    for (const animation of required) {
      assert.ok(frames[id]?.[animation] > 0, `missing sprite frames for ${id}_${animation}-0.png`);
    }
  });
}

test('random event sprites exist', () => {
  const { ASSETS_PATH, EFFECT_SPRITES } = ctx.PettyConfig.SPECIES;
  for (const file of Object.values(EFFECT_SPRITES)) {
    assert.ok(existsSync(path.join(SRC, ASSETS_PATH, file)), `${ASSETS_PATH}${file} is missing`);
  }
});

test('SpeciesManager exposes frame counts and thumbnails from the catalog', async () => {
  const manager = ctx.SpeciesManager.getInstance();
  await manager.loadAllSpecies();
  assert.equal(manager.getFrameCount('cat', 'walk'), frames.cat.walk);
  assert.equal(manager.getFrameCount('cat', 'does-not-exist'), 0);
  assert.equal(manager.getThumbnailUrl('cat'), 'assets/sprites/cat_walk-0.png');
  assert.equal(manager.hasSpecies('toString'), false);
});
