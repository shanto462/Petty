// Ponds for Petty: four kinds, each with its own shape, bank and centerpiece. All are set into
// the ground and seen from a low angle, with the water near the bottom so a wading heron's
// legs end up in it. Fishing birds aim at `water`; species/<id>.json must use the same numbers
// (generate.mjs checks).

import { Canvas, inEllipse, segmentDistance, seeded, shade } from './pixel.mjs';

export const PONDS = {
  // A grassy oval with lily pads, a frog and a dragonfly
  pond: {
    width: 240,
    height: 56,
    water: { x: 0.5, y: 0.78, rx: 0.37, ry: 0.17 },
    shape: 'oval',
    ground: { colors: ['#4c9a3a', '#5fb04a', '#6cc04f'], spread: [22, 13] },
    bank: ['#8b6a43', '#a07c50'],
    colors: ['#8fd3f2', '#5fb6d6', '#3f93c2', '#2f78aa'],
    outline: '#2d5a26',
    fish: ['shadow', 2],
    features: ['lilies', 'frog', 'dragonfly', 'bankStones', 'sideReeds'],
  },
  // A kidney-shaped garden pond: flat stones, koi, a red bridge and a stone lantern
  pond_koi: {
    width: 220,
    height: 72,
    water: { x: 0.5, y: 0.833, rx: 0.355, ry: 0.132 },
    shape: 'kidney',
    ground: { colors: ['#4c9a3a', '#5fb04a', '#6cc04f'], spread: [16, 11] },
    bank: ['#7d7a72', '#9a968c'],
    colors: ['#b5ecf2', '#7fd6e0', '#4fbccb', '#3399b0'],
    outline: '#2d5a26',
    fish: ['koi', 3],
    features: ['flagstones', 'bridge', 'lantern'],
  },
  // A wide, wobbly marsh: mud, murky water, duckweed, a log and reeds everywhere
  pond_marsh: {
    width: 280,
    height: 60,
    water: { x: 0.5, y: 0.8, rx: 0.375, ry: 0.167 },
    shape: 'wavy',
    ground: { colors: ['#5d7d32', '#6f8f3a', '#86a64a'], spread: [26, 12] },
    bank: ['#4e3a26', '#6a4f33'],
    colors: ['#8fa98a', '#6b8c72', '#4f735f', '#3e5e50'],
    outline: '#33441e',
    fish: ['shadow', 1],
    features: ['duckweed', 'log', 'marshReeds'],
  },
  // A desert oasis: a sand bank, bright water, sandstone rocks and a palm tree birds can sit in
  pond_oasis: {
    width: 220,
    height: 120,
    water: { x: 0.5, y: 0.9, rx: 0.318, ry: 0.075 },
    shape: 'oval',
    ground: { colors: ['#c39a52', '#e3c47f', '#f0d898'], spread: [30, 13] },
    bank: ['#b98a4a', '#d4a965'],
    colors: ['#b8f1ea', '#7fe0d6', '#45c5bf', '#2aa3a5'],
    outline: '#8a6a32',
    fish: ['gold', 2],
    features: ['sandRipples', 'rocks', 'palm'],
  },
};

/**
 * @param {object} style - One of PONDS
 * @param {number} frame - 0 to 7: shimmer, fish, reeds, the frog and the dragonfly move
 */
