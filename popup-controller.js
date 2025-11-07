// Popup Controller - Pet management UI

class PopupController {
  constructor() {
    this.speciesManager = null;
    this.globalPets = [];
    this.init();
  }
  
  async init() {
    console.log('[Popup] Initializing...');
    
    // Species manager is already loaded via popup.html script tag
    this.speciesManager = new SpeciesManager();
    await this.speciesManager.loadAllSpecies();
    await this.loadGlobalPets();
    this.renderSpeciesGrid();
    this.updateUI(); // Update pet counts and totals
    this.setupRemoveAll();
    this.setupSearch();
    this.updateSpeciesCount();
    
    const loadedCount = Object.keys(this.speciesManager.species).length;
    console.log('[Popup] ✅ Ready! Loaded', loadedCount, '/ 43 species');
    console.log('[Popup] Species:', Object.keys(this.speciesManager.species).sort().join(', '));
    console.log('[Popup] Active pets:', this.globalPets.length);
    
    if (loadedCount < 43) {
      console.warn('[Popup] ⚠️ Missing species! Expected 43, got', loadedCount);
    }
  }
  
  async loadGlobalPets() {
    try {
      const response = await ChromeMessaging.sendMessage({ type: 'GET_GLOBAL_PETS' });
      if (response && response.pets) {
        this.globalPets = response.pets;
      }
    } catch (error) {
      console.error('[PopupController] Failed to load global pets:', error);
    }
  }
  
  renderSpeciesGrid() {
    const container = document.getElementById('species-grid');
    container.innerHTML = '';
    
    const byTags = this.speciesManager.getSpeciesByTags();
    
    // Automatically discover all tags and sort them
    const allTags = Object.keys(byTags).sort();
    
    // Emoji mapping for tags (defaults to 📦 if not found)
    const tagEmoji = {
      'cats': '🐱',
      'dinos': '🦖',
      'water': '🐠',
      'jungle': '🦍',
      'forest': '🦔',
      'birds': '🦅',
      'dogs': '🐕',
      'bear': '🐻',
      'farm': '🐄',
      'plants': '🌻',
      'pokèmon': '⚡',
      'memes': '🎭',
      'aliens': '👽',
      'decorations': '🏠',
      'emoji': '😊',
      'slow motion': '🐌',
      'other': '✨'
    };
    
    let totalRendered = 0;
    
    console.log('[Popup] Discovered tags:', allTags);
    
    allTags.forEach(tag => {
      if (!byTags[tag] || byTags[tag].length === 0) {
        return;
      }
      
      const category = document.createElement('div');
      category.className = 'category';
      
      const title = document.createElement('h3');
      const emoji = tagEmoji[tag] || '📦';
      const count = byTags[tag].length;
      title.textContent = `${emoji} ${tag.charAt(0).toUpperCase() + tag.slice(1)} (${count})`;
      category.appendChild(title);
      
      const grid = document.createElement('div');
      grid.className = 'pet-grid';
      
      // Sort alphabetically within category
      const sortedSpecies = byTags[tag].sort((a, b) => a.id.localeCompare(b.id));
      
      console.log(`[Popup] Category ${tag}:`, sortedSpecies.map(s => s.id).join(', '));
      
      sortedSpecies.forEach(species => {
        const item = this.createSpeciesItem(species);
        grid.appendChild(item);
        totalRendered++;
      });
      
      category.appendChild(grid);
      container.appendChild(category);
    });
    
    console.log('[Popup] ✅ Rendered', totalRendered, 'species in', allTags.length, 'categories');
  }
  
  createSpeciesItem(species) {
    const item = document.createElement('div');
    item.className = 'pet-item';
    item.dataset.species = species.id;
    item.title = species.id.replace(/_/g, ' ') + '\nClick to toggle on/off';
    
    const img = document.createElement('img');
    // Try multiple animation paths
    const imagePaths = [
      `${species.id}_${species.movementPath}-0.png`,
      `${species.id}_front-0.png`,
      `${species.id}_idle-0.png`
    ];
    
    let imageIndex = 0;
    img.src = chrome.runtime.getURL(`Resources/PetsAssets/${imagePaths[0]}`);
    img.onerror = () => {
      imageIndex++;
      if (imageIndex < imagePaths.length) {
        img.src = chrome.runtime.getURL(`Resources/PetsAssets/${imagePaths[imageIndex]}`);
      } else {
        img.alt = species.id[0].toUpperCase();
        img.style.fontSize = '32px';
        img.style.lineHeight = '48px';
      }
    };
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
        type: 'ADD_PET', 
        species: speciesId 
      });
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    } catch (error) {
      console.error('[PopupController] Failed to add pet:', error);
    }
  }
  
  async removePet(speciesId) {
    const pet = this.globalPets.find(p => p.species === speciesId);
    if (!pet) return;
    
    try {
      const response = await ChromeMessaging.sendMessage({ 
        type: 'REMOVE_PET', 
        petId: pet.id 
      });
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    } catch (error) {
      console.error('[PopupController] Failed to remove pet:', error);
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
      
      const imagePaths = [
        `${speciesId}_${species?.movementPath || 'walk'}-0.png`,
        `${speciesId}_front-0.png`,
        `${speciesId}_idle-0.png`
      ];
      
      let imageIndex = 0;
      img.src = chrome.runtime.getURL(`Resources/PetsAssets/${imagePaths[0]}`);
      img.onerror = () => {
        imageIndex++;
        if (imageIndex < imagePaths.length) {
          img.src = chrome.runtime.getURL(`Resources/PetsAssets/${imagePaths[imageIndex]}`);
        }
      };
      
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
          const response = await ChromeMessaging.sendMessage({ type: 'REMOVE_ALL_PETS' });
          if (response && response.success) {
            await this.loadGlobalPets();
            this.updateUI();
          }
        } catch (error) {
          console.error('[PopupController] Failed to remove all pets:', error);
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
    const expectedSpecies = 43;
    
    document.getElementById('species-count').textContent = totalSpecies;
    document.getElementById('shown-count').textContent = totalSpecies;
    
    // Visual warning if not all species loaded
    const countEl = document.querySelector('.species-count');
    if (totalSpecies < expectedSpecies) {
      countEl.style.background = 'rgba(244, 67, 54, 0.3)';
      countEl.innerHTML = `⚠️ Showing <strong id="shown-count">${totalSpecies}</strong> / <strong id="species-count">${expectedSpecies}</strong> species (Some failed to load!)`;
    }
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

