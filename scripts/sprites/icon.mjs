// Petty's toolbar icon: the heron's head in its straw hat, on a round sky badge so it reads on
// light and dark toolbars. The shapes live in a 0..1 square and are drawn at each size with
// hard pixels; 128 px is the 32 px drawing scaled up 4x, so it keeps the pixel-art look.

import { Canvas, inEllipse, inPolygon, segmentDistance } from './pixel.mjs';

const C = {
  sky: '#bfe6f5',
  skyDark: '#8fd3f2',
  rim: '#2f78aa',
  outline: '#2a3039',
  white: '#f4f5f6',
  shade: '#c3cbd3',
  grey: '#97a3b0',
  crest: '#22252b',
  eye: '#f2d23c',
  beak: '#e8b33a',
  beakLow: '#cf9223',
  straw: '#e7c879',
  strawDark: '#cba855',
  band: '#8a3b2a',
  brim: '#a8843f',
};

// Shapes in unit space (0..1), facing right
const NECK = [
  [0.36, 1.05],
  [0.38, 0.8],
  [0.47, 0.66],
  [0.42, 0.5],
];
const HEAD = { x: 0.43, y: 0.45, rx: 0.15, ry: 0.115 };
const BEAK_UPPER = [
  [0.53, 0.4],
  [0.94, 0.47],
  [0.53, 0.47],
];
const BEAK_LOWER = [
  [0.53, 0.47],
  [0.88, 0.48],
  [0.53, 0.52],
];
const BRIM = { x: 0.42, y: 0.31, rx: 0.33, ry: 0.065 };
const CONE = [
  [0.22, 0.3],
  [0.42, 0.1],
  [0.62, 0.3],
];

function layer(size, paint) {
  return new Canvas(size, size).fill((x, y) => paint((x + 0.5) / size, (y + 0.5) / size));
}

/**
 * The icon drawn natively at `size` px. Tiny sizes skip the bird's outline (it would eat the
 * head) and use a deeper sky, so the white head and yellow beak still stand out.
 */
function drawAt(size) {
  const px = 1 / size;
  const tiny = size < 24;
  const icon = new Canvas(size, size);

  // Badge: a sky disc with a darker rim
  icon.draw(
    layer(size, (u, v) => {
      const d = Math.hypot(u - 0.5, v - 0.5);
      if (d > 0.5) return null;
      if (d > 0.5 - px * 1.2) return C.rim;
      if (tiny) return '#5fb6d6';
      return v > 0.62 ? C.skyDark : C.sky;
    }),
  );

  // Neck, head and beak share one outline; the bottom is cut by the badge
  const bird = layer(size, (u, v) => {
    if (Math.hypot(u - 0.5, v - 0.5) > 0.5 - px * 1.5) return null;
    if (inPolygon(u, v, BEAK_UPPER)) return C.beak;
    if (inPolygon(u, v, BEAK_LOWER)) return C.beakLow;
    if (inEllipse(u, v, HEAD.x, HEAD.y, HEAD.rx, HEAD.ry)) {
      // Black stripe from behind the eye toward the back of the head
      if (!tiny && v > HEAD.y - 0.035 && v < HEAD.y + 0.02 && u < HEAD.x - 0.015) return C.crest;
      return C.white;
    }
    for (let i = 0; i < NECK.length - 1; i++) {
      if (segmentDistance(u, v, NECK[i], NECK[i + 1]) < 0.085 - i * 0.012) {
        return u < NECK[i][0] - 0.03 ? C.shade : C.white;
      }
    }
    // A bit of grey back at the bottom
    if (v > 0.82 && u < 0.36 && u > 0.08) return C.grey;
    return null;
  });
  icon.draw(tiny ? bird : bird.outline(C.outline, 0));

  // Plume trailing from the back of the head
  icon.draw(
    layer(size, (u, v) =>
      segmentDistance(u, v, [HEAD.x - 0.1, HEAD.y - 0.01], [0.13, 0.5]) < Math.max(px * 0.7, 0.012) ? C.crest : null,
    ),
  );

  // Eye: a yellow ring with a dark pupil, at least one pixel each
  const ex = Math.floor((HEAD.x + 0.06) * size);
  const ey = Math.floor((HEAD.y - 0.02) * size);
  if (size >= 32) {
    icon.set(ex - 1, ey, C.eye);
    icon.set(ex, ey - 1, C.eye);
  }
  icon.set(ex, ey, '#111111');

  // Hat: a wide, shallow straw hat with a dark band
  const hat = layer(size, (u, v) => {
    const brim = inEllipse(u, v, BRIM.x, BRIM.y, BRIM.rx, BRIM.ry);
    const cone = inPolygon(u, v, CONE);
    if (!brim && !cone) return null;
    if (cone && v > 0.24 && v < 0.29) return C.band;
    if (brim && v > BRIM.y + 0.01) return C.brim;
    const ray = Math.floor((Math.atan2(v - 0.35, u - BRIM.x) * 180) / Math.PI / 16);
    return ray % 2 ? C.straw : C.strawDark;
  });
  icon.draw(hat.outline('#5e4320', 0), 0, tiny ? -1 : 0); // Lifted at 16 px so the head shows
  return icon;
}

/** @returns {Record<16 | 32 | 48 | 128, Canvas>} */
export function drawIcons() {
  const small = drawAt(32);
  return { 16: drawAt(16), 32: small, 48: drawAt(48), 128: small.scale(4) };
}
