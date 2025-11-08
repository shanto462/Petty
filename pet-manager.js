// Pet Manager - Manages all pets and UI

class PetManager {
  constructor() {
    this.logger = window.PettyLogger;
    this.speciesManager = new SpeciesManager();
    this.pets = [];
    this.ephemeralEntities = []; // UFOs, clouds, poop stains, etc.
    this.enabled = true;
    this.menuOpen = false;
  }
  
  async init() {
    this.logger.log('[PetManager] Initializing...');
    
    // Load all species
    await this.speciesManager.loadAllSpecies();
    
    // Send viewport dimensions to background
    this.sendViewportUpdate();
    window.addEventListener('resize', () => this.sendViewportUpdate());
    
    // Get global pets from background
    ChromeMessaging.sendMessage({ type: 'GET_GLOBAL_PETS' })
      .then((response) => {
        if (response && response.pets) {
          response.pets.forEach(petData => {
            this.createPetFromData(petData);
          });
        }
        
        // Start update loop
        this.startUpdateLoop();
        
        this.logger.log('[PetManager] ✅ Ready! Active pets:', this.pets.length);
      })
      .catch((error) => {
        this.logger.error('[PetManager] Failed to get global pets:', error);
        // Still start update loop
        this.startUpdateLoop();
      });
    
    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleBackgroundMessage(message);
    });
  }
  
  sendViewportUpdate() {
    ChromeMessaging.sendMessage({
      type: 'UPDATE_VIEWPORT',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }).catch(() => {}); // Ignore errors for fire-and-forget messages
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

      case 'TRIGGER_UFO_ABDUCTION':
        this.logger.log('[PetManager] UFO Abduction event triggered by background!');
        if (typeof UfoAbductionEvent !== 'undefined') {
          UfoAbductionEvent.trigger(this);
        }
        break;

      case 'TRIGGER_CLOUD_EVENT':
        this.logger.log('[PetManager] Cloud event triggered by background!');
        if (typeof CloudEvent !== 'undefined') {
          CloudEvent.trigger(this);
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
          
          // Sync animation state (critical for multi-tab sync!)
          if (globalPet.currentAnimation && localPet.currentAnimation !== globalPet.currentAnimation) {
            localPet.setAnimation(globalPet.currentAnimation);
          }
          
          // Sync moving state
          if (globalPet.isMoving !== undefined && localPet.isMoving !== globalPet.isMoving) {
            localPet.isMoving = globalPet.isMoving;
          }
          
          // Sync sleeping state
          if (globalPet.isSleeping !== undefined && localPet.isSleeping !== globalPet.isSleeping) {
            localPet.isSleeping = globalPet.isSleeping;
          }
          
          localPet.updatePosition();
        }
      }
    });
  }
  
  createPetFromData(petData) {
    const speciesData = this.speciesManager.getSpecies(petData.species);
    if (!speciesData) {
      this.logger.error('[PetManager] ❌ Species data not found:', petData.species);
      return null;
    }
    
    this.logger.log('[PetManager] 🐾 Creating pet:', petData.species, {
      animations: speciesData.animations?.length || 0,
      movementPath: speciesData.movementPath,
      dragPath: speciesData.dragPath,
      fps: speciesData.fps
    });
    
    const pet = new Pet(petData.species, speciesData, this);
    pet.id = petData.id; // Use global ID
    pet.position = petData.position;
    pet.velocity = petData.velocity || { x: 0, y: 0 };
    pet.direction = petData.direction || 1;
    this.pets.push(pet);
    
    this.logger.log('[PetManager] ✅ Created synced pet:', petData.species);
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

  /**
   * Get pets overlapping with a rectangular area (for SleepingPlace collision detection)
   * @param {Object} position - Top-left position {x, y}
   * @param {number} size - Size of the area (assumes square)
   * @param {Function} filter - Optional filter function
   * @returns {Array} Overlapping pets sorted by overlap area (largest first)
   */
  getPetsOverlapping(position, size, filter = null) {
    const { DISPLAY } = window.PettyConfig;
    const petSize = DISPLAY.DEFAULT_PET_SIZE;
    
    const overlapping = this.pets
      .map(pet => {
        // Check if pet overlaps with the area
        const petRight = pet.position.x + petSize;
        const petBottom = pet.position.y + petSize;
        const areaRight = position.x + size;
        const areaBottom = position.y + size;
        
        // Check for overlap
        if (pet.position.x < areaRight &&
            petRight > position.x &&
            pet.position.y < areaBottom &&
            petBottom > position.y) {
          
          // Calculate overlap area
          const overlapLeft = Math.max(pet.position.x, position.x);
          const overlapTop = Math.max(pet.position.y, position.y);
          const overlapRight = Math.min(petRight, areaRight);
          const overlapBottom = Math.min(petBottom, areaBottom);
          const overlapWidth = overlapRight - overlapLeft;
          const overlapHeight = overlapBottom - overlapTop;
          const overlapArea = overlapWidth * overlapHeight;
          
          return { pet, overlapArea };
        }
        return null;
      })
      .filter(result => result !== null);
    
    // Apply optional filter
    let filtered = overlapping;
    if (filter) {
      filtered = overlapping.filter(result => filter(result.pet));
    }
    
    // Sort by overlap area (largest first) and return only pets
    return filtered
      .sort((a, b) => b.overlapArea - a.overlapArea)
      .map(result => result.pet);
  }
  
  startUpdateLoop() {
    const update = (timestamp) => {
      if (!this.enabled) return;

      // Update pets
      this.pets.forEach(pet => pet.update(timestamp));

      // Update ephemeral entities
      this.ephemeralEntities.forEach(entity => entity.update(timestamp));

      // Remove dead ephemeral entities
      this.ephemeralEntities = this.ephemeralEntities.filter(e => e.isAlive);

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  /**
   * Add an ephemeral entity (UFO, cloud, poop stain, etc.)
   */
  addEphemeralEntity(entity) {
    this.ephemeralEntities.push(entity);
    this.logger.log('[PetManager] Added ephemeral entity:', entity.type, entity.id);
  }

  /**
   * Remove an ephemeral entity
   */
  removeEphemeralEntity(entityId) {
    const index = this.ephemeralEntities.findIndex(e => e.id === entityId);
    if (index >= 0) {
      this.ephemeralEntities[index].remove();
      this.ephemeralEntities.splice(index, 1);
      this.logger.log('[PetManager] Removed ephemeral entity:', entityId);
    }
  }

  /**
   * Remove all ephemeral entities of a specific type
   */
  removeEphemeralEntitiesByType(type) {
    const toRemove = this.ephemeralEntities.filter(e => e.type === type);
    toRemove.forEach(e => e.remove());
    this.ephemeralEntities = this.ephemeralEntities.filter(e => e.type !== type);
    this.logger.log('[PetManager] Removed all ephemeral entities of type:', type);
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

