import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './helpers.mjs';

const { isId, toPoint, toSize, sanitizePetState } = loadScripts(['background/message-guards.js']).PettyMessageGuards;

test('isId accepts short strings only', () => {
  assert.equal(isId('abc'), true);
  assert.equal(isId(''), false);
  assert.equal(isId(42), false);
  assert.equal(isId('x'.repeat(65)), false);
});

test('toPoint rejects non-finite numbers and clamps huge values', () => {
  assert.equal(toPoint({ x: NaN, y: 1 }), null);
  assert.equal(toPoint({ x: Infinity, y: 1 }), null);
  assert.equal(toPoint({ x: '1', y: 1 }), null);
  assert.deepEqual({ ...toPoint({ x: 1e9, y: -1e9 }) }, { x: 100000, y: -100000 });
});

test('toSize rejects zero and negative sizes', () => {
  assert.equal(toSize({ width: 0, height: 10 }), null);
  assert.equal(toSize({ width: -1, height: 10 }), null);
  assert.deepEqual({ ...toSize({ width: 800, height: 600 }) }, { width: 800, height: 600 });
});

test('sanitizePetState keeps only known, valid fields', () => {
  const state = JSON.parse(
    '{"currentAnimation":"eat","isMoving":false,"direction":-1,"species":"hack","id":"x",' +
      '"__proto__":{"polluted":true},"position":{"x":1,"y":2},"velocity":{"x":"a","y":0},' +
      '"currentSize":{"width":75,"height":75},"isSleeping":"yes"}',
  );
  const clean = sanitizePetState(state);
  assert.deepEqual(Object.keys(clean).sort(), ['currentAnimation', 'currentSize', 'direction', 'isMoving', 'position']);
  assert.equal(Object.hasOwn(clean, '__proto__'), false);
  assert.equal(clean.polluted, undefined);
});

test('sanitizePetState rejects invalid directions and non-objects', () => {
  assert.deepEqual({ ...sanitizePetState({ direction: 2 }) }, {});
  assert.deepEqual({ ...sanitizePetState(null) }, {});
  assert.deepEqual({ ...sanitizePetState('state') }, {});
});
