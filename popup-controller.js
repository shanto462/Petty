// Popup Controller - Pet management UI

class PopupController {
  constructor() {
    this.speciesManager = null;
    this.globalPets = [];
    this.init();
  }
  
  async init() {
    console.log('[Popup] Initializing...');
    
    // Load species manager (reuse from content script)
    const script = document.createElement('script');
    script.src = 'species-manager.js';
    document.head.appendChild(script);
    
    await new Promise(resolve => {
      script.onload = () => {
        this.speciesManager = new SpeciesManager();
        resolve();
      };
    });
    
    await this.speciesManager.loadAllSpecies();
    await this.loadGlobalPets();
    this.renderSpeciesGrid();
    this.setupToggle();
    this.setupRemoveAll();
    this.setupSearch();
    this.updateSpeciesCount();
    
    const loadedCount = Object.keys(this.speciesManager.species).length;
    console.log('[Popup] ✅ Ready! Loaded', loadedCount, '/ 43 species');
    console.log('[Popup] Species:', Object.keys(this.speciesManager.species).sort().join(', '));
    
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
    item.title = species.id.replace(/_/g, ' ') + '\nLeft-click: Add | Right-click: Remove';
    
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
    
    const count = document.createElement('div');
    count.className = 'pet-count';
    count.textContent = this.getPetCount(species.id);
    count.style.display = this.getPetCount(species.id) > 0 ? 'block' : 'none';
    item.appendChild(count);
    
    item.onclick = () => this.addPet(species.id);
    item.oncontextmenu = (e) => {
      e.preventDefault();
      this.removePet(species.id);
    };
    
    if (this.getPetCount(species.id) > 0) {
      item.classList.add('active');
    }
    
    return item;
  }
  
  getPetCount(speciesId) {
    return this.globalPets.filter(p => p.species === speciesId).length;
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
    const items = document.querySelectorAll('.pet-item');
    items.forEach(item => {
      const speciesId = item.dataset.species;
      const count = this.getPetCount(speciesId);
      const countEl = item.querySelector('.pet-count');
      
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'block' : 'none';
      
      if (count > 0) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Update total count
    document.getElementById('total-count').textContent = this.globalPets.length;
  }
  
  setupToggle() {
    const toggle = document.getElementById('toggle-enabled');
    const label = document.getElementById('toggle-label');
    
    chrome.storage.sync.get(['pettyEnabled'], (result) => {
      const enabled = result.pettyEnabled !== false;
      if (enabled) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    });
    
    label.onclick = () => {
      const isActive = toggle.classList.contains('active');
      const newValue = !isActive;
      
      chrome.storage.sync.set({ pettyEnabled: newValue });
      
      if (newValue) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    };
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

