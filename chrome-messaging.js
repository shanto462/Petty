// Chrome Messaging Helper - Handles retries for suspended service workers

class ChromeMessaging {
  static async sendMessage(message, maxRetries = 3, delay = 100) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        return response;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isChannelClosed = error.message.includes('message channel closed') || 
                                error.message.includes('Extension context invalidated');
        
        if (isChannelClosed && !isLastAttempt) {
          console.warn(`[ChromeMessaging] Retry ${attempt}/${maxRetries} - Service worker suspended, retrying...`);
          await this.sleep(delay * attempt); // Exponential backoff
          continue;
        }
        
        if (isLastAttempt) {
          console.error('[ChromeMessaging] Failed after', maxRetries, 'attempts:', error.message);
        }
        
        throw error;
      }
    }
  }
  
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export
window.ChromeMessaging = ChromeMessaging;

