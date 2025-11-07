// Pet - Individual pet instance with capability-based behavior

class Pet {
  constructor(speciesId, speciesData, petManager) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.speciesId = speciesId;
    this.speciesData = speciesData;
    this.petManager = petManager;
    
    // Properties from species JSON data - ALL properties are loaded and used:
    // - speed: Movement velocity (multiplied by baseSpeed in background.js)
    // - fps: Animation frame rate (used by SpriteAnimator)
    // - movementPath: Walking animation ID (e.g., "walk")
    // - dragPath: Animation when being dragged
    // - zIndex: Stacking order (applied as 999999 + zIndex)
    // - capabilities: Behavior capabilities
    // - tags: Species categorization
    this.speed = speciesData.speed || 0;
    this.zIndex = speciesData.zIndex || 0;
    this.movementPath = speciesData.movementPath || 'walk';
    this.dragPath = speciesData.dragPath || 'drag';
    this.capabilities = speciesData.capabilities || [];
    this.tags = speciesData.tags || [];
    
    // State
    this.position = { x: Math.random() * (window.innerWidth - 100), y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.direction = 1; // Always start right (like macOS), gets synced from background anyway
    this.isDragging = false;
    this.isGrounded = false;
    this.currentAnimation = 'front';
    
    // Capabilities state
    this.isAngry = false;
    this.animationTimer = null;
    
    // Physics
    this.gravity = 0.5;
    this.bounce = 0.3;
    
    // DOM & Animator
    this.element = null;
    this.img = null;
    this.animator = new SpriteAnimator(speciesId, speciesData);
    
    this.create();
  }
  
