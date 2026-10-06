// Physics - Pure per-pet physics step used by the background coordinator.
// Kept free of chrome.* APIs so it can be unit tested in Node.

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.PettyPhysics) {
    const { PHYSICS, DISPLAY, SPEED, CAPABILITIES } = globalScope.PettyConfig;

    /**
     * Width and height the physics engine should use for a pet.
     * SleepingPlace entities are 2x size; animation-specific sizes (e.g. UFO bombing) win.
     */
    function entitySize(pet, species, petSize) {
      if (pet.currentSize) {
        return { width: pet.currentSize.width, height: pet.currentSize.height };
      }
      const isSleepingPlace = species.capabilities?.includes(CAPABILITIES.SLEEPING_PLACE);
      const size = isSleepingPlace ? petSize * 2 : petSize;
      return { width: size, height: size };
    }

    /**
     * Advances one pet by one physics tick. Mutates `pet` in place.
     * @param {object} pet - Global pet state (position, velocity, direction, isMoving, ...)
     * @param {object} species - Species definition from the catalog
     * @param {{settings: object, viewport: {width: number, height: number}}} world
     */
    function stepPet(pet, species, { settings, viewport }) {
      if (pet.isDragging || !species) return;

      // Speed calculation matching macOS formula:
      // speed = (petSize / defaultSize) * baseSpeed * species.speed * speedMultiplier
      const sizeRatio = settings.petSize / DISPLAY.DEFAULT_PET_SIZE;
      const speed = sizeRatio * SPEED.BASE_SPEED * (species.speed || 0) * settings.speedMultiplier;
      const gravity = settings.gravityEnabled ? PHYSICS.GRAVITY : 0;

      const { width, height } = entitySize(pet, species, settings.petSize);
      const maxX = viewport.width - width;
      const maxY = viewport.height - height;

      const isStationary = !pet.isMoving;
      const isSleepingPlace = species.capabilities?.includes(CAPABILITIES.SLEEPING_PLACE);
      // Wall crawlers and sleeping places ignore gravity and stick to the bottom edge
      const isWallCrawler = species.capabilities?.includes(CAPABILITIES.WALL_CRAWLER);

      if (!isWallCrawler && !isSleepingPlace && pet.position.y < maxY) {
        pet.velocity.y += gravity;
      }

      if (isWallCrawler || isSleepingPlace) {
        pet.position.y = maxY;
        pet.velocity.y = 0;
      }

      pet.position.x += pet.velocity.x;
      pet.position.y += pet.velocity.y;

      // Ground collision, with stronger friction for pets that are not walking
      if (pet.position.y >= maxY) {
        pet.position.y = maxY;
        pet.velocity.y = 0;
        pet.velocity.x *= isStationary ? PHYSICS.STATIONARY_FRICTION : PHYSICS.FRICTION;
      }

      // Wall collisions with bounce
      if (pet.position.x <= 0) {
        pet.position.x = 0;
        pet.velocity.x = Math.abs(pet.velocity.x) * PHYSICS.BOUNCE;
        pet.direction = 1;
      } else if (pet.position.x >= maxX) {
        pet.position.x = maxX;
        pet.velocity.x = -Math.abs(pet.velocity.x) * PHYSICS.BOUNCE;
        pet.direction = -1;
      }

      // Linear movement only while walking on the ground.
      // Direction changes only happen on wall bounces (like macOS).
      if (!isStationary && speed > 0 && pet.position.y >= maxY - 1) {
        if (Math.abs(pet.velocity.x) < speed * PHYSICS.MIN_SPEED_THRESHOLD) {
          pet.velocity.x = pet.direction * speed;
        }
      }

      if (isStationary && Math.abs(pet.velocity.x) < PHYSICS.STOP_THRESHOLD) {
        pet.velocity.x = 0;
      }
    }

    /**
     * Fixed-timestep clock. Each call runs `onStep` once for every `stepMs` of real time
     * that passed, so pets keep the same speed even when timers fire late.
     * @param {{stepMs: number, maxCatchUpMs: number, now?: () => number}} options
     * @returns {(onStep: () => void) => number} Advances the clock; returns the steps run
     */
    function createStepper({ stepMs, maxCatchUpMs, now = () => performance.now() }) {
      let last = now();
      let pending = 0;

      return function advance(onStep) {
        const current = now();
        // Cap the backlog so a worker that was suspended does not fast-forward for minutes
        pending = Math.min(pending + (current - last), maxCatchUpMs);
        last = current;

        let steps = 0;
        while (pending >= stepMs) {
          onStep();
          pending -= stepMs;
          steps++;
        }
        return steps;
      };
    }

    globalScope.PettyPhysics = { stepPet, entitySize, createStepper };
  }
})();
