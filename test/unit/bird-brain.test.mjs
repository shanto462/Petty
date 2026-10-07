import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadScripts } from './helpers.mjs';

const VIEWPORT = { innerWidth: 1000, innerHeight: 600 };
const ctx = loadScripts(['shared/config.js', 'shared/logger.js', 'content/bird-brain.js'], {
  window: true,
  ...VIEWPORT,
});
const { BirdBrain, PettyConfig } = ctx;
const { BIRDS } = PettyConfig;
const SIZE = 75;

/** Makes Math.random inside the extension code return the given values in turn. */
function rollDice(...values) {
  ctx.__rolls = values;
  vm.runInContext('Math.random = () => (__rolls.length > 1 ? __rolls.shift() : __rolls[0])', ctx);
}

function makeWorld() {
  const manager = { pets: [] };
  return manager;
}

function addTree(manager, x, perches = [{ x: 0.2, y: 0.6 }]) {
  const tree = {
    id: `tree-${manager.pets.length}`,
    element: {},
    position: { x, y: VIEWPORT.innerHeight - 225 },
    currentSize: { width: 150, height: 225 },
    speciesData: { perches },
    isDragging: false,
    hasCapability: (c) => c === 'PerchingPlace',
  };
  manager.pets.push(tree);
  return tree;
}

function addPond(manager, x) {
  const pond = {
    id: `pond-${manager.pets.length}`,
    element: {},
    position: { x, y: VIEWPORT.innerHeight - 75 },
    currentSize: { width: 225, height: 75 },
    speciesData: { water: { x: 0.5, y: 0.5, rx: 0, ry: 0.2 } },
    isDragging: false,
    hasCapability: (c) => c === 'FishingSpot',
  };
  manager.pets.push(pond);
  return pond;
}

function addBird(manager, capabilities = ['Flying']) {
  const bird = {
    id: `bird-${manager.pets.length}`,
    speciesId: 'test_bird',
    element: {},
    petManager: manager,
    position: { x: 100, y: 100 },
    direction: 1,
    currentSize: { width: SIZE, height: SIZE },
    movementPath: 'walk',
    currentAnimation: null,
    isDragging: false,
    animator: { hasAnimation: () => true },
    hasCapability: (c) => capabilities.includes(c),
    setAnimation(id) {
      this.currentAnimation = id;
    },
  };
  bird.brain = new BirdBrain(bird);
  manager.pets.push(bird);
  return bird;
}

/** Moves the bird onto its flight target, as the physics would, and lets the brain react. */
function arrive(bird) {
  bird.position = { ...bird.flightTarget };
  bird.brain.update();
}

test('a bird flies to a perch so its feet stand on the branch', () => {
  const manager = makeWorld();
  const tree = addTree(manager, 300);
  const bird = addBird(manager);
  bird.brain.goToPerch(bird.brain.findFreePerch());

  assert.equal(bird.brain.state, 'toPerch');
  assert.equal(bird.isAirborne, true);
  assert.deepEqual(
    { ...bird.flightTarget },
    {
      x: tree.position.x + 0.2 * 150 - SIZE * BIRDS.FEET.x,
      y: tree.position.y + 0.6 * 225 - SIZE * BIRDS.FEET.y,
    },
  );

  arrive(bird);
  assert.equal(bird.brain.state, 'perched');
  assert.equal(bird.isPerched, true);
  assert.equal(bird.isAirborne, false);
  assert.equal(bird.currentAnimation, 'front');
});

test('two birds never share a perch', () => {
  const manager = makeWorld();
  addTree(manager, 300);
  const first = addBird(manager);
  const second = addBird(manager);
  first.brain.goToPerch(first.brain.findFreePerch());
  assert.equal(second.brain.findFreePerch(), null);
});

test('a perched bird flies off when its tree is removed', () => {
  const manager = makeWorld();
  addTree(manager, 300);
  const bird = addBird(manager);
  bird.brain.goToPerch(bird.brain.findFreePerch());
  arrive(bird);

  manager.pets.shift(); // The tree
  bird.brain.update();
  assert.equal(bird.brain.state, 'cruise');
  assert.equal(bird.isPerched, false);
  assert.equal(bird.isAirborne, true);
  assert.equal(bird.currentAnimation, 'fly');
});

test('a perched bird follows its tree, and takes off when the tree is picked up', () => {
  const manager = makeWorld();
  const tree = addTree(manager, 300);
  const bird = addBird(manager);
  bird.brain.goToPerch(bird.brain.findFreePerch());
  arrive(bird);

  tree.position.y -= 20; // The window got shorter
  bird.brain.update();
  assert.equal(bird.position.y, tree.position.y + 0.6 * 225 - SIZE * BIRDS.FEET.y);

  tree.isDragging = true;
  bird.brain.update();
  assert.equal(bird.brain.state, 'cruise');
});

test('without trees or ponds a bird only flies or lands on the ground', () => {
  const manager = makeWorld();
  const bird = addBird(manager, ['Flying', 'FishesInPonds']);
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    rollDice(roll);
    bird.brain.decide();
    assert.ok(['toGround', 'cruise'].includes(bird.brain.state), `got ${bird.brain.state}`);
  }
});

