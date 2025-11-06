// Pet - Individual pet instance with capability-based behavior

class Pet {
  constructor(speciesId, speciesData, petManager) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.speciesId = speciesId;
    this.speciesData = speciesData;
    this.petManager = petManager;
    
    // Properties from species data
    this.speed = speciesData.speed || 0;
    this.zIndex = speciesData.zIndex || 0;
    this.movementPath = speciesData.movementPath || 'walk';
    this.dragPath = speciesData.dragPath || 'drag';
    this.capabilities = speciesData.capabilities || [];
    this.tags = speciesData.tags || [];
    
    // State
    this.position = { x: Math.random() * (window.innerWidth - 100), y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.direction = Math.random() > 0.5 ? 1 : -1;
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
    console.log('[Pet]', this.speciesId, 'created with capabilities:', this.capabilities);
    
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
      this.velocity.x = this.direction * this.speed;
    } else {
      this.setAnimation('front');
    }
    
    // Schedule animations if capable
    if (this.hasCapability('AnimationsScheduler')) {
      this.scheduleNextAnimation();
    }
  }
  
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  
  async setAnimation(animationId) {
    if (this.currentAnimation === animationId) return;
    this.currentAnimation = animationId;
    await this.animator.setAnimation(animationId);
    
    // Immediately display the first frame
    if (this.img && this.animator.getCurrentFrameUrl()) {
      this.img.src = this.animator.getCurrentFrameUrl();
    }
    
    console.log('[Pet]', this.speciesId, '→', animationId);
  }
  
  scheduleNextAnimation() {
    if (this.animationTimer) clearTimeout(this.animationTimer);
    
    const delay = 3000 + Math.random() * 5000; // 3-8 seconds
    this.animationTimer = setTimeout(() => {
      this.chooseRandomAnimation();
    }, delay);
  }
  
  chooseRandomAnimation() {
    if (this.isDragging) return;
    
    const animations = this.speciesData.animations || [];
    if (animations.length === 0) return;
    
    // Pick random animation
    const anim = animations[Math.floor(Math.random() * animations.length)];
    this.setAnimation(anim.id);
    
    // Resume movement after animation completes
    if (this.hasCapability('LinearMovement') && this.speed > 0) {
      setTimeout(() => {
        if (!this.isDragging) {
          this.setAnimation(this.movementPath);
          this.velocity.x = this.direction * this.speed;
        }
      }, 3000); // Give time for animation to play
    }
    
    this.scheduleNextAnimation();
  }
  
  update(timestamp) {
    if (!this.element) return;
    
    // Update sprite animation ONLY
    const result = this.animator.update(timestamp);
    if (result && result.frame) {
      this.img.src = result.frame;
    }
    
    // If animation completed, return to movement
    if (result && result.status === 'completed') {
      if (this.hasCapability('LinearMovement') && this.speed > 0 && !this.isDragging) {
        this.setAnimation(this.movementPath);
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
    
    // Position is controlled by background worker, just render
    this.updatePosition();
  }
  
  checkAngryInteraction() {
    const nearbyPets = this.petManager.getPetsNear(this.position, 100);
    const nearbyCats = nearbyPets.filter(p => 
      p.id !== this.id && 
      p.tags.includes('cats')
    );
    
    if (nearbyCats.length > 0 && !this.isAngry) {
      this.isAngry = true;
      this.setAnimation('angry');
      setTimeout(() => {
        this.isAngry = false;
        if (this.hasCapability('LinearMovement') && this.speed > 0) {
          this.setAnimation(this.movementPath);
        }
      }, 3000);
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
    
    // Resume movement
    if (this.hasCapability('LinearMovement') && this.speed > 0) {
      this.setAnimation(this.movementPath);
      this.velocity.x = this.direction * this.speed;
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

