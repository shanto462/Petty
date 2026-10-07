// Pet Manager - Manages all pets and effects in one tab.
// The visible tab runs physics on requestAnimationFrame, which Chrome keeps at full
// rate for visible pages and pauses for hidden ones. The background service worker
// stores the roster and last positions: this tab reports them once a second and when
// it is hidden, and adopts them again when it becomes visible.

(function () {
  if (window.petManager) return;

  const { DISPLAY, MESSAGE_TYPES, PHYSICS, DEFAULT_SETTINGS } = window.PettyConfig;
  const { stepPet, createStepper } = window.PettyPhysics;

  /**
   * False once the extension was reloaded, updated or removed. This tab's script is then
   * cut off from the background, so its pets could never move again.
   */
  function isExtensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  class PetManager {
    constructor() {
      this.logger = window.PettyLogger;
      this.speciesManager = SpeciesManager.getInstance();
      this.pets = [];
      this.ephemeralEntities = []; // UFOs, clouds, poop stains, etc.
      this.enabled = true;
      this.menuOpen = false;
      this.loopRunning = false;
      this.lastReport = 0;
      this.advancePhysics = null;
      this.onResize = () => this.sendViewportUpdate();
      this.onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          this.reportStates();
        } else {
          this.refreshFromBackground();
        }
      };
      this.onPageHide = () => this.reportStates();
    }

    async init() {
      this.logger.log('[PetManager] Initializing...');

      await this.speciesManager.loadAllSpecies();

      // Listen for messages from background
      chrome.runtime.onMessage.addListener((message) => {
        this.handleBackgroundMessage(message);
      });

      // Send viewport dimensions to background
      this.sendViewportUpdate();
      window.addEventListener('resize', this.onResize);

      await this.refreshFromBackground();
      this.logger.log('[PetManager] Ready! Active pets:', this.pets.length);

      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('pagehide', this.onPageHide);
    }

    /**
     * Adopts the roster and last known positions from the background
     */
    async refreshFromBackground() {
      if (!this.stayConnected()) return;
      try {
        const response = await ChromeMessaging.sendMessage({ type: MESSAGE_TYPES.GET_GLOBAL_PETS });
        this.syncPets(response?.pets);
      } catch (error) {
        if (this.stayConnected()) {
          this.logger.warn('[PetManager] Failed to get global pets:', error);
        }
      }
    }

    /**
     * True while this script can still talk to the extension. After the extension is
     * reloaded or updated, Chrome cuts this script off for good (retrying cannot help),
     * so it cleans up instead. Refreshing the page loads the new version.
     */
    stayConnected() {
      if (!this.enabled) return false;
      if (isExtensionAlive()) return true;
      this.shutdown();
      return false;
    }

    /**
     * Saves where every pet is, so other tabs (and a restarted worker) continue from here
     */
    reportStates() {
      if (this.pets.length === 0 || !this.stayConnected()) return;
      ChromeMessaging.sendMessage({
        type: MESSAGE_TYPES.REPORT_PET_STATES,
        states: this.pets.map((pet) => ({
          id: pet.id,
          position: pet.position,
          velocity: pet.velocity,
          direction: pet.direction,
          isMoving: pet.isMoving,
          isSleeping: pet.isSleeping,
          currentAnimation: pet.currentAnimation,
          currentSize: pet.currentSize,
        })),
      }).catch(() => {}); // Fire-and-forget
    }

    /**
     * Runs as many fixed physics steps as real time has passed since the last frame
     */
    stepPhysics() {
      const world = {
        settings: DEFAULT_SETTINGS,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
      this.advancePhysics(() => {
        for (const pet of this.pets) {
          stepPet(pet, pet.speciesData, world);
        }
      });
    }

    sendViewportUpdate() {
      if (!this.stayConnected()) return;
      ChromeMessaging.sendMessage({
        type: MESSAGE_TYPES.UPDATE_VIEWPORT,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      }).catch(() => {}); // Fire-and-forget
    }

    handleBackgroundMessage(message) {
      switch (message?.type) {
        case MESSAGE_TYPES.PET_ADDED:
          this.createPetFromData(message.pet);
          break;

        case MESSAGE_TYPES.PET_REMOVED:
          this.removePetLocal(message.petId);
          break;

        case MESSAGE_TYPES.ALL_PETS_REMOVED:
          this.removeAllPetsLocal();
          break;

        case 'PET_POSITION_UPDATE': {
          const pet = this.pets.find((p) => p.id === message.petId);
          if (pet && !pet.isDragging) {
            pet.position = message.position;
            pet.updatePosition();
          }
          break;
        }

        case MESSAGE_TYPES.TRIGGER_UFO_ABDUCTION:
          this.logger.log('[PetManager] UFO Abduction event triggered by background!');
          window.UfoAbductionEvent?.trigger(this);
          break;

        case MESSAGE_TYPES.TRIGGER_CLOUD_EVENT:
          this.logger.log('[PetManager] Cloud event triggered by background!');
          window.CloudEvent?.trigger(this);
          break;
      }
    }

    syncPets(globalPets) {
      if (!Array.isArray(globalPets)) return;

      // Background is the source of truth: drop pets it no longer knows about
      const globalIds = new Set(globalPets.map((p) => p.id));
      this.pets.filter((pet) => !globalIds.has(pet.id)).forEach((pet) => this.removePetLocal(pet.id));

      globalPets.forEach((globalPet) => {
        const localPet = this.pets.find((p) => p.id === globalPet.id);

        // A tab that missed PET_ADDED (e.g. it was loading) catches up here
        if (!localPet) {
          this.createPetFromData(globalPet);
          return;
        }

        // Only update if not being dragged by THIS tab
        if (localPet.isDragging) return;

        localPet.position = { ...globalPet.position };
        localPet.velocity = { ...globalPet.velocity };
        localPet.direction = globalPet.direction;

        // Sync animation state (critical for multi-tab sync!)
        if (globalPet.currentAnimation && localPet.currentAnimation !== globalPet.currentAnimation) {
          localPet.setAnimation(globalPet.currentAnimation);
        }

        if (globalPet.isMoving !== undefined && localPet.isMoving !== globalPet.isMoving) {
          localPet.isMoving = globalPet.isMoving;
        }

        if (globalPet.isSleeping !== undefined && localPet.isSleeping !== globalPet.isSleeping) {
          localPet.isSleeping = globalPet.isSleeping;
        }

        // Birds work out from the new position whether they are perched, on the ground or flying
        localPet.brain?.resync(globalPet.currentAnimation);

        localPet.updatePosition();
      });
    }

    createPetFromData(petData) {
      if (!petData || this.pets.some((p) => p.id === petData.id)) return null;

      const speciesData = this.speciesManager.getSpecies(petData.species);
      if (!speciesData) {
        this.logger.warn('[PetManager] Species data not found:', petData.species);
        return null;
      }

      const pet = new Pet(petData.species, speciesData, this);
      pet.id = petData.id; // Use global ID
      pet.position = petData.position;
      pet.velocity = petData.velocity || { x: 0, y: 0 };
      pet.direction = petData.direction || 1;
      pet.isMoving = petData.isMoving ?? false;
      this.pets.push(pet);
      pet.brain?.resync(petData.currentAnimation);
      this.ensureUpdateLoop();

      this.logger.log('[PetManager] Created synced pet:', petData.species);
      return pet;
    }

    removePetLocal(petId) {
      const index = this.pets.findIndex((p) => p.id === petId);
      if (index >= 0) {
        this.pets[index].destroy();
        this.pets.splice(index, 1);
      }
    }

    removeAllPetsLocal() {
      this.pets.forEach((pet) => pet.destroy());
      this.pets = [];
    }

    getPetsNear(position, radius) {
      return this.pets.filter((pet) => {
        const dx = pet.position.x - position.x;
        const dy = pet.position.y - position.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
      });
    }

    /**
     * Get pets overlapping with a rectangular area (for SleepingPlace collision detection)
     * @param {Object} position - Top-left position {x, y}
     * @param {number} size - Size of the area (assumes square)
     * @param {Function} filter - Optional filter function
     * @returns {Array} Overlapping pets sorted by overlap area (largest first)
     */
    getPetsOverlapping(position, size, filter = null) {
      const petSize = DISPLAY.DEFAULT_PET_SIZE;
      const areaRight = position.x + size;
      const areaBottom = position.y + size;

      return this.pets
        .map((pet) => {
          const petRight = pet.position.x + petSize;
          const petBottom = pet.position.y + petSize;

          const overlaps =
            pet.position.x < areaRight &&
            petRight > position.x &&
            pet.position.y < areaBottom &&
            petBottom > position.y;
          if (!overlaps) return null;

          const overlapWidth = Math.min(petRight, areaRight) - Math.max(pet.position.x, position.x);
          const overlapHeight = Math.min(petBottom, areaBottom) - Math.max(pet.position.y, position.y);
          return { pet, overlapArea: overlapWidth * overlapHeight };
        })
        .filter((result) => result !== null && (!filter || filter(result.pet)))
        .sort((a, b) => b.overlapArea - a.overlapArea)
        .map((result) => result.pet);
    }

    /**
     * Runs the render loop only while something is on screen, so idle tabs cost nothing.
     */
    ensureUpdateLoop() {
      if (this.loopRunning || !this.enabled) return;
      this.loopRunning = true;
      // A fresh clock, so time spent with nothing on screen is not simulated
      this.advancePhysics = createStepper({ stepMs: PHYSICS.UPDATE_INTERVAL, maxCatchUpMs: PHYSICS.MAX_CATCH_UP });

      const update = (timestamp) => {
        // Checked every frame (a cheap property read) so a cut-off tab stops at once
        if (!this.stayConnected()) {
          this.loopRunning = false;
          return;
        }

        this.stepPhysics();
        this.pets.forEach((pet) => pet.update(timestamp));

        if (timestamp - this.lastReport >= PHYSICS.REPORT_INTERVAL) {
          this.lastReport = timestamp;
          this.reportStates();
        }
        this.ephemeralEntities.forEach((entity) => entity.update(timestamp));
        this.ephemeralEntities = this.ephemeralEntities.filter((e) => e.isAlive);

        if (!this.enabled || (this.pets.length === 0 && this.ephemeralEntities.length === 0)) {
          this.loopRunning = false;
          return;
        }
        requestAnimationFrame(update);
      };

      requestAnimationFrame(update);
    }

    /**
     * Removes everything this tab drew. Used when the extension was reloaded or updated,
     * so old tabs do not keep frozen pets on screen. The page's next load shows them again.
     */
    shutdown() {
      if (!this.enabled) return;
      this.enabled = false;
      this.removeAllPetsLocal();
      this.ephemeralEntities.forEach((entity) => entity.remove());
      this.ephemeralEntities = [];
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('pagehide', this.onPageHide);
      this.logger.log('[PetManager] Extension was reloaded or updated; cleared this tab');
    }

    /**
     * Add an ephemeral entity (UFO, cloud, poop stain, etc.)
     */
    addEphemeralEntity(entity) {
      this.ephemeralEntities.push(entity);
      this.ensureUpdateLoop();
      this.logger.log('[PetManager] Added ephemeral entity:', entity.type, entity.id);
    }

    /**
     * Remove an ephemeral entity
     */
    removeEphemeralEntity(entityId) {
      const index = this.ephemeralEntities.findIndex((e) => e.id === entityId);
      if (index >= 0) {
        this.ephemeralEntities[index].remove();
        this.ephemeralEntities.splice(index, 1);
      }
    }

    /**
     * Remove all ephemeral entities of a specific type
     */
    removeEphemeralEntitiesByType(type) {
      this.ephemeralEntities.filter((e) => e.type === type).forEach((e) => e.remove());
      this.ephemeralEntities = this.ephemeralEntities.filter((e) => e.type !== type);
    }
  }

  const start = () => {
    window.petManager = new PetManager();
    window.petManager.init();
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
