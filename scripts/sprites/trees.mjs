// Trees for Petty. A tree is grown, not placed: a trunk splits into limbs, limbs into branches
// and branches into twigs (seeded, so every run draws the same tree). Leaf clumps grow at the
// branch ends, each lit from the top left, with gaps between them where the branches show.
// Birds perch on the tops of the clumps that are open to the sky.

import { Canvas, inEllipse, seeded, segmentDistance, shade } from './pixel.mjs';

export const TREE_WIDTH = 260;
export const TREE_HEIGHT = 195;
const GROUND = TREE_HEIGHT - 1;
// The shapes below were tuned for a 200 px wide tree; trunk, limbs and leaf clumps grow with it
const SCALE = TREE_WIDTH / 200;

export const TREES = {
  // An oak: a short, stout trunk that splits low into big limbs, and a wide, uneven dome
  tree_oak: {
    seed: 3,
    leaves: ['#173f1c', '#245a25', '#33772f', '#4b9638', '#74b94a', '#a3d468'], // Shadow to sunlit
    outline: '#10301a',
    bark: { base: '#6b5a48', light: '#8c7a64', dark: '#4a3d30', outline: '#2a2219', fissures: true },
    grow: {
      trunk: 36,
      width: 18,
      limbs: 4,
      fan: 44,
      depth: 4,
      spread: [20, 36],
      shrink: [0.7, 0.8],
      outward: 0,
      droop: 0,
    },
    clumps: { radius: [10, 14], extra: 0.6 },
    blossoms: null,
    branchesThrough: true, // The big limbs show between the leaf clumps
  },
  // A cherry in bloom: short dark trunk, limbs fanning out wide, an airy pale crown that droops
  tree_cherry: {
    seed: 21,
    leaves: ['#a8577c', '#c77a9b', '#e2a3bc', '#f2c4d5', '#fbe0ea', '#fff4f8'],
    outline: '#7c3a58',
    bark: { base: '#4a2f2c', light: '#6a4842', dark: '#2f1d1b', outline: '#1c100e', fissures: false },
    grow: {
      trunk: 30,
      width: 14,
      limbs: 5,
      fan: 56,
      depth: 4,
      spread: [22, 38],
      shrink: [0.72, 0.84],
      outward: 0.08,
      droop: 0.03,
    },
    clumps: { radius: [7, 10], extra: 0.5 },
    blossoms: ['#ffffff', '#fff4f8', '#ffe8f1'],
    branchesThrough: true, // The dark limbs run through the blossoms
  },
};

const MARGIN = 12; // Room above the crown for the sway and the birds' heads

/** The branching skeleton: tapered segments and the points where leaf clumps grow. */
function growSkeleton(tree) {
  const random = seeded(tree.seed);
  const g = tree.grow;
  const segments = [];
  const tips = [];
  const clamp = (point) => point;

  function branch(start, angle, length, width, depth) {
    // Each branch bends once in the middle, so limbs are not ruler-straight
    const bend = (random() - 0.5) * 18;
    const rad = (angle * Math.PI) / 180;
    const mid = clamp([start[0] + Math.cos(rad) * length * 0.5, start[1] + Math.sin(rad) * length * 0.5]);
    const rad2 = ((angle + bend) * Math.PI) / 180;
    const end = clamp([mid[0] + Math.cos(rad2) * length * 0.5, mid[1] + Math.sin(rad2) * length * 0.5]);
    segments.push({ a: start, b: mid, w0: width, w1: width * 0.88, depth });
    segments.push({ a: mid, b: end, w0: width * 0.88, w1: width * 0.76, depth });

    if (depth >= g.depth) {
      tips.push({ x: end[0], y: end[1], depth });
      return;
    }
    // Leaves grow along the inner branches too, so the crown is full rather than a hollow arch
    if (depth >= 1) tips.push({ x: end[0], y: end[1], depth, inner: true });
    if (depth >= 2) tips.push({ x: mid[0], y: mid[1], depth, inner: true });

    if (depth === 0) {
      // The trunk splits low into a fan of big limbs, from up-left to up-right
      for (let k = 0; k < g.limbs; k++) {
        const across = g.limbs === 1 ? 0 : (k / (g.limbs - 1)) * 2 - 1; // -1 left .. 1 right
        const child = -90 + across * g.fan + (random() - 0.5) * 12;
        const length = g.trunk * (1.15 + random() * 0.35) * (1 - Math.abs(across) * 0.15);
        branch(end, child, length, width * (0.62 - Math.abs(across) * 0.08), depth + 1);
      }
      return;
    }
    const count = random() < 0.3 ? 3 : 2;
    for (let k = 0; k < count; k++) {
      const side = count === 2 ? (k === 0 ? -1 : 1) : k - 1;
      const spread = g.spread[0] + random() * (g.spread[1] - g.spread[0]);
      let child = angle + bend + side * spread + (random() - 0.5) * 10;
      // Spread out sideways, and let the outer twigs droop under their own weight
      const outside = child > -90 ? -10 : -170;
      child += (outside - child) * g.outward;
      if (depth >= 2) child += (child > -90 ? 1 : -1) * g.droop * 40 * (depth - 1);
      const shrink = g.shrink[0] + random() * (g.shrink[1] - g.shrink[0]);
      branch(end, child, length * shrink, width * 0.68, depth + 1);
    }
  }

  const base = [TREE_WIDTH / 2, GROUND - 2];
  branch(base, -90, g.trunk, g.width * SCALE, 0);

  // Scale the grown tree to fill the sprite: the crown (with its leaves) fits inside the margins
  const reach = tree.clumps.radius[1] * SCALE;
  const top = Math.min(...tips.map((t) => t.y)) - reach;
  const halfWidth = Math.max(...tips.map((t) => Math.abs(t.x - base[0]))) + reach;
  const scale = Math.min((base[1] - MARGIN) / (base[1] - top), (TREE_WIDTH / 2 - 2) / halfWidth);
  const fit = ([x, y]) => [base[0] + (x - base[0]) * scale, base[1] + (y - base[1]) * scale];
  for (const s of segments) {
    s.a = fit(s.a);
    s.b = fit(s.b);
  }
  for (const t of tips) [t.x, t.y] = fit([t.x, t.y]);
  return { segments, tips };
}

