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
    this.lastReturnedFrame = null; // Track last frame to avoid redundant updates
    this.decodedImages = {}; // Cache decoded images for instant rendering
    this.DEBUG = false; // Disable debug logging for performance
    this.forcedLoops = null; // For SleepingPlace capability to force specific loop count
  }
  
  async loadAnimation(animationId) {
    if (this.frames[animationId]) {
      return this.frames[animationId];
    }

    // Load frames in smaller chunks to avoid overwhelming the browser
    const maxFrames = 100;
    const chunkSize = 20; // Load 20 frames at a time
    const frames = [];
    const decodedCache = [];

    for (let chunkStart = 0; chunkStart < maxFrames; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, maxFrames);
      const chunkPromises = [];

      for (let index = chunkStart; index < chunkEnd; index++) {
        const path = `Resources/PetsAssets/${this.speciesId}_${animationId}-${index}.png`;
        const url = chrome.runtime.getURL(path);

        chunkPromises.push(
          new Promise(async (resolve) => {
            const img = new Image();
            img.onload = async () => {
              // Decode image for smoother rendering
              try {
                await img.decode();
                resolve({ index, url, img, success: true });
              } catch (e) {
                resolve({ index, url, img, success: true }); // Still resolve if decode fails
              }
            };
            img.onerror = () => resolve({ index, url, img: null, success: false });
            img.src = url;
          })
        );
      }

      // Wait for this chunk to complete
      const results = await Promise.all(chunkPromises);

      // Check results in order - stop at first missing frame
      let foundMissing = false;
      for (const result of results) {
        if (!result.success) {
          foundMissing = true;
          break;
        }
        frames.push(result.url);
        decodedCache.push(result.img);
      }

      // If we found a missing frame, stop loading more chunks
      if (foundMissing) break;
    }

    if (frames.length > 0) {
      this.frames[animationId] = frames;
      this.decodedImages[animationId] = decodedCache;
    } else if (this.DEBUG) {
      console.error('[SpriteAnimator] ❌', this.speciesId, animationId, '→ NO FRAMES');
    }

    return frames;
  }
  
  async setAnimation(animationId) {
    if (this.currentAnimation === animationId) return this.frames[animationId];

    // Load frames first before changing animation
    const frames = await this.loadAnimation(animationId);

    if (!frames || frames.length === 0) {
      if (this.DEBUG) console.error('[SpriteAnimator] ❌ Cannot set animation', animationId);
      return null;
    }

    // Now update state
    this.currentAnimation = animationId;
    this.currentFrame = 0;
    this.loops = 0;
    this.lastFrameTime = 0; // Reset timing
    this.frameCount = frames.length;
    this.lastReturnedFrame = null; // Reset frame tracking
    this.forcedLoops = null; // Clear any forced loops

    return frames;
  }
  
  update(timestamp) {
    if (!this.currentAnimation || this.frameCount === 0) return null;

    // Initialize lastFrameTime on first update
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
      // Return first frame immediately
      const firstFrame = this.getCurrentFrameUrl();
      this.lastReturnedFrame = firstFrame;
      return { status: 'playing', frame: firstFrame, frameChanged: true };
    }

    let frameChanged = false;

    if (timestamp - this.lastFrameTime >= this.frameDelay) {
      this.lastFrameTime = timestamp;
      this.currentFrame++;
      frameChanged = true;

      if (this.currentFrame >= this.frameCount) {
        this.currentFrame = 0;
        this.loops++;

        // Check if animation has required loops (with forcedLoops taking precedence)
        const animData = this.speciesData.animations?.find(a => a.id === this.currentAnimation);
        
        // ForcedLoops takes precedence (used by SleepingPlace capability)
        const requiredLoops = this.forcedLoops !== null ? this.forcedLoops : animData?.requiredLoops;

        // Determine completion based on animation type:
        // - Movement/drag animations (no requiredLoops): loop infinitely
        // - Action animations (with requiredLoops): complete after N loops
        // - Action animations (without requiredLoops): default to 4 loops (macOS behavior)
        const isMovementOrDrag =
          this.currentAnimation === this.speciesData.movementPath ||
          this.currentAnimation === this.speciesData.dragPath;

        let shouldComplete = false;
        if (requiredLoops !== undefined) {
          // Has explicit requiredLoops (or forcedLoops) - use it
          shouldComplete = this.loops >= requiredLoops;
        } else if (!isMovementOrDrag) {
          // Action animation without requiredLoops - default to 4 loops (like macOS angry animation)
          shouldComplete = this.loops >= 4;
        }
        // else: movement/drag animations loop infinitely

        if (shouldComplete) {
          if (this.DEBUG) {
            console.log('[SpriteAnimator]', this.speciesId, this.currentAnimation,
                        'completed after', this.loops, '/', requiredLoops || 4, 'loops');
          }
          this.forcedLoops = null; // Clear forced loops
          return { status: 'completed', loops: this.loops };
        }
      }
    }

    // Only return frame URL if it changed
    if (frameChanged) {
      const currentFrameUrl = this.getCurrentFrameUrl();
      this.lastReturnedFrame = currentFrameUrl;
      return { status: 'playing', frame: currentFrameUrl, frameChanged: true };
    }

    // No change - don't return frame to avoid unnecessary DOM updates
    return { status: 'playing', frameChanged: false };
  }
  
  getCurrentFrameUrl() {
    const frames = this.frames[this.currentAnimation];
    if (!frames || frames.length === 0) return null;
    return frames[this.currentFrame];
  }
  
  getAnimationData(animationId) {
    return this.speciesData.animations?.find(a => a.id === animationId);
  }

  /**
   * Set a specific number of loops for the current animation (used by SleepingPlace)
   */
  setSleepLoops(loops) {
    this.forcedLoops = loops;
    console.log('[SpriteAnimator]', this.speciesId, 'sleep loops set to', loops);
  }
}

// Export
window.SpriteAnimator = SpriteAnimator;

