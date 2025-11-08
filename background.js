// Background Service Worker - Coordinates pets across all tabs

// Load dependencies
importScripts('species-list.js', 'config.js', 'logger.js', 'species-validator.js', 'random-event-scheduler.js');

(function() {
  // Only initialize if not already initialized
  if (!self.__BACKGROUND_INITIALIZED__) {
    self.__BACKGROUND_INITIALIZED__ = true;

    // Access configuration from service worker global scope
    const { PHYSICS, DISPLAY, SPEED, LOG, STORAGE_KEYS, MESSAGE_TYPES } = self.PettyConfig;
    const SPECIES_LIST = self.SPECIES_LIST;
    const { validateSpeciesData } = self.SpeciesValidator || {};
    const logger = self.PettyLogger;

    class PetCoordinator {
  constructor() {
    this.globalPets = []; // Shared pet states
    this.speciesData = {}; // Cache species data
    this.physicsInterval = null;
    this.broadcastInterval = null;
    this.lastPhysicsUpdate = Date.now();
    this.viewport = PHYSICS.DEFAULT_VIEWPORT; // Use configuration constant

    // Settings (hardcoded - no user controls)
    this.settings = {
      petSize: DISPLAY.DEFAULT_PET_SIZE,
      speedMultiplier: 0.025, // Hardcoded to 0.10x for slower pets
      gravityEnabled: true, // Always enabled
      randomEvents: true // Always enabled
    };

    // Random Event Scheduler
    this.eventScheduler = new RandomEventScheduler(this);

    this.init();
  }
  
  async init() {
    logger.log('[Background] Pet Coordinator initialized');

    // Load settings first
    await this.loadSettings();

    // Load species data
    await this.loadSpeciesData();

    // Load saved global pets
    chrome.storage.sync.get([STORAGE_KEYS.GLOBAL_PETS], (result) => {
      if (result[STORAGE_KEYS.GLOBAL_PETS]) {
        this.globalPets = result[STORAGE_KEYS.GLOBAL_PETS];
        logger.log(LOG.PREFIXES.BACKGROUND, 'Loaded', this.globalPets.length, 'global pets');
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

    // Start random event scheduler
    this.eventScheduler.start();
  }

  async loadSettings() {
    // Settings are now hardcoded, no need to load from storage
    logger.log(LOG.PREFIXES.BACKGROUND, 'Using hardcoded settings:', this.settings);
    return Promise.resolve();
  }
  
  async loadSpeciesData() {
    // Use auto-generated species list instead of hardcoded array
    logger.log(LOG.PREFIXES.BACKGROUND, 'Loading', SPECIES_LIST.length, 'species in parallel...');

    // Load all species in parallel using Promise.all() for better performance
    const loadPromises = SPECIES_LIST.map(async (id) => {
      try {
        // Add timestamp to URL to force bypass all caches
        const url = chrome.runtime.getURL(`Resources/Species/${id}.json`) + '?v=' + Date.now();
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
              logger.warn(LOG.PREFIXES.BACKGROUND, 'Validation errors for species:', id, validation.errors);
              return { id, data: validation.data };
            }
            return { id, data: validation.data };
          }

          return { id, data };
        }
        return null;
      } catch (e) {
        logger.warn(LOG.PREFIXES.BACKGROUND, 'Failed to load species:', id, e);
        return null;
      }
    });

    // Wait for all species to load
    const results = await Promise.all(loadPromises);

    // Store loaded species data
    results.forEach(result => {
      if (result && result.data) {
        this.speciesData[result.id] = result.data;
      }
    });

    logger.log(LOG.PREFIXES.BACKGROUND, 'Loaded', Object.keys(this.speciesData).length, '/', SPECIES_LIST.length, 'species for physics');
  }
  
  async handleMessage(message, sender, sendResponse) {
    let pet; // Shared variable for pet lookups

    switch (message.type) {
      case MESSAGE_TYPES.GET_GLOBAL_PETS:
        sendResponse({ pets: this.globalPets });
        break;

      case MESSAGE_TYPES.UPDATE_VIEWPORT:
        this.viewport = message.viewport;
        break;

      case MESSAGE_TYPES.UPDATE_PET_POSITION:
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

      case MESSAGE_TYPES.ADD_PET:
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
          currentAnimation: species?.movementPath || 'front',
          currentSize: null // Will be set when animation changes
        };
        logger.log('[Background] Adding pet:', message.species, {
          speed: species?.speed,
          fps: species?.fps,
          movementPath: species?.movementPath,
          zIndex: species?.zIndex
        });
        this.globalPets.push(newPet);
        this.savePets();
        this.broadcastToAllTabs({ type: MESSAGE_TYPES.PET_ADDED, pet: newPet });
        sendResponse({ success: true, pet: newPet });
        break;

      case MESSAGE_TYPES.REMOVE_PET:
        this.globalPets = this.globalPets.filter(p => p.id !== message.petId);
        this.savePets();
        this.broadcastToAllTabs({ type: MESSAGE_TYPES.PET_REMOVED, petId: message.petId });
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.REMOVE_ALL_PETS:
        this.globalPets = [];
        this.savePets();
        this.broadcastToAllTabs({ type: MESSAGE_TYPES.ALL_PETS_REMOVED });
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.UPDATE_PET_STATE:
        pet = this.globalPets.find(p => p.id === message.petId);
        if (pet) {
          Object.assign(pet, message.state);
        }
        break;

      case 'RELOAD_SETTINGS':
        // Settings are hardcoded, nothing to reload
        sendResponse({ success: true });
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
    // Run physics at configured interval
    this.physicsInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastPhysicsUpdate) / 1000; // Convert to seconds
      this.lastPhysicsUpdate = now;

      // Update physics for all pets
      this.globalPets.forEach(pet => {
        if (pet.isDragging) return; // Skip if being dragged

        const species = this.speciesData[pet.species];
        if (!species) return;

        // Speed calculation matching macOS formula:
        // speed = (petSize / defaultSize) * baseSpeed * species.speed * speedMultiplier
        const sizeRatio = this.settings.petSize / DISPLAY.DEFAULT_PET_SIZE;
        const speed = sizeRatio * SPEED.BASE_SPEED * (species.speed || 0) * this.settings.speedMultiplier;

        const gravity = this.settings.gravityEnabled ? PHYSICS.GRAVITY : 0;
        const bounce = PHYSICS.BOUNCE;
        const friction = PHYSICS.FRICTION;

        // SleepingPlace entities are 2x size - account for this in boundary calculations
        // Also account for animation-specific sizes (e.g., UFO bombing: 300x150)
        const isSleepingPlace = species.capabilities?.includes('SleepingPlace');
        let entityWidth = isSleepingPlace ? this.settings.petSize * 2 : this.settings.petSize;
        let entityHeight = isSleepingPlace ? this.settings.petSize * 2 : this.settings.petSize;
        
        // Use current animation size if available (for scaled animations)
        if (pet.currentSize) {
          entityWidth = pet.currentSize.width;
          entityHeight = pet.currentSize.height;
        }
        
        const maxX = this.viewport.width - entityWidth;
        const maxY = this.viewport.height - entityHeight;

        // Check if pet should be stationary (sleeping, eating, etc.)
        const isStationary = !pet.isMoving;

        // Check if pet is a wall crawler (disables gravity, sticks to bottom)
        const isWallCrawler = species.capabilities?.includes('WallCrawler');

        // Apply gravity (always, unless wall crawler or sleeping place)
        if (!isWallCrawler && !isSleepingPlace && pet.position.y < maxY) {
          pet.velocity.y += gravity;
        }

        // Wall crawlers and sleeping places stick to bottom edge
        if (isWallCrawler || isSleepingPlace) {
          pet.position.y = maxY;
          pet.velocity.y = 0;
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
            pet.velocity.x *= PHYSICS.STATIONARY_FRICTION;
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
          if (Math.abs(pet.velocity.x) < speed * PHYSICS.MIN_SPEED_THRESHOLD) {
            pet.velocity.x = pet.direction * speed;
          }
        }

        // Stop horizontal movement if stationary and nearly stopped
        if (isStationary && Math.abs(pet.velocity.x) < PHYSICS.STOP_THRESHOLD) {
          pet.velocity.x = 0;
        }
      });
    }, PHYSICS.UPDATE_INTERVAL);
  }
  
  startBroadcast() {
    // Broadcast all pet states to keep tabs in sync
    this.broadcastInterval = setInterval(() => {
      if (this.globalPets.length > 0) {
        this.broadcastToAllTabs({
          type: MESSAGE_TYPES.SYNC_ALL_PETS,
          pets: this.globalPets
        });
      }
    }, PHYSICS.BROADCAST_INTERVAL);
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
      chrome.storage.sync.set({ [STORAGE_KEYS.GLOBAL_PETS]: this.globalPets });
    }
  }

    // Initialize
    const coordinator = new PetCoordinator();
  }
})();