/** Bark: each pixel takes the nearest branch; lit on its left, shaded on its right. */
function drawWood(tree, segments, { trunk = true } = {}) {
  const { bark } = tree;
  const random = seeded(tree.seed + 99);
  const knot = segments[0].b;
  const wood = new Canvas(TREE_WIDTH, TREE_HEIGHT).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let best = null;
    for (const s of segments) {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
      const t = Math.max(
        0,
        Math.min(1, ((px - s.a[0]) * (s.b[0] - s.a[0]) + (py - s.a[1]) * (s.b[1] - s.a[1])) / len ** 2),
      );
      const width = (s.w0 + (s.w1 - s.w0) * t) / 2;
      const d = segmentDistance(px, py, s.a, s.b);
      if (d <= width && (!best || d / width < best.edge)) {
        // Which side of the branch: negative = left (lit), positive = right (shade)
        const side = ((px - s.a[0]) * (s.b[1] - s.a[1]) - (py - s.a[1]) * (s.b[0] - s.a[0])) / len;
        best = { edge: d / width, side: Math.sign(side) * (d / width), s };
      }
    }
    // Root flare spreading at the base
    const rootHalf = Math.max(0, (py - (GROUND - 12 * SCALE)) * 1.1);
    const trunkX = segments[0].a[0];
    if (
      trunk &&
      !best &&
      py > GROUND - 12 * SCALE &&
      py <= GROUND &&
      Math.abs(px - trunkX) <= segments[0].w0 / 2 + rootHalf
    ) {
      return Math.abs(px - trunkX) > segments[0].w0 / 2 + rootHalf - 2 ? bark.dark : bark.base;
    }
    if (!best) return null;
    if (best.side > 0.45) return bark.dark;
    if (best.side < -0.55) return bark.light;
    if (best.s.depth <= 1) {
      if (bark.fissures && Math.floor(px * 0.7 + Math.sin(py * 0.25) * 2) % 4 === 0) return bark.dark; // Oak fissures
      if (!bark.fissures && py % 6 < 1) return bark.light; // Cherry bands
    }
    return bark.base;
  });
  // A knot hole on the trunk
  if (trunk) {
    wood.fill((x, y) =>
      inEllipse(x + 0.5, y + 0.5, knot[0] - 1, knot[1] + 14, 2, 3) && wood.isSet(x, y) ? '#2a1c12' : null,
    );
  }
  random();
  return wood.outline(bark.outline, 0);
}

/** One leaf clump: a lumpy mass filled with small leaf clusters, lit from the top left. */
/** A stable 0..1 hash of a spot and a frame, so the rustle does not disturb the seeded texture. */
const flickerHash = (x, y, frame) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + frame * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

