import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  CATALOG_FILE,
  DISABLED_SOURCES,
  generateCatalogSource,
  readSpecies,
  shippedSprites,
} from '../../scripts/lib/catalog.mjs';
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

test('species from disabled sources stay out of the catalog', async () => {
  const all = await readSpecies(undefined, { includeDisabled: true });
  const disabled = all.filter((s) => DISABLED_SOURCES.has(s.source));
  assert.ok(disabled.length > 0, 'the Bit Therapy species are still in the repository');
  for (const { id } of disabled) assert.equal(species[id], undefined, `${id} must not be in the catalog`);
  assert.equal(ctx.SPECIES_LIST.length, all.length - disabled.length);
});

test('the build ships only sprites of enabled species and Petty’s own effects', async () => {
  const shipped = await shippedSprites();
  for (const [id, counts] of Object.entries(frames)) {
    for (const [animation, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) assert.ok(shipped.has(`${id}_${animation}-${i}.png`), `${id}_${animation}-${i}`);
    }
  }
  assert.ok(shipped.has('effect_storm-0.png'));
  for (const file of [
    'cat_walk-0.png',
    'cat_black_walk-0.png',
    'ufo_front-0.png',
    'fantozzi_front-0.png',
    'Sprite-0001.png',
  ]) {
    assert.equal(shipped.has(file), false, `${file} must stay out of the build`);
  }
});

test('a random event can only be on when its sprite ships', async () => {
  const shipped = await shippedSprites();
  const { RANDOM_EVENTS, SPECIES } = ctx.PettyConfig;
  const sprites = { UFO_ABDUCTION: SPECIES.EFFECT_SPRITES.UFO, STORM_CLOUD: SPECIES.EFFECT_SPRITES.CLOUD };
  for (const [event, on] of Object.entries(RANDOM_EVENTS)) {
    if (on) assert.ok(shipped.has(sprites[event]), `${event} is on, but ${sprites[event]} is not shipped`);
  }
});

test('every pond has jumping-fish frames, and the oasis mermaid has all of hers', () => {
  const { ASSETS_PATH } = ctx.PettyConfig.SPECIES;
  const { FISH, FISH_ANGLES, SPLASH, MERMAID } = ctx.PettyConfig.POND_LIFE;
  const exists = (name, i) => existsSync(path.join(SRC, ASSETS_PATH, `effect_${name}-${i}.png`));
  const ponds = Object.values(species).filter((s) => s.capabilities.includes('FishingSpot'));
  assert.ok(ponds.length > 0);
  for (const pond of ponds) {
    assert.ok(pond.fishJumps, `${pond.id} needs "fishJumps"`);
    for (const size of Object.keys(FISH)) {
      FISH_ANGLES.forEach((_, i) =>
        assert.ok(exists(`fish_${pond.fishJumps}_${size}`, i), `${pond.id}: ${size} fish ${i}`),
      );
    }
  }
  for (let i = 0; i < SPLASH.frames; i++) assert.ok(exists('splash', i));
  assert.ok(
    ponds.some((p) => p.mermaid),
    'some pond has a mermaid',
  );
  for (const [state, count] of Object.entries(MERMAID.frames)) {
    for (let i = 0; i < count; i++) assert.ok(exists(`mermaid_${state}`, i), `mermaid ${state} ${i}`);
    assert.ok(!exists(`mermaid_${state}`, count), `MERMAID.frames.${state} matches the files`);
  }
});

test('every frame of the storm cloud exists', () => {
  const { ASSETS_PATH } = ctx.PettyConfig.SPECIES;
  const { SPRITE, FRAMES } = ctx.PettyConfig.STORM_CLOUD;
  for (let i = 0; i < FRAMES; i++) {
    const file = path.join(SRC, ASSETS_PATH, `${SPRITE}-${i}.png`);
    assert.ok(existsSync(file), `${ASSETS_PATH}${SPRITE}-${i}.png is missing`);
  }
  assert.ok(!existsSync(path.join(SRC, ASSETS_PATH, `${SPRITE}-${FRAMES}.png`)), 'FRAMES matches the files');
});

test('SpeciesManager exposes frame counts and thumbnails from the catalog', async () => {
  const manager = ctx.SpeciesManager.getInstance();
  await manager.loadAllSpecies();
  assert.equal(manager.getFrameCount('sparrow', 'walk'), frames.sparrow.walk);
  assert.equal(manager.getFrameCount('sparrow', 'does-not-exist'), 0);
  assert.equal(manager.getThumbnailUrl('sparrow'), 'assets/sprites/sparrow_walk-0.png');
  assert.equal(manager.hasSpecies('toString'), false);
});