export function drawPond(style, frame) {
  const random = seeded(23);
  const W = style.width;
  const H = style.height;
  const cx = W * style.water.x;
  const cy = H * style.water.y;
  const rx = W * style.water.rx;
  const ry = H * style.water.ry;
  const [groundDark, groundMid, groundLight] = style.ground.colors;
  const has = (feature) => style.features.includes(feature);
  const pond = new Canvas(W, H);
  const each = (draw) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) draw(x, y, x + 0.5, y + 0.5);
  };

  // The water's outline: an oval, a kidney (two lobes) or a wobbly marsh edge
  const inWater = (px, py, inset = 0) => {
    const ax = rx - inset;
    const ay = ry - inset * 0.25;
    if (style.shape === 'kidney') {
      return (
        inEllipse(px, py, cx - rx * 0.42, cy + 0.5, ax * 0.6, ay) ||
        inEllipse(px, py, cx + rx * 0.38, cy - 0.3, ax * 0.64, ay * 1.05)
      );
    }
    if (style.shape === 'wavy') {
      const nx = (px - cx) / ax;
      const ny = (py - cy) / ay;
      const angle = Math.atan2(ny, nx);
      const edge = 1 + 0.07 * Math.sin(3 * angle + 0.5) + 0.04 * Math.sin(7 * angle);
      return nx * nx + ny * ny <= edge * edge;
    }
    return inEllipse(px, py, cx, cy, ax, ay);
  };

  // Ground: a wide, low mound whose bottom is cut flat by the ground line
  const [spreadX, spreadY] = style.ground.spread;
  pond.fill((x, y) => {
    if (!inEllipse(x + 0.5, y + 0.5, cx, H - 2, rx + spreadX, ry + spreadY)) return null;
    if (y >= H - 2) return groundDark; // A little shadow where it meets the ground
    return (x * 3 + y * 7) % 11 === 0 ? groundDark : groundMid;
  });
  if (has('sandRipples')) {
    // Wind ripples in the sand
    each((x, y, px, py) => {
      if (pond.isSet(x, y) && y < H - 2 && (Math.floor(px * 0.35 + Math.sin(py * 0.9) * 2) + y) % 6 === 0) {
        pond.set(x, y, groundLight);
      }
    });
  }

  // Far bank: the slope behind the water, which a low view still sees
  each((x, y, px, py) => {
    if (py > cy || inWater(px, py) || !inWater(px, py + 1.8, -2)) return;
    pond.set(x, y, py < cy - ry ? style.bank[1] : style.bank[0]);
  });

  // Water: lighter far away where it mirrors the sky, deeper close by
  each((x, y, px, py) => {
    if (!inWater(px, py)) return;
    const depth = (py - (cy - ry)) / (ry * 2);
    pond.set(x, y, style.colors[depth < 0.2 ? 0 : depth < 0.45 ? 1 : depth < 0.78 ? 2 : 3]);
  });

  // Near edge: the bank hangs over the water a little
  for (let x = 0; x < W; x++) {
    for (let y = Math.floor(cy); y < H; y++) {
      if (inWater(x + 0.5, y + 0.5) && !inWater(x + 0.5, y + 1.5)) {
        pond.set(x, y, (x * 5) % 7 < 3 ? groundLight : groundMid);
        break;
      }
    }
  }

  drawFish(pond, style, { cx, cy, rx, ry, inWater }, frame);

  // Shimmer: short light lines drifting across the water
  [
    [-0.6, -0.1],
    [0.05, -0.4],
    [0.45, 0.25],
    [-0.25, 0.45],
    [0.65, -0.15],
    [-0.4, 0.15],
  ].forEach(([sx, sy], i) => {
    const phase = (frame + i * 3) % 8;
    if (phase > 4) return;
    const x0 = Math.round(cx + sx * rx + phase * 1.5);
    const y0 = Math.round(cy + sy * ry);
    const len = [2, 4, 6, 4, 2][phase];
    for (let k = 0; k < len; k++) {
      if (inWater(x0 + k + 0.5, y0 + 0.5, 2))
        pond.set(x0 + k, y0, phase === 2 ? '#ffffff' : shade(style.colors[0], 0.4));
    }
  });

  const geometry = { W, H, cx, cy, rx, ry, inWater, random, frame, each };
  for (const feature of style.features) FEATURES[feature]?.(pond, style, geometry);

  // Grass (or dry grass) tufts poking up along the top edge of the mound
  for (let i = 0; i < 44; i++) {
    const x = Math.floor(random() * W);
    for (let y = Math.floor(cy - ry - spreadY); y < H - 1; y++) {
      if (pond.isSet(x, y) && !pond.isSet(x, y - 1)) {
        pond.set(x, y - 1, groundDark);
        if (random() > 0.5) pond.set(x, y - 2, has('sandRipples') ? '#a7b55a' : groundLight);
        break;
      }
    }
  }

  return pond.outline(style.outline, 0);
}

