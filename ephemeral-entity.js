// Ephemeral Entity - Base class for temporary entities (UFO, Cloud, Poop Stains, etc.)
// Based on macOS EphemeralEntity system

(function() {
  // Only define if not already defined
  if (!window.EphemeralEntity) {
    const { DISPLAY, LOG } = window.PettyConfig;
    const logger = window.PettyLogger;

    /**
     * Base class for ephemeral (temporary) entities
     * These are not pets but appear on screen temporarily (UFO, clouds, poop stains, etc.)
     */
    class EphemeralEntity {
      constructor(type, config = {}) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.type = type; // 'ufo', 'cloud', 'poop', etc.
        this.element = null;
        this.img = null;

        // Position and state
        this.position = config.position || { x: 0, y: 0 };
        this.velocity = config.velocity || { x: 0, y: 0 };
        this.scale = config.scale || 1.0;
        this.rotation = config.rotation || 0;

        // Lifecycle
        this.isAlive = true;
        this.createdAt = Date.now();
        this.lifetime = config.lifetime || null; // null = infinite, otherwise ms
        this.autoRemove = config.autoRemove !== false; // Auto-remove when lifetime expires

        // Rendering
        this.zIndex = config.zIndex || 0;
        this.imagePath = config.imagePath || null;
        this.size = config.size || DISPLAY.DEFAULT_PET_SIZE;

        // Callbacks
        this.onUpdate = config.onUpdate || null; // Called each frame
        this.onRemove = config.onRemove || null; // Called when removed

        this.create();
      }

      create() {
        // Create DOM element
        this.element = document.createElement('div');
        this.element.className = 'ephemeral-entity';
        this.element.style.position = 'fixed';
        this.element.style.pointerEvents = 'none'; // Don't interfere with page interaction
        this.element.style.zIndex = DISPLAY.BASE_Z_INDEX + this.zIndex;
        this.element.dataset.entityId = this.id;
        this.element.dataset.entityType = this.type;

        if (this.imagePath) {
          this.img = document.createElement('img');
          this.img.style.width = `${this.size}px`;
          this.img.style.height = `${this.size}px`;
          this.img.style.objectFit = 'contain';
          this.img.style.imageRendering = 'pixelated';
          this.img.src = chrome.runtime.getURL(this.imagePath);
          this.element.appendChild(this.img);
        }

        document.body.appendChild(this.element);
        this.updateTransform();

        logger.log(LOG.PREFIXES.PET, `EphemeralEntity [${this.type}] created:`, this.id);
      }

      update(timestamp) {
        if (!this.isAlive) return;

        // Check lifetime
        if (this.lifetime && this.autoRemove) {
          const age = Date.now() - this.createdAt;
          if (age >= this.lifetime) {
            this.remove();
            return;
          }
        }

        // Apply velocity
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Custom update logic
        if (this.onUpdate) {
          this.onUpdate(this, timestamp);
        }

        this.updateTransform();
      }

      updateTransform() {
        if (!this.element) return;

        let transform = `translate(${this.position.x}px, ${this.position.y}px)`;

        if (this.scale !== 1.0) {
          transform += ` scale(${this.scale})`;
        }

        if (this.rotation !== 0) {
          transform += ` rotate(${this.rotation}deg)`;
        }

        this.element.style.transform = transform;
      }

      /**
       * Smoothly scale the entity over time
       * @param {number} targetScale - Target scale (e.g., 0.5 for 50% size)
       * @param {number} duration - Duration in ms
       */
      async scaleTo(targetScale, duration) {
        const startScale = this.scale;
        const startTime = Date.now();

        return new Promise((resolve) => {
          const animate = () => {
            if (!this.isAlive) {
              resolve();
              return;
            }

            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);

            // Ease-in-out function
            const eased = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            this.scale = startScale + (targetScale - startScale) * eased;
            this.updateTransform();

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              resolve();
            }
          };

          requestAnimationFrame(animate);
        });
      }

      /**
       * Check if entity is outside viewport bounds
       */
      isOutOfBounds() {
        const margin = this.size * 2; // Allow some margin
        return (
          this.position.x < -margin ||
          this.position.x > window.innerWidth + margin ||
          this.position.y < -margin ||
          this.position.y > window.innerHeight + margin
        );
      }

      /**
       * Remove the entity
       */
      remove() {
        if (!this.isAlive) return;

        this.isAlive = false;

        if (this.onRemove) {
          this.onRemove(this);
        }

        if (this.element) {
          this.element.remove();
          this.element = null;
        }

        logger.log(LOG.PREFIXES.PET, `EphemeralEntity [${this.type}] removed:`, this.id);
      }

      /**
       * Check distance to another entity (pet or ephemeral)
       */
      distanceTo(other) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy);
      }

      /**
       * Seeker capability: Follow a target entity
       * @param {Object} target - Target entity (pet or ephemeral)
       * @param {Object} options - { offset: {x, y}, speed, arrivalDistance, onArrival }
       */
      seekTarget(target, options = {}) {
        if (!target || !target.position) return false;

        const offset = options.offset || { x: 0, y: -50 }; // Default: above target
        const speed = options.speed || 2.0;
        const arrivalDistance = options.arrivalDistance || 20;

        // Calculate target position with offset
        const targetX = target.position.x + offset.x;
        const targetY = target.position.y + offset.y;

        // Calculate direction to target
        const dx = targetX - this.position.x;
        const dy = targetY - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if arrived
        if (distance < arrivalDistance) {
          if (options.onArrival) {
            options.onArrival(this, target);
          }
          return true; // Arrived
        }

        // Move towards target
        const dirX = dx / distance;
        const dirY = dy / distance;

        this.velocity.x = dirX * speed;
        this.velocity.y = dirY * speed;

        return false; // Still seeking
      }
    }

    // Export
    window.EphemeralEntity = EphemeralEntity;
  }
})();
