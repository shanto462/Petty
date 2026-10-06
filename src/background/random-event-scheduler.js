// Random Event Scheduler - Triggers random events like UFO abductions
// Based on macOS RandomEventsScheduler.swift
//
// Uses chrome.alarms, because service worker timers are cancelled whenever Chrome
// stops the worker (https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers).

(function () {
  const globalScope = typeof window !== 'undefined' ? window : self;

  if (!globalScope.RandomEventScheduler) {
    const { LOG, MESSAGE_TYPES } = globalScope.PettyConfig || {};
    const logger = globalScope.PettyLogger || { log: () => {}, warn: () => {}, error: () => {} };

    const ALARM_NAME = 'petty-random-event';
    const MIN_DELAY_MINUTES = 0.5; // chrome.alarms minimum (Chrome 120+)
    const MAX_DELAY_MINUTES = 5 * 60; // 0-5 hours between events (matching macOS)

    /**
     * Schedules random events (UFO abductions, clouds, etc.) at random intervals
     * Respects the randomEvents setting and only triggers when pets are active
     */
    class RandomEventScheduler {
      static ALARM_NAME = ALARM_NAME;

      constructor(coordinator) {
        this.coordinator = coordinator; // Reference to PetCoordinator

        // Available events
        this.events = [
          { name: 'UFO Abduction', type: MESSAGE_TYPES.TRIGGER_UFO_ABDUCTION },
          { name: 'Fantozzi Cloud', type: MESSAGE_TYPES.TRIGGER_CLOUD_EVENT },
        ];
      }

      /**
       * Makes sure an event is scheduled. The alarm survives service worker restarts,
       * so an existing one is kept rather than pushed further into the future.
       */
      async start() {
        const existing = await chrome.alarms.get(ALARM_NAME);
        if (!existing) {
          await this.schedule();
        }
      }

      /**
       * Schedule the next random event
       */
      async schedule() {
        const delayInMinutes = MIN_DELAY_MINUTES + Math.random() * (MAX_DELAY_MINUTES - MIN_DELAY_MINUTES);
        await chrome.alarms.create(ALARM_NAME, { delayInMinutes });
        logger.log(LOG.PREFIXES.BACKGROUND, `Next random event in ${Math.round(delayInMinutes)} minutes`);
      }

      /**
       * Called by the alarm listener: runs one event, then schedules the next
       */
      async onAlarm() {
        try {
          await this.trigger();
        } finally {
          await this.schedule();
        }
      }

      /**
       * Trigger a random event in the tab the user is looking at
       */
      async trigger() {
        if (!this.coordinator.settings.randomEvents) {
          logger.log(LOG.PREFIXES.BACKGROUND, 'Random events disabled, skipping');
          return;
        }

        if (this.coordinator.globalPets.length === 0) {
          logger.log(LOG.PREFIXES.BACKGROUND, 'No pets active, skipping random event');
          return;
        }

        const randomEvent = this.events[Math.floor(Math.random() * this.events.length)];
        logger.log(LOG.PREFIXES.BACKGROUND, 'Triggering random event:', randomEvent.name);

        // Only one tab runs the event; its changes (e.g. an abducted pet) reach the others
        await this.coordinator.sendToActiveTab({ type: randomEvent.type });
      }
    }

    globalScope.RandomEventScheduler = RandomEventScheduler;
  }
})();