/** Dark fish shadows, bright koi or little golden fish swimming in loops. */
function drawFish(pond, style, { cx, cy, rx, ry, inWater }, frame) {
  const [kind, count] = style.fish;
  const looks = {
    shadow: [['#2a5f88', '#2a5f88']],
    koi: [
      ['#f07a2a', '#fbe9d6'],
      ['#ffffff', '#e8452c'],
      ['#f2b43a', '#f2b43a'],
    ],
    gold: [['#f2d36b', '#e8a33a']],
  }[kind];
  const dark = kind === 'shadow' ? shade(style.colors[3], -0.25) : null;
  for (let n = 0; n < count; n++) {
    const speed = n % 2 ? -1 : 1;
    const angle = ((frame + n * 2.7) / 8) * Math.PI * 2 * speed;
    const fx = cx + Math.cos(angle) * rx * (0.5 - n * 0.08);
    const fy = cy + Math.sin(angle) * ry * 0.35 + 0.5;
    const facing = -Math.sin(angle) * speed >= 0 ? 1 : -1;
    const len = 3.6 * (1.1 - n * 0.12);
    const [a, b] = looks[n % looks.length];
    for (let y = Math.floor(fy - 3); y <= fy + 3; y++) {
      for (let x = Math.floor(fx - 10); x <= fx + 10; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        if (!inWater(px, py, 3)) continue;
        const tailX = fx - facing * (len + 1);
        if (inEllipse(px, py, fx, fy, len, 1)) pond.set(x, y, dark ?? ((Math.floor(px - fx + 10) & 2) === 0 ? a : b));
        else if (Math.abs(px - tailX) < 1.4 && Math.abs(py - fy) < 1.2 - Math.abs(px - tailX) * 0.5) {
          pond.set(x, y, dark ?? shade(a, -0.15));
        }
      }
    }
  }
}

function drawStone(pond, sx, sy, r, flat = 0.6, light = '#c4bfb4', dark = '#8e887d') {
  for (let y = Math.floor(sy - r); y <= sy + r; y++) {
    for (let x = Math.floor(sx - r); x <= sx + r; x++) {
      if (inEllipse(x + 0.5, y + 0.5, sx, sy, r, r * flat))
        pond.set(x, y, y + 0.5 < sy - r * flat * 0.2 ? light : dark);
    }
  }
}

function drawReed(pond, x0, base, h, cattail, lean) {
  for (let k = 0; k < h; k++) {
    const x = Math.round(x0 + (k > h * 0.6 ? lean : 0));
    pond.set(x, base - k, k > h - 3 && !cattail ? '#8fd16a' : '#3f8a34');
  }
  if (!cattail) return;
  const x = Math.round(x0 + lean);
  for (let k = 0; k < 4; k++) {
    pond.set(x, base - h + 1 + k, '#7a4a28');
    pond.set(x + 1, base - h + 1 + k, '#5e3820');
  }
  pond.set(x, base - h, '#3f8a34');
}

