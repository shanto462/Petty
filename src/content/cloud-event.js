// Storm Cloud Event - Random event: a small storm cloud follows one pet around for a while.
// Started by the background's random event scheduler (TRIGGER_CLOUD_EVENT). The idea comes
// from Bit Therapy's rain cloud; the cloud art is Petty's own (see content/storm-cloud.js).

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.CloudEvent) {
    const { LOG, STORM_CLOUD } = globalScope.PettyConfig || {};
    const logger = globalScope.PettyLogger;

    class CloudEvent {
      /**
       * Picks a pet that moves (not a tree or a pond, and not a heron already in its own
       * storm) and lets a storm cloud follow it for STORM_CLOUD.EVENT_MIN to EVENT_MAX ms.
       * @param {PetManager} petManager
       * @returns {EphemeralEntity | null} The cloud, or null when no pet can have one
       */
      static trigger(petManager) {
        const eligible = petManager.pets.filter((pet) => pet.speciesData?.speed > 0 && !pet.brain?.stormCloud);
        if (eligible.length === 0) {
          logger.log(LOG.PREFIXES.PET, 'No pet for the storm cloud event');
          return null;
        }

        const pet = eligible[Math.floor(Math.random() * eligible.length)];
        const duration = STORM_CLOUD.EVENT_MIN + Math.random() * (STORM_CLOUD.EVENT_MAX - STORM_CLOUD.EVENT_MIN);
        logger.log(LOG.PREFIXES.PET, `Storm cloud follows ${pet.speciesId} for ${Math.round(duration / 1000)} s`);
        return StormCloud.follow(pet, petManager, { duration });
      }
    }

    globalScope.CloudEvent = CloudEvent;
  }
})();
