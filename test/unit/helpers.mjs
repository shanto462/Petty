// Loads the extension's classic scripts into an isolated VM context, the way
// Chrome loads them into a page, popup or service worker.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SRC = path.join(ROOT, 'src');

const quietConsole = { log() {}, info() {}, warn() {}, error() {} };

/**
 * @param {string[]} files - Paths relative to src/
 * @param {object} [globals] - Extra globals (chrome, Image, window, ...)
 * @returns {object} The VM global object
 */
export function loadScripts(files, globals = {}) {
  const context = {
    console: quietConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: globalThis.crypto,
    performance: globalThis.performance,
    ...globals,
  };
  context.self = context;
  if (globals.window === true) context.window = context;
  vm.createContext(context);

  context.importScripts = (...urls) => {
    for (const url of urls) runFile(context, url.replace(/^\//, ''));
  };

  for (const file of files) runFile(context, file);
  return context;
}

function runFile(context, file) {
  vm.runInContext(readFileSync(path.join(SRC, file), 'utf8'), context, { filename: file });
}

/** Scripts every runtime context loads first, in manifest order. */
export const SHARED = [
  'shared/catalog.js',
  'shared/config.js',
  'shared/logger.js',
  'shared/species-validator.js',
  'shared/species-manager.js',
];

/** Minimal chrome.* fake that records what the extension does. */
export function createChromeFake({ stored = {}, session = {} } = {}) {
  const listeners = [];
  const alarmListeners = [];
  const sent = [];
  const scheduled = new Map(); // Alarms by name
  const data = structuredClone(stored);
  const sessionData = structuredClone(session);

  const area = (backing) => ({
    get: async (key) => (key in backing ? { [key]: structuredClone(backing[key]) } : {}),
    set: async (items) => {
      Object.assign(backing, structuredClone(items));
    },
  });

  return {
    listeners,
    alarmListeners,
    sent,
    scheduled,
    data,
    sessionData,
    runtime: {
      id: 'petty-test',
      getURL: (p) => `chrome-extension://petty-test/${p.replace(/^\//, '')}`,
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
    storage: { sync: area(data), session: area(sessionData) },
    alarms: {
      get: async (name) => scheduled.get(name),
      create: async (name, info) => {
        scheduled.set(name, { name, ...info });
      },
      onAlarm: { addListener: (fn) => alarmListeners.push(fn) },
    },
    tabs: {
      TAB_ID_NONE: -1,
      query: async (filter) => (filter?.active ? [{ id: 7 }] : [{ id: 1 }, { id: 2 }]),
      sendMessage: async (tabId, message) => {
        sent.push({ tabId, message });
      },
    },
  };
}

/** Sends a message through the registered runtime.onMessage listener and awaits the reply. */
export function sendToListener(fake, message, sender = { id: fake.runtime.id }) {
  return new Promise((resolve) => {
    const keepOpen = fake.listeners[0](message, sender, resolve);
    if (keepOpen !== true) resolve(undefined);
  });
}