const FEATURES = {
  lilies(pond, style, { cx, cy, rx, ry, frame, each }) {
    const pads = [
      [-0.55, 0.2, 5.5, '#f6a6c8'],
      [0.3, 0.45, 4.5, null],
      [0.66, -0.25, 3.5, '#ffffff'],
      [-0.15, -0.35, 3, null],
      [0.12, 0.05, 4, '#f6a6c8'],
      [-0.8, -0.2, 3, null],
    ];
    pads.forEach(([sx, sy, r, flower], i) => {
      const px0 = cx + sx * rx;
      const py0 = cy + sy * ry;
      const bob = (frame + i * 2) % 8 < 4 ? 0 : 1;
      each((x, y, px, py) => {
        const qx = px - bob * (i % 2 ? -0.5 : 0.5);
        if (!inEllipse(qx, py, px0, py0, r, r * 0.32)) return;
        if (qx > px0 + 0.5 && Math.abs(py - py0) < 0.6) return; // The notch
        pond.set(x, y, py < py0 ? '#7ccf5c' : '#4f9e3a');
      });
      if (!flower) return;
      const fx = Math.round(px0 - 1);
      const fy = Math.round(py0 - 1);
      pond.set(fx - 1, fy, flower);
      pond.set(fx, fy, '#ffd84a');
      pond.set(fx + 1, fy, flower);
      pond.set(fx, fy - 1, shade(flower, 0.4));
    });
  },

  // A small frog sitting on the big lily pad; it blinks and puffs its throat
  frog(pond, style, { cx, cy, rx, ry, frame }) {
    const x = Math.round(cx - rx * 0.55 + 2);
    const y = Math.round(cy + ry * 0.2 - 2);
    const body = '#5fb04a';
    const dark = '#3f7f2e';
    const rows = ['.oo.oo.', 'oeooeoo', 'ooooooo', '.ooooo.'];
    rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c === '.') return;
        const blink = frame === 5 && c === 'e';
        pond.set(x + dx, y + dy - 2, c === 'e' && !blink ? '#111111' : dy === 3 ? dark : body);
      }),
    );
    if (frame % 4 === 2) pond.set(x + 3, y + 2, '#c9e8a0'); // Throat puff
  },

  // A blue dragonfly darting over the water
  dragonfly(pond, style, { cx, cy, rx, ry, frame }) {
    const t = (frame / 8) * Math.PI * 2;
    const x = Math.round(cx + Math.sin(t) * rx * 0.45);
    const y = Math.round(cy - ry - 7 + Math.sin(t * 2) * 2);
    for (let k = 0; k < 5; k++) pond.set(x - k, y, k === 0 ? '#1f5fa8' : '#3f8fd8');
    const up = frame % 2 === 0;
    pond.set(x - 1, y - 1 - (up ? 1 : 0), '#e6f2ff');
    pond.set(x - 2, y - 1 - (up ? 1 : 0), '#e6f2ff');
    pond.set(x - 1, y + 1, '#c4daf2');
    pond.set(x - 2, y + 1, '#c4daf2');
  },

  bankStones(pond, style, { cx, cy, rx, ry }) {
    drawStone(pond, cx - rx * 0.92, cy + ry + 1.2, 3.6);
    drawStone(pond, cx - rx * 0.72, cy + ry + 2.6, 2.4);
    drawStone(pond, cx + rx * 0.84, cy + ry + 1.4, 3.2);
  },

  sideReeds(pond, style, { cx, cy, rx, ry, frame }) {
    const base = Math.round(cy - ry + 1);
    [
      [-1, -3, 18, true],
      [-1, 1, 13, false],
      [-1, -7, 11, false],
      [1, -4, 16, true],
      [1, 1, 12, false],
      [1, 5, 9, false],
    ].forEach(([side, dx, h, cattail], i) => {
      const lean = (frame + i) % 8 < 4 ? 0 : i % 2 ? 1 : -1;
      drawReed(pond, cx + side * rx + dx, base, h, cattail, lean);
    });
  },

  // Flat grey flagstones all around the water
  flagstones(pond, style, { cx, cy, rx, ry, inWater }) {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const back = Math.sin(a) < 0;
      let sx = cx + Math.cos(a) * (rx + 3);
      const sy = cy + Math.sin(a) * (ry + 2);
      // Push the stone out until it sits just outside the water (the kidney is not an oval)
      for (let k = 0; k < 20 && inWater(sx, sy, -1); k++) sx += Math.sign(Math.cos(a)) * 1;
      const shadeKey = i % 3;
      drawStone(
        pond,
        sx,
        sy,
        back ? 3.2 : 4.6,
        0.42,
        ['#d6d1c6', '#c4bfb4', '#bdb7aa'][shadeKey],
        ['#9a9488', '#8e887d', '#857f74'][shadeKey],
      );
    }
  },

  // A red arched wooden bridge over the right half of the pond
  bridge(pond, style, { cx, cy, rx, ry }) {
    const x0 = Math.round(cx + rx * 0.02);
    const x1 = Math.round(cx + rx * 0.98);
    const deck = (x) => cy - 3 - 9 * Math.sin((Math.PI * (x - x0)) / (x1 - x0));
    for (let x = x0; x <= x1; x++) {
      const y = Math.round(deck(x));
      pond.set(x, y, '#d9543f');
      pond.set(x, y + 1, '#c0392b');
      pond.set(x, y + 2, '#8e2b20');
      if ((x - x0) % 6 === 0) for (let k = 1; k <= 5; k++) pond.set(x, y - k, '#a8321f'); // Posts
      pond.set(x, Math.round(deck(x)) - 5, '#d9543f'); // Hand rail
    }
    // Feet of the bridge standing in the water
    for (const x of [x0 + 2, x1 - 2])
      for (let y = Math.round(deck(x)) + 3; y < cy + ry * 0.4; y++) pond.set(x, y, '#8e2b20');
  },

  // A small stone lantern on the left bank, with a warm light inside
  lantern(pond, style, { cx, cy, rx }) {
    const x = Math.round(cx - rx * 1.02 - 10);
    const base = Math.round(cy + 2);
    const rows = [
      ['....#....', 0],
      ['..#####..', 0],
      ['#########', 0],
      ['.#*****#.', 1],
      ['.#*o*o*#.', 1],
      ['.#*****#.', 1],
      ['..#####..', 0],
      ['...###...', 0],
      ['...###...', 0],
      ['...###...', 0],
      ['..#####..', 0],
      ['.#######.', 0],
    ];
    rows.forEach(([row], dy) =>
      [...row].forEach((c, dx) => {
        if (c === '.') return;
        const color = c === '#' ? (dx < 4 ? '#b9b4aa' : '#8e887d') : c === 'o' ? '#ffe08a' : '#f2b84a';
        pond.set(x + dx, base - rows.length + dy, color);
      }),
    );
  },

  duckweed(pond, style, { W, cy, ry, inWater, random }) {
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(random() * W);
      const y = Math.floor(cy - ry + random() * ry * 2);
      if (inWater(x + 0.5, y + 0.5, 2)) pond.set(x, y, random() > 0.5 ? '#9cc456' : '#7fa843');
    }
  },

  log(pond, style, { cx, cy, rx, ry, each }) {
    const a = [cx + rx * 0.35, cy + ry + 2.5];
    const b = [cx + rx * 0.8, cy + ry + 0.5];
    each((x, y, px, py) => {
      if (segmentDistance(px, py, a, b) < 2.2) pond.set(x, y, py < (a[1] + b[1]) / 2 - 0.5 ? '#8a6a44' : '#6b4f30');
      if (Math.hypot(px - a[0], py - a[1]) < 2) pond.set(x, y, '#c7a676'); // Cut end
    });
  },

  // Reeds and cattails behind the water and a few in front of it
  marshReeds(pond, style, { cx, cy, rx, ry, frame, random }) {
    const back = Math.round(cy - ry + 1);
    const front = Math.round(cy + ry + 1);
    for (let i = 0; i < 34; i++) {
      const sx = cx + (random() * 2 - 1) * rx * 1.05;
      const inFront = i % 5 === 4;
      const h = inFront ? 6 + Math.floor(random() * 6) : 9 + Math.floor(random() * 16);
      const lean = (frame + i) % 8 < 4 ? 0 : i % 2 ? 1 : -1;
      drawReed(pond, sx, inFront ? front : back, h, random() > 0.65, lean);
    }
  },

  sandRipples() {}, // Drawn with the ground

  // Warm sandstone rocks on the bank, and a flat one in the water where the mermaid sits
  rocks(pond, style, { cx, cy, rx, ry }) {
    const [sx, sy] = mermaidRock(style);
    drawStone(pond, sx, sy, 8, 0.42, '#c9b493', '#8e7b62');
    drawStone(pond, cx + rx * 0.95, cy - 1, 6, 0.7, '#e0a96a', '#b07a42');
    drawStone(pond, cx + rx * 1.12, cy + 2, 3.5, 0.7, '#e0a96a', '#b07a42');
    drawStone(pond, cx - rx * 0.6, cy + ry + 2.2, 3, 0.6, '#e0a96a', '#b07a42');
  },

  palm(pond, style, geometry) {
    drawPalm(pond, style, geometry);
  },
};

