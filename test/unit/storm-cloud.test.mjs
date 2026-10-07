import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './helpers.mjs';

/** Records what the storm cloud asks of EphemeralEntity, without a DOM. */
class FakeEntity {
  constructor(type, config) {
    this.type = type;
    this.config = config;
    this.position = { ...config.position };
    this.img = { style: {}, src: config.imagePath };
    this.isAlive = true;
  }

  remove() {
    this.isAlive = false;
  }
}

const ctx = loadScripts(['shared/config.js', 'shared/logger.js', 'content/storm-cloud.js', 'content/cloud-event.js'], {
  window: true,
  EphemeralEntity: FakeEntity,
  Image: class {},
  chrome: { runtime: { getURL: (path) => `ext/${path}` } },
});
const { StormCloud, CloudEvent, PettyConfig } = ctx;
const { STORM_CLOUD } = PettyConfig;

function makeWorld(pets) {
  const added = [];
  return { pets, added, addEphemeralEntity: (entity) => added.push(entity) };
}

const makePet = (overrides = {}) => ({
  speciesId: 'sparrow',
  speciesData: { speed: 0.7 },
  element: {},
  position: { x: 300, y: 200 },
  currentSize: { width: 75, height: 75 },
  ...overrides,
});

test('a storm cloud hangs just above its pet so the rain falls on it', () => {
  const pet = makePet();
  const cloud = StormCloud.follow(pet, makeWorld([pet]));
  assert.equal(cloud.type, 'storm');
  assert.equal(cloud.position.x + STORM_CLOUD.WIDTH / 2, pet.position.x + 75 / 2, 'centered over the pet');
  assert.ok(cloud.position.y < pet.position.y, 'above it');
  assert.ok(cloud.position.y + STORM_CLOUD.HEIGHT > pet.position.y, 'with the rain reaching down to it');
  assert.equal(cloud.img.style.height, `${STORM_CLOUD.HEIGHT}px`);
});

test('a storm cloud trails its pet and animates through its frames', () => {
  const pet = makePet();
  const cloud = StormCloud.follow(pet, makeWorld([pet]));
  pet.position = { x: 600, y: 200 };
  const start = cloud.position.x;
  cloud.onUpdate(cloud, 0);
  assert.ok(
    cloud.position.x > start && cloud.position.x < StormCloud.above(pet).x,
    'it moves toward the pet, a bit behind',
  );

  cloud.onUpdate(cloud, 1000 / STORM_CLOUD.FPS);
  assert.equal(cloud.img.src, `ext/assets/sprites/${STORM_CLOUD.SPRITE}-1.png`);
});

test('a storm cloud goes away with its pet', () => {
  const pet = makePet();
  const world = makeWorld([pet]);
  const cloud = StormCloud.follow(pet, world);
  world.pets = [];
  cloud.onUpdate(cloud, 0);
  assert.equal(cloud.isAlive, false);
});

test('the storm cloud event picks a pet that moves and lasts a limited time', () => {
  const tree = makePet({ speciesId: 'tree_oak', speciesData: { speed: 0 } });
  const stormyHeron = makePet({ speciesId: 'heron', brain: { stormCloud: {} } });
  const sparrow = makePet();
  const world = makeWorld([tree, stormyHeron, sparrow]);
  for (let i = 0; i < 5; i++) {
    const cloud = CloudEvent.trigger(world);
    assert.equal(
      cloud.config.position.x,
      StormCloud.above(sparrow).x,
      'never the tree, nor a heron already in a storm',
    );
    assert.ok(cloud.config.lifetime >= STORM_CLOUD.EVENT_MIN && cloud.config.lifetime <= STORM_CLOUD.EVENT_MAX);
    assert.equal(cloud.config.autoRemove, true);
  }
  assert.equal(CloudEvent.trigger(makeWorld([tree])), null, 'no pet that moves: no cloud');
});
