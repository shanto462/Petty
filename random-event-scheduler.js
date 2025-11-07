// Random Event Scheduler - Triggers random events like UFO abductions
// Based on macOS RandomEventsScheduler.swift

(function() {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.RandomEventScheduler) {
    const { LOG } = globalScope.PettyConfig || {};

    /**
     * Schedules random events (UFO abductions, clouds, etc.) at random intervals
     * Respects the randomEvents setting and only triggers when pets are active
     */
    class RandomEventScheduler {
      constructor(coordinator) {
        this.coordinator = coordinator; // Reference to PetCoordinator
        this.scheduledTimeout = null;
        this.isRunning = false;

        // Event configuration (matching macOS)
        this.MAX_EVENT_DELAY_HOURS = 5; // 0-5 hours between events
        this.MAX_EVENT_DELAY_MS = this.MAX_EVENT_DELAY_HOURS * 60 * 60 * 1000;

        // Available events (will be populated as we implement them)
        this.events = [];
      }

      /**
       * Start the scheduler
       */
      start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(LOG.PREFIXES.BACKGROUND, 'RandomEventScheduler started');
        this.schedule();
      }

      /**
       * Stop the scheduler
       */
      stop() {
        this.isRunning = false;
        if (this.scheduledTimeout) {
          clearTimeout(this.scheduledTimeout);
          this.scheduledTimeout = null;
        }
        console.log(LOG.PREFIXES.BACKGROUND, 'RandomEventScheduler stopped');
      }

      /**
       * Schedule the next random event
       */
      schedule() {
        if (!this.isRunning) return;

        // Random delay between 0 and MAX_EVENT_DELAY_MS
        const delay = Math.random() * this.MAX_EVENT_DELAY_MS;
        const delayMinutes = Math.round(delay / 60000);

        console.log(LOG.PREFIXES.BACKGROUND,
          `Next random event in ${delayMinutes} minutes (${Math.round(delay/1000)}s)`);

        this.scheduledTimeout = setTimeout(() => {
          this.trigger();
          this.schedule(); // Reschedule for next event
        }, delay);
      }

      /**
       * Trigger a random event
       */
      async trigger() {
        // Check if random events are enabled
        if (!this.coordinator.settings.randomEvents) {
          console.log(LOG.PREFIXES.BACKGROUND, 'Random events disabled, skipping');
          return;
        }

        // Check if there are any pets
        if (this.coordinator.globalPets.length === 0) {
          console.log(LOG.PREFIXES.BACKGROUND, 'No pets active, skipping random event');
          return;
        }

        // No events implemented yet
        if (this.events.length === 0) {
          console.log(LOG.PREFIXES.BACKGROUND, 'No events available yet (UFO/Cloud coming soon)');
          return;
        }

        // Pick a random event
        const event = this.events[Math.floor(Math.random() * this.events.length)];
        console.log(LOG.PREFIXES.BACKGROUND, 'Triggering random event:', event.name);

        try {
          await event.trigger(this.coordinator);
        } catch (error) {
          console.error(LOG.PREFIXES.BACKGROUND, 'Failed to trigger event:', error);
        }
      }

      /**
       * Register an event handler
       * @param {string} name - Event name
       * @param {function} triggerFn - Function that triggers the event
       */
      registerEvent(name, triggerFn) {
        this.events.push({ name, trigger: triggerFn });
        console.log(LOG.PREFIXES.BACKGROUND, 'Registered event:', name);
      }
    }

    globalScope.RandomEventScheduler = RandomEventScheduler;
  }
})();