// --- The oasis rock and palm ---

/** Center of the flat rock in the oasis water, in sprite pixels. */
function mermaidRock({ width, height, water }) {
  return [width * (water.x + water.rx * 0.42), height * water.y - 1];
}

/** Where the mermaid sits (the top of the rock), as fractions of the pond sprite. */
export function mermaidSeat(style) {
  const [x, y] = mermaidRock(style);
  return { x: +(x / style.width).toFixed(3), y: +((y - 3) / style.height).toFixed(3) };
}

const FRONDS = [
  [-150, 30],
  [-118, 30],
  [-62, 32],
  [-28, 34],
  [12, 30],
  [168, 28],
  [48, 22],
]; // [direction in degrees, length]
const PERCH_FRONDS = [0, 3]; // The fronds reaching out left and right: birds stand on them
const PERCH_ALONG = 16; // How far out along the frond (px)

function palmCrown({ width, height, water }) {
  return [width * water.x - width * water.rx * 0.25, height * 0.3];
}

/** Center of a frond `k` px out from the crown; the frond droops more the further out. */
function frondPoint(crown, [deg, length], k, sway = 0) {
  const a = (deg * Math.PI) / 180;
  const t = k / length;
  return [crown[0] + Math.cos(a) * k + sway * t, crown[1] + Math.sin(a) * k * 0.8 + t * t * 14];
}

