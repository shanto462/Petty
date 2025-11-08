// Fantozzi Cloud Event - Random event where cloud follows a pet
// Based on macOS FantozziCloud.swift

(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.CloudEvent) {
    const { LOG, DISPLAY, MESSAGE_TYPES } = globalScope.PettyConfig || {};
    const logger = globalScope.PettyLogger;

    /**
     * Fantozzi Rainy Cloud Event
     * 1. Spawn cloud above random pet
     * 2. Cloud is 2x normal size
     * 3. Cloud follows pet for 60-120 seconds
     * 4. Auto-adjusts speed to match pet movement
     * 5. Cloud despawns automatically
     */
    class CloudEvent {
      /**
       * Trigger cloud event
       * @param {PetManager} petManager - Reference to pet manager
       */
      static async trigger(petManager) {
        logger.log(LOG.PREFIXES.PET, 'Cloud event triggered!');

        // Find eligible pets (non-ephemeral, has movement)
        const eligiblePets = petManager.pets.filter(pet => {
          const species = pet.speciesData;
          return species && species.speed > 0;
        });

        if (eligiblePets.length === 0) {
          logger.log(LOG.PREFIXES.PET, 'No eligible pets for cloud event');
          return;
        }

        // Select random pet
        const targetPet = eligiblePets[Math.floor(Math.random() * eligiblePets.length)];
        logger.log(LOG.PREFIXES.PET, 'Cloud following pet:', targetPet.speciesId);

        // Create cloud entity (2x normal size)
        const cloudSize = DISPLAY.DEFAULT_PET_SIZE * 2; // 150px
        const cloud = new EphemeralEntity('cloud', {
          position: { x: targetPet.position.x, y: targetPet.position.y - cloudSize },
          velocity: { x: 0, y: 0 },
          size: cloudSize,
          zIndex: 200, // Above everything (like macOS zIndex)
          imagePath: 'Resources/PetsAssets/fantozzi_front-0.png',
          autoRemove: false, // Manual control via lifetime
          scale: 2.0 // 2x size
        });

        // Fallback to emoji if sprite doesn't load
        if (cloud.img) {
          cloud.img.onerror = () => {
            logger.log(LOG.PREFIXES.PET, 'Cloud sprite not found, using emoji fallback');
            cloud.element.innerHTML = '<div style="font-size: 120px; user-select: none;">☁️</div>';
          };
        }

        petManager.addEphemeralEntity(cloud);

        // Random duration: 60-120 seconds
        const duration = 60000 + Math.random() * 60000;
        const startTime = Date.now();

        logger.log(LOG.PREFIXES.PET, `Cloud will follow for ${Math.round(duration/1000)} seconds`);

        // Custom update function for cloud
        cloud.onUpdate = (entity, timestamp) => {
          // Check if duration expired
          if (Date.now() - startTime >= duration) {
            logger.log(LOG.PREFIXES.PET, 'Cloud duration expired, removing');
            entity.remove();
            return;
          }

          // Check if target pet still exists
          if (!petManager.pets.includes(targetPet)) {
            logger.log(LOG.PREFIXES.PET, 'Target pet removed, cloud despawning');
            entity.remove();
            return;
          }

          // Calculate offset: cloud stays above pet
          // yOffset = cloudHeight - petHeight (from macOS)
          const yOffset = cloudSize - DISPLAY.DEFAULT_PET_SIZE;

          // Follow target pet
          const arrived = entity.seekTarget(targetPet, {
            offset: { x: 0, y: -yOffset },
            speed: 4.0, // Slightly faster than UFO for responsive following
            arrivalDistance: 50, // Larger distance for smoother following
            onArrival: null // No callback, just keep following
          });

          // Cloud continuously tracks pet position even when "arrived"
          // This ensures it follows pet movements smoothly
        };

        // Schedule removal after duration
        setTimeout(() => {
          if (cloud.isAlive) {
            logger.log(LOG.PREFIXES.PET, 'Cloud timeout reached, removing');
            cloud.remove();
          }
        }, duration);
      }
    }

    globalScope.CloudEvent = CloudEvent;
  }
})();
