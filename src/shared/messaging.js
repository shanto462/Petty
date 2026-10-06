// Chrome Messaging Helper - Handles retries for suspended service workers

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.ChromeMessaging) {
    const logger = globalScope.PettyLogger || { warn: console.warn, error: console.error };

    // Errors that usually clear up once the service worker has (re)started
    const RETRYABLE_ERRORS = ['message channel closed', 'Receiving end does not exist'];

    class ChromeMessaging {
      /**
       * False after the extension was reloaded, updated or removed. Chrome then cuts
       * off scripts that were already running in open tabs, permanently.
       */
      static isConnected() {
        try {
          return Boolean(chrome.runtime?.id);
        } catch {
          return false;
        }
      }

      static async sendMessage(message, maxRetries = 3, delay = 100) {
        if (!this.isConnected()) {
          throw new Error('Extension context invalidated'); // Retrying cannot reconnect
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await chrome.runtime.sendMessage(message);
          } catch (error) {
            const isLastAttempt = attempt === maxRetries;
            const isRetryable = RETRYABLE_ERRORS.some((text) => error.message?.includes(text));

            if (isRetryable && !isLastAttempt) {
              logger.warn(`[ChromeMessaging] Retry ${attempt}/${maxRetries} - service worker not ready, retrying...`);
              await this.sleep(delay * attempt); // Linear backoff
              continue;
            }

            if (isLastAttempt && isRetryable) {
              logger.error('[ChromeMessaging] Failed after', maxRetries, 'attempts:', error.message);
            }

            throw error;
          }
        }
      }

      static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
    }

    globalScope.ChromeMessaging = ChromeMessaging;
  }
})();