const frondThickness = (t) => 2.8 * (1 - t) + 0.7;

/** Spots on the palm where birds can stand, as fractions of the oasis sprite. */
export function palmPerches(style) {
  const crown = palmCrown(style);
  return PERCH_FRONDS.map((i) => {
    const frond = FRONDS[i];
    const [x, y] = frondPoint(crown, frond, PERCH_ALONG);
    const top = y - frondThickness(PERCH_ALONG / frond[1]);
    return { x: +(x / style.width).toFixed(3), y: +(top / style.height).toFixed(3) };
  });
}

/** A palm leaning over the water: a ringed trunk from the left bank and a crown of fronds. */
function drawPalm(pond, style, { cx, cy, rx, frame }) {
  const crown = palmCrown(style);
  const base = [cx - rx - 4, cy - 2];
  const control = [base[0] - 8, (base[1] + crown[1]) / 2];
  const trunk = Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const u = 1 - t;
    return [
      u * u * base[0] + 2 * u * t * control[0] + t * t * crown[0],
      u * u * base[1] + 2 * u * t * control[1] + t * t * crown[1],
    ];
  });
  const palm = new Canvas(pond.width, pond.height);
  for (let i = 0; i < trunk.length - 1; i++) {
    const width = 3.2 - (i / trunk.length) * 1.2;
    for (let y = 0; y < pond.height; y++) {
      for (let x = 0; x < pond.width; x++) {
        const d = segmentDistance(x + 0.5, y + 0.5, trunk[i], trunk[i + 1]);
        if (d < width) palm.set(x, y, i % 3 === 0 ? '#7d5530' : d > width - 1.1 ? '#8a6038' : '#a5774a');
      }
    }
  }
  // Coconuts under the crown
  for (const [dx, dy] of [
    [-2, 3],
    [2, 3.5],
    [0, 5],
  ]) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        if (x * x + y * y <= 3.5) {
          palm.set(Math.round(crown[0] + dx + x), Math.round(crown[1] + dy + y), x + y < 0 ? '#8a5a2b' : '#5e3a1a');
        }
      }
    }
  }
  // Fronds: thick arcs that droop from the crown and sway a little (perch fronds stay put)
  const sway = [0, 1, 1, 0, 0, -1, -1, 0][frame];
  FRONDS.forEach((frond, index) => {
    const length = frond[1];
    for (let k = 0; k <= length; k += 0.5) {
      const t = k / length;
      const [x, y] = frondPoint(crown, frond, k, PERCH_FRONDS.includes(index) ? 0 : sway);
      const thick = frondThickness(t);
      for (let oy = -Math.ceil(thick); oy <= Math.ceil(thick); oy++) {
        if (Math.abs(oy) > thick) continue;
        palm.set(Math.round(x), Math.round(y + oy), oy < 0 ? '#5fb04a' : oy === 0 ? '#86c95a' : '#3f8a34');
      }
      // Leaflets hanging from the frond
      if (Number.isInteger(k / 3) && k > 3) {
        for (let j = 1; j <= 4; j++) palm.set(Math.round(x + j * 0.3), Math.round(y + thick + j), '#3f8a34');
      }
    }
  });
  pond.draw(palm.outline('#3a2a14', 0));
}
