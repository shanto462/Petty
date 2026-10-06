import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './helpers.mjs';

const { validateSpeciesData } = loadScripts(['shared/species-validator.js']).SpeciesValidator;

test('rejects non-object data', () => {
  const result = validateSpeciesData(null, 'ghost');
  assert.equal(result.valid, false);
  assert.equal(result.data, null);
});

test('fills defaults for missing optional fields', () => {
  const result = validateSpeciesData({ id: 'blob' }, 'blob');
  assert.equal(result.valid, true);
  assert.equal(result.data.fps, 10);
  assert.equal(result.data.movementPath, 'walk');
  assert.equal(result.data.dragPath, 'drag');
  assert.deepEqual([...result.data.capabilities], []);
});

test('reports wrong types and falls back to the default', () => {
  const result = validateSpeciesData({ id: 'blob', speed: 'fast', tags: 'cats' }, 'blob');
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.data.speed, 0);
  assert.deepEqual([...result.data.tags], []);
});

test('flags animations without an id', () => {
  const result = validateSpeciesData({ id: 'blob', animations: [{ id: 'eat' }, {}] }, 'blob');
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Animation\[1\]/);
});

test('forces the id to match the file name', () => {
  const result = validateSpeciesData({ id: 'other' }, 'blob');
  assert.equal(result.data.id, 'blob');
});

test('keeps extra fields for forward compatibility', () => {
  const result = validateSpeciesData({ id: 'blob', custom: 42 }, 'blob');
  assert.equal(result.data.custom, 42);
});
