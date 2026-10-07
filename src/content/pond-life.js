// Pond Life - Life in a pond that is not a pet. Now and then fish leap out of the water in an
// arc, sometimes a few in a row; at the oasis a mermaid comes up onto her rock to brush her
// hair when no pet is near, and dives back in when one comes close.
// Runs from Pet.update in the visible tab; the art is Petty's own (effect_*.png).

(function () {
  if (window.PondLife) return;

  const { POND_LIFE, SPECIES, DISPLAY } = window.PettyConfig;
  const SCALE = DISPLAY.DEFAULT_PET_SIZE / 50; // Sprite pixels to screen pixels
  const between = (min, max) => min + Math.random() * (max - min);
  const frameUrl = (name, frame) => chrome.runtime.getURL(`${SPECIES.ASSETS_PATH}effect_${name}-${frame}.png`);

  /** Picks a fish size; small ones are the most common. */
  function pickSize() {
    const sizes = Object.entries(POND_LIFE.FISH);
    let roll = Math.random() * sizes.reduce((sum, [, size]) => sum + size.weight, 0);
    for (const [id, size] of sizes) {
      roll -= size.weight;
      if (roll < 0) return id;
    }
    return sizes[0][0];
  }

  /** The frame whose angle is closest to `angle` degrees. */
  function angleFrame(angle) {
    let best = 0;
    POND_LIFE.FISH_ANGLES.forEach((a, i) => {
      if (Math.abs(a - angle) < Math.abs(POND_LIFE.FISH_ANGLES[best] - angle)) best = i;
    });
    return best;
  }

  class PondLife {
    constructor(pond) {
      this.pond = pond;
      this.look = pond.speciesData.fishJumps || null;
      this.seat = pond.speciesData.mermaid || null;
      this.nextJump = 0;
      this.school = []; // Times at which the rest of a school leaps
      this.jumps = []; // Fish in the air
      this.splashes = [];
      this.mermaid = null; // { entity, state, since }
      this.quietSince = null;
      this.mermaidAfter = 0; // No mermaid before this time (after a dive)
    }

    get manager() {
      return this.pond.petManager;
    }

    /** The water surface in screen pixels: its middle, half-width and height on screen. */
    water() {
      const water = this.pond.speciesData.water || { x: 0.5, y: 0.5, rx: 0.3 };
      const { width, height } = this.pond.currentSize;
      return {
        x: this.pond.position.x + water.x * width,
        y: this.pond.position.y + water.y * height,
        halfWidth: water.rx * width,
      };
    }

    /** Loads every frame once, so the first leap or the first mermaid does not flicker. */
    preload() {
      this.preloaded = true;
      const names = [];
      if (this.look) {
        for (const size of Object.keys(POND_LIFE.FISH)) {
          POND_LIFE.FISH_ANGLES.forEach((_, i) => names.push([`fish_${this.look}_${size}`, i]));
        }
        for (let i = 0; i < POND_LIFE.SPLASH.frames; i++) names.push(['splash', i]);
      }
      if (this.seat) {
        for (const [state, count] of Object.entries(POND_LIFE.MERMAID.frames)) {
          for (let i = 0; i < count; i++) names.push([`mermaid_${state}`, i]);
        }
      }
      for (const [name, i] of names) new Image().src = frameUrl(name, i);
    }

    update(now) {
      if (!this.pond.currentSize || !this.pond.element || !this.manager?.addEphemeralEntity) return;
      if (!this.preloaded) this.preload();
      if (this.pond.isDragging) {
        this.hideMermaid();
        return;
      }
      if (this.look) this.updateFish(now);
      if (this.seat) this.updateMermaid(now);
      this.updateSplashes(now);
    }

    // --- Fish ---

    updateFish(now) {
      if (!this.nextJump) this.nextJump = now + between(POND_LIFE.JUMP_MIN, POND_LIFE.JUMP_MAX);
      if (now >= this.nextJump) {
        this.nextJump = now + between(POND_LIFE.JUMP_MIN, POND_LIFE.JUMP_MAX);
        this.leap(now);
        if (Math.random() < POND_LIFE.SCHOOL_CHANCE) {
          const more = 1 + Math.floor(Math.random() * 2);
          for (let i = 1; i <= more; i++) this.school.push(now + i * POND_LIFE.SCHOOL_GAP);
        }
      }
      while (this.school.length > 0 && now >= this.school[0]) {
        this.school.shift();
        this.leap(now);
      }
      this.jumps = this.jumps.filter((jump) => this.flyFish(jump, now));
    }

    /** One fish leaps: an arc that starts and lands inside the water. */
    leap(now, size = pickSize()) {
      const water = this.water();
      const fish = POND_LIFE.FISH[size];
      const start = water.x + (Math.random() * 2 - 1) * water.halfWidth * 0.6;
      let direction = Math.random() < 0.5 ? -1 : 1;
      let span = fish.span * between(0.8, 1.2);
      // Land in the water: turn around, or leap shorter, if the arc would end on the bank
      const room = (dir) => water.halfWidth * 0.85 - dir * (start - water.x);
      if (room(direction) < span) direction = -direction;
      span = Math.min(span, Math.max(10, room(direction)));

      const px = fish.sprite * SCALE;
      const entity = new EphemeralEntity('fish', {
        position: { x: start - px / 2, y: water.y - px / 2 },
        size: px,
        zIndex: -105, // In front of the pond, behind the trees and pets
        imagePath: `${SPECIES.ASSETS_PATH}effect_fish_${this.look}_${size}-${angleFrame(-60)}.png`,
        autoRemove: false,
      });
      if (direction < 0 && entity.img) entity.img.style.transform = 'scaleX(-1)';
      this.manager.addEphemeralEntity(entity);
      this.splash(start, water.y, now);
      this.jumps.push({
        entity,
        size,
        px,
        start: now,
        duration: 450 + span * 7,
        from: { x: start, y: water.y },
        span: span * direction,
        height: span * between(0.5, 0.75),
        frame: -1,
      });
    }

    /** Moves a leaping fish along its arc; returns false once it is back in the water. */
    flyFish(jump, now) {
      const t = (now - jump.start) / jump.duration;
      if (t >= 1 || !jump.entity.isAlive) {
        if (jump.entity.isAlive) this.splash(jump.from.x + jump.span, jump.from.y, now);
        jump.entity.remove();
        return false;
      }
      const x = jump.from.x + jump.span * t;
      const y = jump.from.y - 4 * jump.height * t * (1 - t);
      // Point the nose along the arc: up on the way out, down on the way back in
      const climb = -4 * jump.height * (1 - 2 * t);
      const frame = angleFrame((Math.atan2(climb, Math.abs(jump.span)) * 180) / Math.PI);
      if (frame !== jump.frame && jump.entity.img) {
        jump.frame = frame;
        jump.entity.img.src = frameUrl(`fish_${this.look}_${jump.size}`, frame);
      }
      jump.entity.position = { x: x - jump.px / 2, y: y - jump.px / 2 };
      return true;
    }

    splash(x, y, now) {
      const { sprite, waterline, frames } = POND_LIFE.SPLASH;
      const px = sprite * SCALE;
      const entity = new EphemeralEntity('splash', {
        position: { x: x - px / 2, y: y - waterline * SCALE },
        size: px,
        zIndex: -104,
        imagePath: `${SPECIES.ASSETS_PATH}effect_splash-0.png`,
        autoRemove: false,
      });
      this.manager.addEphemeralEntity(entity);
      this.splashes.push({ entity, start: now, frame: 0, frames });
    }

    updateSplashes(now) {
      const { duration } = POND_LIFE.SPLASH;
      this.splashes = this.splashes.filter((splash) => {
        const frame = Math.floor(((now - splash.start) / duration) * splash.frames);
        if (frame >= splash.frames || !splash.entity.isAlive) {
          splash.entity.remove();
          return false;
        }
        if (frame !== splash.frame && splash.entity.img) {
          splash.frame = frame;
          splash.entity.img.src = frameUrl('splash', frame);
        }
        return true;
      });
    }

    // --- The mermaid ---

    /** Where she sits, in screen pixels. */
    seatPoint() {
      const { width, height } = this.pond.currentSize;
      return { x: this.pond.position.x + this.seat.x * width, y: this.pond.position.y + this.seat.y * height };
    }

    /** True when a pet that moves (a bird, say) is close to her rock. */
    someoneNear() {
      const seat = this.seatPoint();
      return this.manager.pets.some((pet) => {
        if (pet === this.pond || !(pet.speciesData?.speed > 0)) return false;
        const size = pet.currentSize || { width: DISPLAY.DEFAULT_PET_SIZE, height: DISPLAY.DEFAULT_PET_SIZE };
        const dx = pet.position.x + size.width / 2 - seat.x;
        const dy = pet.position.y + size.height / 2 - seat.y;
        return Math.hypot(dx, dy) < POND_LIFE.MERMAID.shyDistance;
      });
    }

    updateMermaid(now) {
      const near = this.someoneNear();
      if (!this.mermaid) {
        if (near) this.quietSince = null;
        else if (this.quietSince === null) this.quietSince = now;
        else if (now - this.quietSince >= POND_LIFE.MERMAID.quiet && now >= this.mermaidAfter) this.showMermaid(now);
        return;
      }

      const { fps, frames } = POND_LIFE.MERMAID;
      const mermaid = this.mermaid;
      if (near && mermaid.state !== 'dive') this.setMermaid('dive', now);
      const frame = Math.floor(((now - mermaid.since) / 1000) * fps);
      if (frame >= frames[mermaid.state]) {
        if (mermaid.state === 'rise') this.setMermaid('brush', now);
        else if (mermaid.state === 'dive') {
          this.hideMermaid();
          this.mermaidAfter = now + POND_LIFE.MERMAID.cooldown;
          this.quietSince = null;
          return;
        }
      }
      this.drawMermaid(now);
    }

    showMermaid(now) {
      const { sprite } = POND_LIFE.MERMAID;
      const entity = new EphemeralEntity('mermaid', {
        position: this.mermaidPosition(),
        size: sprite * SCALE,
        zIndex: -104, // In front of the pond and its rock
        imagePath: `${SPECIES.ASSETS_PATH}effect_mermaid_rise-0.png`,
        autoRemove: false,
      });
      this.manager.addEphemeralEntity(entity);
      this.mermaid = { entity, state: 'rise', since: now, frame: -1 };
    }

    setMermaid(state, now) {
      this.mermaid.state = state;
      this.mermaid.since = now;
      this.mermaid.frame = -1;
    }

    mermaidPosition() {
      const seat = this.seatPoint();
      const [hx, hy] = POND_LIFE.MERMAID.hips;
      return { x: seat.x - hx * SCALE, y: seat.y - hy * SCALE };
    }

    drawMermaid(now) {
      const { fps, frames } = POND_LIFE.MERMAID;
      const mermaid = this.mermaid;
      const count = frames[mermaid.state];
      const elapsed = Math.floor(((now - mermaid.since) / 1000) * fps);
      const frame = mermaid.state === 'brush' ? elapsed % count : Math.min(count - 1, elapsed);
      if (frame !== mermaid.frame && mermaid.entity.img) {
        mermaid.frame = frame;
        mermaid.entity.img.src = frameUrl(`mermaid_${mermaid.state}`, frame);
      }
      mermaid.entity.position = this.mermaidPosition(); // Stay on the rock if the pond moves
    }

    hideMermaid() {
      this.mermaid?.entity.remove();
      this.mermaid = null;
    }

    destroy() {
      this.hideMermaid();
      for (const { entity } of [...this.jumps, ...this.splashes]) entity.remove();
      this.jumps = [];
      this.splashes = [];
    }
  }

  window.PondLife = PondLife;
})();