test('songbirds never go fishing', () => {
  const manager = makeWorld();
  addPond(manager, 300);
  const bird = addBird(manager);
  for (const roll of [0, 0.5, 0.99]) {
    rollDice(roll);
    bird.brain.decide();
    assert.notEqual(bird.brain.state, 'toPond');
  }
});

test('a landing bird hops on the ground and pecks', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  bird.brain.goToGround();
  assert.equal(bird.flightTarget.y, VIEWPORT.innerHeight - SIZE);

  arrive(bird);
  assert.equal(bird.brain.state, 'grounded');
  assert.equal(bird.isAirborne, false, 'normal physics takes over on the ground');
  assert.equal(bird.currentAnimation, 'eat');
  bird.brain.onAnimationComplete('eat');
  assert.equal(bird.currentAnimation, 'walk');
});

test('a kingfisher hovers over the pond, dives, and eats its catch on a perch', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  addTree(manager, 100);
  const bird = addBird(manager, ['Flying', 'FishesInPonds']);
  rollDice(0); // Pick fishing, aim at the pond center, then catch the fish

  bird.brain.goFishing(pond);
  const surface = { x: pond.position.x + 0.5 * 225, y: pond.position.y + 0.5 * 75 };
  assert.equal(bird.brain.state, 'toPond');
  assert.deepEqual(
    { ...bird.flightTarget },
    {
      x: surface.x - SIZE / 2,
      y: surface.y - SIZE - BIRDS.HOVER_HEIGHT,
    },
  );

  arrive(bird);
  assert.equal(bird.brain.state, 'hover');
  assert.equal(bird.currentAnimation, 'hover');
  assert.deepEqual({ ...bird.flightTarget }, { ...bird.position }, 'it holds still while hovering');

  bird.brain.onAnimationComplete('hover');
  assert.equal(bird.brain.state, 'dive');
  assert.equal(bird.currentAnimation, 'dive');
  assert.equal(bird.flightBoost, BIRDS.DIVE_BOOST);
  assert.equal(bird.flightTarget.y, surface.y - SIZE * BIRDS.WATERLINE, 'the water line meets the surface');

  arrive(bird);
  assert.equal(bird.brain.state, 'splash');
  bird.brain.onAnimationComplete('splash');
  assert.equal(bird.brain.hasFish, true);
  assert.equal(bird.brain.state, 'toPerch');
  assert.equal(bird.currentAnimation, 'fly_fish');

  arrive(bird);
  assert.equal(bird.brain.state, 'perched');
  assert.equal(bird.currentAnimation, 'eat');
  bird.brain.onAnimationComplete('eat');
  assert.equal(bird.brain.hasFish, false);
  assert.equal(bird.currentAnimation, 'front');
});

test('targets past the edge of the window are moved inside it, so the bird still arrives', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  pond.speciesData.water.y = 0.95; // Water so low that the dive would end below the ground line
  addTree(manager, -40); // A tree pushed against the left edge
  const bird = addBird(manager, ['Flying', 'FishesInPonds']);
  rollDice(0);

  bird.brain.goFishing(pond);
  arrive(bird);
  bird.brain.onAnimationComplete('hover');
  assert.equal(bird.flightTarget.y, VIEWPORT.innerHeight - SIZE);
  arrive(bird);
  assert.equal(bird.brain.state, 'splash');

  bird.brain.onAnimationComplete('splash');
  assert.equal(bird.flightTarget.x, 0);
  arrive(bird);
  assert.equal(bird.brain.state, 'perched');
});

test('a kingfisher that misses flies off to try again later', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  const bird = addBird(manager, ['Flying', 'FishesInPonds']);
  rollDice(0.5, 0.99); // Aim, then miss
  bird.brain.goFishing(pond);
  arrive(bird);
  bird.brain.onAnimationComplete('hover');
  arrive(bird);
  bird.brain.onAnimationComplete('splash');
  assert.equal(bird.brain.hasFish, false);
  assert.equal(bird.brain.state, 'cruise');
});

test('a dropped bird flies away instead of falling', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  bird.brain.onDragStart();
  assert.equal(bird.isAirborne, false);
  bird.isDragging = true;
  bird.brain.update(); // Ignored while held
  assert.equal(bird.brain.state, 'dragged');

  bird.isDragging = false;
  bird.brain.onDrop();
  assert.equal(bird.brain.state, 'cruise');
  assert.equal(bird.isAirborne, true);
});

test('after another tab moved it, a bird finds out where it is', () => {
  const manager = makeWorld();
  const tree = addTree(manager, 300);
  const perched = addBird(manager);
  perched.position = {
    x: tree.position.x + 0.2 * 150 - SIZE * BIRDS.FEET.x + 2,
    y: tree.position.y + 0.6 * 225 - SIZE * BIRDS.FEET.y,
  };
  perched.brain.resync('front');
  assert.equal(perched.brain.state, 'perched');
  assert.equal(perched.isPerched, true);

  const walking = addBird(manager);
  walking.position = { x: 600, y: VIEWPORT.innerHeight - SIZE };
  walking.brain.resync('walk');
  assert.equal(walking.brain.state, 'grounded');

  const fresh = addBird(manager); // New pets start in the air with their walk animation
  fresh.brain.resync('walk');
  assert.equal(fresh.brain.state, 'cruise');
  assert.equal(fresh.isAirborne, true);
});
