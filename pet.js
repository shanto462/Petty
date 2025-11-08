// Pet - Individual pet instance with capability-based behavior

(function() {
  // Only define if not already defined
  if (!window.Pet) {
    // Access configuration
    const { DISPLAY, ANIMATION, LOG, MESSAGE_TYPES, DEFAULT_ANIMATIONS, CAPABILITIES } = window.PettyConfig;

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
    const randomX = window.innerWidth * (0.2 + Math.random() * 0.6); // 20-80%
    const randomY = this.hasCapability(CAPABILITIES.WALL_CRAWLER)
      ? window.innerHeight - DISPLAY.DEFAULT_PET_SIZE  // Bottom for wall crawlers
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

    // Track last rendered position to avoid unnecessary DOM updates
    this.lastRenderedX = null;
    this.lastRenderedY = null;

    // DOM & Animator
    this.element = null;
    this.img = null;
    this.animator = new SpriteAnimator(speciesId, speciesData);

    // Event handlers (store references for proper cleanup)
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);

    this.create();
  }
  
  create() {
    console.log(LOG.PREFIXES.PET, this.speciesId, 'created:', {
      capabilities: this.capabilities,
      speed: this.speed,
      fps: this.speciesData.fps || 10,
      movementPath: this.movementPath,
      zIndex: this.zIndex
    });

    // Create DOM element
    this.element = document.createElement('div');
    this.element.className = DISPLAY.PET_CLASS;
    this.element.style.zIndex = DISPLAY.BASE_Z_INDEX + this.zIndex;
    this.element.dataset.petId = this.id;
    this.element.dataset.species = this.speciesId;

    this.img = document.createElement('img');
    this.img.style.width = `${DISPLAY.DEFAULT_PET_SIZE}px`;
    this.img.style.height = `${DISPLAY.DEFAULT_PET_SIZE}px`;

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
      console.log(LOG.PREFIXES.PET, this.speciesId, '→', animationId, '(', frames.length, 'frames)');
    } else {
      console.warn(LOG.PREFIXES.PET, this.speciesId, '→', animationId, 'FAILED - no frames');
    }

    // Notify background of animation change (for movement control)
    ChromeMessaging.sendMessage({
      type: MESSAGE_TYPES.UPDATE_PET_STATE,
      petId: this.id,
      state: {
        currentAnimation: animationId,
        isMoving: (animationId === this.movementPath)
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
    console.log(LOG.PREFIXES.PET, this.speciesId, 'chose random animation:', anim.id, 'requiredLoops:', anim.requiredLoops);
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
      console.log(LOG.PREFIXES.PET, this.speciesId, 'animation completed after', result.loops, 'loops');

      if (this.hasCapability(CAPABILITIES.LINEAR_MOVEMENT) && this.speed > 0 && !this.isDragging) {
        this.setAnimation(this.movementPath);
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
      console.log(LOG.PREFIXES.PET, this.speciesId, 'getting angry at another cat!');
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
    const maxX = window.innerWidth - DISPLAY.DEFAULT_PET_SIZE;
    const maxY = window.innerHeight - DISPLAY.DEFAULT_PET_SIZE;

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

      console.log(LOG.PREFIXES.PET, this.speciesId, 'destroyed');
    }
  }

    // Export
    window.Pet = Pet;
  }
})();
