import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChromeFake, loadScripts, sendToListener } from './helpers.mjs';

const KEY = 'globalPets';
const STATES_KEY = 'petStates';

function startWorker({ stored, session } = {}) {
  const chrome = createChromeFake({ stored, session });
  const ctx = loadScripts(['background/service-worker.js'], { chrome });
  return { chrome, ctx };
}

const send = (chrome, message) => sendToListener(chrome, message);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const speciesOf = (pets) => Array.from(pets, (p) => p.species);

test('registers its listeners synchronously at startup', () => {
  const { chrome } = startWorker();
  assert.equal(chrome.listeners.length, 1);
  assert.equal(chrome.alarmListeners.length, 1);
});

test('starts with no pets and schedules a random event alarm', async () => {
  const { chrome } = startWorker();
  const response = await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.equal(response.success, true);
  assert.equal(response.pets.length, 0);
  const alarm = chrome.scheduled.get('petty-random-event');
  assert.ok(alarm.delayInMinutes >= 0.5 && alarm.delayInMinutes <= 300);
});

test('keeps an existing alarm when the worker restarts', async () => {
  const chrome = createChromeFake();
  chrome.scheduled.set('petty-random-event', { name: 'petty-random-event', delayInMinutes: 42 });
  loadScripts(['background/service-worker.js'], { chrome });
  await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.equal(chrome.scheduled.get('petty-random-event').delayInMinutes, 42);
});

test('adds a pet, broadcasts it, and saves the roster and live state', async () => {
  const { chrome } = startWorker();
  const response = await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  assert.equal(response.success, true);
  assert.equal(response.pet.species, 'sparrow');
  assert.match(response.pet.id, /^[0-9a-f-]{36}$/);

  await settle();
  assert.deepEqual(chrome.data[KEY], [{ id: response.pet.id, species: 'sparrow' }]);
  assert.equal(chrome.sessionData[STATES_KEY][0].id, response.pet.id);
  assert.ok(chrome.sent.some(({ message }) => message.type === 'PET_ADDED'));
});

test('rejects unknown species and malformed messages', async () => {
  const { chrome } = startWorker();
  assert.equal((await send(chrome, { type: 'ADD_PET', species: 'dragon' })).success, false);
  assert.equal((await send(chrome, { type: 'ADD_PET', species: '__proto__' })).success, false);
  assert.equal((await send(chrome, { type: 'REPORT_PET_STATES', states: 'nope' })).success, false);
  assert.equal((await send(chrome, null)).success, false);
  assert.equal((await send(chrome, { type: 'NOPE' })).success, false);
});

test('answers every known message so callers never see a closed channel', async () => {
  const { chrome } = startWorker();
  const { pet } = await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  for (const message of [
    { type: 'UPDATE_VIEWPORT', viewport: { width: 1280, height: 720 } },
    { type: 'UPDATE_PET_POSITION', petId: pet.id, position: { x: 10, y: 20 } },
    { type: 'UPDATE_PET_STATE', petId: pet.id, state: { isMoving: false } },
    { type: 'REPORT_PET_STATES', states: [{ id: pet.id, position: { x: 1, y: 2 } }] },
    { type: 'RELOAD_SETTINGS' },
  ]) {
    assert.equal((await send(chrome, message)).success, true, message.type);
  }
});

test('stores positions reported by the visible tab', async () => {
  const { chrome } = startWorker();
  const { pet } = await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  await send(chrome, {
    type: 'REPORT_PET_STATES',
    states: [
      { id: pet.id, position: { x: 321, y: 645 }, velocity: { x: 0.6, y: 0 }, direction: -1, isMoving: true },
      { id: 'unknown', position: { x: 1, y: 1 } },
    ],
  });
  const { pets } = await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.equal(pets.length, 1);
  assert.deepEqual({ ...pets[0].position }, { x: 321, y: 645 });
  assert.equal(pets[0].direction, -1);

  await settle();
  assert.deepEqual(chrome.sessionData[STATES_KEY][0].position, { x: 321, y: 645 });
});

