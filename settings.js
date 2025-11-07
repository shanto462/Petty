// Settings Manager - Centralized settings with chrome.storage persistence

(function() {
  if (!window.PettySettings) {
    const { DISPLAY, SPEED } = window.PettyConfig;

    class PettySettings {
      constructor() {
        // Default settings (matching macOS defaults)
        this.defaults = {
          petSize: DISPLAY.DEFAULT_PET_SIZE, // 75px
          speedMultiplier: SPEED.DEFAULT_MULTIPLIER, // 1.0
          gravityEnabled: true,
          randomEvents: true
        };

        this.current = { ...this.defaults };
        this.listeners = []; // Callback functions for setting changes
      }

      /**
       * Load settings from chrome.storage
       */
      async load() {
        return new Promise((resolve) => {
          chrome.storage.sync.get(['pettySettings'], (result) => {
            if (result.pettySettings) {
              this.current = { ...this.defaults, ...result.pettySettings };
              console.log('[Settings] Loaded:', this.current);
            } else {
              console.log('[Settings] Using defaults:', this.current);
            }
            this.notifyListeners();
            resolve(this.current);
          });
        });
      }

      /**
       * Save settings to chrome.storage
       */
      async save() {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ pettySettings: this.current }, () => {
            console.log('[Settings] Saved:', this.current);
            resolve();
          });
        });
      }

      /**
       * Get a setting value
       */
      get(key) {
        return this.current[key] ?? this.defaults[key];
      }

      /**
       * Set a setting value and save
       */
      async set(key, value) {
        // Validate ranges
        if (key === 'petSize') {
          value = Math.max(DISPLAY.MIN_PET_SIZE, Math.min(DISPLAY.MAX_PET_SIZE, value));
        } else if (key === 'speedMultiplier') {
          value = Math.max(SPEED.MIN_MULTIPLIER, Math.min(SPEED.MAX_MULTIPLIER, value));
        }

        this.current[key] = value;
        await this.save();
        this.notifyListeners();
      }

      /**
       * Reset all settings to defaults
       */
      async reset() {
        this.current = { ...this.defaults };
        await this.save();
        this.notifyListeners();
      }

      /**
       * Add a listener for setting changes
       */
      onChange(callback) {
        this.listeners.push(callback);
      }

      /**
       * Notify all listeners of changes
       */
      notifyListeners() {
        this.listeners.forEach(callback => callback(this.current));
      }
    }

    // Create singleton instance
    window.PettySettings = new PettySettings();
  }
})();
