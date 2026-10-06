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