function drawClump(tree, clump, random, crown, frame = 0) {
  const { x: cx, y: cy, r, tone: base } = clump;
  const tones = tree.leaves;
  const layer = new Canvas(TREE_WIDTH, TREE_HEIGHT);
  // A lumpy outline: the clump is a few overlapping blobs
  const lumps = [[cx, cy, r, r * 0.86]];
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2;
    const lr = r * (0.42 + random() * 0.22);
    lumps.push([cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.52, lr, lr * 0.86]);
  }
  layer.fill((x, y) =>
    lumps.some(([lx, ly, rx, ry]) => inEllipse(x + 0.5, y + 0.5, lx, ly, rx, ry)) ? tones[0] : null,
  );

  const leaves = [];
  for (let i = 0; i < r * r * 0.9; i++) {
    const x = cx + (random() * 2 - 1) * r * 1.15;
    const y = cy + (random() * 2 - 1) * r;
    if (!layer.isSet(Math.floor(x), Math.floor(y))) continue;
    const local = ((cx - x) * 0.7 + (cy - y)) / r; // Facing the light inside the clump
    const level = base + local * 1.3 + (random() - 0.5) * 0.9;
    let tone = Math.max(1, Math.min(5, Math.round(level)));
    // Rustle: in each frame a few leaf clusters turn to the light or away from it
    if (frame > 0 && flickerHash(Math.round(x), Math.round(y), frame) < 0.1) {
      tone = Math.max(1, Math.min(5, tone + (flickerHash(Math.round(y), Math.round(x), frame) < 0.5 ? 1 : -1)));
    }
    leaves.push({ x, y, s: 1.6 + random() * 1.4, tone });
  }
  leaves.sort((a, b) => a.tone - b.tone);
  for (const { x, y, s, tone } of leaves) {
    for (let py = Math.floor(y - s); py <= y + s; py++) {
      for (let px = Math.floor(x - s); px <= x + s; px++) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        if (dx * dx + dy * dy > s * s || !layer.isSet(px, py)) continue;
        let t = tone;
        if (dx + dy < -s * 0.8) t = Math.min(5, tone + 1);
        else if (dy > s * 0.5) t = Math.max(0, tone - 1);
        layer.set(px, py, tones[t]);
      }
    }
  }
  // The underside of the clump sits in its own shadow: one darker row along its lower edge
  layer.fill((x, y) => {
    if (!layer.isSet(x, y) || layer.isSet(x, y + 1) || y + 0.5 <= cy + r * 0.2) return null;
    return tones[Math.max(1, Math.round(base) - 2)];
  });

  if (tree.blossoms) {
    for (let i = 0; i < r * 2.4; i++) {
      const x = Math.floor(cx + (random() * 2 - 1) * r);
      const y = Math.floor(cy + (random() * 2 - 1.3) * r * 0.8);
      if (!layer.isSet(x, y) || !layer.isSet(x + 1, y) || !layer.isSet(x, y + 1)) continue;
      const color = tree.blossoms[i % tree.blossoms.length];
      layer.set(x, y, color);
      if (i % 2) layer.set(x + 1, y, color);
      if (i % 3 === 0) layer.set(x, y + 1, shade(color, -0.1));
    }
  }
  crown.draw(layer);
}

/** Leaf clumps at the branch tips: the crown, drawn back to front. */
function drawCrown(tree, tips, frame = 0) {
  const random = seeded(tree.seed + 7);
  const { radius, extra } = tree.clumps;
  const ys = tips.map((t) => t.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const clumps = tips
    .filter((t) => !t.inner || random() < extra)
    .map((t) => {
      const r = (radius[0] + random() * (radius[1] - radius[0]) * (t.inner ? 0.7 : 1)) * SCALE;
      const height = 1 - (t.y - top) / (bottom - top || 1); // 1 at the top of the crown
      const leftLight = (TREE_WIDTH / 2 - t.x) / TREE_WIDTH; // The sun is up and to the left
      const tone = 2.2 + height * 1.4 + leftLight * 1.2 - (t.inner ? 0.6 : 0);
      return { x: t.x, y: t.y, r, tone, inner: t.inner };
    })
    // Inner, lower clumps first; outer, upper ones in front of them
    .sort((a, b) => (a.inner === b.inner ? b.y - a.y : a.inner ? -1 : 1));
  const crown = new Canvas(TREE_WIDTH, TREE_HEIGHT);
  for (const clump of clumps) drawClump(tree, clump, random, crown, frame);
  crown.outline(tree.outline, 0);
  return { crown, clumps };
}

/** Grass, a few flowers and a soft shadow on the ground under the tree. */
function drawGround(trunkX) {
  const ground = new Canvas(TREE_WIDTH, TREE_HEIGHT);
  ground.fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    if (y >= GROUND - 1 && inEllipse(px, py, trunkX, GROUND, 34 * SCALE, 3)) return '#3f8a34';
    if (y < GROUND - 5 || Math.abs(px - trunkX) > 30 * SCALE) return null;
    const blade = (x * 13 + (x >> 2) * 7) % 6;
    if (y < GROUND - blade) return null;
    return blade > 3 ? '#74b94a' : blade > 1 ? '#5aa83f' : '#4c9a3a';
  });
  for (const [dx, color] of [
    [-22, '#ffffff'],
    [17, '#ffd84a'],
    [25, '#ffffff'],
  ]) {
    ground.set(trunkX + dx, GROUND - 4, color);
    ground.set(trunkX + dx, GROUND - 3, '#3f8a34');
  }
  return ground;
}

