// The heron's storm cloud. Trees are in trees.mjs, ponds in ponds.mjs.

import { Canvas, inEllipse, segmentDistance, seeded } from './pixel.mjs';

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
