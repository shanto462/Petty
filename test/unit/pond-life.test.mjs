import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadScripts } from './helpers.mjs';

/** Records what pond life asks of EphemeralEntity, without a DOM. */
class FakeEntity {
  constructor(type, config) {
    this.type = type;
    this.position = { ...config.position };
    this.size = config.size;
    this.zIndex = config.zIndex;
    this.img = { style: {}, src: config.imagePath };
    this.isAlive = true;
  }

  remove() {
    this.isAlive = false;
  }
}

const ctx = loadScripts(['shared/config.js', 'shared/logger.js', 'content/pond-life.js'], {
  window: true,
  EphemeralEntity: FakeEntity,
  Image: class {},
  chrome: { runtime: { getURL: (path) => path } },
});
const { PondLife, PettyConfig } = ctx;
const { POND_LIFE } = PettyConfig;

function rollDice(...values) {
  ctx.__rolls = values;
  vm.runInContext('Math.random = () => (__rolls.length > 1 ? __rolls.shift() : __rolls[0])', ctx);
}

function makeWorld({ mermaid = false } = {}) {
  const manager = { pets: [], added: [], addEphemeralEntity: (entity) => manager.added.push(entity) };
  const pond = {
    speciesId: 'pond_test',
    speciesData: {
      speed: 0,
      water: { x: 0.5, y: 0.8, rx: 0.36, ry: 0.15 },
      fishJumps: 'koi',
      ...(mermaid && { mermaid: { x: 0.6, y: 0.8 } }),
    },
    element: {},
    petManager: manager,
    position: { x: 200, y: 600 },
    currentSize: { width: 360, height: 100 },
    isDragging: false,
  };
  manager.pets.push(pond);
  const life = new PondLife(pond);
  return { manager, pond, life };
}

const fishIn = (manager) => manager.added.filter((e) => e.type === 'fish');
const surface = 600 + 0.8 * 100;
const [waterLeft, waterRight] = [200 + 180 - 0.36 * 360, 200 + 180 + 0.36 * 360];

test('a fish leaps out of the water in an arc and lands back in it', () => {
  const { manager, life } = makeWorld();
  rollDice(0.5);
  life.leap(1000, 'large');
  const [fish] = fishIn(manager);
  const jump = life.jumps[0];
  const center = (e) => ({ x: e.position.x + e.size / 2, y: e.position.y + e.size / 2 });

  assert.equal(center(fish).y, surface, 'it starts at the water surface');
  let highest = surface;
  const frames = [];
  for (let t = 1000; t < 1000 + jump.duration; t += 16) {
    life.update(t);
    if (!fish.isAlive) break;
    highest = Math.min(highest, center(fish).y);
    frames.push(fish.img.src);
  }
  assert.ok(highest < surface - 30, 'it leaps well above the water');
  life.update(1000 + jump.duration + 1);
  assert.equal(fish.isAlive, false, 'and is gone once it is back in');
  const landing = jump.from.x + jump.span;
  assert.ok(landing > waterLeft && landing < waterRight, 'it lands in the water, not on the bank');
  assert.match(frames[0], /effect_fish_koi_large-\d+\.png$/);
  assert.ok(frames.at(0) < frames.at(-1), 'the nose turns from up to down along the arc');
  assert.equal(
    manager.added.filter((e) => e.type === 'splash').length,
    2,
    'a splash where it leaves and where it lands',
  );
});

test('a fish leaping near the bank turns toward the middle of the pond', () => {
  const { life } = makeWorld();
  for (const roll of [0.01, 0.99]) {
    rollDice(roll);
    life.leap(0, 'large');
    const jump = life.jumps.at(-1);
    const landing = jump.from.x + jump.span;
    assert.ok(landing > waterLeft && landing < waterRight);
  }
});

test('fish going left are mirrored', () => {
  const { manager, life } = makeWorld();
  rollDice(0.5, 0.2); // Middle of the pond, heading left
  life.leap(0, 'small');
  assert.ok(life.jumps[0].span < 0);
  assert.equal(fishIn(manager)[0].img.style.transform, 'scaleX(-1)');
});

