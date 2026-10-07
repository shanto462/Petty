// Birds for Petty, drawn from simple shapes in a local space that faces right.
// Local space: origin at the body center, +x toward the head, +y down.
// A pose rotates and moves that space, flaps the wings, bends the legs and so on.

import { Canvas, inEllipse, inPolygon, segmentDistance, shade, toCanvas, toLocal } from './pixel.mjs';

export const BIRD_SIZE = 50;
export const GROUND_Y = 48; // Feet rest on this row in standing poses

// --- Species: proportions and paint ---

const SONGBIRD = {
  body: { rx: 8.5, ry: 6 },
  head: { x: 7.5, y: -5.5, r: 5 },
  beak: { length: 4, height: 1.6, color: '#4a3f38' },
  tail: { length: 11, width: 3, droop: 4 },
  wing: { length: 17, width: 7 },
  hips: [1.5, -1.2],
  legLength: 5,
  stance: -16,
};

const SPARROW = {
  ...SONGBIRD,
  outline: '#3b2716',
  legs: '#c48a6a',
  eye: [2.2, -1],
  paintBody(x, y) {
    if (y < -1 + x * 0.15) {
      return (Math.floor(x * 0.9 + y * 0.6) & 3) === 0 ? '#5e3b20' : '#9a6b3f';
    }
    return y > 3.2 ? '#c7b99f' : '#ddd0b6';
  },
  paintHead(x, y) {
    if (x > 1.2 && y > 2.2) return '#2b2622'; // Black bib
    if (y < -1.6) return '#8c8a84'; // Grey crown
    if (y < 0.6 && x < 1.4) return '#8b5a2b'; // Chestnut stripe behind the eye
    return '#ebe5d6'; // Pale cheek
  },
  paintWing(t, across) {
    if (t < 0.38) return '#8a5a33';
    if (t < 0.48) return '#f2ede0'; // White wing bar
    return across > 0.55 ? '#b08458' : '#5a3a22';
  },
  tailColor: '#5e4128',
};

const ROBIN = {
  ...SONGBIRD,
  body: { rx: 8, ry: 7 },
  head: { x: 7, y: -6, r: 5.3 },
  beak: { length: 3.4, height: 1.4, color: '#2e2a26' },
  tail: { length: 8.5, width: 3, droop: 3 },
  stance: -24,
  outline: '#3a2c1a',
  legs: '#a8826a',
  eye: [2, -1.2],
  paintBody(x, y) {
    if (y < -2.4 + x * 0.2) return '#8a7650';
    if (x > -3.5 && y < 3) return '#e0602c';
    return '#efe8dc';
  },
  paintHead(x, y) {
    if (y < -2.2 || x < -2.6) return '#8a7650';
    if (y < -1.4 || x < -1.8) return '#a5abb0'; // Grey rim around the orange face
    return '#e0602c';
  },
  paintWing(t, across) {
    if (t < 0.45) return '#7a6744';
    return across > 0.55 ? '#9b8862' : '#5b4b30';
  },
  tailColor: '#6b5a3b',
};

const BLUEBIRD = {
  ...SONGBIRD,
  body: { rx: 8.5, ry: 6.3 },
  outline: '#1d2c5c',
  legs: '#5a4a44',
  eye: [2.2, -1],
  beak: { length: 3.6, height: 1.4, color: '#2a2622' },
  paintBody(x, y) {
    if (y < -1.4 + x * 0.15) return '#3f6fd8';
    if (x > -3 && y < 3.4) return '#d7742f';
    return '#f0ebe4';
  },
  paintHead(x, y) {
    if (x > 0.5 && y > 2.6) return '#d7742f';
    return y < -2.5 ? '#6f9ef0' : '#3f6fd8';
  },
  paintWing(t, across) {
    if (t < 0.45) return '#4f86ea';
    return across > 0.55 ? '#7fb0f6' : '#2b4ea0';
  },
  tailColor: '#2b4ea0',
};

