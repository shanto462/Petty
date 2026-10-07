// Trees for Petty (birds perch on them) and the heron's storm cloud. Ponds are in ponds.mjs.

import { Canvas, inEllipse, segmentDistance, seeded, shade } from './pixel.mjs';

export const TREE_WIDTH = 100;
export const TREE_HEIGHT = 150;

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

export const STORM_WIDTH = 100;
export const STORM_HEIGHT = 70;
export const STORM_FRAMES = 16;
const LIGHTNING_FRAMES = new Set([5, 6, 13]);

/**
 * A small dark storm cloud with rain falling from it. Lightning shows in a few frames only,
 * as a bolt under the cloud (the cloud itself never flashes).
 * @param {number} frame - 0 to STORM_FRAMES - 1
 */
export function drawStormCloud(frame) {
  const random = seeded(41);
  const puffs = [
    [50, 22, 16],
    [32, 26, 12],
    [68, 25, 13],
    [20, 30, 8],
    [82, 30, 9],
    [42, 15, 11],
    [60, 14, 10],
  ];
  const cloud = new Canvas(STORM_WIDTH, STORM_HEIGHT).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (py > 36) return null; // Flat bottom
    let lit = null;
    for (const [cx, cy, r] of puffs) {
      if (!inEllipse(px, py, cx, cy, r, r * 0.9)) continue;
      lit = Math.max(lit ?? -Infinity, (cy - r * 0.5 - py) / r + (cx - px) * 0.01);
    }
    if (lit === null) return null;
    const level = lit + (random() - 0.5) * 0.2;
    if (py > 33) return '#3e444f';
    if (level > 0.25) return '#8a93a1';
    if (level > -0.2) return '#6b7482';
    return '#545c69';
  });
  cloud.outline('#2b3038', 0);

  const out = new Canvas(STORM_WIDTH, STORM_HEIGHT);
  // Rain: slanted streaks that fall a little further each frame
  for (let i = 0; i < 22; i++) {
    const x0 = 16 + ((i * 29) % 70);
    const y0 = 38 + ((i * 17 + frame * 5) % 32);
    for (let k = 0; k < 4; k++) out.set(Math.round(x0 - (y0 + k - 38) * 0.25), y0 + k, k === 0 ? '#c4d6e8' : '#7f9fbe');
  }
  if (LIGHTNING_FRAMES.has(frame)) {
    const bolt = [
      [56, 36],
      [50, 46],
      [56, 47],
      [47, 60],
      [50, 52],
      [44, 52],
    ];
    const zigzag = new Canvas(STORM_WIDTH, STORM_HEIGHT).fill((x, y) => {
      const p = [x + 0.5, y + 0.5];
      for (let i = 0; i < bolt.length - 1; i++) if (segmentDistance(...p, bolt[i], bolt[i + 1]) < 0.8) return '#fffbe0';
      return null;
    });
    out.draw(zigzag.outline('#f2c94c', 0));
  }
  out.draw(cloud);
  return out;
}
