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

const SONGBIRD = ['Flying', 'PerchesOnTrees'];
const KINGFISHER = ['Flying', 'PerchesOnTrees', 'FishesInPonds'];
const HERON = ['Flying', 'WadesInPonds', 'FliesInStorms'];

function addBird(manager, capabilities = SONGBIRD, speciesData = {}) {
  const bird = {
    id: `bird-${manager.pets.length}`,
    speciesId: 'test_bird',
    speciesData,
    element: {},
    petManager: manager,
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
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

/** Flies the bird through every leg of its flight, as the physics would, until it arrives. */
function arrive(bird) {
  const state = bird.brain.state;
  for (let leg = 0; leg < 5 && bird.brain.state === state; leg++) {
    bird.position = { ...bird.flightTarget };
    bird.brain.update();
  }
}

test('a bird flies to a perch so its feet stand on the branch', () => {
  const manager = makeWorld();
  const tree = addTree(manager, 300);
  const bird = addBird(manager);
  bird.brain.goToPerch(bird.brain.findFreePerch());

  assert.equal(bird.brain.state, 'toPerch');
  assert.equal(bird.isAirborne, true);
  assert.deepEqual(
    { ...bird.brain.destination },
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

const slope = (from, to) => Math.abs(to.y - from.y) / Math.abs(to.x - from.x);

test('a bird high above its perch flies out level, then glides in instead of dropping', () => {
  const manager = makeWorld();
  addTree(manager, 100);
  const bird = addBird(manager);
  bird.position = { x: 120, y: 50 };
  bird.brain.goToPerch(bird.brain.findFreePerch());
  const { destination } = bird.brain;

  const entry = { ...bird.flightTarget };
  assert.equal(entry.y, 50, 'the first leg is level');
  assert.ok(entry.x > destination.x, 'it lines up on the side it is already on');
  bird.position = entry;
  bird.brain.update();
  assert.deepEqual({ ...bird.flightTarget }, { ...destination }, 'then it heads for the perch');
  assert.ok(slope(entry, destination) <= BIRDS.MAX_DESCENT + 1e-9);
});

test('a bird lines up from the other side when its side of the window is too narrow', () => {
  const manager = makeWorld();
  addTree(manager, 800);
  const bird = addBird(manager);
  bird.position = { x: 850, y: 50 };
  bird.brain.goToPerch(bird.brain.findFreePerch());
  assert.ok(bird.flightTarget.x < bird.brain.destination.x);
  assert.ok(slope(bird.flightTarget, bird.brain.destination) <= BIRDS.MAX_DESCENT + 1e-9);
});

test('a bird lands on the ground far enough ahead to glide straight to it', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  rollDice(0);
  bird.brain.goToGround();
  assert.deepEqual({ ...bird.flightTarget }, { ...bird.brain.destination }, 'one leg, no turn');
  assert.ok(bird.flightTarget.x > bird.position.x, 'ahead of it');
  assert.ok(slope(bird.position, bird.flightTarget) <= BIRDS.MAX_DESCENT + 1e-9);
});

test('a flying bird leans into its descent and levels out after landing', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  bird.brain.takeOff();
  bird.brain.until = Infinity;
  bird.velocity = { x: 2, y: 1.5 }; // Going down to the right
  for (let i = 0; i < 60; i++) bird.brain.update();
  assert.ok(Math.abs(bird.rotation - BIRDS.MAX_TILT) < 0.5, `nose down, at most MAX_TILT (got ${bird.rotation})`);

  bird.direction = -1; // Same descent, facing left: the lean mirrors
  bird.velocity = { x: -2, y: 1.5 };
  for (let i = 0; i < 60; i++) bird.brain.update();
  assert.ok(bird.rotation < -BIRDS.MAX_TILT + 0.5);

  bird.isAirborne = false; // Landed
  bird.currentAnimation = 'front';
  for (let i = 0; i < 80; i++) bird.brain.update();
  assert.equal(bird.rotation, 0);
});

test('a bird still lands when the window gets shorter on its way down', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  rollDice(0);
  bird.brain.goToGround();
  ctx.innerHeight = VIEWPORT.innerHeight - 120; // Devtools opened, say
  try {
    bird.brain.update();
    assert.equal(bird.flightTarget.y, ctx.innerHeight - SIZE, 'the target moved up with the window');
    arrive(bird);
    assert.equal(bird.brain.state, 'grounded');
  } finally {
    ctx.innerHeight = VIEWPORT.innerHeight;
  }
});

test('a bird that cannot arrive takes off again instead of hanging in the air', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  bird.brain.goToGround();
  bird.brain.since -= BIRDS.MAX_PASSING_TIME + 1; // As if it had been flying there for too long
  bird.brain.update();
  assert.equal(bird.brain.state, 'cruise');
  assert.equal(bird.currentAnimation, 'fly');
  assert.equal(bird.flightTarget, null);
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
  const bird = addBird(manager, KINGFISHER);
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
  assert.equal(bird.brain.destination.y, VIEWPORT.innerHeight - SIZE);

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
  const bird = addBird(manager, KINGFISHER);
  rollDice(0); // Pick fishing, aim at the pond center, then catch the fish

  bird.brain.goFishing(pond);
  const surface = { x: pond.position.x + 0.5 * 225, y: pond.position.y + 0.5 * 75 };
  assert.equal(bird.brain.state, 'toPond');
  assert.deepEqual(
    { ...bird.brain.destination },
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
  assert.equal(
    bird.flightTarget.y,
    surface.y - SIZE * BIRDS.WATERLINE,
    'a straight dive: the water line meets the surface',
  );

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
  const bird = addBird(manager, KINGFISHER);
  rollDice(0);

  bird.brain.goFishing(pond);
  arrive(bird);
  bird.brain.onAnimationComplete('hover');
  assert.equal(bird.brain.destination.y, VIEWPORT.innerHeight - SIZE);
  arrive(bird);
  assert.equal(bird.brain.state, 'splash');

  bird.brain.onAnimationComplete('splash');
  assert.equal(bird.brain.destination.x, 0);
  arrive(bird);
  assert.equal(bird.brain.state, 'perched');
});

test('a kingfisher that misses flies off to try again later', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  const bird = addBird(manager, KINGFISHER);
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

// --- Heron: wading, kung fu on the ground, storms ---

const heronData = { groundActions: ['kungfu', 'stance', 'front'] };

/** Pretends the brain's clock moved past every timer. */
function timePasses(bird) {
  bird.brain.until = 0;
  bird.brain.nextAction = 0;
}

test('a heron never sits on a tree', () => {
  const manager = makeWorld();
  addTree(manager, 300);
  const heron = addBird(manager, HERON, heronData);
  assert.equal(heron.brain.findFreePerch(), null);
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    rollDice(roll);
    heron.brain.decide();
    assert.notEqual(heron.brain.state, 'toPerch');
  }
});

test('a heron on the ground does kung fu and walks between moves', () => {
  const manager = makeWorld();
  const heron = addBird(manager, HERON, heronData);
  rollDice(0);
  heron.brain.goToGround();
  arrive(heron);
  assert.equal(heron.brain.state, 'grounded');
  assert.equal(heron.currentAnimation, 'kungfu');

  heron.brain.onAnimationComplete('kungfu');
  assert.equal(heron.currentAnimation, 'walk');
  heron.brain.nextAction = 0; // Time for the next move, but not yet time to leave
  rollDice(0.5);
  heron.brain.update();
  assert.equal(heron.brain.state, 'grounded');
  assert.equal(heron.currentAnimation, 'stance');

  heron.brain.onAnimationComplete('stance');
  timePasses(heron); // Walking again, and time is up: now it may fly off
  heron.brain.update();
  assert.equal(heron.brain.state, 'cruise');
});

test('a heron does not fly off in the middle of a kung fu move', () => {
  const manager = makeWorld();
  const heron = addBird(manager, HERON, heronData);
  rollDice(0);
  heron.brain.goToGround();
  arrive(heron);
  timePasses(heron);
  heron.brain.update();
  assert.equal(heron.brain.state, 'grounded');
  assert.equal(heron.currentAnimation, 'kungfu');
});

test('a heron wades into the pond, strikes, and swallows a big fish', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  const heron = addBird(manager, HERON, heronData);
  heron.currentSize = { width: 150, height: 150 };
  rollDice(0); // Aim at the pond center, then catch

  heron.brain.goWading(pond);
  assert.equal(heron.brain.state, 'toWade');
  assert.equal(heron.brain.destination.y, VIEWPORT.innerHeight - 150, 'it stands on the bottom, in the water');
  assert.equal(heron.brain.destination.x, pond.position.x + 0.5 * 225 - 150 * BIRDS.FEET.x);

  arrive(heron);
  assert.equal(heron.brain.state, 'wading');
  assert.equal(heron.isPerched, true, 'it stands still');
  assert.equal(heron.currentAnimation, 'wade');

  heron.brain.nextAction = 0;
  heron.brain.update();
  assert.equal(heron.currentAnimation, 'strike');
  heron.brain.onAnimationComplete('strike');
  assert.equal(heron.currentAnimation, 'catch');
  heron.brain.onAnimationComplete('catch');
  assert.equal(heron.currentAnimation, 'gulp');
  heron.brain.onAnimationComplete('gulp');
  assert.equal(heron.currentAnimation, 'wade');
  assert.equal(heron.brain.state, 'wading');

  pond.isDragging = true; // Picking up the pond scares it off
  heron.brain.update();
  assert.equal(heron.brain.state, 'cruise');
});

test('two herons never stand in the same spot of a pond', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  pond.speciesData.water.rx = 0.36;
  const first = addBird(manager, HERON, heronData);
  const second = addBird(manager, HERON, heronData);
  first.currentSize = second.currentSize = { width: 150, height: 150 };

  rollDice(0.5); // The first heron takes the middle: no room is left on either side
  first.brain.goWading(pond);
  assert.equal(second.brain.findWadeSpot(pond), null);
  second.brain.goWading(pond);
  assert.equal(second.brain.state, 'cruise', 'it does something else');

  rollDice(0); // From the left edge instead, the right edge stays free
  first.brain.goWading(pond);
  rollDice(1);
  const spot = second.brain.findWadeSpot(pond);
  assert.ok(Math.abs(spot - first.brain.wadeX) >= 150 * 0.55);
});

