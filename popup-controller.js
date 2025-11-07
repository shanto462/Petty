// Popup Controller - Pet management UI

(function() {
  // Only initialize if not already initialized
  if (!window.__POPUP_CONTROLLER_INITIALIZED__) {
    window.__POPUP_CONTROLLER_INITIALIZED__ = true;

    // Access configuration
    const { LOG, MESSAGE_TYPES, SPECIES, TAG_EMOJI } = window.PettyConfig;

    class PopupController {
  constructor() {
    this.speciesManager = null;
    this.globalPets = [];
    this.init();
  }

  async init() {
    console.log(LOG.PREFIXES.POPUP, 'Initializing...');

    try {
      // Use singleton instance of SpeciesManager
      this.speciesManager = SpeciesManager.getInstance();
      await this.speciesManager.loadAllSpecies();
      await this.loadGlobalPets();
      this.renderSpeciesGrid();
      this.updateUI();
      this.setupRemoveAll();
      this.setupSearch();
      this.updateSpeciesCount();

      const loadedCount = Object.keys(this.speciesManager.species).length;
      console.log(LOG.PREFIXES.POPUP, 'Ready! Loaded', loadedCount, '/', SPECIES.EXPECTED_COUNT, 'species');
      console.log(LOG.PREFIXES.POPUP, 'Species:', Object.keys(this.speciesManager.species).sort().join(', '));
      console.log(LOG.PREFIXES.POPUP, 'Active pets:', this.globalPets.length);

      if (loadedCount < SPECIES.EXPECTED_COUNT) {
        console.warn(LOG.PREFIXES.POPUP, 'Missing species! Expected', SPECIES.EXPECTED_COUNT, 'got', loadedCount);
      }
    } catch (error) {
      console.error(LOG.PREFIXES.POPUP, 'Initialization error:', error);
      this.showError('Failed to initialize. Please try again.');
    }
  }
  
  async loadGlobalPets() {
    try {
      const response = await ChromeMessaging.sendMessage({ type: MESSAGE_TYPES.GET_GLOBAL_PETS });
      if (response && response.pets) {
        this.globalPets = response.pets;
      }
    } catch (error) {
      console.error(LOG.PREFIXES.POPUP, 'Failed to load global pets:', error);
      throw error;
    }
  }
  
  renderSpeciesGrid() {
    const container = document.getElementById('species-grid');
    container.innerHTML = '';

    const byTags = this.speciesManager.getSpeciesByTags();

    // Automatically discover all tags and sort them
    const allTags = Object.keys(byTags).sort();

    let totalRendered = 0;

    console.log(LOG.PREFIXES.POPUP, 'Discovered tags:', allTags);

    allTags.forEach(tag => {
      if (!byTags[tag] || byTags[tag].length === 0) {
        return;
      }

      const category = document.createElement('div');
      category.className = 'category';

      const title = document.createElement('h3');
      const emoji = TAG_EMOJI[tag] || '📦';
      const count = byTags[tag].length;
      title.textContent = `${emoji} ${tag.charAt(0).toUpperCase() + tag.slice(1)} (${count})`;
      category.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'pet-grid';

      // Sort alphabetically within category
      const sortedSpecies = byTags[tag].sort((a, b) => a.id.localeCompare(b.id));

      console.log(LOG.PREFIXES.POPUP, `Category ${tag}:`, sortedSpecies.map(s => s.id).join(', '));

      sortedSpecies.forEach(species => {
        const item = this.createSpeciesItem(species);
        grid.appendChild(item);
        totalRendered++;
      });

      category.appendChild(grid);
      container.appendChild(category);
    });

    console.log(LOG.PREFIXES.POPUP, 'Rendered', totalRendered, 'species in', allTags.length, 'categories');
  }
  
  createSpeciesItem(species) {
    const item = document.createElement('div');
    item.className = 'pet-item';
    item.dataset.species = species.id;
    item.title = species.id.replace(/_/g, ' ') + '\nClick to toggle on/off';

    const img = document.createElement('img');

    // Try multiple fallback image paths using configuration
    let imageIndex = 0;
    const tryNextImage = () => {
      if (imageIndex < SPECIES.FALLBACK_IMAGE_PATHS.length) {
        const pathGenerator = SPECIES.FALLBACK_IMAGE_PATHS[imageIndex];
        const imagePath = pathGenerator(species.id, species.movementPath || 'walk');
        img.src = chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}${imagePath}`);
        imageIndex++;
      } else {
        // All fallbacks failed, show text
        img.alt = species.id[0].toUpperCase();
        img.style.fontSize = '32px';
        img.style.lineHeight = '48px';
      }
    };

    img.onerror = tryNextImage;
    tryNextImage();

    item.appendChild(img);
    
    const name = document.createElement('div');
    name.className = 'pet-name';
    name.textContent = species.id.replace(/_/g, ' ');
    item.appendChild(name);
    
    const status = document.createElement('div');
    status.className = 'pet-status';
    item.appendChild(status);
    
    // Toggle behavior: click to add/remove
    item.onclick = () => this.togglePet(species.id);
    
    if (this.getPetCount(species.id) > 0) {
      item.classList.add('active');
    }
    
    return item;
  }
  
  getPetCount(speciesId) {
    return this.globalPets.filter(p => p.species === speciesId).length;
  }
  
  isActive(speciesId) {
    return this.globalPets.some(p => p.species === speciesId);
  }
  
  async togglePet(speciesId) {
    if (this.isActive(speciesId)) {
      await this.removePet(speciesId);
    } else {
      await this.addPet(speciesId);
    }
  }
  
  async addPet(speciesId) {
    try {
      const response = await ChromeMessaging.sendMessage({
        type: MESSAGE_TYPES.ADD_PET,
        species: speciesId
      });
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    } catch (error) {
      console.error(LOG.PREFIXES.POPUP, 'Failed to add pet:', error);
      this.showError('Failed to add pet. Please try again.');
    }
  }

  async removePet(speciesId) {
    const pet = this.globalPets.find(p => p.species === speciesId);
    if (!pet) return;

    try {
      const response = await ChromeMessaging.sendMessage({
        type: MESSAGE_TYPES.REMOVE_PET,
        petId: pet.id
      });
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    } catch (error) {
      console.error(LOG.PREFIXES.POPUP, 'Failed to remove pet:', error);
      this.showError('Failed to remove pet. Please try again.');
    }
  }
  
  updateUI() {
    // Update pet item states
    const items = document.querySelectorAll('.pet-item');
    items.forEach(item => {
      const speciesId = item.dataset.species;
      if (this.isActive(speciesId)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Update total count
    document.getElementById('total-count').textContent = this.globalPets.length;
    
    // Update active pets list
    this.updateActivePetsList();
  }
  
  updateActivePetsList() {
    const listEl = document.getElementById('active-pets-list');
    
    if (this.globalPets.length === 0) {
      listEl.innerHTML = '<div class="no-active-pets">No active pets. Click a pet below to add!</div>';
      return;
    }
    
    // Group pets by species
    const petsBySpecies = {};
    this.globalPets.forEach(pet => {
      if (!petsBySpecies[pet.species]) {
        petsBySpecies[pet.species] = [];
      }
      petsBySpecies[pet.species].push(pet);
    });
    
    listEl.innerHTML = '';
    Object.keys(petsBySpecies).sort().forEach(speciesId => {
      const species = this.speciesManager.getSpecies(speciesId);
      
      const badge = document.createElement('div');
      badge.className = 'active-pet-badge';
      
      // Add pet image
      const img = document.createElement('img');
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.objectFit = 'contain';
      img.style.imageRendering = 'pixelated';

      // Use fallback image paths from configuration
      let imageIndex = 0;
      const tryNextImage = () => {
        if (imageIndex < SPECIES.FALLBACK_IMAGE_PATHS.length) {
          const pathGenerator = SPECIES.FALLBACK_IMAGE_PATHS[imageIndex];
          const imagePath = pathGenerator(speciesId, species?.movementPath || 'walk');
          img.src = chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}${imagePath}`);
          imageIndex++;
        }
      };

      img.onerror = tryNextImage;
      tryNextImage();

      badge.appendChild(img);
      
      // Add name
      const name = document.createElement('span');
      name.textContent = speciesId.replace(/_/g, ' ');
      badge.appendChild(name);
      
      // Add remove button
      const removeBtn = document.createElement('span');
      removeBtn.className = 'remove-btn';
      removeBtn.title = 'Remove';
      removeBtn.textContent = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removePet(speciesId);
      };
      badge.appendChild(removeBtn);
      
      listEl.appendChild(badge);
    });
  }
  
  setupRemoveAll() {
    document.getElementById('remove-all').onclick = async () => {
      if (confirm('Remove all pets from all tabs?')) {
        try {
          const response = await ChromeMessaging.sendMessage({ type: MESSAGE_TYPES.REMOVE_ALL_PETS });
          if (response && response.success) {
            await this.loadGlobalPets();
            this.updateUI();
          }
        } catch (error) {
          console.error(LOG.PREFIXES.POPUP, 'Failed to remove all pets:', error);
          this.showError('Failed to remove all pets. Please try again.');
        }
      }
    };
  }
  
  setupSearch() {
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      this.filterSpecies(query);
    });
  }
  
  filterSpecies(query) {
    const categories = document.querySelectorAll('.category');
    let visibleCount = 0;
    
    categories.forEach(category => {
      const items = category.querySelectorAll('.pet-item');
      let categoryHasVisible = false;
      
      items.forEach(item => {
        const name = item.dataset.species.toLowerCase();
        const shouldShow = !query || name.includes(query);
        
        item.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) {
          categoryHasVisible = true;
          visibleCount++;
        }
      });
      
      category.style.display = categoryHasVisible ? 'block' : 'none';
    });
    
    document.getElementById('shown-count').textContent = visibleCount;
  }
  
  updateSpeciesCount() {
    const totalSpecies = Object.keys(this.speciesManager.species).length;

    document.getElementById('species-count').textContent = totalSpecies;
    document.getElementById('shown-count').textContent = totalSpecies;

    // Visual warning if not all species loaded
    const countEl = document.querySelector('.species-count');
    if (totalSpecies < SPECIES.EXPECTED_COUNT) {
      countEl.style.background = 'rgba(244, 67, 54, 0.3)';
      countEl.innerHTML = `⚠️ Showing <strong id="shown-count">${totalSpecies}</strong> / <strong id="species-count">${SPECIES.EXPECTED_COUNT}</strong> species (Some failed to load!)`;
    }
  }

  /**
   * Display error message to user
   */
  showError(message) {
    // Simple error display - could be enhanced with a modal or toast
    const container = document.getElementById('species-grid');
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 20px; text-align: center; color: #ff6b6b; background: rgba(244, 67, 54, 0.2); border-radius: 8px; margin: 10px;';
    errorDiv.textContent = message;
    container.prepend(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => errorDiv.remove(), 5000);
  }
}

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        new PopupController();
      });
    } else {
      new PopupController();
    }
  }
})();

