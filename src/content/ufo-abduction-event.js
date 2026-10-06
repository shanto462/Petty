// UFO Abduction Event - Random event where UFO abducts a pet
// Based on macOS UfoAbduction.swift

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.UfoAbductionEvent) {
    const { LOG, MESSAGE_TYPES, SPECIES } = globalScope.PettyConfig || {};
    const logger = globalScope.PettyLogger;

    /**
     * UFO Abduction Event
     * 1. Spawn UFO at top-left
     * 2. UFO seeks random pet
     * 3. When arrived, abduct pet (shrink + remove)
     * 4. UFO flies away
     * 5. Respawn pet after 10 seconds
     */
    class UfoAbductionEvent {
      /**
       * Trigger UFO abduction event
       * @param {PetManager} petManager - Reference to pet manager
       */
      static async trigger(petManager) {
        logger.log(LOG.PREFIXES.PET, 'UFO Abduction event triggered!');

        // Find eligible pets (non-ephemeral, has movement)
        const eligiblePets = petManager.pets.filter((pet) => {
          const species = pet.speciesData;
          return species && species.speed > 0;
        });

        if (eligiblePets.length === 0) {
          logger.log(LOG.PREFIXES.PET, 'No eligible pets for UFO abduction');
          return;
        }

        // Select random pet
        const targetPet = eligiblePets[Math.floor(Math.random() * eligiblePets.length)];
        logger.log(LOG.PREFIXES.PET, 'UFO targeting pet:', targetPet.speciesId);

        // Create UFO entity
        const ufo = new EphemeralEntity('ufo', {
          position: { x: 50, y: 50 }, // Top-left
          velocity: { x: 0, y: 0 },
          size: 100,
          zIndex: 10, // Above pets
          imagePath: `${SPECIES.ASSETS_PATH}${SPECIES.EFFECT_SPRITES.UFO}`,
          autoRemove: false, // Manual control
        });

        // Fallback to emoji if sprite doesn't load
        if (ufo.img) {
          ufo.img.onerror = () => {
            logger.log(LOG.PREFIXES.PET, 'UFO sprite not found, using emoji fallback');
            ufo.element.replaceChildren(EphemeralEntity.createEmoji('🛸', 80));
          };
        }

        petManager.addEphemeralEntity(ufo);

        // State machine
        let state = 'seeking'; // seeking, abducting, leaving
        let abductionStartTime = 0;
        const ABDUCTION_DURATION = 1250; // ms
        const RESPAWN_DELAY = 10000; // 10 seconds

        // Store pet data for respawn
        const petData = {
          species: targetPet.speciesId,
          speciesData: targetPet.speciesData,
        };

        // Custom update function for UFO
        ufo.onUpdate = async (entity, timestamp) => {
          switch (state) {
            case 'seeking':
              // Seek pet to position above it
              entity.seekTarget(targetPet, {
                offset: { x: 0, y: -80 },
                speed: 3.0,
                arrivalDistance: 30,
                onArrival: () => {
                  logger.log(LOG.PREFIXES.PET, 'UFO arrived at pet!');
                  state = 'abducting';
                  abductionStartTime = Date.now();

                  // Start abduction sequence
                  UfoAbductionEvent.startAbduction(targetPet, petManager);
                },
              });
              break;

            case 'abducting':
              // Stay above pet during abduction
              entity.position.x = targetPet.position.x;
              entity.position.y = targetPet.position.y - 80;
              entity.velocity = { x: 0, y: 0 };

              // Check if abduction complete
              if (Date.now() - abductionStartTime >= ABDUCTION_DURATION) {
                logger.log(LOG.PREFIXES.PET, 'Abduction complete, removing pet');

                // Remove pet
                const petId = targetPet.id;
                petManager.removePetLocal(petId);

                // Notify background to remove from global state
                ChromeMessaging.sendMessage({
                  type: MESSAGE_TYPES.REMOVE_PET,
                  petId: petId,
                }).catch(() => {});

                // UFO flies away
                state = 'leaving';
                entity.velocity = { x: 4, y: -4 }; // Diagonal up-right

                // Schedule respawn
                setTimeout(async () => {
                  logger.log(LOG.PREFIXES.PET, 'Respawning abducted pet:', petData.species);

                  // Request background to add new pet
                  try {
                    await ChromeMessaging.sendMessage({
                      type: MESSAGE_TYPES.ADD_PET,
                      species: petData.species,
                    });
                  } catch (error) {
                    logger.error(LOG.PREFIXES.PET, 'Failed to respawn pet:', error);
                  }
                }, RESPAWN_DELAY);
              }
              break;

            case 'leaving':
              // Remove UFO when off-screen
              if (entity.isOutOfBounds()) {
                logger.log(LOG.PREFIXES.PET, 'UFO left screen, removing');
                entity.remove();
              }
              break;
          }
        };
      }

      /**
       * Start abduction animation on pet
       */
      static async startAbduction(pet, petManager) {
        logger.log(LOG.PREFIXES.PET, 'Starting abduction animation on', pet.speciesId);

        // Paralyze pet (stop normal physics)
        pet.isDragging = true; // Hack to prevent physics updates

        // Change animation to drag (being lifted)
        await pet.setAnimation(pet.dragPath);

        // Shrink pet from current size to 5x5 over 1.1 seconds
        await pet.scaleTo(0.1, 1100); // 0.1 = 10% of original size (~7.5px)

        logger.log(LOG.PREFIXES.PET, 'Abduction animation complete');
      }
    }

    globalScope.UfoAbductionEvent = UfoAbductionEvent;
  }
})();
