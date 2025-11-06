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
    
    console.log('[Popup] Ready!');
  }
  
  async loadGlobalPets() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_GLOBAL_PETS' }, (response) => {
        if (response && response.pets) {
          this.globalPets = response.pets;
        }
        resolve();
      });
    });
  }
  
  renderSpeciesGrid() {
    const container = document.getElementById('species-grid');
    container.innerHTML = '';
    
    const byTags = this.speciesManager.getSpeciesByTags();
    const tagOrder = ['cats', 'water', 'jungle', 'forest', 'memes', 'aliens', 'decorations', 'other'];
    
    tagOrder.forEach(tag => {
      if (!byTags[tag]) return;
      
      const category = document.createElement('div');
      category.className = 'category';
      
      const title = document.createElement('h3');
      title.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
      category.appendChild(title);
      
      const grid = document.createElement('div');
      grid.className = 'pet-grid';
      
      byTags[tag].forEach(species => {
        const item = this.createSpeciesItem(species);
        grid.appendChild(item);
      });
      
      category.appendChild(grid);
      container.appendChild(category);
    });
  }
  
  createSpeciesItem(species) {
    const item = document.createElement('div');
    item.className = 'pet-item';
    item.dataset.species = species.id;
    
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL(`Resources/PetsAssets/${species.id}_front-0.png`);
    img.onerror = () => {
      img.src = chrome.runtime.getURL(`Resources/PetsAssets/${species.id}_idle-0.png`);
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
  
  addPet(speciesId) {
    chrome.runtime.sendMessage({ 
      type: 'ADD_PET', 
      species: speciesId 
    }, async (response) => {
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    });
  }
  
  removePet(speciesId) {
    const pet = this.globalPets.find(p => p.species === speciesId);
    if (!pet) return;
    
    chrome.runtime.sendMessage({ 
      type: 'REMOVE_PET', 
      petId: pet.id 
    }, async (response) => {
      if (response && response.success) {
        await this.loadGlobalPets();
        this.updateUI();
      }
    });
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
    document.getElementById('remove-all').onclick = () => {
      if (confirm('Remove all pets from all tabs?')) {
        chrome.runtime.sendMessage({ type: 'REMOVE_ALL_PETS' }, async (response) => {
          if (response && response.success) {
            await this.loadGlobalPets();
            this.updateUI();
          }
        });
      }
    };
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

