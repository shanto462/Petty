// Popup Controller - Pet management UI

(function () {
  // Only initialize if not already initialized
  if (window.__POPUP_CONTROLLER_INITIALIZED__) return;
  window.__POPUP_CONTROLLER_INITIALIZED__ = true;

  const { LOG, MESSAGE_TYPES, SPECIES, TAG_EMOJI } = window.PettyConfig;
  const logger = window.PettyLogger;

  const CONFIRM_TIMEOUT = 3000; // ms the "Clear all" button waits for a second click
  const TOAST_DURATION = 4000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const displayName = (speciesId) => speciesId.replace(/_/g, ' ');
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const primaryTag = (species) => species.tags?.[0] || 'other';

  /**
   * Lets a sideways-scrolling row respond to a normal (vertical) mouse wheel.
   */
  function makeScrollRow(row) {
    row.addEventListener(
      'wheel',
      (e) => {
        // Trackpads already scroll sideways; only translate vertical wheel movement
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        if (row.scrollWidth <= row.clientWidth) return;
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      },
      { passive: false },
    );
  }

  const visibleCenters = new Map(); // Sprite URL -> Promise of its visible-pixel offset

  /**
   * Sprites are drawn near the bottom of their frame with empty space above. This finds
   * how far the visible pixels sit from the frame center, as a fraction of the frame,
   * so thumbnails can be centered without rescaling the pixel art.
   */
  function measureVisibleCenter(url) {
    if (!visibleCenters.has(url)) {
      const measure = async () => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const { naturalWidth: width, naturalHeight: height } = img;
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        const { data } = context.getImageData(0, 0, width, height);

        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        if (maxX < 0) return null; // Fully transparent frame

        return {
          x: 0.5 - (minX + maxX + 1) / 2 / width,
          y: 0.5 - (minY + maxY + 1) / 2 / height,
        };
      };
      visibleCenters.set(
        url,
        measure().catch(() => null),
      );
    }
    return visibleCenters.get(url);
  }

  function checkIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm5 12.5 4.5 4.5L19 7.5');
    svg.appendChild(path);
    return svg;
  }

  class PopupController {
    constructor() {
      this.speciesManager = null;
      this.globalPets = [];
      this.activeTag = null; // null = all categories
      this.query = '';
      this.confirmTimer = null;
      this.toastTimer = null;
      this.init();
    }

    async init() {
      logger.log(LOG.PREFIXES.POPUP, 'Initializing...');
      this.setupThemeSwitch();

      try {
        this.speciesManager = SpeciesManager.getInstance();
        await this.speciesManager.loadAllSpecies();
        await this.loadGlobalPets();
        document.querySelectorAll('.scroll-row').forEach(makeScrollRow);
        this.renderSpeciesGrid();
        this.setupRemoveAll();
        this.setupSearch();
        this.setupTagFilters();
        this.updateSpeciesCount();
        this.updateUI();
        this.applyFilter(); // Respects anything typed into search while loading
        document.body.dataset.ready = 'true';

        logger.log(LOG.PREFIXES.POPUP, 'Ready! Active pets:', this.globalPets.length);
      } catch (error) {
        logger.error(LOG.PREFIXES.POPUP, 'Initialization error:', error);
        this.showError('Petty could not load. Close and reopen the popup.');
      }
    }

    async loadGlobalPets() {
      const response = await ChromeMessaging.sendMessage({ type: MESSAGE_TYPES.GET_GLOBAL_PETS });
      if (response?.pets) {
        this.globalPets = response.pets;
      }
    }

    /**
     * Renders every species once, grouped by its main category.
     */
    renderSpeciesGrid() {
      const container = document.getElementById('species-grid');
      const groups = {};
      Object.values(this.speciesManager.getAllSpecies()).forEach((species) => {
        (groups[primaryTag(species)] ??= []).push(species);
      });

      const sections = Object.keys(groups)
        .sort()
        .map((tag) => {
          const category = document.createElement('section');
          category.className = 'category';
          category.dataset.tag = tag;

          const title = document.createElement('h3');
          title.textContent = capitalize(tag);
          const count = document.createElement('span');
          count.className = 'category-count';
          count.textContent = groups[tag].length;
          title.appendChild(count);
          category.appendChild(title);

          const grid = document.createElement('div');
          grid.className = 'pet-grid';
          groups[tag]
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach((species) => grid.appendChild(this.createSpeciesItem(species)));
          category.appendChild(grid);

          return category;
        });

      const empty = document.createElement('p');
      empty.className = 'empty-results';
      empty.id = 'empty-results';
      empty.hidden = true;
      empty.textContent = 'No pets match your search.';

      container.replaceChildren(...sections, empty);
    }

    createThumbnail(speciesId) {
      const url = this.speciesManager.getThumbnailUrl(speciesId);
      if (!url) {
        const fallback = document.createElement('span');
        fallback.className = 'pet-fallback';
        fallback.textContent = speciesId[0].toUpperCase();
        fallback.setAttribute('aria-hidden', 'true');
        return fallback;
      }

      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.decoding = 'async';
      img.className = 'sprite';
      measureVisibleCenter(url).then((offset) => {
        if (!offset) return;
        img.style.setProperty('--center-x', offset.x.toFixed(4));
        img.style.setProperty('--center-y', offset.y.toFixed(4));
      });
      return img;
    }

    createSpeciesItem(species) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pet-item';
      item.dataset.species = species.id;
      item.title = `${capitalize(displayName(species.id))}: click to add or remove`;
      item.setAttribute('aria-pressed', 'false');

      const thumb = document.createElement('span');
      thumb.className = 'pet-thumb';
      const image = this.createThumbnail(species.id);
      thumb.appendChild(image);
      item.appendChild(thumb);

      const name = document.createElement('span');
      name.className = 'pet-name';
      name.textContent = displayName(species.id);
      item.appendChild(name);

      const check = document.createElement('span');
      check.className = 'pet-check';
      check.appendChild(checkIcon());
      item.appendChild(check);

      item.addEventListener('click', () => this.togglePet(species.id));
      if (image instanceof HTMLImageElement) {
        this.animateOnHover(item, image, species);
      }

      return item;
    }

    /**
     * Plays the pet's walk cycle while the pointer is over its tile.
     */
    animateOnHover(item, img, species) {
      const animation = species.movementPath;
      const frames = this.speciesManager.getFrameCount(species.id, animation);
      if (frames < 2) return;

      const still = img.src;
      const frameDelay = 1000 / Math.min(12, Math.max(1, species.fps || 10));
      let timer = null;
      let frame = 0;

      item.addEventListener('pointerenter', () => {
        if (reduceMotion.matches || timer) return;
        timer = setInterval(() => {
          frame = (frame + 1) % frames;
          img.src = this.speciesManager.getSpriteUrl(species.id, animation, frame);
        }, frameDelay);
      });
      item.addEventListener('pointerleave', () => {
        clearInterval(timer);
        timer = null;
        frame = 0;
        img.src = still;
      });
    }

    isActive(speciesId) {
      return this.globalPets.some((p) => p.species === speciesId);
    }

    async togglePet(speciesId) {
      if (this.isActive(speciesId)) {
        await this.removePet(speciesId);
      } else {
        await this.addPet(speciesId);
      }
    }

    async addPet(speciesId) {
      try {
        const response = await ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.ADD_PET,
          species: speciesId,
        });
        if (!response?.success) {
          this.showError(response?.error || 'Could not add that pet. Please try again.');
          return;
        }
        await this.loadGlobalPets();
        this.updateUI();
      } catch (error) {
        logger.error(LOG.PREFIXES.POPUP, 'Failed to add pet:', error);
        this.showError('Could not add that pet. Please try again.');
      }
    }

    async removePet(speciesId) {
      const pet = this.globalPets.find((p) => p.species === speciesId);
      if (!pet) return;

      try {
        const response = await ChromeMessaging.sendMessage({
          type: MESSAGE_TYPES.REMOVE_PET,
          petId: pet.id,
        });
        if (response?.success) {
          await this.loadGlobalPets();
          this.updateUI();
        }
      } catch (error) {
        logger.error(LOG.PREFIXES.POPUP, 'Failed to remove pet:', error);
        this.showError('Could not remove that pet. Please try again.');
      }
    }

    updateUI() {
      document.querySelectorAll('.pet-item').forEach((item) => {
        const active = this.isActive(item.dataset.species);
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });

      const count = this.globalPets.length;
      document.getElementById('total-count').textContent = count;
      document.getElementById('count-pill').classList.toggle('live', count > 0);
      document.getElementById('remove-all').hidden = count === 0;
      if (count === 0) this.resetRemoveAll();

      this.updateActivePetsList();
    }

    updateActivePetsList() {
      const listEl = document.getElementById('active-pets-list');

      if (this.globalPets.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'no-active-pets';
        empty.textContent = 'No pets yet. Pick one below and it will appear on your tabs.';
        listEl.replaceChildren(empty);
        return;
      }

      const speciesIds = [...new Set(this.globalPets.map((pet) => pet.species))].sort();
      const existing = new Map([...listEl.querySelectorAll('.active-pet-badge')].map((b) => [b.dataset.species, b]));

      listEl.replaceChildren(
        ...speciesIds.map((speciesId) => {
          // Reuse badges that are already shown so only new ones animate in
          const current = existing.get(speciesId);
          if (current) {
            current.classList.remove('is-new');
            return current;
          }

          const badge = document.createElement('div');
          badge.className = 'active-pet-badge is-new';
          badge.dataset.species = speciesId;
          badge.appendChild(this.createThumbnail(speciesId));

          const name = document.createElement('span');
          name.textContent = displayName(speciesId);
          badge.appendChild(name);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'remove-btn';
          removeBtn.title = 'Remove';
          removeBtn.setAttribute('aria-label', `Remove ${displayName(speciesId)}`);
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removePet(speciesId);
          });
          badge.appendChild(removeBtn);

          return badge;
        }),
      );
    }

    /**
     * Light / Auto / Dark switch; theme.js applies and saves the choice.
     */
    setupThemeSwitch() {
      const buttons = document.querySelectorAll('#theme-switch [data-theme-choice]');
      const sync = () => {
        const choice = window.PettyTheme.get();
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
      };
      buttons.forEach((button) =>
        button.addEventListener('click', () => {
          window.PettyTheme.set(button.dataset.themeChoice);
          sync();
        }),
      );
      sync();
    }

    /**
     * "Clear all" asks for a second click instead of a browser dialog.
     */
    setupRemoveAll() {
      const button = document.getElementById('remove-all');
      button.addEventListener('click', async () => {
        if (!button.classList.contains('confirming')) {
          button.classList.add('confirming');
          button.textContent = 'Click again to clear';
          this.confirmTimer = setTimeout(() => this.resetRemoveAll(), CONFIRM_TIMEOUT);
          return;
        }

        this.resetRemoveAll();
        try {
          const response = await ChromeMessaging.sendMessage({ type: MESSAGE_TYPES.REMOVE_ALL_PETS });
          if (response?.success) {
            await this.loadGlobalPets();
            this.updateUI();
          }
        } catch (error) {
          logger.error(LOG.PREFIXES.POPUP, 'Failed to remove all pets:', error);
          this.showError('Could not clear your pets. Please try again.');
        }
      });
    }

    resetRemoveAll() {
      clearTimeout(this.confirmTimer);
      const button = document.getElementById('remove-all');
      button.classList.remove('confirming');
      button.textContent = 'Clear all';
    }

    setupSearch() {
      const input = document.getElementById('search');
      input.placeholder = `Search ${Object.keys(this.speciesManager.getAllSpecies()).length} pets`;
      this.query = input.value.toLowerCase().trim();
      input.addEventListener('input', () => {
        this.query = input.value.toLowerCase().trim();
        this.applyFilter();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) {
          e.preventDefault(); // Keep the popup open; clear the search instead
          input.value = '';
          this.query = '';
          this.applyFilter();
        }
      });
    }

    setupTagFilters() {
      const container = document.getElementById('tag-filters');

      const counts = {};
      Object.values(this.speciesManager.getAllSpecies()).forEach((species) => {
        (species.tags?.length ? species.tags : ['other']).forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
      });

      ['all', ...Object.keys(counts).sort()].forEach((tag) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-filter-btn';
        btn.dataset.tag = tag;
        btn.classList.toggle('active', tag === 'all');
        btn.setAttribute('aria-pressed', String(tag === 'all'));

        const label = tag === 'all' ? 'All' : `${TAG_EMOJI[tag] || '📦'} ${capitalize(tag)}`;
        btn.append(label);
        if (tag !== 'all') {
          const count = document.createElement('span');
          count.className = 'chip-count';
          count.textContent = counts[tag];
          btn.append(' ', count);
        }

        btn.addEventListener('click', () => {
          container.querySelectorAll('.tag-filter-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
          });
          this.activeTag = tag === 'all' ? null : tag;
          this.applyFilter();
          btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });

        container.appendChild(btn);
      });
    }

    /**
     * Shows pets that match both the selected category and the search text.
     */
    applyFilter() {
      let visibleCount = 0;

      document.querySelectorAll('.category').forEach((category) => {
        let categoryHasVisible = false;

        category.querySelectorAll('.pet-item').forEach((item) => {
          const speciesId = item.dataset.species;
          const species = this.speciesManager.getSpecies(speciesId);
          const matchesTag = !this.activeTag || Boolean(species?.tags?.includes(this.activeTag));
          const matchesQuery = !this.query || displayName(speciesId).includes(this.query);
          const visible = matchesTag && matchesQuery;

          item.hidden = !visible;
          if (visible) {
            categoryHasVisible = true;
            visibleCount++;
          }
        });

        category.hidden = !categoryHasVisible;
      });

      document.getElementById('shown-count').textContent = visibleCount;
      document.getElementById('empty-results').hidden = visibleCount > 0;
    }

    updateSpeciesCount() {
      const totalSpecies = Object.keys(this.speciesManager.getAllSpecies()).length;

      document.getElementById('species-count').textContent = totalSpecies;
      document.getElementById('shown-count').textContent = totalSpecies;

      // Visual warning if not all species loaded
      if (totalSpecies < SPECIES.EXPECTED_COUNT) {
        const bar = document.getElementById('species-count-bar');
        bar.classList.add('species-count-warning');
        bar.append(' (some failed to load)');
      }
    }

    /**
     * Shows a short message at the bottom of the popup
     */
    showError(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, TOAST_DURATION);
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PopupController(), { once: true });
  } else {
    new PopupController();
  }
})();