test('a wading heron faces the middle of the pond, so its strikes land in the water', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  pond.speciesData.water.rx = 0.36;
  const middle = pond.position.x + 0.5 * 225;
  for (const [side, facing] of [
    [1, -1], // Standing right of the middle, flying in heading right: it turns left
    [-1, 1],
  ]) {
    const heron = addBird(manager, HERON, heronData);
    heron.currentSize = { width: 150, height: 150 };
    heron.direction = -facing;
    heron.brain.goWading(pond, middle + side * 50);
    arrive(heron);
    assert.equal(heron.brain.state, 'wading');
    assert.equal(heron.direction, facing);
  }
});

test('a full pond does not stop a heron from wading in another one', () => {
  const manager = makeWorld();
  const full = addPond(manager, 100); // Water only in the middle: room for one heron
  const other = addPond(manager, 600);
  const first = addBird(manager, HERON, heronData);
  const second = addBird(manager, HERON, heronData);
  first.brain.goWading(full, full.position.x + 0.5 * 225);
  for (const roll of [0, 0.5, 0.99]) {
    rollDice(roll);
    assert.equal(second.brain.findWadingPlace().pond, other);
  }
});

test('a heron moves between ponds instead of always using the same one', () => {
  const manager = makeWorld();
  const left = addPond(manager, 100);
  const right = addPond(manager, 600);
  const heron = addBird(manager, HERON, heronData);
  rollDice(0.5);
  heron.brain.lastPond = left;
  assert.equal(heron.brain.findWadingPlace().pond, right);
  heron.brain.lastPond = right;
  assert.equal(heron.brain.findWadingPlace().pond, left);
});

