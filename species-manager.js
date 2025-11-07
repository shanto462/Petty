// Species Manager - Loads and manages all species data with singleton pattern

(function() {
  // Only define if not already defined
  if (!window.SpeciesManager) {
    // Access configuration and species list
    const { LOG, SPECIES } = window.PettyConfig;
    const SPECIES_LIST = window.SPECIES_LIST;
    const { validateSpeciesData } = window.SpeciesValidator || {};

    class SpeciesManager {
  // Singleton instance
  static #instance = null;

  constructor() {
    // Implement singleton pattern - return existing instance if it exists
    if (SpeciesManager.#instance) {
      return SpeciesManager.#instance;
    }

    this.species = {};
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
   * Load all species data in parallel using Promise.all()
   */
  async loadAllSpecies() {
    // If already loaded, return cached data
    if (this.loaded) {
      console.log(LOG.PREFIXES.SPECIES_MANAGER, 'Already loaded, returning cached data');
      return this.species;
    }

    // If already loading, return the existing promise
    if (this.loading) {
      console.log(LOG.PREFIXES.SPECIES_MANAGER, 'Loading in progress, waiting...');
      return this.loading;
    }

    console.log(LOG.PREFIXES.SPECIES_MANAGER, 'Loading', SPECIES_LIST.length, 'species in parallel...');

    // Create the loading promise
    this.loading = this.#performLoad();

    try {
      await this.loading;
      return this.species;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Internal method to perform the actual loading
   */
  async #performLoad() {
    // Load all species in parallel using Promise.all()
    const loadPromises = SPECIES_LIST.map(async (id) => {
      try {
        // Add timestamp to URL to force bypass all caches
        const url = chrome.runtime.getURL(`${SPECIES.RESOURCES_PATH}${id}.json`) + '?v=' + Date.now();
        const response = await fetch(url, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });

        if (response.ok) {
          const data = await response.json();

          // Validate species data if validator is available
          if (validateSpeciesData) {
            const validation = validateSpeciesData(data, id);
            if (!validation.valid) {
              console.warn(LOG.PREFIXES.SPECIES_MANAGER, 'Validation errors for species:', id, validation.errors);
              // Still return data even if validation fails (with defaults applied)
              return { id, data: validation.data };
            }
            // Use validated data with defaults applied
            return { id, data: validation.data };
          }

          return { id, data };
        }

        console.warn(LOG.PREFIXES.SPECIES_MANAGER, 'Failed to fetch species:', id);
        return null;
      } catch (error) {
        console.warn(LOG.PREFIXES.SPECIES_MANAGER, 'Failed to load:', id, error);
        return null;
      }
    });

    // Wait for all species to load
    const results = await Promise.all(loadPromises);

    // Store loaded species data
    results.forEach(result => {
      if (result && result.data) {
        this.species[result.id] = result.data;
      }
    });

    this.loaded = true;
    const loadedCount = Object.keys(this.species).length;
    console.log(LOG.PREFIXES.SPECIES_MANAGER, 'Loaded', loadedCount, '/', SPECIES_LIST.length, 'species');

    if (loadedCount < SPECIES.EXPECTED_COUNT) {
      console.warn(LOG.PREFIXES.SPECIES_MANAGER, 'Warning: Expected', SPECIES.EXPECTED_COUNT, 'species but loaded', loadedCount);
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
    return Object.values(this.species).filter(s => s.tags && s.tags.includes(tag));
  }

  /**
   * Get species organized by tags
   */
  getSpeciesByTags() {
    const byTags = {};
    Object.values(this.species).forEach(species => {
      if (!species.tags || species.tags.length === 0) {
        if (!byTags['other']) byTags['other'] = [];
        byTags['other'].push(species);
      } else {
        species.tags.forEach(tag => {
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
    return id in this.species;
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
    this.loaded = false;
    this.loading = null;
    }
  }

    // Export both the class and singleton instance
    window.SpeciesManager = SpeciesManager;
  }
})();

