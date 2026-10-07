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
     * Flight for birds that are in the air or perched. No gravity: a bird either flies
     * straight to `pet.flightTarget` or cruises sideways toward its `pet.cruiseY` height.
     */
    function stepFlight(pet, species, { settings, viewport }) {
      const { width, height } = entitySize(pet, species, settings.petSize);
      if (pet.isPerched) {
        pet.velocity.x = 0;
        pet.velocity.y = 0;
        return;
      }

      const sizeRatio = settings.petSize / DISPLAY.DEFAULT_PET_SIZE;
      const flySpeed =
        sizeRatio *
        SPEED.BASE_SPEED *
        (species.flySpeed || species.speed * 2 || 1) *
        settings.speedMultiplier *
        (pet.flightBoost || 1);

      const target = pet.flightTarget;
      if (target) {
        const dx = target.x - pet.position.x;
        const dy = target.y - pet.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= flySpeed) {
          pet.position.x = target.x;
          pet.position.y = target.y;
          pet.velocity.x = 0;
          pet.velocity.y = 0;
        } else {
          pet.velocity.x = (dx / distance) * flySpeed;
          pet.velocity.y = (dy / distance) * flySpeed;
        }
        if (Math.abs(dx) > 1) pet.direction = dx > 0 ? 1 : -1;
      } else {
        pet.velocity.x = pet.direction * flySpeed;
        const cruiseY = pet.cruiseY ?? pet.position.y;
        const climb = Math.max(-flySpeed * 0.6, Math.min(flySpeed * 0.6, (cruiseY - pet.position.y) * 0.02));
        pet.velocity.y = climb;
      }

      pet.position.x += pet.velocity.x;
      pet.position.y += pet.velocity.y;

      // Turn around at the edges of the window, and never leave it
      const maxX = viewport.width - width;
      const maxY = viewport.height - height;
      if (pet.position.x <= 0) {
        pet.position.x = 0;
        if (!target) pet.direction = 1;
      } else if (pet.position.x >= maxX) {
        pet.position.x = maxX;
        if (!target) pet.direction = -1;
      }
      pet.position.y = Math.max(0, Math.min(maxY, pet.position.y));
    }

    /**
     * Advances one pet by one physics tick. Mutates `pet` in place.
     * @param {object} pet - Global pet state (position, velocity, direction, isMoving, ...)
     * @param {object} species - Species definition from the catalog
     * @param {{settings: object, viewport: {width: number, height: number}}} world
     */
    function stepPet(pet, species, { settings, viewport }) {
      if (pet.isDragging || !species) return;

      const capabilities = species.capabilities || [];
      if (capabilities.includes(CAPABILITIES.FLYING) && (pet.isAirborne || pet.isPerched)) {
        stepFlight(pet, species, { settings, viewport });
        return;
      }

      // Speed calculation matching macOS formula:
      // speed = (petSize / defaultSize) * baseSpeed * species.speed * speedMultiplier
      const sizeRatio = settings.petSize / DISPLAY.DEFAULT_PET_SIZE;
      const speed = sizeRatio * SPEED.BASE_SPEED * (species.speed || 0) * settings.speedMultiplier;
      const gravity = settings.gravityEnabled ? PHYSICS.GRAVITY : 0;

      const { width, height } = entitySize(pet, species, settings.petSize);
      const maxX = viewport.width - width;
      const maxY = viewport.height - height;

      const isStationary = !pet.isMoving;
      // Wall crawlers, sleeping places, trees and ponds ignore gravity and stick to the bottom edge
      const sticksToBottom = [
        CAPABILITIES.WALL_CRAWLER,
        CAPABILITIES.SLEEPING_PLACE,
        CAPABILITIES.PERCHING_PLACE,
        CAPABILITIES.FISHING_SPOT,
      ].some((capability) => capabilities.includes(capability));

      if (!sticksToBottom && pet.position.y < maxY) {
        pet.velocity.y += gravity;
      }

      if (sticksToBottom) {
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

    globalScope.PettyPhysics = { stepPet, stepFlight, entitySize, createStepper };
  }
})();
