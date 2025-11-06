// Pet Manager - Manages all pets and UI

class PetManager {
  constructor() {
    this.speciesManager = new SpeciesManager();
    this.pets = [];
    this.enabled = true;
    this.menuOpen = false;
  }
  
  async init() {
    console.log('[PetManager] Initializing...');
    
    // Load all species
    await this.speciesManager.loadAllSpecies();
    
    // Send viewport dimensions to background
    this.sendViewportUpdate();
    window.addEventListener('resize', () => this.sendViewportUpdate());
    
    // Load settings
    chrome.storage.sync.get(['pettyEnabled'], (result) => {
      this.enabled = result.pettyEnabled !== false;
      
      if (this.enabled) {
        // Get global pets from background
        chrome.runtime.sendMessage({ type: 'GET_GLOBAL_PETS' }, (response) => {
          if (response && response.pets) {
            response.pets.forEach(petData => {
              this.createPetFromData(petData);
            });
          }
          
          // Start update loop
          this.startUpdateLoop();
          
          console.log('[PetManager] ✅ Ready! Active pets:', this.pets.length);
        });
      }
    });
    
    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleBackgroundMessage(message);
    });
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.pettyEnabled) {
        this.enabled = changes.pettyEnabled.newValue;
        if (!this.enabled) {
          this.removeAllPetsLocal();
        }
      }
    });
  }
  
  sendViewportUpdate() {
    chrome.runtime.sendMessage({
      type: 'UPDATE_VIEWPORT',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }
  
  handleBackgroundMessage(message) {
    switch (message.type) {
      case 'PET_ADDED':
        this.createPetFromData(message.pet);
        break;
        
      case 'PET_REMOVED':
        this.removePetLocal(message.petId);
        break;
        
      case 'ALL_PETS_REMOVED':
        this.removeAllPetsLocal();
        break;
        
      case 'SYNC_ALL_PETS':
        this.syncPets(message.pets);
        break;
        
      case 'PET_POSITION_UPDATE':
        const pet = this.pets.find(p => p.id === message.petId);
        if (pet && !pet.isDragging) {
          pet.position = message.position;
          pet.updatePosition();
        }
        break;
    }
  }
  
  syncPets(globalPets) {
    // Sync positions from global state (background is source of truth)
    globalPets.forEach(globalPet => {
      const localPet = this.pets.find(p => p.id === globalPet.id);
      if (localPet) {
        // Only update if not being dragged by THIS tab
        if (!localPet.isDragging) {
          localPet.position = { ...globalPet.position };
          localPet.velocity = { ...globalPet.velocity };
          localPet.direction = globalPet.direction;
          localPet.updatePosition();
        }
      }
    });
  }
  
  createPetFromData(petData) {
    const speciesData = this.speciesManager.getSpecies(petData.species);
    if (!speciesData) return null;
    
    const pet = new Pet(petData.species, speciesData, this);
    pet.id = petData.id; // Use global ID
    pet.position = petData.position;
    pet.velocity = petData.velocity || { x: 0, y: 0 };
    pet.direction = petData.direction || 1;
    this.pets.push(pet);
    
    console.log('[PetManager] Created synced pet:', petData.species);
    return pet;
  }
  
  removePetLocal(petId) {
    const index = this.pets.findIndex(p => p.id === petId);
    if (index >= 0) {
      this.pets[index].destroy();
      this.pets.splice(index, 1);
    }
  }
  
  removeAllPetsLocal() {
    this.pets.forEach(pet => pet.destroy());
    this.pets = [];
  }
  
  getPetsNear(position, radius) {
    return this.pets.filter(pet => {
      const dx = pet.position.x - position.x;
      const dy = pet.position.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= radius;
    });
  }
  
  startUpdateLoop() {
    const update = (timestamp) => {
      if (!this.enabled) return;
      
      this.pets.forEach(pet => pet.update(timestamp));
      
      requestAnimationFrame(update);
    };
    
    requestAnimationFrame(update);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.petManager = new PetManager();
    window.petManager.init();
  });
} else {
  window.petManager = new PetManager();
  window.petManager.init();
}

