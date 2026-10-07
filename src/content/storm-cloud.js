// Storm Cloud - A small animated storm cloud that trails a pet and rains on it.
// Used by the heron's storm flights (content/bird-brain.js) and by the storm cloud
// random event (content/cloud-event.js). The art is Petty's own (effect_storm-<n>.png).

(function () {
  if (window.StormCloud) return;

  const { DISPLAY, SPECIES, STORM_CLOUD } = window.PettyConfig;
  const { SPRITE, FRAMES, FPS, WIDTH, HEIGHT } = STORM_CLOUD;

  const frameUrl = (frame) => chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}${SPRITE}-${frame}.png`);

  /** Where the cloud hangs over a pet: just above it, so the rain falls on it. */
  function above(pet) {
    const width = pet.currentSize?.width ?? DISPLAY.DEFAULT_PET_SIZE;
    return { x: pet.position.x + width / 2 - WIDTH / 2, y: pet.position.y - HEIGHT * 0.55 };
  }

  /**
   * Adds a storm cloud that trails `pet`. It goes away when removed, when the pet is gone,
   * or after `duration` ms.
   * @returns {EphemeralEntity}
   */
  function follow(pet, petManager, { duration = null } = {}) {
    // Warm the cache so the first loop of the cloud does not flicker
    for (let i = 0; i < FRAMES; i++) new Image().src = frameUrl(i);

    const cloud = new EphemeralEntity('storm', {
      position: above(pet),
      size: WIDTH,
      zIndex: 20, // Above the pets
      imagePath: `${SPECIES.ASSETS_PATH}${SPRITE}-0.png`,
      lifetime: duration,
      autoRemove: duration !== null,
    });
    if (cloud.img) cloud.img.style.height = `${HEIGHT}px`;

    let shown = 0;
    cloud.onUpdate = (entity, timestamp) => {
      if (!pet.element || !petManager.pets.includes(pet)) {
        entity.remove();
        return;
      }
      // Trail the pet a little, like a cloud pushed by the wind
      const target = above(pet);
      entity.position.x += (target.x - entity.position.x) * 0.12;
      entity.position.y += (target.y - entity.position.y) * 0.12;
      const frame = Math.floor(timestamp / (1000 / FPS)) % FRAMES;
      if (frame !== shown && entity.img) {
        shown = frame;
        entity.img.src = frameUrl(frame);
      }
    };

    petManager.addEphemeralEntity(cloud);
    return cloud;
  }

  window.StormCloud = { follow, above };
})();
