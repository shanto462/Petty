// Settings Management - Centralized settings with chrome.storage persistence
// This file provides a consistent API for settings but is optional -
// settings are already managed inline in background.js and popup-controller.js

(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.PettySettings) {
    const { DISPLAY, SPEED } = globalScope.PettyConfig || {};

    /**
     * Settings Manager (Optional Singleton)
     * Note: Settings are already managed in background.js and popup-controller.js
     * This provides a unified API if needed in the future
     */
    class PettySettings {
      constructor() {
        this.defaults = {
          petSize: DISPLAY?.DEFAULT_PET_SIZE || 75,
          speedMultiplier: SPEED?.DEFAULT_MULTIPLIER || 1.0,
          gravityEnabled: true,
          randomEvents: true
        };
        this.current = { ...this.defaults };
        this.listeners = [];
      }

      /**
       * Load settings from chrome.storage
       */
      async load() {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          console.warn('[PettySettings] Chrome storage not available, using defaults');
          return this.current;
        }

        return new Promise((resolve) => {
          chrome.storage.sync.get(['pettySettings'], (result) => {
            if (result.pettySettings) {
              this.current = { ...this.defaults, ...result.pettySettings };
            }
            resolve(this.current);
          });
        });
      }

      /**
       * Save settings to chrome.storage
       */
      async save() {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          console.warn('[PettySettings] Chrome storage not available');
          return;
        }

        return new Promise((resolve) => {
          chrome.storage.sync.set({ pettySettings: this.current }, resolve);
        });
      }

      /**
       * Set a specific setting
       */
      async set(key, value) {
        // Validate ranges
        if (key === 'petSize' && DISPLAY) {
          value = Math.max(DISPLAY.MIN_PET_SIZE, Math.min(DISPLAY.MAX_PET_SIZE, value));
        } else if (key === 'speedMultiplier' && SPEED) {
          value = Math.max(SPEED.MIN_MULTIPLIER, Math.min(SPEED.MAX_MULTIPLIER, value));
        }

        this.current[key] = value;
        await this.save();
        this.notifyListeners(key, value);
      }

      /**
       * Get a specific setting
       */
      get(key) {
        return this.current[key];
      }

      /**
       * Get all settings
       */
      getAll() {
        return { ...this.current };
      }

      /**
       * Reset to defaults
       */
      async reset() {
        this.current = { ...this.defaults };
        await this.save();
        this.notifyListeners('all', this.current);
      }

      /**
       * Add change listener
       */
      addListener(callback) {
        this.listeners.push(callback);
      }

      /**
       * Remove change listener
       */
      removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
      }

      /**
       * Notify all listeners
       */
      notifyListeners(key, value) {
        this.listeners.forEach(callback => {
          try {
            callback(key, value);
          } catch (error) {
            console.error('[PettySettings] Listener error:', error);
          }
        });
      }
    }

    // Export as singleton (optional - not used by current implementation)
    globalScope.PettySettings = new PettySettings();
  }
})();