test('a kingfisher also prefers a pond it did not just fish', () => {
  const manager = makeWorld();
  const left = addPond(manager, 100);
  const right = addPond(manager, 600);
  const bird = addBird(manager, KINGFISHER);
  rollDice(0.5);
  bird.brain.goFishing(left);
  bird.brain.takeOff();
  assert.equal(bird.brain.findPond(), right);
});

test('a heron that misses keeps watching the water', () => {
  const manager = makeWorld();
  const pond = addPond(manager, 500);
  const heron = addBird(manager, HERON, heronData);
  rollDice(0.5, 0.99);
  heron.brain.goWading(pond);
  arrive(heron);
  heron.brain.nextAction = 0;
  heron.brain.update();
  heron.brain.onAnimationComplete('strike');
  assert.equal(heron.currentAnimation, 'wade');
  assert.ok(heron.brain.nextAction > 0);
});

test('a heron sometimes flies through a storm, slower, until it blows over', () => {
  const manager = makeWorld();
  const heron = addBird(manager, HERON, heronData);
  heron.brain.startStorm();
  assert.equal(heron.brain.state, 'storm');
  assert.equal(heron.currentAnimation, 'storm');
  assert.equal(heron.isAirborne, true);
  assert.equal(heron.flightBoost, BIRDS.STORM_SPEED);

  heron.brain.nextAction = 0;
  const before = heron.cruiseY;
  rollDice(0.9);
  heron.brain.update();
  assert.notEqual(heron.cruiseY, before, 'a gust moves it');

  timePasses(heron);
  heron.brain.update();
  assert.equal(heron.brain.state, 'cruise');
  assert.equal(heron.currentAnimation, 'fly');
  assert.equal(heron.flightBoost, 1);
});

test('only birds that fly in storms pick a storm', () => {
  const manager = makeWorld();
  const bird = addBird(manager);
  for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
    rollDice(roll);
    bird.brain.decide();
    assert.notEqual(bird.brain.state, 'storm');
  }
});
