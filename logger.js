// Logger - Centralized logging utility that respects debug settings

(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  /**
   * Logger utility that respects DEBUG.SHOW_CONSOLE_LOGS setting
   */
  class Logger {
    constructor() {
      this.config = globalScope.PettyConfig;
    }

    /**
     * Debug log - only shows when SHOW_CONSOLE_LOGS is true
     */
    log(...args) {
      if (this.config?.DEBUG?.SHOW_CONSOLE_LOGS) {
        console.log(...args);
      }
    }

    /**
     * Warning - always shows (important)
     */
    warn(...args) {
      console.warn(...args);
    }

    /**
     * Error - always shows (critical)
     */
    error(...args) {
      console.error(...args);
    }

    /**
     * Info - always shows (informational)
     */
    info(...args) {
      console.info(...args);
    }
  }

  // Create singleton instance
  globalScope.PettyLogger = new Logger();
})();