const KINGFISHER = {
  body: { rx: 7.5, ry: 5.6 },
  head: { x: 7, y: -6, r: 6 },
  beak: { length: 9, height: 2, color: '#1e1a18' },
  tail: { length: 6, width: 2.6, droop: 2 },
  wing: { length: 14, width: 6 },
  hips: [1.2, -1],
  legLength: 3,
  stance: -34,
  outline: '#0f2d45',
  legs: '#e0503a',
  eye: [2.4, -1.2],
  paintBody(x, y) {
    if (y < -2.2 + x * 0.2) return x < -2 ? '#3fd0f0' : '#1f8fc2'; // Bright stripe down the back
    return '#e8792d';
  },
  paintHead(x, y) {
    if (y < -1.8) return (Math.floor(x * 1.3) + Math.floor(y)) % 3 === 0 ? '#5cc8ea' : '#1f8fc2';
    if (x > 1.8 && y > 1.6) return '#f4f1e8'; // White throat
    if (x < -2.8 && y > -0.5 && y < 2.5) return '#f4f1e8'; // White neck patch
    if (y < 1.2 && x < 1.8) return '#e8792d'; // Orange cheek
    return '#1f8fc2';
  },
  paintWing(t, across) {
    if (t < 0.5) return (Math.floor(t * 20) + Math.floor(across * 4)) % 3 === 0 ? '#5cc8ea' : '#1f8fc2';
    return across > 0.6 ? '#2a77a8' : '#17608e';
  },
  tailColor: '#1d5f9a',
};

export const BIRDS = { sparrow: SPARROW, robin: ROBIN, bluebird: BLUEBIRD, kingfisher: KINGFISHER };

// --- Wing shapes in local space ---

/** A folded wing lying along the back, tip pointing at the tail. */
function foldedWing(bird) {
  const { rx } = bird.body;
  return [
    [rx * 0.55, -3.6],
    [rx * 0.1, -5],
    [-rx * 0.6, -4],
    [-rx * 1.35, -1.2],
    [-rx * 0.65, 1.6],
    [rx * 0.35, 1.2],
  ];
}

/**
 * An open wing. `phi` is the direction of the tip in degrees: -90 points straight up,
 * 0 points back toward the tail and +90 points down. Tips seen edge-on look shorter.
 * Returns the outline, starting at the shoulder on the leading edge; index 4 is the tip.
 */
function openWing(bird, phi) {
  const { length, width } = bird.wing;
  const rad = (phi * Math.PI) / 180;
  const reach = length * (0.6 + 0.4 * Math.abs(Math.sin(rad)));
  const dir = [-Math.cos(rad), Math.sin(rad)]; // phi 0 = backward (-x)
  const side = [dir[1], -dir[0]];
  // The leading edge faces forward (and up when the wing sweeps back)
  const lead = side[0] - side[1] * 0.3 >= 0 ? 1 : -1;
  const base = [1.5, -2.5];
  const at = (along, off) => [
    base[0] + dir[0] * along + side[0] * off * lead,
    base[1] + dir[1] * along + side[1] * off * lead,
  ];
  // Leading edge, rounded tip, then a notched trailing edge for the flight feathers
  return [
    at(0, width * 0.55),
    at(reach * 0.45, width * 0.55),
    at(reach * 0.75, width * 0.45),
    at(reach * 0.93, width * 0.2),
    at(reach, -width * 0.1),
    at(reach * 0.86, -width * 0.32),
    at(reach * 0.8, -width * 0.14),
    at(reach * 0.68, -width * 0.48),
    at(reach * 0.62, -width * 0.28),
    at(reach * 0.48, -width * 0.6),
    at(reach * 0.3, -width * 0.62),
    at(0, -width * 0.55),
  ];
}

function wingParams(points, x, y) {
  // Position along the wing (0 at the shoulder, 1 at the tip) and across it (0 leading, 1 trailing)
  const lead = points[0];
  const trail = points[points.length - 1];
  const [bx, by] = [(lead[0] + trail[0]) / 2, (lead[1] + trail[1]) / 2];
  const tip = points[4];
  const len = Math.hypot(tip[0] - bx, tip[1] - by) || 1;
  const t = ((x - bx) * (tip[0] - bx) + (y - by) * (tip[1] - by)) / (len * len);
  const w = Math.hypot(trail[0] - lead[0], trail[1] - lead[1]) || 1;
  const across = ((x - lead[0]) * (trail[0] - lead[0]) + (y - lead[1]) * (trail[1] - lead[1])) / (w * w);
  return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, across))];
}

