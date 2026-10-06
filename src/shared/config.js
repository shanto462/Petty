// Configuration Constants - Centralized configuration for the Petty extension

// Export to global scope (works in both window and service worker contexts)
(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  // Only define configuration if it doesn't already exist (prevents redeclaration errors)
  if (!globalScope.PettyConfig) {
    /**
     * Physics Constants
     * Physics runs in each visible tab on requestAnimationFrame (see content/pet-manager.js).
     * The background service worker only stores state, because Chrome does not run
     * service worker timers at a reliable rate.
     */
    const PHYSICS = {
      // Physics engine timing
      UPDATE_INTERVAL: 16, // One fixed physics step, ~60 steps per second (ms)
      MAX_CATCH_UP: 1000, // Longest stretch of time simulated after a pause (ms)
      REPORT_INTERVAL: 1000, // How often the visible tab saves pet positions (ms)

      // Physics parameters
      GRAVITY: 0.5,
      BOUNCE: 0.3,
      FRICTION: 0.95,
      STATIONARY_FRICTION: 0.8, // Stronger friction for non-moving pets

      // Movement
      BASE_SPEED: 0.8, // Multiplier for species.speed (slowed down by 2.5x from original 2.0)
      MIN_SPEED_THRESHOLD: 0.5, // Minimum velocity multiplier before applying linear movement
      STOP_THRESHOLD: 0.1, // Velocity threshold to stop horizontal movement for stationary pets

      // Viewport used to place new pets until a tab reports its size
      DEFAULT_VIEWPORT: {
        width: 1920,
        height: 1080,
      },
    };

    /**
     * Pet Display Constants
     * Used for rendering and visual display of pets
     */
    const DISPLAY = {
      DEFAULT_PET_SIZE: 75, // Default pet size matching macOS (changed from 64 to 75)
      MIN_PET_SIZE: 30, // Minimum pet size
      MAX_PET_SIZE: 350, // Maximum pet size
      BASE_Z_INDEX: 999999, // Base z-index for pet elements (species.zIndex is added to this)
      PET_CLASS: 'petty-pet', // CSS class for pet elements
      FLIP_CLASS: 'flipped', // CSS class for horizontally flipped pets
      DRAGGING_CLASS: 'dragging', // CSS class when pet is being dragged
    };

    /**
     * Speed Constants
     * Used for pet movement speed calculations (matches macOS)
     */
    const SPEED = {
      BASE_SPEED: 30, // Base speed in pixels/second (macOS value)
      DEFAULT_MULTIPLIER: 1.0, // Default user speed multiplier
      MIN_MULTIPLIER: 0.25, // Minimum speed multiplier (25%)
      MAX_MULTIPLIER: 2.0, // Maximum speed multiplier (200%)
    };

    /**
     * Behavior Settings
     * Fixed for now; there is no settings UI
     */
    const DEFAULT_SETTINGS = {
      petSize: DISPLAY.DEFAULT_PET_SIZE,
      speedMultiplier: 0.025, // Slow, calm walking pace
      gravityEnabled: true,
      randomEvents: true,
    };

    /**
     * Animation Constants
     * Used by AnimationsScheduler capability for random pet actions
     */
    const ANIMATION = {
      // Random animation scheduling
      INITIAL_DELAY_MAX: 15000, // Maximum initial delay before first random animation (ms)
      SCHEDULE_MIN_DELAY: 10000, // Minimum delay between random animations (ms)
      SCHEDULE_MAX_DELAY: 30000, // Maximum delay between random animations (ms)

      // Interaction cooldowns
      ANGRY_ANIMATION_DURATION: 3000, // Duration of angry animation (ms)
      ANGRY_COOLDOWN: 30000, // Cooldown before pet can get angry again (ms)
      INTERACTION_RANGE: 100, // Distance in pixels for pet interactions
    };

    /**
     * Species Data Constants
     * Configuration for species loading and management
     */
    const SPECIES = {
      EXPECTED_COUNT: (globalScope.SPECIES_LIST || []).length, // Species shipped in the generated catalog
      ASSETS_PATH: 'assets/sprites/', // Path to pet sprite assets (relative to the extension root)
      EFFECT_SPRITES: {
        UFO: 'ufo_front-0.png', // UFO abduction random event
        CLOUD: 'fantozzi_front-0.png', // Fantozzi rain cloud random event
      },

      // Fallback image paths for species thumbnails
      FALLBACK_IMAGE_PATHS: [
        (speciesId, movementPath) => `${speciesId}_${movementPath}-0.png`,
        (speciesId) => `${speciesId}_front-0.png`,
        (speciesId) => `${speciesId}_idle-0.png`,
      ],
    };

    /**
     * Tag Emoji Mapping
     * Emoji icons for each species tag/category
     */
    const TAG_EMOJI = {
      cats: '🐱',
      dinos: '🦖',
      water: '🐠',
      jungle: '🦍',
      forest: '🦔',
      birds: '🦅',
      dogs: '🐕',
      bear: '🐻',
      farm: '🐄',
      plants: '🌻',
      pokèmon: '⚡',
      memes: '🎭',
      aliens: '👽',
      decorations: '🏠',
      emoji: '😊',
      'slow motion': '🐌',
      other: '✨',
    };

    /**
     * Logging Configuration
     * Standardized logging prefixes and formats
     */
    const LOG = {
      PREFIXES: {
        BACKGROUND: '[Background]',
        PET: '[Pet]',
        PET_MANAGER: '[PetManager]',
        SPECIES_MANAGER: '[SpeciesManager]',
        POPUP: '[Popup]',
        SPRITE_ANIMATOR: '[SpriteAnimator]',
        CHROME_MESSAGING: '[ChromeMessaging]',
      },
    };

    /**
     * Debug Configuration
     * Enable/disable debug features
     */
    const DEBUG = {
      SHOW_ACTION_BUBBLES: false, // Show bubbles above pets displaying their current action (development aid)
      SHOW_CONSOLE_LOGS: false, // Show detailed console logs
      BUBBLE_DURATION: 3000, // How long debug bubbles stay visible (ms)
    };

    /**
     * Limits
     * Safety caps for shared state
     */
    const LIMITS = {
      MAX_PETS: 100, // Maximum number of pets on screen at once
    };

    /**
     * Chrome Storage Keys
     * Keys used for Chrome sync storage
     */
    const STORAGE_KEYS = {
      GLOBAL_PETS: 'globalPets', // chrome.storage.sync: the roster (id + species)
      PET_STATES: 'petStates', // chrome.storage.session: last positions, survives worker restarts
    };

    /**
     * Message Types
     * Chrome runtime message types for communication between components
     */
    const MESSAGE_TYPES = {
      GET_GLOBAL_PETS: 'GET_GLOBAL_PETS',
      UPDATE_VIEWPORT: 'UPDATE_VIEWPORT',
      UPDATE_PET_POSITION: 'UPDATE_PET_POSITION',
      ADD_PET: 'ADD_PET',
      REMOVE_PET: 'REMOVE_PET',
      REMOVE_ALL_PETS: 'REMOVE_ALL_PETS',
      UPDATE_PET_STATE: 'UPDATE_PET_STATE',
      PET_ADDED: 'PET_ADDED',
      PET_REMOVED: 'PET_REMOVED',
      ALL_PETS_REMOVED: 'ALL_PETS_REMOVED',
      REPORT_PET_STATES: 'REPORT_PET_STATES',
      TRIGGER_UFO_ABDUCTION: 'TRIGGER_UFO_ABDUCTION',
      TRIGGER_CLOUD_EVENT: 'TRIGGER_CLOUD_EVENT',
    };

    /**
     * Default Animation Names
     * Standard animation identifiers used across species
     */
    const DEFAULT_ANIMATIONS = {
      FRONT: 'front', // Default idle animation
      WALK: 'walk', // Default movement animation
      DRAG: 'drag', // Animation when being dragged
      ANGRY: 'angry', // Angry interaction animation
    };

    /**
     * Capability Names
     * Standard capability identifiers for pet behaviors
     */
    const CAPABILITIES = {
      LINEAR_MOVEMENT: 'LinearMovement',
      ANIMATIONS_SCHEDULER: 'AnimationsScheduler',
      FLIP_HORIZONTALLY: 'FlipHorizontallyWhenGoingLeft',
      GETS_ANGRY: 'GetsAngryWhenMeetingOtherCats',
      ANIMATED_SPRITE: 'AnimatedSprite',
      BOUNCE_ON_COLLISIONS: 'BounceOnLateralCollisions',
      WALL_CRAWLER: 'WallCrawler',
      SLEEPING_PLACE: 'SleepingPlace',
      LEAVES_POOP_STAINS: 'LeavesPoopStains',
      ROTATING: 'Rotating',
      AUTO_RESPAWN: 'AutoRespawn',
    };

    // Assign to global scope
    globalScope.PettyConfig = {
      PHYSICS,
      DISPLAY,
      SPEED,
      DEFAULT_SETTINGS,
      ANIMATION,
      SPECIES,
      TAG_EMOJI,
      LOG,
      DEBUG,
      LIMITS,
      STORAGE_KEYS,
      MESSAGE_TYPES,
      DEFAULT_ANIMATIONS,
      CAPABILITIES,
    };
  }
})();
