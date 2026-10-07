import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './helpers.mjs';

const ctx = loadScripts(['shared/config.js', 'shared/physics.js']);
const { stepPet } = ctx.PettyPhysics;
const { PHYSICS, DISPLAY } = ctx.PettyConfig;

const world = {
  settings: { petSize: DISPLAY.DEFAULT_PET_SIZE, speedMultiplier: 1, gravityEnabled: true },
  viewport: { width: 1000, height: 600 },
};
const groundY = world.viewport.height - DISPLAY.DEFAULT_PET_SIZE;
const walker = { speed: 1, capabilities: ['LinearMovement'] };

const makePet = (overrides = {}) => ({
  position: { x: 400, y: 100 },
  velocity: { x: 0, y: 0 },
  direction: 1,
  isMoving: false,
  isDragging: false,
  currentSize: null,
  ...overrides,
});

test('gravity pulls a falling pet down', () => {
  const pet = makePet();
  stepPet(pet, walker, world);
  assert.equal(pet.velocity.y, PHYSICS.GRAVITY);
  assert.ok(pet.position.y > 100);
});

test('pets land on the bottom edge and stop falling', () => {
  const pet = makePet({ position: { x: 400, y: groundY + 50 }, velocity: { x: 0, y: 10 } });
  stepPet(pet, walker, world);
  assert.equal(pet.position.y, groundY);
  assert.equal(pet.velocity.y, 0);
});

test('a walking pet on the ground moves in its direction', () => {
  const pet = makePet({ position: { x: 400, y: groundY }, isMoving: true, direction: -1 });
  stepPet(pet, walker, world);
  assert.ok(pet.velocity.x < 0);
});

test('hitting the right wall bounces the pet back to the left', () => {
  const maxX = world.viewport.width - DISPLAY.DEFAULT_PET_SIZE;
  const pet = makePet({ position: { x: maxX + 5, y: groundY }, velocity: { x: 4, y: 0 }, isMoving: true });
  stepPet(pet, walker, world);
  assert.equal(pet.position.x, maxX);
  assert.equal(pet.direction, -1);
  assert.ok(pet.velocity.x <= 0);
});

test('hitting the left wall bounces the pet back to the right', () => {
  const pet = makePet({ position: { x: -5, y: groundY }, velocity: { x: -4, y: 0 }, direction: -1, isMoving: true });
  stepPet(pet, walker, world);
  assert.equal(pet.position.x, 0);
  assert.equal(pet.direction, 1);
});

test('a stationary pet slides to a stop', () => {
  const pet = makePet({ position: { x: 400, y: groundY }, velocity: { x: 0.05, y: 0 } });
  stepPet(pet, walker, world);
  assert.equal(pet.velocity.x, 0);
});

test('a dragged pet is left alone', () => {
  const pet = makePet({ isDragging: true });
  stepPet(pet, walker, world);
  assert.deepEqual({ ...pet.position }, { x: 400, y: 100 });
});

test('sleeping places stick to the bottom at double size', () => {
  const pet = makePet({ position: { x: 400, y: 10 } });
  stepPet(pet, { speed: 0, capabilities: ['SleepingPlace'] }, world);
  assert.equal(pet.position.y, world.viewport.height - DISPLAY.DEFAULT_PET_SIZE * 2);
});

test('animation-specific sizes are used for collisions', () => {
  const pet = makePet({ position: { x: 400, y: 1000 }, currentSize: { width: 300, height: 150 } });
  stepPet(pet, walker, world);
  assert.equal(pet.position.y, world.viewport.height - 150);
});

const bird = { speed: 0.7, flySpeed: 3, capabilities: ['LinearMovement', 'Flying'] };
const flySpeed = (species, boost = 1) =>
  ctx.PettyConfig.SPEED.BASE_SPEED * species.flySpeed * world.settings.speedMultiplier * boost;

test('a flying bird ignores gravity and heads for its target', () => {
  const pet = makePet({ isAirborne: true, flightTarget: { x: 400, y: 0 } });
  stepPet(pet, bird, world);
  assert.equal(pet.position.x, 400);
  assert.ok(pet.position.y < 100, 'it climbs toward the target instead of falling');
  assert.ok(Math.abs(pet.velocity.y + flySpeed(bird)) < 1e-9);
});

test('a flying bird lands exactly on a target within one step', () => {
  const pet = makePet({ isAirborne: true, flightTarget: { x: 401, y: 101 } });
  stepPet(pet, bird, world);
  assert.deepEqual({ ...pet.position }, { x: 401, y: 101 });
  assert.deepEqual({ ...pet.velocity }, { x: 0, y: 0 });
});

test('a diving bird flies faster', () => {
  const pet = makePet({ isAirborne: true, flightTarget: { x: 400, y: 500 }, flightBoost: 2 });
  stepPet(pet, bird, world);
  assert.ok(Math.abs(pet.velocity.y - flySpeed(bird, 2)) < 1e-9);
});

test('a cruising bird turns around at the edge of the window', () => {
  const maxX = world.viewport.width - DISPLAY.DEFAULT_PET_SIZE;
  const pet = makePet({ isAirborne: true, position: { x: maxX - 0.1, y: 100 }, direction: 1, cruiseY: 100 });
  stepPet(pet, bird, world);
  assert.equal(pet.position.x, maxX);
  assert.equal(pet.direction, -1);
  assert.equal(pet.position.y, 100, 'it keeps its height');
});

test('a perched bird stays where it is', () => {
  const pet = makePet({ isPerched: true, velocity: { x: 3, y: 3 } });
  stepPet(pet, bird, world);
  assert.deepEqual({ ...pet.position }, { x: 400, y: 100 });
  assert.deepEqual({ ...pet.velocity }, { x: 0, y: 0 });
});

test('a bird on the ground walks and falls like any pet', () => {
  const pet = makePet();
  stepPet(pet, bird, world);
  assert.equal(pet.velocity.y, PHYSICS.GRAVITY);
});

for (const capability of ['PerchingPlace', 'FishingSpot']) {
  test(`${capability} scenery sticks to the bottom edge`, () => {
    const pet = makePet({ position: { x: 400, y: 10 }, currentSize: { width: 150, height: 225 } });
    stepPet(pet, { speed: 0, capabilities: [capability] }, world);
    assert.equal(pet.position.y, world.viewport.height - 225);
  });
}

test('the stepper runs one step per elapsed interval, whatever the timer rate', () => {
  let now = 0;
  const advance = ctx.PettyPhysics.createStepper({ stepMs: 16, maxCatchUpMs: 1000, now: () => now });
  let steps = 0;
  const count = () => steps++;

  now = 16 * 10; // A timer that fired 10 steps late
  assert.equal(advance(count), 10);
  now += 8; // Not a full step yet
  assert.equal(advance(count), 0);
  now += 8;
  assert.equal(advance(count), 1);
  assert.equal(steps, 11);
});

test('the stepper caps catch-up after a long pause', () => {
  let now = 0;
  const advance = ctx.PettyPhysics.createStepper({ stepMs: 16, maxCatchUpMs: 160, now: () => now });
  now = 60_000; // A tab hidden for a minute
  assert.equal(
    advance(() => {}),
    10,
  );
});
