// Sprite Animator - Handles sprite frame loading and animation.
// Frame counts come from the generated catalog, so only frames that exist are requested.

(function () {
  if (!window.SpriteAnimator) {
    // Action animations without requiredLoops play this many times (macOS behavior)
    const DEFAULT_ACTION_LOOPS = 4;

    class SpriteAnimator {
      constructor(speciesId, speciesData, speciesManager = SpeciesManager.getInstance()) {
        this.logger = window.PettyLogger;
        this.speciesId = speciesId;
        this.speciesData = speciesData;
        this.speciesManager = speciesManager;
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
        this.decodedImages = {}; // Keep decoded images alive for instant rendering
        this.forcedLoops = null; // For SleepingPlace capability to force specific loop count
        this.latestRequest = 0; // Only the newest setAnimation call may switch the animation
      }

      /**
       * True when the catalog has at least one frame for this animation
       */
      hasAnimation(animationId) {
        return this.speciesManager.getFrameCount(this.speciesId, animationId) > 0;
      }

      async loadAnimation(animationId) {
        if (this.frames[animationId]) {
          return this.frames[animationId];
        }

        const count = this.speciesManager.getFrameCount(this.speciesId, animationId);
        if (count === 0) {
          return [];
        }

        const urls = Array.from({ length: count }, (_, index) =>
          this.speciesManager.getSpriteUrl(this.speciesId, animationId, index),
        );

        // Decode every frame up front so playback never stalls on image loading
        const images = await Promise.all(
          urls.map(async (url) => {
            const img = new Image();
            img.src = url;
            try {
              await img.decode();
            } catch {
              // A frame that fails to decode still renders once the browser loads it
            }
            return img;
          }),
        );

        this.frames[animationId] = urls;
        this.decodedImages[animationId] = images;
        return urls;
      }

      async setAnimation(animationId) {
        const request = ++this.latestRequest;
        if (this.currentAnimation === animationId) return this.frames[animationId];

        // Load frames first before changing animation
        const frames = await this.loadAnimation(animationId);

        // A newer request came in while these frames loaded: it wins, even if it finished first
        if (request !== this.latestRequest) return null;

        if (!frames || frames.length === 0) {
          return null;
        }

        this.currentAnimation = animationId;
        this.currentFrame = 0;
        this.loops = 0;
        this.lastFrameTime = 0; // Reset timing
        this.frameCount = frames.length;
        this.lastReturnedFrame = null;
        this.forcedLoops = null; // Clear any forced loops

        return frames;
      }

      update(timestamp) {
        if (!this.currentAnimation || this.frameCount === 0) return null;

        // Initialize lastFrameTime on first update and show the first frame immediately
        if (this.lastFrameTime === 0) {
          this.lastFrameTime = timestamp;
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

            const animData = this.getAnimationData(this.currentAnimation);
            // ForcedLoops takes precedence (used by SleepingPlace capability)
            const requiredLoops = this.forcedLoops !== null ? this.forcedLoops : animData?.requiredLoops;

            // Completion rules:
            // - Movement/drag animations (no requiredLoops): loop forever
            // - Action animations with requiredLoops: complete after N loops
            // - Action animations without requiredLoops: complete after DEFAULT_ACTION_LOOPS
            const isMovementOrDrag =
              this.currentAnimation === this.speciesData.movementPath ||
              this.currentAnimation === this.speciesData.dragPath;

            let shouldComplete = false;
            if (requiredLoops !== undefined) {
              shouldComplete = this.loops >= requiredLoops;
            } else if (!isMovementOrDrag) {
              shouldComplete = this.loops >= DEFAULT_ACTION_LOOPS;
            }

            if (shouldComplete) {
              this.forcedLoops = null;
              return { status: 'completed', loops: this.loops };
            }
          }
        }

        // Only return frame URL if it changed, to avoid unnecessary DOM updates
        if (frameChanged) {
          const currentFrameUrl = this.getCurrentFrameUrl();
          this.lastReturnedFrame = currentFrameUrl;
          return { status: 'playing', frame: currentFrameUrl, frameChanged: true };
        }

        return { status: 'playing', frameChanged: false };
      }

      getCurrentFrameUrl() {
        const frames = this.frames[this.currentAnimation];
        if (!frames || frames.length === 0) return null;
        return frames[this.currentFrame];
      }

      getAnimationData(animationId) {
        return this.speciesData.animations?.find((a) => a.id === animationId);
      }

      /**
       * Set a specific number of loops for the current animation (used by SleepingPlace)
       */
      setSleepLoops(loops) {
        this.forcedLoops = loops;
        this.logger.log('[SpriteAnimator]', this.speciesId, 'sleep loops set to', loops);
      }
    }

    window.SpriteAnimator = SpriteAnimator;
  }
})();