test('ignores state fields a tab must not change', async () => {
  const { chrome } = startWorker();
  const { pet } = await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  await send(chrome, {
    type: 'UPDATE_PET_STATE',
    petId: pet.id,
    state: { species: 'bluebird', id: 'x', isMoving: false },
  });
  const { pets } = await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.equal(pets[0].species, 'sparrow');
  assert.equal(pets[0].id, pet.id);
  assert.equal(pets[0].isMoving, false);
});

test('removes one pet or all pets', async () => {
  const { chrome } = startWorker();
  const { pet } = await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  await send(chrome, { type: 'ADD_PET', species: 'robin' });
  await send(chrome, { type: 'REMOVE_PET', petId: pet.id });
  assert.deepEqual(speciesOf((await send(chrome, { type: 'GET_GLOBAL_PETS' })).pets), ['robin']);
  await send(chrome, { type: 'REMOVE_ALL_PETS' });
  assert.equal((await send(chrome, { type: 'GET_GLOBAL_PETS' })).pets.length, 0);
});

test('restores saved pets, including the older full-state format, and drops unknown species', async () => {
  const { chrome } = startWorker({
    stored: {
      [KEY]: [
        { id: 'abc123def', species: 'sparrow', position: { x: 1, y: 2 }, velocity: { x: 0, y: 0 } },
        { id: 'b', species: 'robin' },
        { id: 'c', species: 'no-such-pet' },
        'garbage',
      ],
    },
  });
  const { pets } = await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.deepEqual(
    Array.from(pets, (p) => [p.id, p.species]),
    [
      ['abc123def', 'sparrow'],
      ['b', 'robin'],
    ],
  );
});

test('a restarted worker resumes positions from session storage', async () => {
  const { chrome } = startWorker({
    stored: { [KEY]: [{ id: 'p1', species: 'sparrow' }] },
    session: { [STATES_KEY]: [{ id: 'p1', species: 'sparrow', position: { x: 500, y: 600 }, direction: -1 }] },
  });
  const { pets } = await send(chrome, { type: 'GET_GLOBAL_PETS' });
  assert.deepEqual({ ...pets[0].position }, { x: 500, y: 600 });
  assert.equal(pets[0].direction, -1);
});

test('random events stay off while their Bit Therapy art is disabled', async () => {
  const { chrome } = startWorker();
  await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  chrome.sent.length = 0;
  chrome.alarmListeners[0]({ name: 'petty-random-event' });
  await settle();
  await settle();
  assert.equal(chrome.sent.filter(({ message }) => message.type.startsWith('TRIGGER_')).length, 0);
  assert.ok(chrome.scheduled.has('petty-random-event'), 'the alarm keeps running');
});

test('random events go only to the active tab, and only when pets exist', async () => {
  const { chrome, ctx } = startWorker();
  Object.assign(ctx.PettyConfig.RANDOM_EVENTS, { UFO_ABDUCTION: true, RAIN_CLOUD: true });
  const [onAlarm] = chrome.alarmListeners;

  onAlarm({ name: 'petty-random-event' });
  await settle();
  await settle();
  assert.equal(chrome.sent.filter(({ message }) => message.type.startsWith('TRIGGER_')).length, 0, 'no pets, no event');

  await send(chrome, { type: 'ADD_PET', species: 'sparrow' });
  chrome.sent.length = 0;
  onAlarm({ name: 'petty-random-event' });
  await settle();
  await settle();
  const triggers = chrome.sent.filter(({ message }) => message.type.startsWith('TRIGGER_'));
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].tabId, 7);
  assert.ok(chrome.scheduled.has('petty-random-event'), 'next event is scheduled');
});

test('ignores messages from other extensions', async () => {
  const { chrome } = startWorker();
  const reply = await sendToListener(chrome, { type: 'REMOVE_ALL_PETS' }, { id: 'someone-else' });
  assert.equal(reply, undefined);
});
