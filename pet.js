// Pet - Individual pet instance with capability-based behavior

(function() {
    // Only define if not already defined
  if (!window.Pet) {
    // Access configuration
    const { DISPLAY, ANIMATION, LOG, MESSAGE_TYPES, DEFAULT_ANIMATIONS, CAPABILITIES, DEBUG } = window.PettyConfig;
    const logger = window.PettyLogger;

    class Pet {
  constructor(speciesId, speciesData, petManager) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.speciesId = speciesId;
    this.speciesData = speciesData;
    this.petManager = petManager;

    // Properties from species JSON data
    this.speed = speciesData.speed || 0;
    this.zIndex = speciesData.zIndex || 0;
    this.movementPath = speciesData.movementPath || DEFAULT_ANIMATIONS.WALK;
    this.dragPath = speciesData.dragPath || DEFAULT_ANIMATIONS.DRAG;
    this.capabilities = speciesData.capabilities || [];
    this.tags = speciesData.tags || [];

    // State - Initial positioning matches macOS behavior
    // X: 20-80% of viewport width
    // Y: 10-50% of viewport height (WallCrawler spawns at bottom)
    // SleepingPlace entities are 2x size, so adjust positioning
    const entitySize = this.hasCapability(CAPABILITIES.SLEEPING_PLACE) 
      ? DISPLAY.DEFAULT_PET_SIZE * 2 
      : DISPLAY.DEFAULT_PET_SIZE;
    
    const randomX = window.innerWidth * (0.2 + Math.random() * 0.6); // 20-80%
    const randomY = this.hasCapability(CAPABILITIES.WALL_CRAWLER)
      ? window.innerHeight - entitySize  // Bottom for wall crawlers
      : this.hasCapability(CAPABILITIES.SLEEPING_PLACE)
      ? window.innerHeight - entitySize  // Bottom for sleeping places (stationary)
      : window.innerHeight * (0.1 + Math.random() * 0.4); // 10-50% for normal pets

    this.position = { x: randomX, y: randomY };
    this.velocity = { x: 0, y: 0 };
    this.direction = 1; // Always start moving right (like macOS)
    this.isDragging = false;
    this.isGrounded = false;
    this.currentAnimation = null;
    this.rotation = 0; // For Rotating capability

    // Capabilities state
    this.isAngry = false;
    this.animationTimer = null;
    this.angryTimer = null; // Track angry cooldown timer for cleanup
    this.lastPoopTime = 0; // For LeavesPoopStains capability
    this.lastPositionUpdate = 0; // Throttle position updates to reduce messaging overhead
    this.isSleeping = false; // For SleepingPlace interaction
    this.sleepingPlaceEnabled = true; // Cooldown for SleepingPlace capability

    // Track last rendered position to avoid unnecessary DOM updates
    this.lastRenderedX = null;
    this.lastRenderedY = null;

    // DOM & Animator
    this.element = null;
    this.img = null;
    this.animator = new SpriteAnimator(speciesId, speciesData);
    this.debugBubble = null; // Debug bubble element

    // Event handlers (store references for proper cleanup)
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);

    this.create();
  }
  
  create() {
    // Create DOM element
    this.element = document.createElement('div');
    this.element.className = DISPLAY.PET_CLASS;
    this.element.style.zIndex = DISPLAY.BASE_Z_INDEX + this.zIndex;
    this.element.dataset.petId = this.id;
    this.element.dataset.species = this.speciesId;

    // SleepingPlace capability: Make element 2x larger
    if (this.hasCapability(CAPABILITIES.SLEEPING_PLACE)) {
      this.element.style.width = `${DISPLAY.DEFAULT_PET_SIZE * 2}px`;
      this.element.style.height = `${DISPLAY.DEFAULT_PET_SIZE * 2}px`;
    }

    this.img = document.createElement('img');
    // SleepingPlace entities are 2x size
    const imageSize = this.hasCapability(CAPABILITIES.SLEEPING_PLACE) 
      ? DISPLAY.DEFAULT_PET_SIZE * 2 
      : DISPLAY.DEFAULT_PET_SIZE;
    this.img.style.width = `${imageSize}px`;
    this.img.style.height = `${imageSize}px`;

    // Show placeholder while loading (prevents blank pet during sprite load)
    this.img.style.background = 'transparent';
    this.img.alt = '🐾'; // Screen reader accessibility

    this.element.appendChild(this.img);

    // Add loading placeholder emoji
    const placeholder = document.createElement('div');
    placeholder.className = 'pet-loading-placeholder';
    placeholder.textContent = '🐾';
    placeholder.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: ${DISPLAY.DEFAULT_PET_SIZE * 0.6}px;
      opacity: 0.5;
      pointer-events: none;
      user-select: none;
    `;
    this.element.appendChild(placeholder);

    // Remove placeholder once first sprite loads
    this.img.onload = () => {
      if (placeholder && placeholder.parentNode) {
        placeholder.remove();
      }
    };

    // Event listeners using bound references for proper cleanup
    this.element.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);

    document.body.appendChild(this.element);
    this.updatePosition();

    // Start with appropriate animation
    if (this.hasCapability(CAPABILITIES.LINEAR_MOVEMENT) && this.speed > 0) {
      this.setAnimation(this.movementPath);
    } else {
      this.setAnimation(DEFAULT_ANIMATIONS.FRONT);
    }

    // Schedule animations if capable - add random initial delay to desynchronize pets
    if (this.hasCapability(CAPABILITIES.ANIMATIONS_SCHEDULER)) {
      const initialDelay = Math.random() * ANIMATION.INITIAL_DELAY_MAX;
      this.animationTimer = setTimeout(() => {
        if (!this.isDragging && this.element) {
          this.scheduleNextAnimation();
        }
      }, initialDelay);
    }
  }
  
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  
  async setAnimation(animationId) {
    if (this.currentAnimation === animationId) return;
    this.currentAnimation = animationId;

    const frames = await this.animator.setAnimation(animationId);

    // Immediately display the first frame if available
    if (this.img && frames && frames.length > 0) {
      this.img.src = frames[0];
    }

    // Apply animation-specific size if defined (e.g., UFO bombing: [4, 2], panda lightsaber: [1.42, 1.2])
    const animData = this.animator.getAnimationData(animationId);
    const previousSize = this.currentSize || { 
      width: this.hasCapability(CAPABILITIES.SLEEPING_PLACE) ? DISPLAY.DEFAULT_PET_SIZE * 2 : DISPLAY.DEFAULT_PET_SIZE, 
      height: this.hasCapability(CAPABILITIES.SLEEPING_PLACE) ? DISPLAY.DEFAULT_PET_SIZE * 2 : DISPLAY.DEFAULT_PET_SIZE 
    };
    
    if (animData && animData.size && Array.isArray(animData.size)) {
      const [widthMultiplier, heightMultiplier] = animData.size;
      const newWidth = DISPLAY.DEFAULT_PET_SIZE * widthMultiplier;
      const newHeight = DISPLAY.DEFAULT_PET_SIZE * heightMultiplier;
      
      // Adjust position to keep pet visually centered when size changes
      // When growing: move pet left/up so it expands around its center
      // When shrinking: move pet right/down to maintain visual center
      const widthDiff = newWidth - previousSize.width;
      const heightDiff = newHeight - previousSize.height;
      
      if (widthDiff !== 0 || heightDiff !== 0) {
        this.position.x -= widthDiff / 2;
        this.position.y -= heightDiff / 2;
        
        // Clamp to viewport bounds with new size
        const maxX = window.innerWidth - newWidth;
        const maxY = window.innerHeight - newHeight;
        this.position.x = Math.max(0, Math.min(maxX, this.position.x));
        this.position.y = Math.max(0, Math.min(maxY, this.position.y));
        
        // Sync with background
        ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.UPDATE_PET_POSITION,
          petId: this.id,
          position: this.position,
          isDragging: false
        }).catch(() => {});
      }
      
      // Scale both container and image to prevent clipping
      this.element.style.width = `${newWidth}px`;
      this.element.style.height = `${newHeight}px`;
      this.img.style.width = `${newWidth}px`;
      this.img.style.height = `${newHeight}px`;
      
      // Store current size for physics calculations
      this.currentSize = { width: newWidth, height: newHeight };
      
      logger.log(LOG.PREFIXES.PET, this.speciesId, 'animation', animationId, 
                 'size:', `${newWidth}x${newHeight}`, `(${widthMultiplier}x${heightMultiplier})`);
    } else {
      // Reset to default size (handles SleepingPlace 2x size)
      const defaultSize = this.hasCapability(CAPABILITIES.SLEEPING_PLACE)
        ? DISPLAY.DEFAULT_PET_SIZE * 2
        : DISPLAY.DEFAULT_PET_SIZE;
      
      // Adjust position when returning to default size
      const widthDiff = defaultSize - previousSize.width;
      const heightDiff = defaultSize - previousSize.height;
      
      if (widthDiff !== 0 || heightDiff !== 0) {
        this.position.x -= widthDiff / 2;
        this.position.y -= heightDiff / 2;
        
        // Clamp to viewport bounds
        const maxX = window.innerWidth - defaultSize;
        const maxY = window.innerHeight - defaultSize;
        this.position.x = Math.max(0, Math.min(maxX, this.position.x));
        this.position.y = Math.max(0, Math.min(maxY, this.position.y));
        
        // Sync with background
        ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.UPDATE_PET_POSITION,
          petId: this.id,
          position: this.position,
          isDragging: false
        }).catch(() => {});
      }
      
      this.element.style.width = `${defaultSize}px`;
      this.element.style.height = `${defaultSize}px`;
      this.img.style.width = `${defaultSize}px`;
      this.img.style.height = `${defaultSize}px`;
      
      // Store current size for physics calculations
      this.currentSize = { width: defaultSize, height: defaultSize };
    }

    // Show debug bubble
    if (DEBUG.SHOW_ACTION_BUBBLES) {
      this.showDebugBubble(animationId);
    }

    // Notify background of animation change (for movement control)
    // Pets are moving if they're in movement animation AND not sleeping
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_STATE,
      petId: this.id,
      state: {
        currentAnimation: animationId,
        isMoving: (animationId === this.movementPath && !this.isSleeping),
        currentSize: this.currentSize // Send current size for physics calculations
      }
    }).catch(() => {}); // Ignore errors for fire-and-forget messages
  }
  
  scheduleNextAnimation() {
    // Clear any existing timer to prevent memory leaks
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }

    // Random delay using configuration constants
    const delay = ANIMATION.SCHEDULE_MIN_DELAY + Math.random() * (ANIMATION.SCHEDULE_MAX_DELAY - ANIMATION.SCHEDULE_MIN_DELAY);
    this.animationTimer = setTimeout(() => {
      this.chooseRandomAnimation();
    }, delay);
  }
  
  chooseRandomAnimation() {
    if (this.isDragging) return;

    const animations = this.speciesData.animations || [];
    if (animations.length === 0) return;

    // Filter out movement animations from random selection
    const actionAnimations = animations.filter(a =>
      a.id !== this.movementPath &&
      a.id !== this.dragPath &&
      a.id !== DEFAULT_ANIMATIONS.FRONT
    );

    if (actionAnimations.length === 0) return;

    // Pick random animation
    const anim = actionAnimations[Math.floor(Math.random() * actionAnimations.length)];
    this.setAnimation(anim.id);

    // Wait for animation to complete before scheduling next
  }
  
  update(timestamp) {
    if (!this.element) return;

    // Update sprite animation ONLY
    const result = this.animator.update(timestamp);

    // Only update img.src when frame actually changes (huge performance improvement)
    if (result && result.frameChanged && result.frame) {
      this.img.src = result.frame;
    }

    // If animation completed, return to movement and schedule next animation
    if (result && result.status === 'completed') {
      logger.log(LOG.PREFIXES.PET, this.speciesId, 'animation completed after', result.loops, 'loops');

      // Wake up if sleeping
      if (this.isSleeping) {
        logger.log(LOG.PREFIXES.PET, this.speciesId, 'waking up from sleep');
        this.isSleeping = false;
        
        // Notify background that pet can move again
        ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.UPDATE_PET_STATE,
          petId: this.id,
          state: {
            isMoving: true
          }
        }).catch(() => {});
      }

      if (this.hasCapability(CAPABILITIES.LINEAR_MOVEMENT) && this.speed > 0 && !this.isDragging) {
        this.setAnimation(this.movementPath);
        
        // Ensure background knows pet is moving (redundant safety check)
        ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.UPDATE_PET_STATE,
          petId: this.id,
          state: {
            isMoving: true
          }
        }).catch(() => {});
      }

      // Schedule next random animation
      if (this.hasCapability(CAPABILITIES.ANIMATIONS_SCHEDULER) && !this.isDragging) {
        this.scheduleNextAnimation();
      }
    }

    // FlipHorizontallyWhenGoingLeft (visual only)
    if (this.hasCapability(CAPABILITIES.FLIP_HORIZONTALLY)) {
      if (this.direction < 0) {
        this.element.classList.add(DISPLAY.FLIP_CLASS);
      } else {
        this.element.classList.remove(DISPLAY.FLIP_CLASS);
      }
    }

    // Check for interactions (only when in moving state)
    if (this.hasCapability(CAPABILITIES.GETS_ANGRY) && this.currentAnimation === this.movementPath) {
      this.checkAngryInteraction();
    }

    // SleepingPlace capability - check for pets to put to sleep
    if (this.hasCapability(CAPABILITIES.SLEEPING_PLACE) && this.sleepingPlaceEnabled && this.currentAnimation === this.movementPath) {
      this.checkSleepingPlaceInteraction();
    }

    // LeavesPoopStains capability - drop poop every 30-60 seconds
    if (this.hasCapability(CAPABILITIES.LEAVES_POOP_STAINS)) {
      const now = Date.now();
      const poopInterval = 30000 + Math.random() * 30000; // 30-60 seconds

      if (now - this.lastPoopTime > poopInterval) {
        this.leavePoopStain();
        this.lastPoopTime = now;
      }
    }

    // Position is controlled by background worker, just render
    this.updatePosition();
  }

  /**
   * LeavesPoopStains capability: Leave a poop stain at current position
   */
  leavePoopStain() {
    if (!this.petManager) return;

    const poop = new EphemeralEntity('poop', {
      position: { x: this.position.x + 20, y: this.position.y + 40 },
      velocity: { x: 0, y: 0 },
      size: 30,
      zIndex: -1, // Below pets
      imagePath: null, // We'll use text emoji instead
      lifetime: 60000, // 60 seconds
      autoRemove: true
    });

    // Use text emoji instead of image
    poop.element.innerHTML = '<div style="font-size: 24px; user-select: none;">💩</div>';

    this.petManager.addEphemeralEntity(poop);
  }
  
  checkAngryInteraction() {
    if (this.isAngry) return; // Already angry or on cooldown

    const nearbyPets = this.petManager.getPetsNear(this.position, ANIMATION.INTERACTION_RANGE);
    const nearbyCats = nearbyPets.filter(p =>
      p.id !== this.id &&
      p.tags.includes('cats')
    );

    if (nearbyCats.length > 0) {
      this.isAngry = true;
      logger.log(LOG.PREFIXES.PET, this.speciesId, 'getting angry at another cat!');
      this.setAnimation(DEFAULT_ANIMATIONS.ANGRY);

      // Animation will complete naturally via animator.update() using requiredLoops
      // The update() method (lines 180-191) handles returning to movement animation

      // Cooldown - track timer for cleanup
      this.angryTimer = setTimeout(() => {
        this.isAngry = false;
        this.angryTimer = null;
      }, ANIMATION.ANGRY_COOLDOWN);
    }
  }

  /**
   * SleepingPlace capability: Check for overlapping pets that can sleep
   */
  checkSleepingPlaceInteraction() {
    if (!this.sleepingPlaceEnabled) return;

    // Get the size of the sleeping place (2x normal size)
    const sleepingPlaceSize = DISPLAY.DEFAULT_PET_SIZE * 2;
    
    // Find overlapping pets that can sleep
    const overlappingPets = this.petManager.getPetsOverlapping(
      this.position, 
      sleepingPlaceSize,
      (pet) => pet.id !== this.id && !pet.isSleeping && pet.canSleep()
    );

    // Sort by overlap area (largest first) and take the first one
    if (overlappingPets.length > 0) {
      const petToSleep = overlappingPets[0];
      this.putPetToSleep(petToSleep);
      
      // Disable sleeping place for 120 seconds (cooldown)
      this.sleepingPlaceEnabled = false;
      setTimeout(() => {
        this.sleepingPlaceEnabled = true;
      }, 120000);
    }
  }

  /**
   * SleepingPlace capability: Put a pet to sleep
   */
  putPetToSleep(pet) {
    const sleepAnimation = pet.getSleepAnimation();
    if (!sleepAnimation) return;

    const sleepingPlaceSize = DISPLAY.DEFAULT_PET_SIZE * 2;
    
    // Position pet on top of sleeping place (centered horizontally, on top vertically)
    pet.position.x = this.position.x + (sleepingPlaceSize - DISPLAY.DEFAULT_PET_SIZE) / 2;
    pet.position.y = this.position.y + sleepingPlaceSize - DISPLAY.DEFAULT_PET_SIZE;
    pet.velocity = { x: 0, y: 0 };
    pet.isSleeping = true;

    // Get required loops (from animation data or random 25-75)
    const loops = sleepAnimation.requiredLoops || (25 + Math.floor(Math.random() * 51)); // 25-75
    
    logger.log(LOG.PREFIXES.PET, pet.speciesId, 'going to sleep on', this.speciesId, 'for', loops, 'loops');
    
    // Set sleep animation
    pet.setAnimation(sleepAnimation.id);
    
    // Force the animator to use specific loop count
    pet.animator.setSleepLoops(loops);

    // Notify background that pet is sleeping (no longer moving)
    // This is redundant with setAnimation above but ensures state sync
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_STATE,
      petId: pet.id,
      state: {
        currentAnimation: sleepAnimation.id,
        isMoving: false  // Force stopped while sleeping
      }
    }).catch(() => {});

    // Also sync position to background
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_POSITION,
      petId: pet.id,
      position: pet.position,
      isDragging: false
    }).catch(() => {});
  }

  /**
   * Check if this pet can sleep (has a sleep animation)
   */
  canSleep() {
    return this.getSleepAnimation() !== null;
  }

  /**
   * Get the sleep animation for this pet
   */
  getSleepAnimation() {
    const animations = this.speciesData.animations || [];
    return animations.find(a => a.id === 'sleep') || null;
  }

  /**
   * Show debug bubble above pet displaying current action
   */
  showDebugBubble(action) {
    // Remove existing bubble if any
    if (this.debugBubble) {
      this.debugBubble.remove();
    }

    // Create bubble
    this.debugBubble = document.createElement('div');
    this.debugBubble.className = 'petty-debug-bubble';
    this.debugBubble.textContent = action;
    this.debugBubble.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      pointer-events: none;
      z-index: ${DISPLAY.BASE_Z_INDEX + 1000};
      white-space: nowrap;
      animation: petty-bubble-fade 0.3s ease-in-out;
    `;

    document.body.appendChild(this.debugBubble);

    // Position bubble above pet
    this.updateDebugBubblePosition();

    // Auto-remove after duration
    setTimeout(() => {
      if (this.debugBubble) {
        this.debugBubble.style.opacity = '0';
        this.debugBubble.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          if (this.debugBubble) {
            this.debugBubble.remove();
            this.debugBubble = null;
          }
        }, 300);
      }
    }, DEBUG.BUBBLE_DURATION);
  }

  /**
   * Update debug bubble position to follow pet
   */
  updateDebugBubblePosition() {
    if (!this.debugBubble || !this.element) return;

    const entitySize = this.hasCapability(CAPABILITIES.SLEEPING_PLACE) 
      ? DISPLAY.DEFAULT_PET_SIZE * 2 
      : DISPLAY.DEFAULT_PET_SIZE;

    const bubbleX = this.position.x + entitySize / 2;
    const bubbleY = this.position.y - 10;

    this.debugBubble.style.left = bubbleX + 'px';
    this.debugBubble.style.top = bubbleY + 'px';
    this.debugBubble.style.transform = 'translate(-50%, -100%)';
  }
  
  updatePosition() {
    // Only update DOM if position changed by at least 0.5px (avoid sub-pixel thrashing)
    const threshold = 0.5;
    const xChanged = this.lastRenderedX === null || Math.abs(this.position.x - this.lastRenderedX) >= threshold;
    const yChanged = this.lastRenderedY === null || Math.abs(this.position.y - this.lastRenderedY) >= threshold;

    if (!xChanged && !yChanged) return; // Skip update if position hasn't meaningfully changed

    // Use CSS transform for better performance than left/top
    const rotation = this.hasCapability(CAPABILITIES.ROTATING) && this.rotation !== 0 ? this.rotation : 0;
    const scale = this.element.scale || 1.0;

    // Single transform update (more efficient than multiple style changes)
    this.element.style.transform = `translate(${this.position.x}px, ${this.position.y}px) scale(${scale}) rotate(${rotation}deg)`;

    // Track last rendered position
    this.lastRenderedX = this.position.x;
    this.lastRenderedY = this.position.y;

    // Update debug bubble position if exists
    if (DEBUG.SHOW_ACTION_BUBBLES) {
      this.updateDebugBubblePosition();
    }
  }

  /**
   * Rotating capability: Set rotation angle
   * @param {number} degrees - Rotation in degrees
   */
  setRotation(degrees) {
    this.rotation = degrees;
  }

  /**
   * ShapeShifter capability: Smoothly scale the pet over time
   * Used for UFO abduction effect
   * @param {number} targetScale - Target scale (e.g., 0.5 for 50% size)
   * @param {number} duration - Duration in ms
   */
  async scaleTo(targetScale, duration) {
    const startScale = this.element.scale || 1.0;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const animate = () => {
        if (!this.element) {
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Ease-in-out function
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentScale = startScale + (targetScale - startScale) * eased;
        this.element.scale = currentScale;
        this.element.style.transform = `scale(${currentScale})`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }
  
  onMouseDown(e) {
    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - this.position.x,
      y: e.clientY - this.position.y
    };
    this.velocity = { x: 0, y: 0 };
    this.element.classList.add(DISPLAY.DRAGGING_CLASS);
    this.setAnimation(this.dragPath);
    e.preventDefault();
    e.stopPropagation();
  }

  onMouseMove(e) {
    if (!this.isDragging) return;

    // Calculate new position
    let newX = e.clientX - this.dragOffset.x;
    let newY = e.clientY - this.dragOffset.y;

    // Apply boundary constraints to prevent dragging outside viewport
    // Use current animation size (accounts for scaled animations)
    const entityWidth = this.currentSize?.width || DISPLAY.DEFAULT_PET_SIZE;
    const entityHeight = this.currentSize?.height || DISPLAY.DEFAULT_PET_SIZE;
    const maxX = window.innerWidth - entityWidth;
    const maxY = window.innerHeight - entityHeight;

    this.position.x = Math.max(0, Math.min(maxX, newX));
    this.position.y = Math.max(0, Math.min(maxY, newY));

    this.updatePosition();

    // Throttle position updates to reduce messaging overhead (max 20 updates/sec)
    const now = Date.now();
    if (now - this.lastPositionUpdate < 50) return;
    this.lastPositionUpdate = now;

    // Send position update while dragging
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_POSITION,
      petId: this.id,
      position: this.position,
      isDragging: true
    }).catch(() => {}); // Ignore errors
  }

  onMouseUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove(DISPLAY.DRAGGING_CLASS);

    // Send position update to background and notify that dragging stopped
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_POSITION,
      petId: this.id,
      position: this.position,
      isDragging: false
    }).catch(() => {}); // Ignore errors

    // Resume movement
    if (this.hasCapability(CAPABILITIES.LINEAR_MOVEMENT) && this.speed > 0) {
      this.setAnimation(this.movementPath);
    } else {
      this.setAnimation(DEFAULT_ANIMATIONS.FRONT);
    }
  }
  
  syncState() {
    // Periodically send state to background (throttled)
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_STATE,
      petId: this.id,
      state: {
        position: this.position,
        velocity: this.velocity,
        direction: this.direction
      }
    }).catch(() => {}); // Ignore errors for fire-and-forget messages
  }

  /**
   * Properly destroy the pet and clean up all resources to prevent memory leaks
   */
  destroy() {
    // Clear all timers to prevent memory leaks
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }

    if (this.angryTimer) {
      clearTimeout(this.angryTimer);
      this.angryTimer = null;
    }

    // Remove debug bubble
    if (this.debugBubble) {
      this.debugBubble.remove();
      this.debugBubble = null;
    }

    // Remove event listeners using bound references
    if (this.element) {
      this.element.removeEventListener('mousedown', this.boundMouseDown);
    }
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

    // Remove DOM element
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    // Clear references
    this.img = null;
    this.animator = null;

      logger.log(LOG.PREFIXES.PET, this.speciesId, 'destroyed');
    }
  }

    // Export
    window.Pet = Pet;
  }
})();
