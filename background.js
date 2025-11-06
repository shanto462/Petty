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
    const speciesList = [
      'ape', 'betta', 'cat', 'cat_black', 'cat_blue', 'cat_floppa', 
      'cat_gray', 'cat_grumpy', 'cat_house', 'cat_white'
    ];
    
    for (const id of speciesList) {
      try {
        const url = chrome.runtime.getURL(`Resources/Species/${id}.json`);
        const response = await fetch(url);
        if (response.ok) {
          this.speciesData[id] = await response.json();
        }
      } catch (e) {
        // Ignore errors
      }
    }
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
        const newPet = {
          id: Math.random().toString(36).substr(2, 9),
          species: message.species,
          position: { x: Math.random() * 800, y: 100 },
          velocity: { x: 0, y: 0 },
          direction: 1,
          isDragging: false
        };
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
        
        const speed = species.speed || 0;
        const gravity = 0.5;
        const bounce = 0.3;
        const friction = 0.95;
        
        const maxX = this.viewport.width - 64;
        const maxY = this.viewport.height - 64;
        
        // Apply gravity
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
          pet.velocity.x *= friction; // Apply friction on ground
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
        
        // Apply linear movement if has speed and on ground
        if (speed > 0 && pet.position.y >= maxY - 1) {
          if (Math.abs(pet.velocity.x) < speed * 0.5) {
            pet.velocity.x = pet.direction * speed;
          }
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

