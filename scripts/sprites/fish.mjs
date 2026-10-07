// Fish that leap out of the ponds in a dolphin-like arc, and the little splash they make.
// Each fish is drawn at several angles (nose up to nose down), so the leap turns smoothly
// without rotating pixel art in the browser. Files: effect_fish_<look>_<size>-<angle>.png.

import { Canvas, inEllipse, inPolygon, toLocal } from './pixel.mjs';

// One look per kind of pond (species/<pond>.json says which, in "fishJumps")
export const FISH_LOOKS = {
  silver: { back: '#5e7d94', body: '#9fb7c8', belly: '#e6eef2', fin: '#6f8fa6', outline: '#2c3e4c' },
  koi: { back: '#f07a2a', body: '#f07a2a', belly: '#fbe9d6', fin: '#f6a35c', outline: '#5a2a10', spots: '#ffffff' },
  carp: { back: '#5f6a2a', body: '#8a8f3e', belly: '#d8d29a', fin: '#6f7a34', outline: '#2e3412' },
  gold: { back: '#d9952a', body: '#f2c24a', belly: '#fff0b8', fin: '#e8a33a', outline: '#6a4210' },
};

// canvas: sprite size in pixels (square); length: nose to tail tip
export const FISH_SIZES = {
  small: { canvas: 14, length: 9 },
  medium: { canvas: 18, length: 12 },
  large: { canvas: 24, length: 17 },
};

// Nose up (negative) to nose down, in degrees; frame <i> of a fish is FISH_ANGLES[i]
export const FISH_ANGLES = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];

export const SPLASH_SIZE = 16;
export const SPLASH_FRAMES = 4;

/** A fish facing right, turned by `angle` degrees, centered on its square sprite. */
export function drawFish(look, size, angle) {
  const { canvas: n, length: L } = size;
  const local = toLocal(n / 2, n / 2, angle);
  const rx = L * 0.36;
  const ry = L * 0.16;
  const tail = [
    [-rx + 1, 0],
    [-rx - L * 0.2, -L * 0.17],
    [-rx - L * 0.12, 0],
    [-rx - L * 0.2, L * 0.17],
  ];
  const dorsal = [
    [-L * 0.08, -ry + 0.4],
    [L * 0.04, -ry - L * 0.12],
    [L * 0.14, -ry + 0.4],
  ];
  const fish = new Canvas(n, n).fill((x, y) => {
    const [lx, ly] = local(x, y);
    if (inEllipse(lx, ly, 0, 0, rx, ry)) {
      if (look.spots && Math.sin(lx * 1.7) + Math.cos(ly * 2.3 + lx) > 1.1) return look.spots; // Koi patches
      if (ly < -ry * 0.3) return look.back;
      if (ly > ry * 0.35) return look.belly;
      return look.body;
    }
    if (inPolygon(lx, ly, tail) || inPolygon(lx, ly, dorsal)) return look.fin;
    return null;
  });
  fish.outline(look.outline, 0);
  // Eye, near the nose on the upper side
  const [ex, ey] = toCanvasPoint(n / 2, n / 2, angle, rx * 0.62, -ry * 0.25);
  fish.set(Math.floor(ex), Math.floor(ey), '#111111');
  return fish;
}

function toCanvasPoint(cx, cy, angle, x, y) {
  const rad = (angle * Math.PI) / 180;
  return [cx + x * Math.cos(rad) - y * Math.sin(rad), cy + x * Math.sin(rad) + y * Math.cos(rad)];
}

/** A small splash: a crown of water that rises and falls, with a ripple ring. */
export function drawSplash(step) {
  const n = SPLASH_SIZE;
  const water = n - 3; // The water line
  const splash = new Canvas(n, n);
  const heights = [3, 5, 4, 1][step];
  [-4, -2, 0, 2, 4].forEach((dx, i) => {
    const h = Math.round(heights * [0.6, 0.9, 1, 0.9, 0.6][i]);
    for (let k = 0; k < h; k++) {
      const x = n / 2 + dx + Math.round((Math.sign(dx) * k) / 3);
      splash.set(x, water - 1 - k, k > h - 2 ? '#ffffff' : '#bfe9fa');
    }
  });
  if (step === 1 || step === 2) {
    for (const side of [-1, 1]) {
      splash.set(n / 2 + side * (5 + step), water - 5 - step, '#ffffff');
      splash.set(n / 2 + side * (5 + step), water - 4 - step, '#8fd3f2');
    }
  }
  splash.outline('#3f93c2', 0);
  const ring = 3 + step * 1.6;
  for (let x = 0; x < n; x++) {
    for (let y = water - 1; y <= water + 1; y++) {
      const d = ((x + 0.5 - n / 2) / ring) ** 2 + ((y + 0.5 - water) / (ring * 0.3)) ** 2;
      if (d > 0.7 && d <= 1.1 && !splash.isSet(x, y)) splash.set(x, y, step > 1 ? '#a9e0f5' : '#e9f8ff');
    }
  }
  return splash;
}

/** Every jumping-fish frame: { 'fish_<look>_<size>': [Canvas per angle], splash: [...] }. */
export function fishAnimations() {
  const animations = {};
  for (const [lookId, look] of Object.entries(FISH_LOOKS)) {
    for (const [sizeId, size] of Object.entries(FISH_SIZES)) {
      animations[`fish_${lookId}_${sizeId}`] = FISH_ANGLES.map((angle) => drawFish(look, size, angle));
    }
  }
  animations.splash = Array.from({ length: SPLASH_FRAMES }, (_, step) => drawSplash(step));
  return animations;
}