// --- Drawing ---

/**
 * @param {object} bird - One of BIRDS
 * @param {object} pose
 *   x, y: canvas position of the body center; angle: body tilt in degrees (negative = head up)
 *   wing: 'folded' or a tip angle (see openWing); farWing: tip angle of the far wing
 *   head: [dx, dy] head offset; headTilt: head turn in degrees; tail: extra tail tilt; legs: 'stand' | 'tuck' | 'dangle' | number (bent)
 *   blink, beakOpen, fish ('beak' | 'swallow'), waterline (hide pixels below this row)
 */
export function drawBird(bird, pose) {
  const canvas = new Canvas(BIRD_SIZE, BIRD_SIZE);
  const { x: ox, y: oy, angle = 0 } = pose;
  const local = toLocal(ox, oy, angle);
  const toC = toCanvas(ox, oy, angle);
  const [hdx, hdy] = pose.head ?? [0, 0];
  const head = { x: bird.head.x + hdx, y: bird.head.y + hdy, r: bird.head.r };
  const { rx, ry } = bird.body;
  // The head (with beak and eye) can turn on its own, so a tilted body can still look ahead
  const tilt = ((pose.headTilt ?? 0) * Math.PI) / 180;
  const headSpace = (lx, ly) => {
    const dx = lx - head.x;
    const dy = ly - head.y;
    return [dx * Math.cos(-tilt) - dy * Math.sin(-tilt), dx * Math.sin(-tilt) + dy * Math.cos(-tilt)];
  };
  const fromHead = ([hx, hy]) =>
    toC([head.x + hx * Math.cos(tilt) - hy * Math.sin(tilt), head.y + hx * Math.sin(tilt) + hy * Math.cos(tilt)]);

  // Tail: a tapered fan behind the body, tilted down by `droop` plus the pose's tail angle
  const tailTilt = ((bird.tail.droop * 4 + (pose.tail ?? 0)) * Math.PI) / 180;
  const tailRoot = [-rx * 0.6, 0.6];
  const tailDir = [-Math.cos(tailTilt), Math.sin(tailTilt)];
  const tailSide = [tailDir[1], -tailDir[0]];
  const tl = bird.tail.length;
  const tw = bird.tail.width;
  const tail = [
    [tailRoot[0] + tailSide[0] * tw * 0.8, tailRoot[1] + tailSide[1] * tw * 0.8],
    [tailRoot[0] + tailDir[0] * tl + tailSide[0] * tw, tailRoot[1] + tailDir[1] * tl + tailSide[1] * tw],
    [
      tailRoot[0] + tailDir[0] * (tl + 1) - tailSide[0] * tw * 0.6,
      tailRoot[1] + tailDir[1] * (tl + 1) - tailSide[1] * tw * 0.6,
    ],
    [tailRoot[0] - tailSide[0] * tw * 0.8, tailRoot[1] - tailSide[1] * tw * 0.8],
  ];

  const beakOpen = pose.beakOpen ? 1.2 : 0;
  const bx = head.r * 0.75;
  const by = 0.6;
  const upperBeak = [
    [bx - 0.6, by - bird.beak.height],
    [bx + bird.beak.length, by - beakOpen * 0.6],
    [bx - 0.6, by + 0.2],
  ];
  const lowerBeak = [
    [bx - 0.6, by + 0.2],
    [bx + bird.beak.length * 0.85, by + beakOpen],
    [bx - 0.6, by + bird.beak.height * 0.8],
  ];

  // Legs (drawn first so the body overlaps their tops)
  const legs = new Canvas(BIRD_SIZE, BIRD_SIZE);
  const hipList = bird.hips.map((hx) => toC([hx, ry * 0.7]));
  const legMode = pose.legs ?? 'stand';
  for (const [i, [hx, hy]] of hipList.entries()) {
    let foot;
    if (legMode === 'stand') foot = [hx + (i === 0 ? 0.5 : -0.5), GROUND_Y + 0.5];
    else if (legMode === 'tuck') foot = [hx - 2.5, hy + 1.5];
    else if (legMode === 'dangle') foot = [hx - 1 + i, hy + bird.legLength + 1];
    else foot = [hx + (i === 0 ? 1 : -1), hy + Math.max(1.5, bird.legLength - legMode)];
    const toes =
      legMode === 'tuck'
        ? []
        : [
            [foot[0] + 2.2, foot[1]],
            [foot[0] - 1.2, foot[1]],
          ];
    legs.fill((x, y) => {
      const px = x + 0.5;
      const py = y + 0.5;
      if (segmentDistance(px, py, [hx, hy], foot) < 0.62) return bird.legs;
      if (toes.some((toe) => segmentDistance(px, py, foot, toe) < 0.55)) return shade(bird.legs, -0.15);
      return null;
    });
  }
  canvas.draw(legs);

  // Far wing: behind the body, darker
  if (pose.farWing !== undefined) {
    const points = openWing(bird, pose.farWing).map(([x, y]) => [x + 2, y - 1]);
    const far = new Canvas(BIRD_SIZE, BIRD_SIZE).fill((x, y) => {
      const [lx, ly] = local(x, y);
      if (!inPolygon(lx, ly, points)) return null;
      const [t, across] = wingParams(points, lx, ly);
      return shade(bird.paintWing(t, across), -0.28);
    });
    canvas.draw(far.outline(bird.outline, 0));
  }

  // Body, head, tail and beak share one silhouette and one outline
  const body = new Canvas(BIRD_SIZE, BIRD_SIZE).fill((x, y) => {
    const [lx, ly] = local(x, y);
    const [hx, hy] = headSpace(lx, ly);
    if (inPolygon(hx, hy, upperBeak) || inPolygon(hx, hy, lowerBeak)) return bird.beak.color;
    if (inEllipse(hx, hy, 0, 0, head.r, head.r * 0.95)) return bird.paintHead(hx, hy);
    if (inEllipse(lx, ly, 0, 0, rx, ry)) {
      const color = bird.paintBody(lx, ly);
      // Soft shading: lighter on top, darker underneath
      if (ly > ry * 0.62) return shade(color, -0.12);
      if (ly < -ry * 0.7 && lx > -rx * 0.3) return shade(color, 0.12);
      return color;
    }
    // Neck bridges head and body so tilted heads stay attached
    if (segmentDistance(lx, ly, [head.x * 0.4, head.y * 0.4], [head.x, head.y]) < head.r * 0.8) {
      return ly - head.y * 0.5 < 0 ? bird.paintHead(hx, hy) : bird.paintBody(lx, ly);
    }
    if (inPolygon(lx, ly, tail))
      return (Math.floor((lx - tailRoot[0]) * 0.5) & 1) === 0 ? bird.tailColor : shade(bird.tailColor, -0.12);
    return null;
  });
  canvas.draw(body.outline(bird.outline, 0));

  // Near wing
  const wingPoints = pose.wing === undefined || pose.wing === 'folded' ? foldedWing(bird) : openWing(bird, pose.wing);
  const wing = new Canvas(BIRD_SIZE, BIRD_SIZE).fill((x, y) => {
    const [lx, ly] = local(x, y);
    if (!inPolygon(lx, ly, wingPoints)) return null;
    if (pose.wing === undefined || pose.wing === 'folded') {
      // Coverts near the shoulder, flight feathers toward the tip
      const t = Math.max(0, Math.min(1, (rx * 0.5 - lx) / (rx * 1.9)));
      const across = Math.max(0, Math.min(1, (ly + 4.5) / 6));
      return bird.paintWing(t, across);
    }
    const [t, across] = wingParams(wingPoints, lx, ly);
    return bird.paintWing(t, across);
  });
  canvas.draw(wing.outline(shade(bird.outline, 0.05), 0));

  // Eye: a dark pixel with a tiny highlight, or a short line when blinking
  const [ex, ey] = fromHead(bird.eye).map(Math.floor);
  if (pose.blink) {
    canvas.set(ex, ey, shade(bird.outline, 0.1));
    canvas.set(ex - 1, ey, shade(bird.outline, 0.1));
  } else {
    canvas.set(ex, ey, '#121012');
    canvas.set(ex, ey - 1, '#121012');
    canvas.set(ex - 1, ey, '#121012');
    canvas.set(ex - 1, ey - 1, '#ffffff');
  }

  if (pose.fish) drawFish(canvas, fromHead([bx + bird.beak.length * 0.7, by]), pose.fish);

  if (pose.waterline !== undefined) canvas.mask((x, y) => y < pose.waterline);
  return canvas;
}

