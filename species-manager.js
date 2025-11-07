// Species Manager - Loads and manages all species data

class SpeciesManager {
  constructor() {
    this.species = {};
    this.loaded = false;
  }
  
  async loadAllSpecies() {
    console.log('[SpeciesManager] Loading all species...');
    
    // Complete list of all 43 species - auto-generated from Resources/Species/*.json
    const speciesList = [
      'ape',
      'betta',
      'cat',
      'cat_black',
      'cat_blue',
      'cat_floppa',
      'cat_gray',
      'cat_grumpy',
      'cat_house',
      'cat_white',
      'cayman718',
      'cromulon',
      'cromulon_pink',
      'crow',
      'crow_white',
      'frog',
      'frog_venom',
      'gazebo',
      'german',
      'hedgehog',
      'jeansbear',
      'koala',
      'koala_pirate',
      'milo',
      'mushroom',
      'mushroom_amanita',
      'mushroomwizard',
      'nyan',
      'panda',
      'panda_vest',
      'poop',
      'sheep',
      'sheep_black',
      'sloth',
      'sloth_swag',
      'snail',
      'snail_nicky',
      'sunflower',
      'trex',
      'trex_blue',
      'trex_violet',
      'trex_yellow',
      'ufo'
    ];
    
    for (const id of speciesList) {
      try {
        const url = chrome.runtime.getURL(`Resources/Species/${id}.json`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          this.species[id] = data;
        }
      } catch (error) {
        console.warn('[SpeciesManager] Failed to load:', id, error);
      }
    }
    
    this.loaded = true;
    console.log('[SpeciesManager] Loaded', Object.keys(this.species).length, 'species');
    return this.species;
  }
  
  getSpecies(id) {
    return this.species[id];
  }
  
  getAllSpecies() {
    return this.species;
  }
  
  getSpeciesByTag(tag) {
    return Object.values(this.species).filter(s => s.tags && s.tags.includes(tag));
  }
  
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
}

// Export
window.SpeciesManager = SpeciesManager;

