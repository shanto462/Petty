// The oasis mermaid: she rises out of the water onto a rock when nobody is around, brushes
// her hair with a golden comb, and dives back in when a bird comes close.
// Canvas space: facing right, sitting with her hips at HIPS; the water line is WATER.

import { Canvas, inEllipse, inPolygon, segmentDistance, shade } from './pixel.mjs';

export const MERMAID_SIZE = 44;
export const HIPS = [24, 33]; // Where she sits (on the oasis rock)
const WATER = 38;

const C = {
  skin: '#f2c6a0',
  skinShade: '#d9a37c',
  outline: '#5a2e2a',
  hair: '#5a3a6e', // Long dark plum hair
  hairDark: '#3a2449',
  hairLight: '#7d5a94',
  shell: '#f0875a', // Coral shell top
  shellDark: '#c8603a',
  tail: '#3f6fd8', // Sapphire tail
  tailDark: '#2b4ea0',
  tailLight: '#7fb0f6',
  fin: '#a8c8ff',
  comb: '#f2c94c',
  eye: '#2a2230',
  blush: '#f09a8e',
};

/**
 * @param {object} pose
 *   tilt: degrees she leans forward (diving); drop: px she sits lower (rising out of the water)
 *   comb: 0..3, how far down the hair the comb is (null = no comb in view)
 *   sway: hair sway in px; blink; fin: fin flick in degrees
 *   clip: hide everything below the water line (true while in the water)
 */
export function drawMermaid(pose) {
  const { tilt = 0, drop = 0, comb = null, sway = 0, blink = false, fin = 0, clip = true } = pose;
  const [hx, hy] = [HIPS[0], HIPS[1] + drop];
  // Rotate around the hips: positive tilt leans her forward, head first
  const rad = (tilt * Math.PI) / 180;
  const toLocalPoint = (x, y) => {
    const dx = x + 0.5 - hx;
    const dy = y + 0.5 - hy;
    return [dx * Math.cos(-rad) - dy * Math.sin(-rad), dx * Math.sin(-rad) + dy * Math.cos(-rad)];
  };
  const toCanvas = ([x, y]) => [hx + x * Math.cos(rad) - y * Math.sin(rad), hy + x * Math.sin(rad) + y * Math.cos(rad)];

  // Shapes relative to the hips (x right, y down)
  const head = [1, -18];
  const tailCurve = [
    [-2, 0],
    [-7, 3],
    [-12, 6],
    [-17, 4],
  ];
  const finAngle = ((-130 + fin) * Math.PI) / 180;
  const finBase = tailCurve[3];
  const finTip = (spread) => [
    finBase[0] + Math.cos(finAngle + spread) * 7,
    finBase[1] + Math.sin(finAngle + spread) * 7,
  ];
  const finShape = [
    finBase,
    finTip(-0.5),
    [finBase[0] + Math.cos(finAngle) * 4, finBase[1] + Math.sin(finAngle) * 4],
    finTip(0.5),
  ];
  // Hair: over the top and the back of her head, then down her back (the face stays clear)
  const hairShape = [
    [head[0] - 4.5, head[1] - 2],
    [head[0] + 1, head[1] - 5.2],
    [head[0] + 3.8, head[1] - 3.2],
    [head[0] + 0.5, head[1] - 2.2],
    [head[0] - 1.5, head[1] + 1],
    [head[0] - 3 + sway * 0.3, head[1] + 6],
    [-4 + sway, -6],
    [-6 + sway, -1],
    [-8 + sway * 1.3, -4],
    [-7 + sway, -12],
    [head[0] - 6, head[1] + 2],
  ];

  const body = new Canvas(MERMAID_SIZE, MERMAID_SIZE).fill((x, y) => {
    const [lx, ly] = toLocalPoint(x, y);
    // Tail: thick at the hips, thinner toward the fin, with scales
    for (let i = 0; i < tailCurve.length - 1; i++) {
      const width = 3.6 - i * 0.9;
      if (segmentDistance(lx, ly, tailCurve[i], tailCurve[i + 1]) < width) {
        if (ly < tailCurve[i][1] - width * 0.4) return C.tailLight;
        return (Math.floor(lx * 0.8) + Math.floor(ly * 0.8)) % 2 ? C.tail : C.tailDark;
      }
    }
    if (inPolygon(lx, ly, finShape)) return C.fin;
    // Head: hair on top and at the back, her face toward the front
    if (inEllipse(lx, ly, head[0], head[1], 4, 4.2)) {
      if (ly < head[1] - 1.8 || lx < head[0] - 1.2) return ly < head[1] - 3 ? C.hairLight : C.hair;
      return lx > head[0] + 2.6 ? C.skinShade : C.skin;
    }
    // Hair falls behind her back
    if (inPolygon(lx, ly, hairShape)) {
      const strand = Math.floor((lx - ly * 0.3) * 0.7) % 3;
      return strand === 0 ? C.hairDark : strand === 1 ? C.hair : C.hairLight;
    }
    // Torso and arms
    if (inEllipse(lx, ly, 0.5, -6, 3.6, 7)) {
      if (ly > -9 && ly < -6.5 && Math.abs(lx - 0.5) < 3.6) return lx > 0.8 ? C.shell : C.shellDark; // Shell top
      return lx > 2 ? C.skinShade : C.skin;
    }
    // The near arm rests on the rock
    if (segmentDistance(lx, ly, [1.5, -11], [4.5, -4]) < 1.2 || segmentDistance(lx, ly, [4.5, -4], [5, 0]) < 1.1)
      return C.skin;
    // Neck
    if (segmentDistance(lx, ly, [0.8, -12], head) < 1.6) return C.skinShade;
    return null;
  });
  body.outline(C.outline, 0);

  // Face: eye, blush
  const [ex, ey] = toCanvas([head[0] + 1.8, head[1] - 0.5]).map(Math.floor);
  if (blink) {
    body.set(ex, ey, C.outline);
    body.set(ex + 1, ey, C.outline);
  } else {
    body.set(ex, ey, C.eye);
    body.set(ex, ey - 1, C.eye);
  }
  const [bx, by] = toCanvas([head[0] + 2, head[1] + 1.5]).map(Math.floor);
  body.set(bx, by, C.blush);

  // The far arm reaches behind her head to comb the hair, top to bottom
  if (comb !== null) {
    const combAt = [
      [-3.5, -22],
      [-5, -18],
      [-6.5, -13],
      [-7.5, -8],
    ][comb];
    const shoulder = [-0.5, -11];
    const elbow = [(shoulder[0] + combAt[0]) / 2 + 2.5, (shoulder[1] + combAt[1]) / 2];
    body.fill((x, y) => {
      const [lx, ly] = toLocalPoint(x, y);
      if (segmentDistance(lx, ly, shoulder, elbow) < 1.1 || segmentDistance(lx, ly, elbow, combAt) < 1) return C.skin;
      if (
        inPolygon(lx, ly, [
          [combAt[0] - 2.5, combAt[1] - 1],
          [combAt[0] + 0.5, combAt[1] - 1],
          [combAt[0] + 0.5, combAt[1] + 1.2],
          [combAt[0] - 2.5, combAt[1] + 1.2],
        ])
      ) {
        return (x + y) % 2 ? C.comb : shade(C.comb, -0.2);
      }
      return null;
    });
  }

  if (clip) body.mask((x, y) => y < WATER);
  return body;
}