/** A small silver fish held across the beak tip. */
function drawFish(canvas, [fx, fy], mode) {
  const len = mode === 'swallow' ? 3 : 6;
  const fish = new Canvas(BIRD_SIZE, BIRD_SIZE).fill((x, y) => {
    const px = x + 0.5 - fx;
    const py = y + 0.5 - fy;
    if (inEllipse(px, py, -0.5, 1.2, len / 2, 1.6)) return py < 0.8 ? '#6c8796' : '#d8e4ea';
    if (
      mode !== 'swallow' &&
      inPolygon(px, py, [
        [len / 2 - 1, 1.2],
        [len / 2 + 2, -0.6],
        [len / 2 + 2, 3],
      ])
    )
      return '#e58a3a';
    return null;
  });
  canvas.draw(fish.outline('#28323a', 0));
}

/** A crown of water, flying drops and a ring at the water line, for the kingfisher's dive. */
export function drawSplash(canvas, waterline, step) {
  const cx = 25;
  const splash = new Canvas(BIRD_SIZE, BIRD_SIZE);
  // Crown: water columns that shoot up and fall back
  const heights = [
    [2, 3, 2],
    [5, 7, 5],
    [6, 9, 6],
    [3, 5, 3],
    [1, 2, 1],
  ][step];
  const columns = [-7, -4, -1, 2, 5];
  columns.forEach((dx, i) => {
    const h = heights[[0, 1, 2, 1, 0][i]];
    const lean = dx < -1 ? -1 : dx > 1 ? 1 : 0;
    for (let k = 0; k < h; k++) {
      const x = cx + dx + Math.round((lean * k) / 3);
      splash.set(x, waterline - 1 - k, k > h - 2 ? '#ffffff' : '#bfe9fa');
      splash.set(x + 1, waterline - 1 - k, '#8fd3f2');
    }
  });
  // Drops thrown out to the sides
  if (step >= 1 && step <= 3) {
    const lift = [0, 9, 11, 8][step];
    const spread = [0, 9, 12, 14][step];
    for (const side of [-1, 1]) {
      for (const [ox, oy] of [
        [0, 0],
        [-3, 3],
      ]) {
        const x = cx + side * (spread + ox) + (side > 0 ? 1 : 0);
        const y = waterline - lift + oy + (step === 3 ? 3 : 0);
        splash.set(x, y, '#ffffff');
        splash.set(x + 1, y, '#ffffff');
        splash.set(x, y + 1, '#8fd3f2');
        splash.set(x + 1, y + 1, '#8fd3f2');
      }
    }
  }
  splash.outline('#3f93c2', 0);
  canvas.draw(splash);
  // A ripple ring spreading on the water
  const ring = 6 + step * 2.4;
  for (let x = 0; x < BIRD_SIZE; x++) {
    for (let y = waterline - 2; y <= waterline + 2; y++) {
      const d = ((x + 0.5 - cx) / ring) ** 2 + ((y + 0.5 - waterline) / (ring * 0.25)) ** 2;
      if (d > 0.7 && d <= 1.05 && !canvas.isSet(x, y)) canvas.set(x, y, step > 2 ? '#a9e0f5' : '#e9f8ff');
    }
  }
}
