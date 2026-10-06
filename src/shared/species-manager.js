// Species Manager - Loads and manages all species data with singleton pattern.
// Species definitions and sprite frame counts come from the generated catalog
// (src/shared/catalog.js), so nothing is fetched at runtime.

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  // Only define if not already defined
  if (!globalScope.SpeciesManager) {
    const { LOG, SPECIES, DEFAULT_ANIMATIONS } = globalScope.PettyConfig;
    const { validateSpeciesData } = globalScope.SpeciesValidator || {};
    const logger = globalScope.PettyLogger;

    class SpeciesManager {
      // Singleton instance
      static #instance = null;

      constructor() {
        // Implement singleton pattern - return existing instance if it exists
        if (SpeciesManager.#instance) {
          return SpeciesManager.#instance;
        }

        this.species = {};
        this.frames = {};
        this.loaded = false;
        this.loading = null; // Promise for ongoing load operation

        SpeciesManager.#instance = this;
      }

      /**
       * Get the singleton instance
       */
      static getInstance() {
        if (!SpeciesManager.#instance) {
          SpeciesManager.#instance = new SpeciesManager();
        }
        return SpeciesManager.#instance;
      }

      /**
       * Load all species data from the catalog (validated, with defaults applied)
       */
      async loadAllSpecies() {
        if (this.loaded) {
          return this.species;
        }

        // If already loading, return the existing promise
        if (this.loading) {
          return this.loading;
        }

        this.loading = this.#performLoad();

        try {
          await this.loading;
          return this.species;
        } finally {
          this.loading = null;
        }
      }

      async #performLoad() {
        const catalog = globalScope.PettyCatalog || { species: {}, frames: {} };

        for (const [id, data] of Object.entries(catalog.species)) {
          if (!validateSpeciesData) {
            this.species[id] = data;
            continue;
          }
          const validation = validateSpeciesData(data, id);
          if (!validation.valid) {
            // Still use the data (defaults applied) so one bad field does not hide a pet
            logger.warn(LOG.PREFIXES.SPECIES_MANAGER, 'Validation errors for species:', id, validation.errors);
          }
          if (validation.data) {
            this.species[id] = validation.data;
          }
        }

        this.frames = catalog.frames;
        this.loaded = true;

        const loadedCount = Object.keys(this.species).length;
        logger.log(LOG.PREFIXES.SPECIES_MANAGER, 'Loaded', loadedCount, '/', SPECIES.EXPECTED_COUNT, 'species');

        if (loadedCount < SPECIES.EXPECTED_COUNT) {
          logger.warn(
            LOG.PREFIXES.SPECIES_MANAGER,
            'Warning: Expected',
            SPECIES.EXPECTED_COUNT,
            'species but loaded',
            loadedCount,
          );
        }
      }

      /**
       * Get a specific species by ID
       */
      getSpecies(id) {
        return this.species[id];
      }

      /**
       * Get all loaded species
       */
      getAllSpecies() {
        return this.species;
      }

      /**
       * Get species that have a specific tag
       */
      getSpeciesByTag(tag) {
        return Object.values(this.species).filter((s) => s.tags && s.tags.includes(tag));
      }

      /**
       * Get species organized by tags
       */
      getSpeciesByTags() {
        const byTags = {};
        Object.values(this.species).forEach((species) => {
          if (!species.tags || species.tags.length === 0) {
            if (!byTags['other']) byTags['other'] = [];
            byTags['other'].push(species);
          } else {
            species.tags.forEach((tag) => {
              if (!byTags[tag]) byTags[tag] = [];
              byTags[tag].push(species);
            });
          }
        });
        return byTags;
      }

      /**
       * Check if a species exists
       */
      hasSpecies(id) {
        return Object.hasOwn(this.species, id);
      }

      /**
       * Number of sprite frames for an animation (0 when the sprite does not exist)
       */
      getFrameCount(speciesId, animationId) {
        return this.frames[speciesId]?.[animationId] || 0;
      }

      /**
       * Extension URL of one sprite frame
       */
      getSpriteUrl(speciesId, animationId, frame = 0) {
        return chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}${speciesId}_${animationId}-${frame}.png`);
      }

      /**
       * Best still image for a species (movement, then front, then idle)
       */
      getThumbnailUrl(speciesId) {
        const species = this.species[speciesId];
        const candidates = [species?.movementPath, DEFAULT_ANIMATIONS.FRONT, 'idle'];
        const animation = candidates.find((id) => id && this.getFrameCount(speciesId, id) > 0);
        return animation ? this.getSpriteUrl(speciesId, animation) : null;
      }

      /**
       * Get loading status
       */
      isLoaded() {
        return this.loaded;
      }

      /**
       * Reset the manager (useful for testing)
       */
      reset() {
        this.species = {};
        this.frames = {};
        this.loaded = false;
        this.loading = null;
      }
    }

    globalScope.SpeciesManager = SpeciesManager;
  }
})();
