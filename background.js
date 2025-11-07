// Background Service Worker - Coordinates pets across all tabs

class PetCoordinator {
  constructor() {
    this.globalPets = []; // Shared pet states
    this.speciesData = {}; // Cache species data
    this.physicsInterval = null;
    this.broadcastInterval = null;
    this.lastPhysicsUpdate = Date.now();
    this.viewport = { width: 1920, height: 1080 }; // Default, updated by tabs
    this.init();
  }
  
  async init() {
    console.log('[Background] Pet Coordinator initialized');
    
    // Load species data
    await this.loadSpeciesData();
    
    // Load saved global pets
    chrome.storage.sync.get(['globalPets'], (result) => {
      if (result.globalPets) {
        this.globalPets = result.globalPets;
        console.log('[Background] Loaded', this.globalPets.length, 'global pets');
      }
    });
    
    // Listen for messages from tabs
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async response
    });
    
    // Run physics in background
    this.startPhysicsEngine();
    
    // Broadcast pet positions to all tabs
    this.startBroadcast();
  }
  
  async loadSpeciesData() {
    // Complete list of all 43 species - MUST match species-manager.js
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
        // Add cache busting to force reload of JSON files
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) {
          this.speciesData[id] = await response.json();
        }
      } catch (e) {
        console.warn('[Background] Failed to load species:', id, e);
      }
    }
    
    console.log('[Background] Loaded', Object.keys(this.speciesData).length, 'species for physics');
  }
  
  handleMessage(message, sender, sendResponse) {
    let pet; // Shared variable for pet lookups
    
    switch (message.type) {
      case 'GET_GLOBAL_PETS':
        sendResponse({ pets: this.globalPets });
        break;
        
      case 'UPDATE_VIEWPORT':
        this.viewport = message.viewport;
        break;
        
      case 'UPDATE_PET_POSITION':
        pet = this.globalPets.find(p => p.id === message.petId);
        if (pet) {
          pet.position = message.position;
          pet.isDragging = message.isDragging || false;
          if (pet.isDragging) {
            pet.velocity = { x: 0, y: 0 };
          }
        }
        sendResponse({ success: true });
        break;
        
      case 'ADD_PET':
        const species = this.speciesData[message.species];
        const newPet = {
          id: Math.random().toString(36).substr(2, 9),
          species: message.species,
          position: { 
            x: Math.random() * (this.viewport.width * 0.6) + this.viewport.width * 0.2, // 20-80% of width
            y: Math.random() * (this.viewport.height * 0.4) + 50 // Random height between 50 and 40% of viewport
          },
          velocity: { x: 0, y: 0 },
          direction: 1, // Always start going right (like macOS), natural desync from wall bounces
          isDragging: false,
          isMoving: species?.capabilities?.includes('LinearMovement') || false,
          currentAnimation: species?.movementPath || 'front'
        };
        console.log('[Background] Adding pet:', message.species, {
          speed: species?.speed,
          fps: species?.fps,
          movementPath: species?.movementPath,
          zIndex: species?.zIndex
        });
        this.globalPets.push(newPet);
        this.savePets();
        this.broadcastToAllTabs({ type: 'PET_ADDED', pet: newPet });
        sendResponse({ success: true, pet: newPet });
        break;
        
      case 'REMOVE_PET':
        this.globalPets = this.globalPets.filter(p => p.id !== message.petId);
        this.savePets();
        this.broadcastToAllTabs({ type: 'PET_REMOVED', petId: message.petId });
        sendResponse({ success: true });
        break;
        
      case 'REMOVE_ALL_PETS':
        this.globalPets = [];
        this.savePets();
        this.broadcastToAllTabs({ type: 'ALL_PETS_REMOVED' });
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_PET_STATE':
        pet = this.globalPets.find(p => p.id === message.petId);
        if (pet) {
          Object.assign(pet, message.state);
        }
        break;
    }
  }
  
  updatePetPosition(petId, position) {
    const pet = this.globalPets.find(p => p.id === petId);
    if (pet) {
      pet.position = position;
    }
  }
  
  startPhysicsEngine() {
    // Run physics at 60fps in background
    this.physicsInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastPhysicsUpdate) / 1000; // Convert to seconds
      this.lastPhysicsUpdate = now;
      
      // Update physics for all pets
      this.globalPets.forEach(pet => {
        if (pet.isDragging) return; // Skip if being dragged
        
        const species = this.speciesData[pet.species];
        if (!species) return;
        
        // Speed calculation: species.speed * baseSpeed
        // baseSpeed = 0.8 (slowed down by 2.5x from original 2.0)
        const baseSpeed = 0.8;
        const speed = (species.speed || 0) * baseSpeed;
        const gravity = 0.5;
        const bounce = 0.3;
        const friction = 0.95;
        
        const maxX = this.viewport.width - 64;
        const maxY = this.viewport.height - 64;
        
        // Check if pet should be stationary (sleeping, eating, etc.)
        const isStationary = !pet.isMoving;
        
        // Apply gravity (always, unless stationary and on ground)
        if (pet.position.y < maxY) {
          pet.velocity.y += gravity;
        }
        
        // Apply movement
        pet.position.x += pet.velocity.x;
        pet.position.y += pet.velocity.y;
        
        // Ground collision
        if (pet.position.y >= maxY) {
          pet.position.y = maxY;
          pet.velocity.y = 0;
          
          // Apply friction on ground (stronger if stationary)
          if (isStationary) {
            pet.velocity.x *= 0.8; // Strong friction for stationary animations
          } else {
            pet.velocity.x *= friction;
          }
        }
        
        // Wall collisions with bounce
        if (pet.position.x <= 0) {
          pet.position.x = 0;
          pet.velocity.x = Math.abs(pet.velocity.x) * bounce;
          pet.direction = 1;
        } else if (pet.position.x >= maxX) {
          pet.position.x = maxX;
          pet.velocity.x = -Math.abs(pet.velocity.x) * bounce;
          pet.direction = -1;
        }
        
        // Apply linear movement ONLY if pet is in moving state
        // Direction changes only happen on wall bounces (like macOS)
        if (!isStationary && speed > 0 && pet.position.y >= maxY - 1) {
          if (Math.abs(pet.velocity.x) < speed * 0.5) {
            pet.velocity.x = pet.direction * speed;
          }
        }
        
        // Stop horizontal movement if stationary and nearly stopped
        if (isStationary && Math.abs(pet.velocity.x) < 0.1) {
          pet.velocity.x = 0;
        }
      });
    }, 16); // ~60fps
  }
  
  startBroadcast() {
    // Broadcast all pet states every 50ms to keep tabs in sync
    this.broadcastInterval = setInterval(() => {
      if (this.globalPets.length > 0) {
        this.broadcastToAllTabs({ 
          type: 'SYNC_ALL_PETS', 
          pets: this.globalPets 
        });
      }
    }, 50);
  }
  
  broadcastToAllTabs(message) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab not ready or closed, ignore
        });
      });
    });
  }
  
  savePets() {
    chrome.storage.sync.set({ globalPets: this.globalPets });
  }
}

// Initialize
const coordinator = new PetCoordinator();