/** Rings on the water where she rises or dives. */
function drawRipples(canvas, step, x = HIPS[0] - 4) {
  for (const [r, color] of [
    [3 + step * 1.8, '#e9f8ff'],
    [6 + step * 1.8, '#a9e0f5'],
  ]) {
    for (let px = 0; px < MERMAID_SIZE; px++) {
      for (let py = WATER - 2; py <= WATER + 2; py++) {
        const d = ((px + 0.5 - x) / r) ** 2 + ((py + 0.5 - WATER) / (r * 0.3)) ** 2;
        if (d > 0.7 && d <= 1.05 && !canvas.isSet(px, py)) canvas.set(px, py, color);
      }
    }
  }
}

/** Water thrown up by her dive. */
function drawSplash(canvas, step, x) {
  const heights = [5, 8, 6, 3][step] ?? 0;
  [-5, -3, -1, 1, 3, 5].forEach((dx, i) => {
    const h = Math.round(heights * [0.5, 0.8, 1, 1, 0.8, 0.5][i]);
    for (let k = 0; k < h; k++) {
      const px = Math.round(x + dx + (Math.sign(dx) * k) / 3);
      canvas.set(px, WATER - 1 - k, k > h - 2 ? '#ffffff' : '#bfe9fa');
    }
  });
}

const hold = (poses, times) => poses.flatMap((pose) => Array(times).fill(pose));

/** { rise, brush, dive }: lists of canvases. */
export function mermaidAnimations() {
  const render = (pose, extra) => {
    const canvas = drawMermaid(pose);
    extra?.(canvas);
    return canvas;
  };
  // Rising: she comes up out of the water a little more each frame
  const rise = [20, 15, 10, 6, 3, 1, 0].map((drop, i) =>
    render({ drop, comb: null, fin: 20 }, (c) => drawRipples(c, i % 4)),
  );
  // Brushing: the comb travels down the hair, then back to the top; the fin flicks now and then
  const brush = hold(
    [0, 1, 2, 3, 0, 1, 2, 3].map((comb, i) => ({
      comb,
      sway: [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5][i],
      blink: i === 5,
      fin: i === 2 || i === 3 ? 25 : 0,
    })),
    2,
  ).map((pose) => render(pose));
  // Diving: she leans forward, goes in head first, the tail flips up, then only a splash is left
  const dive = [
    render({ tilt: 20, comb: null, fin: 15 }),
    render({ tilt: 50, drop: 2, comb: null, fin: 30 }),
    render({ tilt: 85, drop: 6, comb: null, fin: 60 }, (c) => drawSplash(c, 0, HIPS[0] + 6)),
    render({ tilt: 110, drop: 11, comb: null, fin: 90 }, (c) => drawSplash(c, 1, HIPS[0] + 4)),
    render({ tilt: 130, drop: 18, comb: null, fin: 100 }, (c) => drawSplash(c, 2, HIPS[0] + 2)),
    render({ tilt: 140, drop: 40, comb: null }, (c) => {
      drawSplash(c, 3, HIPS[0]);
      drawRipples(c, 2, HIPS[0]);
    }),
    render({ tilt: 140, drop: 40, comb: null }, (c) => drawRipples(c, 3, HIPS[0])),
  ];
  return { rise, brush, dive };
}
