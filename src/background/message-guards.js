// Message Guards - Validates messages sent to the background coordinator.
// Content scripts run inside arbitrary web pages, so every field is checked
// before it touches shared pet state.

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.PettyMessageGuards) {
    const MAX_COORDINATE = 100000;
    const MAX_ID_LENGTH = 64;

    const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function isId(value) {
      return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
    }

    function toPoint(value) {
      if (!value || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
      return {
        x: clamp(value.x, -MAX_COORDINATE, MAX_COORDINATE),
        y: clamp(value.y, -MAX_COORDINATE, MAX_COORDINATE),
      };
    }

    function toSize(value) {
      if (!value || !isFiniteNumber(value.width) || !isFiniteNumber(value.height)) return null;
      if (value.width <= 0 || value.height <= 0) return null;
      return {
        width: Math.min(value.width, MAX_COORDINATE),
        height: Math.min(value.height, MAX_COORDINATE),
      };
    }

    /**
     * Picks only the pet state fields a tab is allowed to change.
     * @returns {object} A new object with validated fields (may be empty).
     */
    function sanitizePetState(state) {
      const clean = {};
      if (!state || typeof state !== 'object') return clean;

      if (typeof state.currentAnimation === 'string' && state.currentAnimation.length <= MAX_ID_LENGTH) {
        clean.currentAnimation = state.currentAnimation;
      }
      if (typeof state.isMoving === 'boolean') clean.isMoving = state.isMoving;
      if (typeof state.isSleeping === 'boolean') clean.isSleeping = state.isSleeping;
      if (state.direction === 1 || state.direction === -1) clean.direction = state.direction;

      const position = toPoint(state.position);
      if (position) clean.position = position;
      const velocity = toPoint(state.velocity);
      if (velocity) clean.velocity = velocity;
      const currentSize = toSize(state.currentSize);
      if (currentSize) clean.currentSize = currentSize;

      return clean;
    }

    globalScope.PettyMessageGuards = { isId, toPoint, toSize, sanitizePetState };
  }
})();
