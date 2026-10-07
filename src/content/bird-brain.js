// Bird Brain - Decides what a flying bird does next. Every bird cruises and lands on the
// ground; the rest depends on its capabilities:
//   PerchesOnTrees  flies to a free perch on a tree and sits there (songbirds sing)
//   FishesInPonds   hovers over a pond, dives, and carries the fish to a perch (kingfisher)
//   WadesInPonds    stands in a pond, strikes at fish and swallows them (heron)
//   FliesInStorms   now and then flies under its own storm cloud (heron)
// On the ground a bird walks between the actions listed in its species' `groundActions`.
// Physics (shared/physics.js) does the flying; this only picks targets and animations.

(function () {
  if (window.BirdBrain) return;

  const { BIRDS, CAPABILITIES, DISPLAY, SPECIES } = window.PettyConfig;
  const logger = window.PettyLogger;

  const between = (min, max) => min + Math.random() * (max - min);
  const near = (a, b, distance = 1) => Math.abs(a.x - b.x) <= distance && Math.abs(a.y - b.y) <= distance;
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

  // Animations that only make sense in the air
  const FLIGHT_ANIMATIONS = new Set(['fly', 'fly_fish', 'storm', 'hover', 'dive', 'splash', 'drag']);

  // States that end on their own (an arrival or an animation). One that runs much longer is stuck.
  const PASSING_STATES = new Set(['toPerch', 'toGround', 'toPond', 'toWade', 'dive', 'hover', 'splash']);

  /** Picks one option, with chances proportional to each `weight`. */
  function pickWeighted(options) {
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    let roll = Math.random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll < 0) return option;
    }
    return options[options.length - 1];
  }

  class BirdBrain {
    constructor(pet) {
      this.pet = pet;
      this.state = 'cruise';
      this.until = 0; // When the current state ends (performance.now() time)
      this.perch = null; // { tree, index } while flying to or sitting on a perch
      this.pond = null;
      this.hasFish = false;
      this.nextSong = 0;
      this.nextAction = 0; // Next ground action, or next strike while wading
      this.stormCloud = null;
      this.path = []; // Waypoints still to fly through before flightTarget is the destination
      this.destination = null;
      this.perches = pet.hasCapability(CAPABILITIES.PERCHES);
      this.isFisher = pet.hasCapability(CAPABILITIES.FISHES);
      this.isWader = pet.hasCapability(CAPABILITIES.WADES);
      this.fliesInStorms = pet.hasCapability(CAPABILITIES.STORMS);
      this.groundActions = pet.speciesData.groundActions || ['eat'];
      this.groundTime = pet.speciesData.groundTime || [BIRDS.GROUND_MIN, BIRDS.GROUND_MAX];
    }

    get now() {
      return performance.now();
    }

    size() {
      return this.pet.currentSize || { width: DISPLAY.DEFAULT_PET_SIZE, height: DISPLAY.DEFAULT_PET_SIZE };
    }

    viewport() {
      return { width: window.innerWidth, height: window.innerHeight };
    }

    groundY() {
      return this.viewport().height - this.size().height;
    }

    /** The closest point the physics lets the bird fly to (it never leaves the window). */
    reachable({ x, y }) {
      const maxX = this.viewport().width - this.size().width;
      return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(this.groundY(), y)) };
    }

    others() {
      return this.pet.petManager?.pets ?? [];
    }

    // --- Places ---

    /** Screen position the bird must have so its feet stand on a tree's perch. */
    perchPosition(tree, index) {
      const spot = tree.speciesData.perches?.[index];
      if (!spot || !tree.currentSize) return null;
      const { width, height } = this.size();
      return {
        x: tree.position.x + spot.x * tree.currentSize.width - width * BIRDS.FEET.x,
        y: tree.position.y + spot.y * tree.currentSize.height - height * BIRDS.FEET.y,
      };
    }

    /** A random perch that no other bird is using or flying to. */
    findFreePerch() {
      if (!this.perches) return null;
      const taken = new Set(
        this.others()
          .filter((other) => other !== this.pet && other.brain?.perch)
          .map((other) => `${other.brain.perch.tree.id}:${other.brain.perch.index}`),
      );
      const free = this.others()
        .filter((tree) => tree.hasCapability?.(CAPABILITIES.PERCHING_PLACE) && tree.currentSize && !tree.isDragging)
        .flatMap((tree) => (tree.speciesData.perches || []).map((_, index) => ({ tree, index })))
        .filter(({ tree, index }) => !taken.has(`${tree.id}:${index}`));
      return free.length > 0 ? pickOne(free) : null;
    }

    ponds() {
      return this.others().filter(
        (pond) => pond.hasCapability?.(CAPABILITIES.FISHING_SPOT) && pond.currentSize && !pond.isDragging,
      );
    }

    /** How many other birds are fishing at, or flying to, this pond. */
    birdsAt(pond) {
      return this.others().filter((other) => other !== this.pet && other.brain?.pond === pond).length;
    }

    /**
     * How much a bird wants a pond: less when other birds are there already, and less for the
     * pond it fished last, so birds spread out and move between ponds.
     */
    pondWeight(pond) {
      return (pond === this.lastPond ? 0.35 : 1) / (1 + this.birdsAt(pond));
    }

    findPond() {
      const ponds = this.ponds();
      return ponds.length > 0
        ? pickWeighted(ponds.map((pond) => ({ pond, weight: this.pondWeight(pond) }))).pond
        : null;
    }

    /** A pond with room to wade, and the spot in it. Every pond is tried, not just one. */
    findWadingPlace() {
      const places = this.ponds()
        .map((pond) => ({ pond, x: this.findWadeSpot(pond) }))
        .filter((place) => place.x !== null);
      if (places.length === 0) return null;
      return pickWeighted(places.map((place) => ({ ...place, weight: this.pondWeight(place.pond) })));
    }

    /** A spot on the water surface of a pond, slightly random so dives do not all look the same. */
    waterPoint(pond) {
      const water = pond.speciesData.water || { x: 0.5, y: 0.5, rx: 0.3, ry: 0.2 };
      const { width, height } = pond.currentSize;
      const jitter = (Math.random() - 0.5) * water.rx * width;
      return { x: pond.position.x + water.x * width + jitter, y: pond.position.y + water.y * height };
    }

    isAlive(entity) {
      return Boolean(entity?.element) && this.others().includes(entity);
    }

    // --- State changes ---

    setState(state, duration = 0) {
      this.state = state;
      this.since = this.now;
      this.until = this.since + duration;
      logger.log('[BirdBrain]', this.pet.speciesId, '->', state);
    }

    flyAnimation() {
      return this.hasFish && this.pet.animator.hasAnimation('fly_fish') ? 'fly_fish' : 'fly';
    }

    /**
     * Fly to `target`; `arrive` runs when the bird gets there. Unless `direct` is set (a dive),
     * the bird glides in no steeper than BIRDS.MAX_DESCENT, so it never drops straight down.
     */
    flyTo(state, target, arrive, { boost = 1, direct = false } = {}) {
      const pet = this.pet;
      pet.isPerched = false;
      pet.isAirborne = true;
      this.destination = this.reachable(target);
      this.path = direct ? [this.destination] : this.approach(this.destination);
      pet.flightTarget = this.path.shift();
      pet.flightBoost = boost;
      this.arrive = arrive;
      this.setState(state);
    }

    /**
     * The legs of a flight to `target`. A target that is too far below (or above) for a gentle
     * slope gets a waypoint first: the bird flies level to a point far enough out to the side,
     * then turns and glides in, the way a plane lines up to land.
     */
    approach(target) {
      const { x, y } = this.pet.position;
      const dy = target.y - y;
      const run = Math.abs(dy) / (dy > 0 ? BIRDS.MAX_DESCENT : BIRDS.MAX_CLIMB);
      if (Math.abs(target.x - x) >= run - 1) return [target];

      // Line up on the side the bird is already on, unless the window is too narrow there
      const maxX = this.viewport().width - this.size().width;
      const side = Math.sign(x - target.x) || -this.pet.direction || 1;
      const room = (s) => (s > 0 ? maxX - target.x : target.x);
      const best = room(side) >= run || room(side) >= room(-side) ? side : -side;
      const entry = { x: Math.max(0, Math.min(maxX, target.x + best * run)), y };
      return [entry, target];
    }

    /** True once the bird reached the end of its flight; moves on to the next leg before that. */
    reachedDestination() {
      const pet = this.pet;
      if (!pet.flightTarget || !near(pet.position, pet.flightTarget)) return false;
      if (this.path.length === 0) return true;
      pet.flightTarget = this.path.shift();
      return false;
    }

    /**
     * Tilts the bird with its flight: nose down when it descends, up when it climbs.
     * Level again when it sits, walks or hovers.
     */
    tilt() {
      const pet = this.pet;
      const levelFlight = pet.isAirborne && ['fly', 'fly_fish', 'storm'].includes(pet.currentAnimation);
      const speed = Math.hypot(pet.velocity.x, pet.velocity.y);
      let target = 0;
      if (levelFlight && speed > 0.05) {
        const angle = (Math.atan2(pet.velocity.y, Math.abs(pet.velocity.x)) * 180) / Math.PI;
        target = pet.direction * Math.max(-BIRDS.MAX_TILT, Math.min(BIRDS.MAX_TILT, angle));
      }
      pet.rotation += (target - pet.rotation) * 0.12;
      if (Math.abs(pet.rotation) < 0.2 && target === 0) pet.rotation = 0;
    }

    takeOff() {
      const pet = this.pet;
      this.endStorm();
      this.perch = null;
      this.pond = null;
      pet.isPerched = false;
      pet.isAirborne = true;
      pet.isMoving = false;
      pet.flightTarget = null;
      pet.flightBoost = 1;
      this.path = [];
      this.destination = null;
      pet.cruiseY = this.viewport().height * between(BIRDS.ALTITUDE_MIN, BIRDS.ALTITUDE_MAX);
      pet.setAnimation(this.flyAnimation());
      this.setState('cruise', between(BIRDS.CRUISE_MIN, BIRDS.CRUISE_MAX));
    }

    /** Called when a cruise ends: choose where to go next. */
    decide() {
      const perch = this.findFreePerch();
      const pond = this.isFisher ? this.findPond() : null;
      const wading = this.isWader ? this.findWadingPlace() : null;
      const choice = pickWeighted([
        { kind: 'fish', weight: pond ? 6 : 0 },
        { kind: 'wade', weight: wading ? 5 : 0 },
        { kind: 'perch', weight: perch ? 5 : 0 },
        { kind: 'storm', weight: this.fliesInStorms ? 0.8 : 0 },
        { kind: 'ground', weight: this.perches ? 1.5 : 3 },
        { kind: 'cruise', weight: 1 },
      ]);

      if (choice.kind === 'fish') this.goFishing(pond);
      else if (choice.kind === 'wade') this.goWading(wading.pond, wading.x);
      else if (choice.kind === 'perch') this.goToPerch(perch);
      else if (choice.kind === 'storm') this.startStorm();
      else if (choice.kind === 'ground') this.goToGround();
      else this.takeOff();
    }

    goToPerch(perch) {
      const target = this.perchPosition(perch.tree, perch.index);
      if (!target) return this.takeOff();
      this.perch = perch;
      this.pet.setAnimation(this.flyAnimation());
      this.flyTo('toPerch', target, () => this.land());
    }

    land() {
      const pet = this.pet;
      pet.isAirborne = false;
      pet.isPerched = true;
      pet.flightTarget = null;
      this.nextSong = this.now + between(BIRDS.SING_MIN, BIRDS.SING_MAX);
      this.setState('perched', between(BIRDS.PERCH_MIN, BIRDS.PERCH_MAX));
      pet.setAnimation(this.hasFish ? 'eat' : 'front');
    }

    goToGround() {
      const pet = this.pet;
      const { width } = this.viewport();
      // Far enough ahead to glide straight down to it, with a little extra
      const drop = Math.max(0, this.groundY() - pet.position.y);
      const ahead = pet.position.x + pet.direction * (drop / BIRDS.MAX_DESCENT + between(20, 120));
      const x = Math.max(0, Math.min(width - this.size().width, ahead));
      pet.setAnimation(this.flyAnimation());
      this.flyTo('toGround', { x, y: this.groundY() }, () => this.touchDown());
    }

    touchDown() {
      const pet = this.pet;
      pet.isAirborne = false;
      pet.isPerched = false;
      pet.flightTarget = null;
      this.setState('grounded', between(...this.groundTime));
      // Eat a catch first; a kingfisher then just sits, other birds start a ground action
      if (this.hasFish) pet.setAnimation('eat');
      else if (this.isFisher) pet.setAnimation('front');
      else this.groundAction();
    }

    /** One of the species' ground actions: pecking for songbirds, kung fu for the heron. */
    groundAction() {
      const actions = this.groundActions.filter((id) => this.pet.animator.hasAnimation(id));
      if (actions.length > 0) this.pet.setAnimation(pickOne(actions));
    }

    goFishing(pond) {
      this.pond = pond;
      this.lastPond = pond;
      const water = this.waterPoint(pond);
      this.water = water;
      const { width, height } = this.size();
      const hover = { x: water.x - width / 2, y: Math.max(0, water.y - height - BIRDS.HOVER_HEIGHT) };
      this.pet.setAnimation('fly');
      this.flyTo('toPond', hover, () => {
        this.pet.flightTarget = { ...this.pet.position }; // Hold still in the air
        this.setState('hover');
        this.pet.setAnimation('hover');
      });
    }

    dive() {
      const { width, height } = this.size();
      // Dive until the sprite's water line meets the pond's surface
      const target = { x: this.water.x - width / 2, y: this.water.y - height * BIRDS.WATERLINE };
      this.pet.setAnimation('dive');
      this.flyTo('dive', target, () => this.splash(), { boost: BIRDS.DIVE_BOOST, direct: true });
    }

    splash() {
      this.pet.flightTarget = { ...this.pet.position };
      this.pet.flightBoost = 1;
      this.setState('splash');
      this.pet.setAnimation('splash');
    }

    afterSplash() {
      this.pond = null;
      if (Math.random() >= BIRDS.CATCH_CHANCE) {
        this.takeOff(); // Missed; try again later
        return;
      }
      this.hasFish = true;
      const perch = this.findFreePerch();
      if (perch) this.goToPerch(perch);
      else this.goToGround();
    }

    /**
     * Where in a pond's water this bird can stand: a spot with room left and right,
     * so two wading birds never stand on top of each other. Null when the pond is full.
     */
    findWadeSpot(pond) {
      const taken = this.others()
        .filter((other) => other !== this.pet && other.brain?.pond === pond && other.brain.wadeX !== undefined)
        .filter((other) => ['toWade', 'wading'].includes(other.brain.state))
        .map((other) => other.brain.wadeX);
      const water = pond.speciesData.water || { x: 0.5, rx: 0.3 };
      const center = pond.position.x + water.x * pond.currentSize.width;
      const reach = water.rx * pond.currentSize.width * 0.85;
      const gap = this.size().width * 0.55;
      for (let i = 0; i < 8; i++) {
        const x = center + (Math.random() * 2 - 1) * reach;
        if (taken.every((other) => Math.abs(other - x) >= gap)) return x;
      }
      return null;
    }

    /** Wading birds land in the water, feet on the bottom of the window. */
    goWading(pond, x = this.findWadeSpot(pond)) {
      if (x === null) return this.takeOff();
      this.pond = pond;
      this.wadeX = x;
      const target = { x: x - this.size().width * BIRDS.FEET.x, y: this.groundY() };
      this.pet.setAnimation('fly');
      this.flyTo('toWade', target, () => this.startWading());
    }

    startWading() {
      const pet = this.pet;
      this.lastPond = this.pond;
      pet.isAirborne = false;
      pet.isPerched = true; // Stands still in the water
      pet.flightTarget = null;
      this.wadeOffset = { x: pet.position.x - this.pond.position.x, y: pet.position.y - this.pond.position.y };
      // Face the middle of the pond: the strike lands well in front of the feet, and from the
      // edge of the water, facing outward, it would land in the grass
      const water = this.pond.speciesData.water || { x: 0.5 };
      const middle = this.pond.position.x + water.x * this.pond.currentSize.width;
      pet.direction = pet.position.x + this.size().width * BIRDS.FEET.x > middle ? -1 : 1;
      this.nextAction = this.now + between(BIRDS.STRIKE_MIN, BIRDS.STRIKE_MAX);
      this.setState('wading', between(BIRDS.WADE_MIN, BIRDS.WADE_MAX));
      pet.setAnimation('wade');
    }

    /** Flies for a while under a storm cloud, pushed around by the wind. */
    startStorm() {
      this.takeOff();
      this.setState('storm', between(BIRDS.STORM_MIN, BIRDS.STORM_MAX));
      this.pet.flightBoost = BIRDS.STORM_SPEED;
      this.nextAction = 0;
      this.pet.setAnimation('storm');
      this.stormCloud = this.createStormCloud();
    }

    endStorm() {
      this.stormCloud?.remove();
      this.stormCloud = null;
    }

    /** Where the storm cloud hangs: just above the bird, so the rain falls on it. */
    cloudPosition() {
      const { WIDTH, HEIGHT } = BIRDS.STORM_CLOUD;
      const { width } = this.size();
      return { x: this.pet.position.x + width / 2 - WIDTH / 2, y: this.pet.position.y - HEIGHT * 0.55 };
    }

    createStormCloud() {
      const manager = this.pet.petManager;
      if (!window.EphemeralEntity || !manager?.addEphemeralEntity) return null;
      const { SPRITE, FRAMES, FPS, WIDTH, HEIGHT } = BIRDS.STORM_CLOUD;
      const frameUrl = (i) => chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}${SPRITE}-${i}.png`);
      // Warm the cache so the first loop of the cloud does not flicker
      for (let i = 0; i < FRAMES; i++) new Image().src = frameUrl(i);

      const cloud = new EphemeralEntity('storm', {
        position: this.cloudPosition(),
        size: WIDTH,
        zIndex: 20, // Above the birds
        imagePath: `${SPECIES.ASSETS_PATH}${SPRITE}-0.png`,
        autoRemove: false,
      });
      if (cloud.img) cloud.img.style.height = `${HEIGHT}px`;
      let shown = 0;
      cloud.onUpdate = (entity, timestamp) => {
        if (!this.isAlive(this.pet) || this.stormCloud !== entity) {
          entity.remove();
          return;
        }
        // Trail the bird a little, like a cloud pushed by the wind
        const target = this.cloudPosition();
        entity.position.x += (target.x - entity.position.x) * 0.12;
        entity.position.y += (target.y - entity.position.y) * 0.12;
        const frame = Math.floor(timestamp / (1000 / FPS)) % FRAMES;
        if (frame !== shown && entity.img) {
          shown = frame;
          entity.img.src = frameUrl(frame);
        }
      };
      manager.addEphemeralEntity(cloud);
      return cloud;
    }

    // --- Hooks called by Pet ---

    /** Starts flying from wherever the bird is. */
    start() {
      this.takeOff();
    }

    /**
     * Picks up after another tab moved this bird: perched if it sits on a perch,
     * on the ground if it is at the bottom, otherwise flying.
     */
    resync(animation = this.pet.currentAnimation) {
      const pet = this.pet;
      if (pet.isDragging) return;
      if (this.perches && ['front', 'sing', 'eat'].includes(animation)) {
        this.perch = null;
        const perch = this.others()
          .filter((tree) => tree.hasCapability?.(CAPABILITIES.PERCHING_PLACE))
          .flatMap((tree) => (tree.speciesData.perches || []).map((_, index) => ({ tree, index })))
          .find(({ tree, index }) => {
            const spot = this.perchPosition(tree, index);
            return spot && near(spot, pet.position, 4);
          });
        if (perch) {
          this.endStorm();
          this.perch = perch;
          pet.position = this.perchPosition(perch.tree, perch.index);
          this.hasFish = false;
          this.land();
          return;
        }
      }
      if (pet.position.y >= this.groundY() - 2 && !FLIGHT_ANIMATIONS.has(animation)) {
        this.endStorm();
        this.hasFish = false;
        this.touchDown();
        return;
      }
      this.hasFish = animation === 'fly_fish';
      this.takeOff();
    }

    onDragStart() {
      const pet = this.pet;
      this.endStorm();
      this.perch = null;
      this.pond = null;
      pet.isAirborne = false;
      pet.isPerched = false;
      pet.flightTarget = null;
      pet.rotation = 0;
      this.path = [];
      this.setState('dragged');
    }

    /** Dropped birds fly off instead of falling. */
    onDrop() {
      this.hasFish = false;
      this.takeOff();
    }

    destroy() {
      this.endStorm();
    }

    onAnimationComplete(animation) {
      const pet = this.pet;
      switch (this.state) {
        case 'hover':
          if (animation === 'hover') this.dive();
          break;
        case 'splash':
          if (animation === 'splash') this.afterSplash();
          break;
        case 'perched':
          if (animation === 'eat' || animation === 'sing') {
            this.hasFish = false;
            pet.setAnimation('front');
          }
          break;
        case 'grounded':
          if (animation === 'eat' || this.groundActions.includes(animation)) {
            this.hasFish = false;
            if (this.isFisher) {
              pet.setAnimation('front');
            } else {
              pet.setAnimation(pet.movementPath); // Walk or hop a little before the next action
              this.nextAction = this.now + between(BIRDS.WALK_MIN, BIRDS.WALK_MAX);
            }
          }
          break;
        case 'wading':
          if (animation === 'strike') {
            if (Math.random() < BIRDS.WADE_CATCH_CHANCE) {
              pet.setAnimation('catch');
            } else {
              pet.setAnimation('wade');
              this.nextAction = this.now + between(BIRDS.STRIKE_MIN, BIRDS.STRIKE_MAX);
            }
          } else if (animation === 'catch') {
            pet.setAnimation('gulp');
          } else if (animation === 'gulp') {
            pet.setAnimation('wade');
            this.nextAction = this.now + between(BIRDS.STRIKE_MIN, BIRDS.STRIKE_MAX);
          }
          break;
      }
    }

    update() {
      const pet = this.pet;
      if (pet.isDragging || this.state === 'dragged') return;
      const now = this.now;
      this.tilt();

      // The window may have shrunk since the target was picked: keep every target reachable,
      // or the physics stops the bird short of it and it hangs in the air for good
      if (pet.flightTarget) pet.flightTarget = this.reachable(pet.flightTarget);
      this.path = this.path.map((point) => this.reachable(point));

      // Safety net for anything else that keeps a bird from arriving
      if (PASSING_STATES.has(this.state) && now - this.since > BIRDS.MAX_PASSING_TIME) {
        logger.warn('[BirdBrain]', pet.speciesId, 'was stuck in', this.state, '- taking off again');
        this.takeOff();
        return;
      }

      switch (this.state) {
        case 'cruise':
          if (now >= this.until) this.decide();
          break;

        case 'storm':
          if (now >= this.until) {
            this.takeOff(); // The storm blows over
          } else if (now >= this.nextAction) {
            // Gusts push the bird up and down
            this.nextAction = now + between(700, 1400);
            const { height } = this.viewport();
            const gust = (Math.random() - 0.5) * 90;
            pet.cruiseY = Math.max(height * 0.05, Math.min(height * 0.5, (pet.cruiseY ?? pet.position.y) + gust));
          }
          break;

        case 'toPerch':
        case 'perched': {
          const { tree, index } = this.perch || {};
          if (!this.isAlive(tree) || tree.isDragging) {
            this.takeOff(); // The tree was removed or picked up
            break;
          }
          const spot = this.perchPosition(tree, index);
          if (!spot) break;
          if (this.state === 'toPerch') {
            this.destination = this.reachable(spot); // Follow the tree if it moved
            if (this.path.length === 0) pet.flightTarget = this.destination;
            if (this.reachedDestination()) this.arrive();
            break;
          }
          pet.position = this.reachable(spot);
          if (now >= this.until && !this.hasFish) {
            this.takeOff();
          } else if (!this.isFisher && pet.currentAnimation === 'front' && now >= this.nextSong) {
            this.nextSong = now + between(BIRDS.SING_MIN, BIRDS.SING_MAX);
            if (pet.animator.hasAnimation('sing')) pet.setAnimation('sing');
          }
          break;
        }

        case 'toGround':
        case 'dive':
          if (this.reachedDestination()) this.arrive();
          break;

        case 'toPond':
        case 'toWade':
          if (!this.isAlive(this.pond) || this.pond.isDragging) this.takeOff();
          else if (this.reachedDestination()) this.arrive();
          break;

        case 'wading': {
          if (!this.isAlive(this.pond) || this.pond.isDragging) {
            this.takeOff();
            break;
          }
          // Stay in the same spot of the pond, even if the window is resized
          pet.position = this.reachable({
            x: this.pond.position.x + this.wadeOffset.x,
            y: this.pond.position.y + this.wadeOffset.y,
          });
          if (pet.currentAnimation !== 'wade') break; // Let a strike or a meal finish
          if (now >= this.until) this.takeOff();
          else if (now >= this.nextAction) pet.setAnimation('strike');
          break;
        }

        case 'grounded': {
          // Leave only between actions, never in the middle of one
          const idle = pet.currentAnimation === pet.movementPath || this.isFisher;
          if (now >= this.until && !this.hasFish && idle) this.takeOff();
          else if (!this.isFisher && pet.currentAnimation === pet.movementPath && now >= this.nextAction) {
            this.groundAction();
          }
          break;
        }
      }
    }
  }

  window.BirdBrain = BirdBrain;
})();
