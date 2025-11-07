// Configuration Constants - Centralized configuration for the Browser Pets extension

/**
 * Physics Constants
 * Used by background.js physics engine for pet movement and collision
 */
export const PHYSICS = {
  // Physics engine timing
  UPDATE_INTERVAL: 16, // ~60fps in milliseconds
  BROADCAST_INTERVAL: 50, // Sync interval for broadcasting pet states to tabs

  // Physics parameters
  GRAVITY: 0.5,
  BOUNCE: 0.3,
  FRICTION: 0.95,
  STATIONARY_FRICTION: 0.8, // Stronger friction for non-moving pets

  // Movement
  BASE_SPEED: 0.8, // Multiplier for species.speed (slowed down by 2.5x from original 2.0)
  MIN_SPEED_THRESHOLD: 0.5, // Minimum velocity multiplier before applying linear movement
  STOP_THRESHOLD: 0.1, // Velocity threshold to stop horizontal movement for stationary pets

  // Default viewport (updated dynamically by tabs)
  DEFAULT_VIEWPORT: {
    width: 1920,
    height: 1080
  }
};

/**
 * Pet Display Constants
 * Used for rendering and visual display of pets
 */
export const DISPLAY = {
  PET_SIZE: 64, // Pet image size in pixels (width and height)
  BASE_Z_INDEX: 999999, // Base z-index for pet elements (species.zIndex is added to this)
  PET_CLASS: 'petty-pet', // CSS class for pet elements
  FLIP_CLASS: 'flipped', // CSS class for horizontally flipped pets
  DRAGGING_CLASS: 'dragging' // CSS class when pet is being dragged
};

/**
 * Animation Constants
 * Used by AnimationsScheduler capability for random pet actions
 */
export const ANIMATION = {
  // Random animation scheduling
  INITIAL_DELAY_MAX: 15000, // Maximum initial delay before first random animation (ms)
  SCHEDULE_MIN_DELAY: 10000, // Minimum delay between random animations (ms)
  SCHEDULE_MAX_DELAY: 30000, // Maximum delay between random animations (ms)

  // Interaction cooldowns
  ANGRY_ANIMATION_DURATION: 3000, // Duration of angry animation (ms)
  ANGRY_COOLDOWN: 30000, // Cooldown before pet can get angry again (ms)
  INTERACTION_RANGE: 100 // Distance in pixels for pet interactions
};

/**
 * Species Data Constants
 * Configuration for species loading and management
 */
export const SPECIES = {
  EXPECTED_COUNT: 43, // Expected number of species
  RESOURCES_PATH: 'Resources/Species/', // Path to species JSON files
  ASSETS_PATH: 'Resources/PetsAssets/', // Path to pet sprite assets

  // Fallback image paths for species thumbnails
  FALLBACK_IMAGE_PATHS: [
    (speciesId, movementPath) => `${speciesId}_${movementPath}-0.png`,
    (speciesId) => `${speciesId}_front-0.png`,
    (speciesId) => `${speciesId}_idle-0.png`
  ]
};

/**
 * Tag Emoji Mapping
 * Emoji icons for each species tag/category
 */
export const TAG_EMOJI = {
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

/**
 * Logging Configuration
 * Standardized logging prefixes and formats
 */
export const LOG = {
  PREFIXES: {
    BACKGROUND: '[Background]',
    PET: '[Pet]',
    PET_MANAGER: '[PetManager]',
    SPECIES_MANAGER: '[SpeciesManager]',
    POPUP: '[Popup]',
    SPRITE_ANIMATOR: '[SpriteAnimator]',
    CHROME_MESSAGING: '[ChromeMessaging]'
  }
};

/**
 * Chrome Storage Keys
 * Keys used for Chrome sync storage
 */
export const STORAGE_KEYS = {
  GLOBAL_PETS: 'globalPets'
};

/**
 * Message Types
 * Chrome runtime message types for communication between components
 */
export const MESSAGE_TYPES = {
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
  SYNC_ALL_PETS: 'SYNC_ALL_PETS'
};

/**
 * Default Animation Names
 * Standard animation identifiers used across species
 */
export const DEFAULT_ANIMATIONS = {
  FRONT: 'front', // Default idle animation
  WALK: 'walk', // Default movement animation
  DRAG: 'drag', // Animation when being dragged
  ANGRY: 'angry' // Angry interaction animation
};

/**
 * Capability Names
 * Standard capability identifiers for pet behaviors
 */
export const CAPABILITIES = {
  LINEAR_MOVEMENT: 'LinearMovement',
  ANIMATIONS_SCHEDULER: 'AnimationsScheduler',
  FLIP_HORIZONTALLY: 'FlipHorizontallyWhenGoingLeft',
  GETS_ANGRY: 'GetsAngryWhenMeetingOtherCats',
  ANIMATED_SPRITE: 'AnimatedSprite',
  BOUNCE_ON_COLLISIONS: 'BounceOnLateralCollisions'
};

// For browser environments without module support, attach to window
if (typeof window !== 'undefined' && !window.PettyConfig) {
  window.PettyConfig = {
    PHYSICS,
    DISPLAY,
    ANIMATION,
    SPECIES,
    TAG_EMOJI,
    LOG,
    STORAGE_KEYS,
    MESSAGE_TYPES,
    DEFAULT_ANIMATIONS,
    CAPABILITIES
  };
}