test('fish leap now and then, sometimes a few in a row', () => {
  const { manager, life } = makeWorld();
  rollDice(0); // Shortest wait, smallest fish, and always a school
  life.update(1);
  life.update(1 + POND_LIFE.JUMP_MIN);
  life.update(1 + POND_LIFE.JUMP_MIN + POND_LIFE.SCHOOL_GAP * 2);
  assert.ok(fishIn(manager).length >= 2);
});

test('the mermaid comes up when nobody is around, and dives when a bird comes close', () => {
  const { manager, pond, life } = makeWorld({ mermaid: true });
  life.update(0);
  life.update(POND_LIFE.MERMAID.quiet - 1);
  assert.equal(life.mermaid, null, 'not before it has been quiet for a while');
  life.update(POND_LIFE.MERMAID.quiet + 1);
  assert.equal(life.mermaid.state, 'rise');
  const entity = life.mermaid.entity;
  const seat = { x: pond.position.x + 0.6 * 360, y: pond.position.y + 0.8 * 100 };
  const [hx, hy] = POND_LIFE.MERMAID.hips;
  assert.deepEqual({ ...entity.position }, { x: seat.x - hx * 1.5, y: seat.y - hy * 1.5 }, 'she sits on her rock');

  const riseEnd = POND_LIFE.MERMAID.quiet + 1 + (POND_LIFE.MERMAID.frames.rise / POND_LIFE.MERMAID.fps) * 1000;
  life.update(riseEnd + 10);
  assert.equal(life.mermaid.state, 'brush');
  assert.match(entity.img.src, /effect_mermaid_brush-\d+\.png$/);

  // A bird lands nearby
  manager.pets.push({ speciesData: { speed: 0.7 }, position: { x: seat.x - 40, y: seat.y - 60 }, currentSize: null });
  life.update(riseEnd + 20);
  assert.equal(life.mermaid.state, 'dive');
  life.update(riseEnd + 20 + 2000);
  assert.equal(life.mermaid, null);
  assert.equal(entity.isAlive, false, 'gone under the water');

  // The bird leaves: she waits out her cooldown and the quiet time before coming up again
  manager.pets.pop();
  const after = riseEnd + 2020;
  life.update(after + 100);
  life.update(after + POND_LIFE.MERMAID.quiet + 200);
  assert.equal(life.mermaid, null, 'still in her cooldown');
  life.update(after + POND_LIFE.MERMAID.cooldown + POND_LIFE.MERMAID.quiet + 500);
  assert.equal(life.mermaid?.state, 'rise', 'and then she comes back up');
});

test('the mermaid never comes up while a bird is near', () => {
  const { manager, pond, life } = makeWorld({ mermaid: true });
  const seat = { x: pond.position.x + 0.6 * 360, y: pond.position.y + 0.8 * 100 };
  manager.pets.push({ speciesData: { speed: 2 }, position: { x: seat.x, y: seat.y - 100 }, currentSize: null });
  for (let t = 0; t < 60000; t += 500) life.update(t);
  assert.equal(life.mermaid, null);
});

test('trees and ponds nearby do not scare her', () => {
  const { manager, pond, life } = makeWorld({ mermaid: true });
  manager.pets.push({ speciesData: { speed: 0 }, position: { ...pond.position }, currentSize: null });
  life.update(0);
  life.update(POND_LIFE.MERMAID.quiet + 1);
  assert.equal(life.mermaid?.state, 'rise');
});

test('picking the pond up sends the mermaid away; removing it clears everything', () => {
  const { pond, life } = makeWorld({ mermaid: true });
  life.update(0);
  life.update(POND_LIFE.MERMAID.quiet + 1);
  const { entity } = life.mermaid;
  pond.isDragging = true;
  life.update(POND_LIFE.MERMAID.quiet + 50);
  assert.equal(entity.isAlive, false);

  pond.isDragging = false;
  rollDice(0.5);
  life.leap(0, 'medium');
  const fish = life.jumps[0].entity;
  life.destroy();
  assert.equal(fish.isAlive, false);
});

test('a pond without a mermaid never shows one', () => {
  const { life } = makeWorld();
  for (let t = 0; t < 60000; t += 1000) life.update(t);
  assert.equal(life.mermaid, null);
});
