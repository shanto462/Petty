// Sprite Animator - Handles sprite frame loading and animation

class SpriteAnimator {
  constructor(speciesId, speciesData) {
    this.speciesId = speciesId;
    this.speciesData = speciesData;
    this.fps = speciesData.fps || 10;
    this.currentAnimation = null;
    this.currentFrame = 0;
    this.frameCount = 0;
    this.frameDelay = 1000 / this.fps;
    this.lastFrameTime = 0;
    this.loops = 0;
    this.frames = {}; // Cache: {animationId: [urls]}
  }
  
  async loadAnimation(animationId) {
    if (this.frames[animationId]) {
      return this.frames[animationId];
    }
    
    const frames = [];
    let index = 0;
    
    // Try loading frames: species_animation-index.png
    while (index < 100) { // Max 100 frames per animation
      try {
        const path = `Resources/PetsAssets/${this.speciesId}_${animationId}-${index}.png`;
        const url = chrome.runtime.getURL(path);
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) break;
        frames.push(url);
        index++;
      } catch (e) {
        break;
      }
    }
    
    if (frames.length > 0) {
      this.frames[animationId] = frames;
      console.log('[SpriteAnimator]', this.speciesId, animationId, '→', frames.length, 'frames');
    }
    
    return frames;
  }
  
  async setAnimation(animationId) {
    if (this.currentAnimation === animationId) return;
    
    this.currentAnimation = animationId;
    this.currentFrame = 0;
    this.loops = 0;
    
    const frames = await this.loadAnimation(animationId);
    this.frameCount = frames ? frames.length : 0;
    
    return frames;
  }
  
  update(timestamp) {
    if (!this.currentAnimation || this.frameCount === 0) return null;
    
    // Initialize lastFrameTime on first update
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
    }
    
    if (timestamp - this.lastFrameTime >= this.frameDelay) {
      this.lastFrameTime = timestamp;
      this.currentFrame++;
      
      if (this.currentFrame >= this.frameCount) {
        this.currentFrame = 0;
        this.loops++;
        
        // Check if animation has required loops
        const animData = this.speciesData.animations?.find(a => a.id === this.currentAnimation);
        if (animData && animData.requiredLoops && this.loops >= animData.requiredLoops) {
          return { status: 'completed', loops: this.loops };
        }
      }
    }
    
    return { status: 'playing', frame: this.getCurrentFrameUrl() };
  }
  
  getCurrentFrameUrl() {
    const frames = this.frames[this.currentAnimation];
    if (!frames || frames.length === 0) return null;
    return frames[this.currentFrame];
  }
  
  getAnimationData(animationId) {
    return this.speciesData.animations?.find(a => a.id === animationId);
  }
}

// Export
window.SpriteAnimator = SpriteAnimator;