/** Falling petals for a blossoming tree, drifting down and sideways across the loop. */
function drawPetals(canvas, tree, frame, clumps) {
  if (!tree.blossoms) return;
  const low = clumps
    .filter((c) => !c.inner)
    .sort((a, b) => b.y - a.y)
    .slice(0, 4);
  low.forEach((c, i) => {
    const t = ((frame + i) % 4) / 4 + i * 0.07;
    const x = Math.round(c.x + Math.sin((t + i) * Math.PI * 2) * 3 + t * 8);
    const y = Math.round(c.y + c.r + t * (GROUND - c.y - c.r - 6));
    if (canvas.isSet(x, y)) return;
    canvas.set(x, y, tree.blossoms[0]);
    canvas.set(x + 1, y, tree.leaves[4]);
  });
}

/**
 * @param {object} tree - One of TREES
 * @param {number} frame - 0 to 3: the crown sways, its leaves rustle and, on a cherry, petals fall
 */
export function drawTree(tree, frame = 0) {
  const { segments, tips } = growSkeleton(tree);
  const wood = drawWood(tree, segments);
  const { crown, clumps } = drawCrown(tree, tips, frame);
  if (tree.branchesThrough) {
    // Like a real tree: the limbs run through the crown, behind some clumps and in front
    // of others
    const limbs = drawWood(
      tree,
      segments.filter((seg) => seg.depth >= 1 && seg.depth <= 2),
      { trunk: false },
    );
    crown.fill((x, y) => (crown.isSet(x, y) && limbs.isSet(x, y) ? limbs.get(x, y) : null));
    const random = seeded(tree.seed + 13);
    const front = new Canvas(TREE_WIDTH, TREE_HEIGHT);
    for (const clump of clumps.filter((c) => !c.inner || random() < 0.45)) {
      drawClump(tree, { ...clump, r: clump.r * 0.8 }, random, front, frame);
    }
    crown.draw(front.mask((x, y) => crown.isSet(x, y)));
  }

  // Sway: the whole crown and the limbs above the fork lean together while the trunk stays
  // put. (Moving only the top rows would tear the crown in two.)
  const sway = [0, 1, 0, -1][frame % 4];
  const fork = Math.round(segments[0].b[1]);
  const out = new Canvas(TREE_WIDTH, TREE_HEIGHT);
  out.draw(drawGround(Math.round(segments[0].a[0])));
  out.draw(wood.shear((y) => (y < fork ? sway : 0)));
  out.draw(crown.shear(() => sway));
  drawPetals(out, tree, frame, clumps);
  return out;
}

/**
 * Spots where a bird can stand, as fractions of the tree sprite (where its feet go):
 * the tops of outer clumps that are open to the sky, spread across the crown.
 */
export function treePerches(tree, count = 5) {
  const image = drawTree(tree, 0);
  const { tips } = growSkeleton(tree);
  const candidates = [];
  for (const tip of tips.filter((t) => !t.inner)) {
    const x = Math.round(tip.x);
    let y = 0;
    while (y < TREE_HEIGHT && !image.isSet(x, y)) y++;
    // Open to the sky: the silhouette top at this column is near this clump
    // Feet sink two pixels into the leaves, so the bird does not seem to float
    if (y < TREE_HEIGHT && Math.abs(y - (tip.y - 10)) < 12) candidates.push([x, y + 2]);
  }
  // Spread out: keep the candidate farthest from those already picked
  const picked = [];
  candidates.sort((a, b) => a[1] - b[1]);
  while (picked.length < count && candidates.length > 0) {
    candidates.sort(
      (a, b) =>
        Math.min(...picked.map((p) => Math.abs(p[0] - b[0])), 999) -
        Math.min(...picked.map((p) => Math.abs(p[0] - a[0])), 999),
    );
    picked.push(candidates.shift());
  }
  return picked
    .sort((a, b) => a[0] - b[0])
    .map(([x, y]) => ({ x: +(x / TREE_WIDTH).toFixed(3), y: +(y / TREE_HEIGHT).toFixed(3) }));
}
