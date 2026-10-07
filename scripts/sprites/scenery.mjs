// Trees and a pond for Petty. Trees are perches for birds; the pond is where they fish.

import { Canvas, inEllipse, segmentDistance, seeded, shade } from './pixel.mjs';

export const TREE_WIDTH = 100;
export const TREE_HEIGHT = 150;
export const POND_WIDTH = 150;
export const POND_HEIGHT = 40;

export const TREES = {
  oak: {
    seed: 7,
    leaves: ['#2f6b2a', '#3f8a34', '#5aa83f', '#86c95a'], // Dark to light
    bark: '#6b4a2e',
    outline: '#1f3a1a',
    blossoms: null,
  },
  cherry: {
    seed: 11,
    leaves: ['#c05a86', '#e07ba6', '#f2a1c2', '#fbd0e1'],
    bark: '#5a3d32',
    outline: '#6e2b47',
    blossoms: '#ffffff',
  },
};

// Branches that stick out of the canopy, as [start, end] in tree pixels. Birds perch on the ends.
const BRANCHES = [
  [
    [44, 104],
    [14, 92],
  ],
  [
    [55, 96],
    [88, 84],
  ],
];

// Leaf clusters as [x, y, radius]; together they form the canopy
const CANOPY = [
  [50, 46, 26],
  [30, 58, 19],
  [70, 56, 20],
  [38, 32, 17],
  [62, 30, 18],
  [50, 20, 14],
  [22, 72, 12],
  [78, 70, 13],
  [50, 70, 18],
];

/**
 * Spots where a bird can stand, as fractions of the tree sprite (x, y of the bird's feet).
 * Two branch tips plus three spots on top of the canopy.
 */
export function treePerches() {
  const tips = BRANCHES.map(([, [x, y]]) => [x + (x < 50 ? 4 : -4), y - 1]);
  const tops = [34, 50, 66].map((x) => [x, canopyTop(x)]);
  return [...tips, ...tops].map(([x, y]) => ({
    x: +(x / TREE_WIDTH).toFixed(3),
    y: +(y / TREE_HEIGHT).toFixed(3),
  }));
}

function canopyTop(x) {
  let top = TREE_HEIGHT;
  for (const [cx, cy, r] of CANOPY) {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) < r) top = Math.min(top, Math.ceil(cy - Math.sqrt(r * r - dx * dx)));
  }
  return top - 1; // The outline row
}

/**
 * @param {object} tree - One of TREES
 * @param {number} sway - Canopy lean in pixels at the top (-1, 0 or 1 for the idle loop)
 */
export function drawTree(tree, sway = 0) {
  const random = seeded(tree.seed);
  const [dark, mid, light, highlight] = tree.leaves;

  // Trunk with root flare and bark lines
  const trunk = new Canvas(TREE_WIDTH, TREE_HEIGHT).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    const flare = Math.max(0, py - 128) * 0.45;
    const half = 5 + flare + (py < 80 ? (80 - py) * 0.03 : 0);
    if (py > 60 && py < 149 && Math.abs(px - 50) < half) {
      if (px - 50 > half - 2.2) return shade(tree.bark, -0.3);
      if (px - 50 < -half + 1.6) return shade(tree.bark, 0.15);
      return (x * 7 + Math.floor(y / 3) * 3) % 11 === 0 ? shade(tree.bark, -0.25) : tree.bark;
    }
    for (const [a, b] of BRANCHES) {
      const d = segmentDistance(px, py, a, b);
      const t = Math.hypot(px - a[0], py - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 2.6 - t * 1.2) return d > 1.4 - t * 0.6 && py > (a[1] + b[1]) / 2 ? shade(tree.bark, -0.3) : tree.bark;
    }
    return null;
  });

  // Canopy: overlapping clusters, lit from the top left
  const canopy = new Canvas(TREE_WIDTH, TREE_HEIGHT).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let best = null;
    for (const [cx, cy, r] of CANOPY) {
      if (!inEllipse(px, py, cx, cy, r, r)) continue;
      // Light comes from the upper left of each cluster
      const lit = ((cx - r * 0.35 - px) * 0.7 + (cy - r * 0.45 - py)) / r;
      best = Math.max(best ?? -Infinity, lit);
    }
    if (best === null) return null;
    const noise = (random() - 0.5) * 0.35;
    const level = best + noise;
    if (level > 0.45) return highlight;
    if (level > 0.05) return light;
    if (level > -0.5) return mid;
    return dark;
  });
  canopy.outline(tree.outline, 0);

  // Small leaf clumps break up the round edge
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(random() * TREE_WIDTH);
    const y = Math.floor(random() * 95);
    if (canopy.isSet(x, y) && !canopy.isSet(x, y - 2)) canopy.set(x, y - 1, tree.outline);
  }

  if (tree.blossoms) {
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(random() * TREE_WIDTH);
      const y = Math.floor(random() * 95);
      const pixel = canopy.get(x, y);
      if (pixel && pixel[3] && canopy.isSet(x + 1, y) && canopy.isSet(x, y + 1)) canopy.set(x, y, tree.blossoms);
    }
  } else {
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(random() * TREE_WIDTH);
      const y = Math.floor(random() * 90);
      if (canopy.isSet(x, y) && canopy.isSet(x + 1, y + 1)) canopy.set(x, y, dark);
    }
  }

  // Sway leans the canopy: rows near the top move the most
  const swayed = sway === 0 ? canopy : canopy.shear((y) => (y < 45 ? sway : 0));

  const out = new Canvas(TREE_WIDTH, TREE_HEIGHT);
  // Grass tufts at the base
  out.fill((x, y) => {
    const px = x + 0.5;
    if (y < 146 || Math.abs(px - 50) > 18) return null;
    const blade = (x * 13) % 5;
    if (y < 149 - blade) return null;
    return blade > 2 ? '#5aa83f' : '#3f8a34';
  });
  out.draw(trunk.outline(shade(tree.bark, -0.55), 0));
  out.draw(swayed);
  return out;
}

