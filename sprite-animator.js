// Sprite Animator - Handles sprite frame loading and animation

class SpriteAnimator {
  constructor(speciesId, speciesData) {
    this.speciesId = speciesId;
    this.speciesData = speciesData;
    // Allow FPS range 0.1-60 to support slow-motion species (e.g., Snail=1fps, cat_house=0.5fps)
    const rawFps = speciesData.fps || 10;
    this.fps = Math.min(60, Math.max(0.1, rawFps));
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

    console.log('[SpriteAnimator] 🔄 Loading animation:', this.speciesId, animationId);

    // Use Image preloading instead of HEAD requests for faster loading
    // Try loading frames in parallel up to a reasonable limit
    const maxFrames = 100;
    const loadPromises = [];

    for (let index = 0; index < maxFrames; index++) {
      const path = `Resources/PetsAssets/${this.speciesId}_${animationId}-${index}.png`;
      const url = chrome.runtime.getURL(path);

      loadPromises.push(
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ index, url, success: true });
          img.onerror = () => resolve({ index, url, success: false });
          img.src = url;
        })
      );
    }

    // Wait for all parallel loads to complete
    const results = await Promise.all(loadPromises);

    // Collect only successful consecutive frames (stop at first missing frame)
    const frames = [];
    for (const result of results) {
      if (!result.success) break; // Stop at first missing frame
      frames.push(result.url);
    }

    if (frames.length > 0) {
      this.frames[animationId] = frames;
      console.log('[SpriteAnimator] ✅', this.speciesId, animationId, '→', frames.length, 'frames');
    } else {
      console.error('[SpriteAnimator] ❌', this.speciesId, animationId, '→ NO FRAMES FOUND!',
                    '\nExpected:', `Resources/PetsAssets/${this.speciesId}_${animationId}-0.png`,
                    '\nCheck if sprite files exist in Resources/PetsAssets/');
    }

    return frames;
  }
  
  async setAnimation(animationId) {
    console.log('[SpriteAnimator] setAnimation called:', this.speciesId, animationId);
    if (this.currentAnimation === animationId) return this.frames[animationId];
    
    // Load frames first before changing animation
    const frames = await this.loadAnimation(animationId);
    
    if (!frames || frames.length === 0) {
      console.error('[SpriteAnimator] ❌ Cannot set animation', animationId, '- no frames loaded');
      return null;
    }
    
    // Now update state
    this.currentAnimation = animationId;
    this.currentFrame = 0;
    this.loops = 0;
    this.lastFrameTime = 0; // Reset timing
    this.frameCount = frames.length;
    
    console.log('[SpriteAnimator] ✅ Started animation:', this.speciesId, animationId, 
                'frames:', this.frameCount, 'fps:', this.fps);
    
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
        if (animData && animData.requiredLoops) {
          if (this.loops >= animData.requiredLoops) {
            console.log('[SpriteAnimator]', this.speciesId, this.currentAnimation, 
                        'completed after', this.loops, '/', animData.requiredLoops, 'loops');
            return { status: 'completed', loops: this.loops };
          }
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

