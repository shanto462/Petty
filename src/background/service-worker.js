// Background Service Worker - Coordinates pets across all tabs.
// The worker is the shared store: the pet roster and each pet's last known state.
// Physics runs in the visible tab on requestAnimationFrame, because Chrome does not
// run service worker timers at a steady rate and may stop the worker at any time
// (https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

importScripts(
  '/shared/catalog.js',
  '/shared/config.js',
  '/shared/logger.js',
  '/shared/species-validator.js',
  '/shared/species-manager.js',
  '/background/message-guards.js',
  '/background/random-event-scheduler.js',
);

(function () {
  // Only initialize if not already initialized
  if (self.__BACKGROUND_INITIALIZED__) return;
  self.__BACKGROUND_INITIALIZED__ = true;

  const { PHYSICS, DEFAULT_SETTINGS, LIMITS, LOG, STORAGE_KEYS, MESSAGE_TYPES, CAPABILITIES, DEFAULT_ANIMATIONS } =
    self.PettyConfig;
  const { isId, toPoint, toSize, sanitizePetState } = self.PettyMessageGuards;
  const logger = self.PettyLogger;

  const ok = (extra = {}) => ({ success: true, ...extra });
  const fail = (error) => ({ success: false, error });

  class PetCoordinator {
    constructor() {
      this.globalPets = []; // Shared pet states
      this.speciesManager = SpeciesManager.getInstance();
      this.viewport = { ...PHYSICS.DEFAULT_VIEWPORT }; // Updated by tabs; used to place new pets
      this.settings = { ...DEFAULT_SETTINGS };

      this.eventScheduler = new RandomEventScheduler(this);

      // Message handlers wait on this, so a message that wakes the worker is never lost
      this.ready = this.init();
    }

    async init() {
      await this.speciesManager.loadAllSpecies();
      await this.restorePets();

      try {
        await this.eventScheduler.start();
      } catch (error) {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Could not schedule random events:', error);
      }

      logger.log(LOG.PREFIXES.BACKGROUND, 'Pet Coordinator ready with', this.globalPets.length, 'pets');
    }

    /**
     * Restores the roster from storage.sync and, when the worker was only restarted,
     * each pet's last state from storage.session. Accepts the older full-state format.
     */
    async restorePets() {
      try {
        const [synced, session] = await Promise.all([
          chrome.storage.sync.get(STORAGE_KEYS.GLOBAL_PETS),
          chrome.storage.session.get(STORAGE_KEYS.PET_STATES).catch(() => ({})),
        ]);
        const roster = Array.isArray(synced[STORAGE_KEYS.GLOBAL_PETS]) ? synced[STORAGE_KEYS.GLOBAL_PETS] : [];
        const states = Array.isArray(session[STORAGE_KEYS.PET_STATES]) ? session[STORAGE_KEYS.PET_STATES] : [];
        const stateById = new Map(states.filter((state) => isId(state?.id)).map((state) => [state.id, state]));

        this.globalPets = roster
          .filter((pet) => pet && isId(pet.id) && this.speciesManager.hasSpecies(pet.species))
          .slice(0, LIMITS.MAX_PETS)
          .map((pet) => {
            const restored = this.createPet(pet.species, pet.id);
            return Object.assign(restored, sanitizePetState(stateById.get(pet.id)));
          });
      } catch (error) {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Could not restore saved pets:', error);
      }
    }

    createPet(speciesId, id = crypto.randomUUID()) {
      const species = this.speciesManager.getSpecies(speciesId);
      return {
        id,
        species: speciesId,
        position: {
          x: Math.random() * (this.viewport.width * 0.6) + this.viewport.width * 0.2, // 20-80% of width
          y: Math.random() * (this.viewport.height * 0.4) + 50, // Between 50px and 40% of height
        },
        velocity: { x: 0, y: 0 },
        direction: 1, // Always start going right (like macOS), natural desync from wall bounces
        isDragging: false,
        isMoving: species?.capabilities?.includes(CAPABILITIES.LINEAR_MOVEMENT) || false,
        currentAnimation: species?.movementPath || DEFAULT_ANIMATIONS.FRONT,
        currentSize: null, // Set by the tab when the animation changes
      };
    }

    findPet(petId) {
      return isId(petId) ? this.globalPets.find((p) => p.id === petId) : undefined;
    }

    /**
     * Handles one message from a tab or the popup. Always returns a response object.
     */
    handleMessage(message) {
      if (!message || typeof message.type !== 'string') {
        return fail('Invalid message');
      }

      switch (message.type) {
        case MESSAGE_TYPES.GET_GLOBAL_PETS:
          return ok({ pets: this.globalPets });

        case MESSAGE_TYPES.UPDATE_VIEWPORT: {
          const viewport = toSize(message.viewport);
          if (!viewport) return fail('Invalid viewport');
          this.viewport = viewport;
          return ok();
        }

        case MESSAGE_TYPES.UPDATE_PET_POSITION: {
          const pet = this.findPet(message.petId);
          const position = toPoint(message.position);
          if (!pet || !position) return fail('Unknown pet or invalid position');
          pet.position = position;
          pet.velocity = { x: 0, y: 0 };
          this.saveStates();
          return ok();
        }

        case MESSAGE_TYPES.REPORT_PET_STATES: {
          // The visible tab runs physics and reports where every pet is
          if (!Array.isArray(message.states)) return fail('Invalid states');
          for (const state of message.states.slice(0, LIMITS.MAX_PETS)) {
            const pet = this.findPet(state?.id);
            if (pet) Object.assign(pet, sanitizePetState(state));
          }
          this.saveStates();
          return ok();
        }

        case MESSAGE_TYPES.ADD_PET: {
          if (typeof message.species !== 'string' || !this.speciesManager.hasSpecies(message.species)) {
            return fail('Unknown species');
          }
          if (this.globalPets.length >= LIMITS.MAX_PETS) {
            return fail(`You can have up to ${LIMITS.MAX_PETS} pets at once`);
          }
          const pet = this.createPet(message.species);
          logger.log(LOG.PREFIXES.BACKGROUND, 'Adding pet:', message.species);
          this.globalPets.push(pet);
          this.savePets();
          this.saveStates();
          this.broadcastToAllTabs({ type: MESSAGE_TYPES.PET_ADDED, pet });
          return ok({ pet });
        }

        case MESSAGE_TYPES.REMOVE_PET: {
          if (!isId(message.petId)) return fail('Invalid pet id');
          this.globalPets = this.globalPets.filter((p) => p.id !== message.petId);
          this.savePets();
          this.saveStates();
          this.broadcastToAllTabs({ type: MESSAGE_TYPES.PET_REMOVED, petId: message.petId });
          return ok();
        }

        case MESSAGE_TYPES.REMOVE_ALL_PETS:
          this.globalPets = [];
          this.savePets();
          this.saveStates();
          this.broadcastToAllTabs({ type: MESSAGE_TYPES.ALL_PETS_REMOVED });
          return ok();

        case MESSAGE_TYPES.UPDATE_PET_STATE: {
          const pet = this.findPet(message.petId);
          if (!pet) return fail('Unknown pet');
          Object.assign(pet, sanitizePetState(message.state));
          this.saveStates();
          return ok();
        }

        case 'RELOAD_SETTINGS':
          // Settings are hardcoded, nothing to reload
          return ok();

        default:
          return fail(`Unknown message type: ${message.type}`);
      }
    }

    /**
     * Sends a message to the tab the user is looking at (used for random events).
     */
    async sendToActiveTab(message) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (typeof tab?.id === 'number') {
          await chrome.tabs.sendMessage(tab.id, message);
        }
      } catch {
        // The active tab has no content script (e.g. chrome:// pages)
      }
    }

    async broadcastToAllTabs(message) {
      let tabs;
      try {
        tabs = await chrome.tabs.query({});
      } catch (error) {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Could not list tabs:', error);
        return;
      }
      for (const tab of tabs) {
        if (typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) continue;
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab has no content script (e.g. chrome:// pages), is loading, or closed
        });
      }
    }

    /**
     * Keeps live state in storage.session so a restarted worker resumes where it was.
     */
    saveStates() {
      chrome.storage.session.set({ [STORAGE_KEYS.PET_STATES]: this.globalPets }).catch((error) => {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Could not save pet states:', error);
      });
    }

    savePets() {
      // Only the roster is persisted; it stays far below the storage.sync per-item quota
      const roster = this.globalPets.map(({ id, species }) => ({ id, species }));
      chrome.storage.sync.set({ [STORAGE_KEYS.GLOBAL_PETS]: roster }).catch((error) => {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Could not save pets:', error);
      });
    }
  }

  const coordinator = new PetCoordinator();

  // Registered synchronously at the top level, as Manifest V3 requires for events
  // that start the service worker.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;

    coordinator.ready
      .then(() => coordinator.handleMessage(message))
      .then(sendResponse, (error) => {
        logger.error(LOG.PREFIXES.BACKGROUND, 'Message failed:', error);
        sendResponse(fail(String(error?.message || error)));
      });
    return true; // Keep the channel open for the async response
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== RandomEventScheduler.ALARM_NAME) return;
    coordinator.ready.then(() => coordinator.eventScheduler.onAlarm());
  });
})();