/** Fractions of the pond sprite: the water's center and half-size, for the fishing birds. */
export const POND_WATER = { x: 0.5, y: 0.78, rx: 0.36, ry: 0.15 };

const GRASS = '#5fb04a';
const GRASS_DARK = '#4c9a3a';
const GRASS_LIGHT = '#6cc04f';

/**
 * A small pond set into the ground, seen from a low angle like the rest of the scene:
 * a flat oval of water, the far bank showing behind it, a thin strip of grass in front,
 * and a flat bottom edge that sits on the bottom of the window.
 * @param {number} frame - 0 to 7, moves the shimmer and the fish shadow
 */
export function drawPond(frame) {
  const random = seeded(23);
  const cx = POND_WIDTH * POND_WATER.x;
  const cy = POND_HEIGHT * POND_WATER.y;
  const rx = POND_WIDTH * POND_WATER.rx;
  const ry = POND_HEIGHT * POND_WATER.ry;
  const pond = new Canvas(POND_WIDTH, POND_HEIGHT);
  const water = (px, py, inset = 0) => inEllipse(px, py, cx, cy, rx - inset, ry - inset * 0.25);

  // Ground: a wide, low mound of grass whose bottom is cut flat by the ground line
  pond.fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (!inEllipse(px, py, cx, POND_HEIGHT - 2, rx + 18, ry + 11)) return null;
    if (y >= POND_HEIGHT - 2) return GRASS_DARK; // A little shadow where it meets the ground
    return (x * 3 + y * 7) % 11 === 0 ? GRASS_DARK : GRASS;
  });

  // Far bank: the earth slope behind the water, which a low view still sees
  pond.fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (py > cy || water(px, py) || !inEllipse(px, py, cx, cy - 1.6, rx + 1.5, ry + 1.2)) return null;
    return py < cy - ry ? '#a07c50' : '#8b6a43';
  });

  // Water: lighter far away where it mirrors the sky, deeper close by
  pond.fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (!water(px, py)) return null;
    const depth = (py - (cy - ry)) / (ry * 2); // 0 at the far edge, 1 at the near edge
    if (depth < 0.22) return '#8fd3f2';
    if (depth < 0.5) return '#5fb6d6';
    if (depth < 0.8) return '#3f93c2';
    return '#2f78aa';
  });

  // Near edge: grass hangs over the water a little
  for (let x = 0; x < POND_WIDTH; x++) {
    for (let y = Math.floor(cy); y < POND_HEIGHT; y++) {
      if (water(x + 0.5, y + 0.5) && !water(x + 0.5, y + 1.5)) {
        pond.set(x, y, (x * 5) % 7 < 3 ? GRASS_LIGHT : GRASS);
        break;
      }
    }
  }

  // Fish shadow swimming in a slow loop, flattened by the low view
  const angle = (frame / 8) * Math.PI * 2;
  const fx = cx + Math.cos(angle) * rx * 0.45;
  const fy = cy + Math.sin(angle) * ry * 0.3 + 0.5;
  const facing = -Math.sin(angle) >= 0 ? 1 : -1;
  for (let y = 0; y < POND_HEIGHT; y++) {
    for (let x = 0; x < POND_WIDTH; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const tailX = fx - facing * 4;
      const body = inEllipse(px, py, fx, fy, 3.2, 0.9);
      const tail = Math.abs(px - tailX) < 1.3 && Math.abs(py - fy) < 1.2 - Math.abs(px - tailX) * 0.5;
      if ((body || tail) && water(px, py, 3)) pond.set(x, y, '#2a6694');
    }
  }

  // Shimmer: short light lines drifting across the water
  const shimmers = [
    [-0.55, -0.1],
    [0.1, -0.35],
    [0.45, 0.25],
    [-0.2, 0.45],
    [0.62, -0.15],
  ];
  shimmers.forEach(([sx, sy], i) => {
    const phase = (frame + i * 3) % 8;
    if (phase > 4) return;
    const x0 = Math.round(cx + sx * rx + phase * 1.5);
    const y0 = Math.round(cy + sy * ry);
    const len = [2, 4, 6, 4, 2][phase];
    for (let k = 0; k < len; k++) {
      if (water(x0 + k + 0.5, y0 + 0.5, 2)) pond.set(x0 + k, y0, phase === 2 ? '#ffffff' : '#c6ecfa');
    }
  });

  // Lily pads lie flat on the water (one with a pink flower)
  const pads = [
    [cx - rx * 0.55, cy + ry * 0.2, 4.5],
    [cx + rx * 0.3, cy + ry * 0.45, 3.5],
    [cx + rx * 0.66, cy - ry * 0.25, 3],
  ];
  pads.forEach(([px0, py0, r], i) => {
    const bob = (frame + i * 2) % 8 < 4 ? 0 : 1;
    for (let y = 0; y < POND_HEIGHT; y++) {
      for (let x = 0; x < POND_WIDTH; x++) {
        const px = x + 0.5 - bob * (i % 2 ? -0.5 : 0.5);
        const py = y + 0.5;
        if (!inEllipse(px, py, px0, py0, r, r * 0.32)) continue;
        if (px > px0 + 0.5 && Math.abs(py - py0) < 0.6) continue; // The notch
        pond.set(x, y, py < py0 ? '#7ccf5c' : '#4f9e3a');
      }
    }
    if (i === 0) {
      const fxp = Math.round(px0 - 1);
      const fyp = Math.round(py0 - 1);
      pond.set(fxp - 1, fyp, '#f6a6c8');
      pond.set(fxp, fyp, '#ffd84a');
      pond.set(fxp + 1, fyp, '#f6a6c8');
      pond.set(fxp, fyp - 1, '#fbd0e1');
    }
  });

  // Stones on the near bank, half in the grass
  const stones = [
    [cx - rx * 0.92, cy + ry + 1.2, 3.4],
    [cx - rx * 0.7, cy + ry + 2.4, 2.3],
    [cx + rx * 0.82, cy + ry + 1.4, 3],
  ];
  for (const [sx, sy, r] of stones) {
    for (let y = 0; y < POND_HEIGHT; y++) {
      for (let x = 0; x < POND_WIDTH; x++) {
        const py = y + 0.5;
        if (inEllipse(x + 0.5, py, sx, sy, r, r * 0.6)) pond.set(x, y, py < sy - r * 0.15 ? '#c4bfb4' : '#8e887d');
      }
    }
  }

  // Grass tufts poking up along the top edge of the mound
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(random() * POND_WIDTH);
    for (let y = 0; y < POND_HEIGHT - 1; y++) {
      if (pond.isSet(x, y) && !pond.isSet(x, y - 1)) {
        pond.set(x, y - 1, GRASS_DARK);
        if (random() > 0.5) pond.set(x, y - 2, GRASS_LIGHT);
        break;
      }
    }
  }

  // Reeds and cattails standing on the far bank and the sides, swaying a little
  const reeds = [
    [cx - rx - 3, 16, true],
    [cx - rx + 1, 12, false],
    [cx - rx - 7, 10, false],
    [cx - rx + 5, 8, false],
    [cx + rx - 4, 14, true],
    [cx + rx + 1, 11, false],
    [cx + rx + 5, 8, false],
    [cx + rx * 0.2, 6, false],
  ];
  reeds.forEach(([x0, h, cattail], i) => {
    const lean = (frame + i) % 8 < 4 ? 0 : i % 2 ? 1 : -1;
    const base = Math.round(cy - ry + 1);
    for (let k = 0; k < h; k++) {
      const x = Math.round(x0 + (k > h * 0.6 ? lean : 0));
      pond.set(x, base - k, k > h - 3 && !cattail ? '#8fd16a' : '#3f8a34');
    }
    if (cattail) {
      const x = Math.round(x0 + lean);
      for (let k = 0; k < 4; k++) {
        pond.set(x, base - h + 1 + k, '#7a4a28');
        pond.set(x + 1, base - h + 1 + k, '#5e3820');
      }
      pond.set(x, base - h, '#3f8a34');
    }
  });

  return pond.outline('#2d5a26', 0);
}
