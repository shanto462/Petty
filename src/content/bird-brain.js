// Bird Brain - Decides what a flying bird does next: cruise, perch on a tree, hop on the
// ground, or (for fishing birds) hover over a pond, dive and carry the fish to a perch.
// Physics (shared/physics.js) does the flying; this only picks targets and animations.

(function () {
  if (window.BirdBrain) return;

  const { BIRDS, CAPABILITIES, DISPLAY } = window.PettyConfig;
  const logger = window.PettyLogger;

  const between = (min, max) => min + Math.random() * (max - min);
  const near = (a, b, distance = 1) => Math.abs(a.x - b.x) <= distance && Math.abs(a.y - b.y) <= distance;

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
      this.isFisher = pet.hasCapability(CAPABILITIES.FISHES);
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
      const taken = new Set(
        this.others()
          .filter((other) => other !== this.pet && other.brain?.perch)
          .map((other) => `${other.brain.perch.tree.id}:${other.brain.perch.index}`),
      );
      const free = this.others()
        .filter((tree) => tree.hasCapability?.(CAPABILITIES.PERCHING_PLACE) && tree.currentSize && !tree.isDragging)
        .flatMap((tree) => (tree.speciesData.perches || []).map((_, index) => ({ tree, index })))
        .filter(({ tree, index }) => !taken.has(`${tree.id}:${index}`));
      return free.length > 0 ? free[Math.floor(Math.random() * free.length)] : null;
    }

    findPond() {
      const ponds = this.others().filter(
        (pond) => pond.hasCapability?.(CAPABILITIES.FISHING_SPOT) && pond.currentSize && !pond.isDragging,
      );
      return ponds.length > 0 ? ponds[Math.floor(Math.random() * ponds.length)] : null;
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
      this.until = this.now + duration;
      logger.log('[BirdBrain]', this.pet.speciesId, '->', state);
    }

    flyAnimation() {
      return this.hasFish && this.pet.animator.hasAnimation('fly_fish') ? 'fly_fish' : 'fly';
    }

    /** Fly to `target`; `arrive` runs when the bird gets there. */
    flyTo(state, target, arrive, boost = 1) {
      const pet = this.pet;
      pet.isPerched = false;
      pet.isAirborne = true;
      pet.flightTarget = this.reachable(target);
      pet.flightBoost = boost;
      this.arrive = arrive;
      this.setState(state);
    }

    takeOff() {
      const pet = this.pet;
      this.perch = null;
      this.pond = null;
      pet.isPerched = false;
      pet.isAirborne = true;
      pet.isMoving = false;
      pet.flightTarget = null;
      pet.flightBoost = 1;
      const { height } = this.viewport();
      pet.cruiseY = height * between(BIRDS.ALTITUDE_MIN, BIRDS.ALTITUDE_MAX);
      pet.setAnimation(this.flyAnimation());
      this.setState('cruise', between(BIRDS.CRUISE_MIN, BIRDS.CRUISE_MAX));
    }

    /** Called when a cruise ends: choose where to go next. */
    decide() {
      const perch = this.findFreePerch();
      const pond = this.isFisher ? this.findPond() : null;
      const choice = pickWeighted([
        { kind: 'fish', weight: pond ? 6 : 0 },
        { kind: 'perch', weight: perch ? 5 : 0 },
        { kind: 'ground', weight: 1.5 },
        { kind: 'cruise', weight: 1 },
      ]);

      if (choice.kind === 'fish') this.goFishing(pond);
      else if (choice.kind === 'perch') this.goToPerch(perch);
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
      const ahead = pet.position.x + pet.direction * between(80, 260);
      const x = Math.max(0, Math.min(width - this.size().width, ahead));
      pet.setAnimation(this.flyAnimation());
      this.flyTo('toGround', { x, y: this.groundY() }, () => this.touchDown());
    }

    touchDown() {
      const pet = this.pet;
      pet.isAirborne = false;
      pet.isPerched = false;
      pet.flightTarget = null;
      this.setState('grounded', between(BIRDS.GROUND_MIN, BIRDS.GROUND_MAX));
      // Songbirds start pecking; a fishing bird eats its catch or just sits
      pet.setAnimation(this.hasFish || !this.isFisher ? 'eat' : 'front');
    }

    goFishing(pond) {
      this.pond = pond;
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
      this.flyTo('dive', target, () => this.splash(), BIRDS.DIVE_BOOST);
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

    // --- Hooks called by Pet ---

    /** Starts flying from wherever the bird is. */
    start() {
      this.takeOff();
    }

    /**
     * Picks up after another tab moved this bird: perched if it sits on a free perch,
     * on the ground if it is at the bottom, otherwise flying.
     */
    resync(animation = this.pet.currentAnimation) {
      const pet = this.pet;
      if (pet.isDragging) return;
      const sitting = ['front', 'sing', 'eat'].includes(animation);
      if (sitting) {
        this.perch = null;
        const perch = this.others()
          .filter((tree) => tree.hasCapability?.(CAPABILITIES.PERCHING_PLACE))
          .flatMap((tree) => (tree.speciesData.perches || []).map((_, index) => ({ tree, index })))
          .find(({ tree, index }) => {
            const spot = this.perchPosition(tree, index);
            return spot && near(spot, pet.position, 4);
          });
        if (perch) {
          this.perch = perch;
          pet.position = this.perchPosition(perch.tree, perch.index);
          this.hasFish = false;
          this.land();
          return;
        }
      }
      if (pet.position.y >= this.groundY() - 2 && (sitting || animation === pet.movementPath)) {
        this.hasFish = false;
        this.touchDown();
        return;
      }
      this.hasFish = animation === 'fly_fish';
      this.takeOff();
    }

    onDragStart() {
      const pet = this.pet;
      this.perch = null;
      this.pond = null;
      pet.isAirborne = false;
      pet.isPerched = false;
      pet.flightTarget = null;
      this.setState('dragged');
    }

    /** Dropped birds fly off instead of falling. */
    onDrop() {
      this.hasFish = false;
      this.takeOff();
    }

    /** Returns true when the brain handled the end of an animation. */
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
          if (animation === 'eat') {
            this.hasFish = false;
            // Songbirds hop a little between pecks; others sit still
            pet.setAnimation(this.isFisher ? 'front' : pet.movementPath);
            this.nextPeck = this.now + between(1200, 3500);
          }
          break;
      }
      return true;
    }

    update() {
      const pet = this.pet;
      if (pet.isDragging || this.state === 'dragged') return;
      const now = this.now;

      switch (this.state) {
        case 'cruise':
          if (now >= this.until) this.decide();
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
            pet.flightTarget = this.reachable(spot); // Follow the tree if it moved
            if (near(pet.position, pet.flightTarget)) this.arrive();
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
          if (pet.flightTarget && near(pet.position, pet.flightTarget)) this.arrive();
          break;

        case 'toPond':
          if (!this.isAlive(this.pond)) this.takeOff();
          else if (pet.flightTarget && near(pet.position, pet.flightTarget)) this.arrive();
          break;

        case 'grounded':
          if (now >= this.until && !this.hasFish) this.takeOff();
          else if (!this.isFisher && pet.currentAnimation === pet.movementPath && now >= (this.nextPeck ?? 0)) {
            pet.setAnimation('eat');
          }
          break;
      }
    }
  }

  window.BirdBrain = BirdBrain;
})();