  create() {
    console.log('[Pet]', this.speciesId, 'created:', {
      capabilities: this.capabilities,
      speed: this.speed,
      fps: this.speciesData.fps || 10,
      movementPath: this.movementPath,
      zIndex: this.zIndex
    });
    
    // Create DOM element
    this.element = document.createElement('div');
    this.element.className = 'petty-pet';
    this.element.style.zIndex = 999999 + this.zIndex;
    this.element.dataset.petId = this.id;
    this.element.dataset.species = this.speciesId;
    
    this.img = document.createElement('img');
    this.img.style.width = '64px';
    this.img.style.height = '64px';
    this.element.appendChild(this.img);
    
    // Event listeners
    this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
    
    document.body.appendChild(this.element);
    this.updatePosition();
    
    // Start with appropriate animation
    if (this.hasCapability('LinearMovement') && this.speed > 0) {
      this.setAnimation(this.movementPath);
    } else {
      this.setAnimation('front');
    }
    
    // Schedule animations if capable - add random initial delay to desynchronize pets
    if (this.hasCapability('AnimationsScheduler')) {
      const initialDelay = Math.random() * 15000; // 0-15 second initial offset
      setTimeout(() => {
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
      console.log('[Pet]', this.speciesId, '→', animationId, '(', frames.length, 'frames)');
    } else {
      console.warn('[Pet]', this.speciesId, '→', animationId, 'FAILED - no frames');
    }
    
    // Notify background of animation change (for movement control)
    chrome.runtime.sendMessage({
      type: 'UPDATE_PET_STATE',
      petId: this.id,
      state: {
        currentAnimation: animationId,
        isMoving: (animationId === this.movementPath)
      }
    });
  }
  
  scheduleNextAnimation() {
    if (this.animationTimer) clearTimeout(this.animationTimer);
    
    // Wide random range like macOS implementation (10-30 seconds)
    const delay = 10000 + Math.random() * 20000;
    this.animationTimer = setTimeout(() => {
      this.chooseRandomAnimation();
    }, delay);
  }
  
  chooseRandomAnimation() {
    if (this.isDragging) return;
    
    const animations = this.speciesData.animations || [];
    if (animations.length === 0) return;
    
    // Filter out movement animations from random selection (like macOS)
    // Movement animation is played automatically, random animations should be actions
    const actionAnimations = animations.filter(a => 
      a.id !== this.movementPath && 
      a.id !== this.dragPath &&
      a.id !== 'front' // front is default idle, not a random action
    );
    
    if (actionAnimations.length === 0) return;
    
    // Pick random animation (weighted toward longer animations for more variety)
    const anim = actionAnimations[Math.floor(Math.random() * actionAnimations.length)];
    console.log('[Pet]', this.speciesId, 'chose random animation:', anim.id, 'requiredLoops:', anim.requiredLoops);
    this.setAnimation(anim.id);
    
    // DON'T schedule next animation yet - wait for this one to complete
    // The update() method will call scheduleNextAnimation() when animation completes
  }
  
  update(timestamp) {
    if (!this.element) return;
    
    // Update sprite animation ONLY
    const result = this.animator.update(timestamp);
    if (result && result.frame) {
      this.img.src = result.frame;
    }
    
    // If animation completed, return to movement and schedule next animation
    if (result && result.status === 'completed') {
      console.log('[Pet]', this.speciesId, 'animation completed after', result.loops, 'loops');
      
      if (this.hasCapability('LinearMovement') && this.speed > 0 && !this.isDragging) {
        this.setAnimation(this.movementPath);
      }
      
      // Schedule next random animation
      if (this.hasCapability('AnimationsScheduler') && !this.isDragging) {
        this.scheduleNextAnimation();
      }
    }
    
    // FlipHorizontallyWhenGoingLeft (visual only)
    if (this.hasCapability('FlipHorizontallyWhenGoingLeft')) {
      if (this.direction < 0) {
        this.element.classList.add('flipped');
      } else {
        this.element.classList.remove('flipped');
      }
    }
    
    // Check for interactions (only when in moving state)
    if (this.hasCapability('GetsAngryWhenMeetingOtherCats') && this.currentAnimation === this.movementPath) {
      this.checkAngryInteraction();
    }
    
    // Position is controlled by background worker, just render
    this.updatePosition();
  }
  
  checkAngryInteraction() {
    if (this.isAngry) return; // Already angry or on cooldown
    
    const nearbyPets = this.petManager.getPetsNear(this.position, 100);
    const nearbyCats = nearbyPets.filter(p => 
      p.id !== this.id && 
      p.tags.includes('cats')
    );
    
    if (nearbyCats.length > 0) {
      this.isAngry = true;
      console.log('[Pet]', this.speciesId, 'getting angry at another cat!');
      this.setAnimation('angry');
      
      // Wait for animation to complete (using requiredLoops or timeout)
      setTimeout(() => {
        if (this.hasCapability('LinearMovement') && this.speed > 0 && !this.isDragging) {
          this.setAnimation(this.movementPath);
        }
      }, 3000);
      
      // Cooldown - 30 seconds before can get angry again (like macOS)
      setTimeout(() => {
        this.isAngry = false;
      }, 30000);
    }
  }
  
  updatePosition() {
    this.element.style.left = this.position.x + 'px';
    this.element.style.top = this.position.y + 'px';
  }
  
  onMouseDown(e) {
    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - this.position.x,
      y: e.clientY - this.position.y
    };
    this.velocity = { x: 0, y: 0 };
    this.element.classList.add('dragging');
    this.setAnimation(this.dragPath);
    e.preventDefault();
    e.stopPropagation();
  }
  
  onMouseMove(e) {
    if (!this.isDragging) return;
    this.position.x = e.clientX - this.dragOffset.x;
    this.position.y = e.clientY - this.dragOffset.y;
    this.updatePosition();
    
    // Send position update while dragging
    chrome.runtime.sendMessage({
      type: 'UPDATE_PET_POSITION',
      petId: this.id,
      position: this.position,
      isDragging: true
    });
  }
  
  onMouseUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('dragging');
    
    // Send position update to background and notify that dragging stopped
    chrome.runtime.sendMessage({
      type: 'UPDATE_PET_POSITION',
      petId: this.id,
      position: this.position,
      isDragging: false
    });
    
    // Resume movement (setAnimation will notify background of isMoving state)
    if (this.hasCapability('LinearMovement') && this.speed > 0) {
      this.setAnimation(this.movementPath);
    } else {
      this.setAnimation('front');
    }
  }
  
  syncState() {
    // Periodically send state to background (throttled)
    chrome.runtime.sendMessage({
      type: 'UPDATE_PET_STATE',
      petId: this.id,
      state: {
        position: this.position,
        velocity: this.velocity,
        direction: this.direction
      }
    });
  }
  
  destroy() {
    if (this.animationTimer) clearTimeout(this.animationTimer);
    if (this.element) this.element.remove();
    console.log('[Pet]', this.speciesId, 'destroyed');
  }
}

// Export
window.Pet = Pet;

