// A big grey heron in a wide straw hat. It has its own rig because a heron is mostly
// neck and legs: an S-shaped neck, legs with a backward-bending heel, and long wings.
// Canvas space: 100x100, facing right, feet on row GROUND in standing poses.

import { Canvas, inEllipse, inPolygon, segmentDistance, shade, toCanvas, toLocal } from './pixel.mjs';

export const HERON_SIZE = 100;
export const GROUND = 98;
export const WADE_LINE = 90; // Water line in wading poses (legs below it are under water)

const C = {
  outline: '#2a3039',
  back: '#97a3b0',
  side: '#aab5c0',
  belly: '#cfd6dd',
  patch: '#3b414c', // Dark patch on the side of the breast
  neck: '#e9edf0',
  neckShade: '#c3cbd3',
  streak: '#3a3f48',
  face: '#f4f5f6',
  crest: '#22252b',
  beak: '#e8b33a',
  beakLow: '#cf9223',
  eye: '#f2d23c',
  legs: '#c7a03c',
  coverts: '#98a4b1',
  lead: '#c6ced7',
  flight: '#3a404b',
  straw: '#e7c879',
  strawDark: '#cba855',
  brimShade: '#a8843f',
  band: '#8a3b2a',
  strap: '#6b4a2e',
  water: '#bfe6f5',
  waterDark: '#7cc6e0',
  rain: '#7f9fbe',
  wind: '#c9d4df',
  motion: '#8ea4bb',
  motionCore: '#e6eef5',
};

const BODY = { rx: 16, ry: 8.5 };
const LEG = { upper: 16, lower: 21 };

// --- Geometry helpers ---

function bezier([p0, p1, p2, p3], t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Two-bone leg: where the heel goes between hip and foot. bend 1 = heel behind, -1 = in front. */
function heel(hip, foot, bend = 1) {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = Math.hypot(dx, dy);
  const { upper, lower } = LEG;
  if (d >= upper + lower - 0.01) return [hip[0] + (dx / d) * upper, hip[1] + (dy / d) * upper];
  const a = Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - lower * lower) / (2 * upper * d))));
  const base = Math.atan2(dy, dx);
  const options = [base + a, base - a].map((angle) => [
    hip[0] + Math.cos(angle) * upper,
    hip[1] + Math.sin(angle) * upper,
  ]);
  options.sort((p, q) => p[0] - q[0]);
  return bend > 0 ? options[0] : options[1];
}

/** Open wing outline. phi: -90 up, 0 back, +90 down, -180 (or 180) forward. Index 4 is the tip. */
function wingShape(shoulder, phi, length, width) {
  const rad = (phi * Math.PI) / 180;
  const dir = [-Math.cos(rad), Math.sin(rad)];
  const side = [dir[1], -dir[0]];
  const lead = side[0] - side[1] * 0.3 >= 0 ? 1 : -1;
  const at = (along, off) => [
    shoulder[0] + dir[0] * along + side[0] * off * lead,
    shoulder[1] + dir[1] * along + side[1] * off * lead,
  ];
  const L = length;
  const w = width;
  return [
    at(0, w * 0.5),
    at(L * 0.35, w * 0.62),
    at(L * 0.7, w * 0.5),
    at(L * 0.92, w * 0.28),
    at(L, 0),
    at(L * 0.95, -w * 0.18),
    at(L * 0.88, -w * 0.06),
    at(L * 0.84, -w * 0.36),
    at(L * 0.76, -w * 0.22),
    at(L * 0.7, -w * 0.5),
    at(L * 0.6, -w * 0.36),
    at(L * 0.52, -w * 0.6),
    at(L * 0.42, -w * 0.48),
    at(L * 0.32, -w * 0.64),
    at(L * 0.2, -w * 0.55),
    at(0, -w * 0.5),
  ];
}

function wingParams(points, x, y) {
  const lead = points[0];
  const trail = points[points.length - 1];
  const base = [(lead[0] + trail[0]) / 2, (lead[1] + trail[1]) / 2];
  const tip = points[4];
  const len2 = (tip[0] - base[0]) ** 2 + (tip[1] - base[1]) ** 2 || 1;
  const t = ((x - base[0]) * (tip[0] - base[0]) + (y - base[1]) * (tip[1] - base[1])) / len2;
  const w2 = (trail[0] - lead[0]) ** 2 + (trail[1] - lead[1]) ** 2 || 1;
  const across = ((x - lead[0]) * (trail[0] - lead[0]) + (y - lead[1]) * (trail[1] - lead[1])) / w2;
  return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, across))];
}

function paintWing(t, across, dark = 0) {
  let color;
  if (across < 0.16 && t < 0.8) color = C.lead;
  else if (across < 0.48 && t < 0.62) color = C.coverts;
  else color = Math.floor(t * 11) % 2 ? C.flight : shade(C.flight, 0.12);
  return dark ? shade(color, -dark) : color;
}

// --- The rig ---

/**
 * @param {object} pose
 *   body: [x, y, angle]; neck: three bezier points relative to the shoulder (last one is the head)
 *   headAngle: beak direction in degrees (0 = right, positive = down); beakOpen: 0..1; blink
 *   legs: [near, far], each { foot: [x, y], bend, toes } (toes: direction in degrees, 0 = forward)
 *   wing: 'folded' or { phi, reach, width }; farWing: same (drawn behind the body)
 *   hat: { tilt, lift, back } in degrees and pixels; tail: extra tail tilt
 *   fish, bulge (0..1 along the neck), waterline, and effects drawn afterwards by the caller
 */
export function drawHeron(pose) {
  const canvas = new Canvas(HERON_SIZE, HERON_SIZE);
  const [bx, by, angle] = pose.body;
  const local = toLocal(bx, by, angle);
  const toC = toCanvas(bx, by, angle);
  const { rx, ry } = BODY;

  const shoulder = toC([rx * 0.72, -ry * 0.35]);
  const neckPoints = [shoulder, ...pose.neck.map(([dx, dy]) => [shoulder[0] + dx, shoulder[1] + dy])];
  const neckEnd = neckPoints[3];
  const headAngle = ((pose.headAngle ?? 0) * Math.PI) / 180;
  const hdir = [Math.cos(headAngle), Math.sin(headAngle)];
  const head = [neckEnd[0] + hdir[0] * 1.5, neckEnd[1] + hdir[1] * 1.5];
  const headLocal = toLocal(head[0], head[1], pose.headAngle ?? 0);
  const headToC = toCanvas(head[0], head[1], pose.headAngle ?? 0);

  // Neck: sampled bezier, thick at the base and thin near the head
  const samples = Array.from({ length: 41 }, (_, i) => bezier(neckPoints, i / 40));
  const neckWidth = (t) =>
    4.8 - t * 1.6 + (pose.bulge !== undefined ? 2.4 * Math.exp(-(((t - pose.bulge) / 0.08) ** 2)) : 0);

  // Legs (behind everything)
  const hips = [toC([1.5, ry * 0.7]), toC([-1.5, ry * 0.7])];
  const legLayer = new Canvas(HERON_SIZE, HERON_SIZE);
  (pose.legs ?? []).forEach((leg, i) => {
    if (!leg) return;
    const hip = hips[i];
    const foot = leg.foot;
    const knee = heel(hip, foot, leg.bend ?? 1);
    const toeDir = ((leg.toes ?? 0) * Math.PI) / 180;
    const toes = [-20, 0, 20].map((spread) => {
      const a = toeDir + (spread * Math.PI) / 180;
      return [foot[0] + Math.cos(a) * 5, foot[1] + Math.sin(a) * 5 * 0.4 + (leg.toes ? Math.sin(a) * 3 : 0)];
    });
    const backToe = [foot[0] - Math.cos(toeDir) * 2.5, foot[1] - Math.sin(toeDir) * 2.5];
    const color = i === 0 ? C.legs : shade(C.legs, -0.22);
    legLayer.fill((x, y) => {
      const p = [x + 0.5, y + 0.5];
      if (segmentDistance(...p, hip, knee) < 1.25) return color;
      if (segmentDistance(...p, knee, foot) < 0.9) return color;
      if (legLayer.isSet(x, y)) return null;
      if ([...toes, backToe].some((toe) => segmentDistance(...p, foot, toe) < 0.6)) return shade(color, -0.12);
      return null;
    });
  });
  canvas.draw(legLayer);

  // Wings
  const wingRoot = toC([2, -ry * 0.7]);
  const openWing = (spec, dark) => {
    const points = wingShape(wingRoot, spec.phi, spec.reach ?? 40, spec.width ?? 13);
    const layer = new Canvas(HERON_SIZE, HERON_SIZE).fill((x, y) => {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!inPolygon(px, py, points)) return null;
      const [t, across] = wingParams(points, px, py);
      return paintWing(t, across, dark);
    });
    return layer.outline(C.outline, 0);
  };
  if (pose.farWing && pose.farWing !== 'folded') {
    const far = { ...pose.farWing };
    canvas.draw(openWing(far, 0.25), 2, -1);
  }

  // Body, tail, neck, head and beak: one silhouette
  const tailTilt = ((12 + (pose.tail ?? 0)) * Math.PI) / 180;
  const tailRoot = [-rx * 0.8, 1];
  const tdir = [-Math.cos(tailTilt), Math.sin(tailTilt)];
  const tside = [tdir[1], -tdir[0]];
  const tail = [
    [tailRoot[0] + tside[0] * 3.5, tailRoot[1] + tside[1] * 3.5],
    [tailRoot[0] + tdir[0] * 8 + tside[0] * 2.5, tailRoot[1] + tdir[1] * 8 + tside[1] * 2.5],
    [tailRoot[0] + tdir[0] * 8.5 - tside[0] * 2, tailRoot[1] + tdir[1] * 8.5 - tside[1] * 2],
    [tailRoot[0] - tside[0] * 3, tailRoot[1] - tside[1] * 3],
  ];
  const open = (pose.beakOpen ?? 0) * 2.2;
  const beakLength = 15;
  const upperBeak = [
    [3.6, -2],
    [3.6 + beakLength, -open * 0.4],
    [3.6, 0.4],
  ];
  const lowerBeak = [
    [3.6, 0.4],
    [3.6 + beakLength * 0.9, open],
    [3.6, 1.9],
  ];
  const crest = [
    [-3, -2.2],
    [-13, -0.5 + (pose.crestLift ?? 0)],
    [-12.5, 0.6 + (pose.crestLift ?? 0)],
    [-3, -0.6],
  ];

  const body = new Canvas(HERON_SIZE, HERON_SIZE).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    const [hx, hy] = headLocal(x, y);
    if (inPolygon(hx, hy, upperBeak)) return hy < -0.6 ? C.beak : shade(C.beak, -0.08);
    if (inPolygon(hx, hy, lowerBeak)) return C.beakLow;
    if (inEllipse(hx, hy, 0, 0, 5.4, 4.1)) {
      if (hy > -1.8 && hy < -0.2 && hx < 0.6) return C.crest; // Black stripe from the eye back
      return C.face;
    }
    if (inPolygon(hx, hy, crest)) return C.crest;

    // Neck
    let best = Infinity;
    let bestT = 0;
    let bestSide = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const d = segmentDistance(px, py, samples[i], samples[i + 1]);
      if (d < best) {
        best = d;
        bestT = i / 40;
        const tx = samples[i + 1][0] - samples[i][0];
        const ty = samples[i + 1][1] - samples[i][1];
        // Positive on the side that faces forward (toward the beak)
        const nx = ty;
        const ny = -tx;
        const sign = nx * hdir[0] + ny * hdir[1] >= 0 ? 1 : -1;
        bestSide = ((px - samples[i][0]) * nx + (py - samples[i][1]) * ny) * sign;
      }
    }
    const width = neckWidth(bestT);
    if (best < width) {
      if (bestSide > 0 && best > width - 1.4 && bestT > 0.15 && bestT < 0.9 && Math.floor(bestT * 30) % 2 === 0) {
        return C.streak; // Dotted dark line down the front of the neck
      }
      return bestSide < -width * 0.35 ? C.neckShade : C.neck;
    }

    const [lx, ly] = local(x, y);
    if (inEllipse(lx, ly, 0, 0, rx, ry)) {
      if (lx > rx * 0.35 && ly > -0.5 && ly < ry * 0.6) return C.patch;
      if (ly < -ry * 0.35) return ly < -ry * 0.75 && lx > -rx * 0.2 ? shade(C.back, 0.12) : C.back;
      if (ly > ry * 0.45) return (Math.floor(lx * 0.8) & 1) === 0 ? C.belly : shade(C.belly, 0.25);
      return C.side;
    }
    if (inPolygon(lx, ly, tail)) return shade(C.flight, 0.15);
    return null;
  });
  canvas.draw(body.outline(C.outline, 0));

  // Near wing
  if (pose.wing && pose.wing !== 'folded') {
    canvas.draw(openWing(pose.wing, 0));
  } else {
    const folded = [
      [rx * 0.55, -ry * 0.75],
      [-rx * 0.3, -ry * 1.05],
      [-rx * 1.05, -ry * 0.45],
      [-rx * 1.45, 1.5],
      [-rx * 0.7, ry * 0.45],
      [rx * 0.25, ry * 0.25],
    ];
    const wing = new Canvas(HERON_SIZE, HERON_SIZE).fill((x, y) => {
      const [lx, ly] = local(x, y);
      if (!inPolygon(lx, ly, folded)) return null;
      const t = (rx * 0.55 - lx) / (rx * 2);
      if (t > 0.62) return Math.floor(ly + lx * 0.3) % 2 ? C.flight : shade(C.flight, 0.12);
      if (ly < -ry * 0.6) return C.lead;
      return (Math.floor(lx * 0.5 - ly) & 3) === 0 ? shade(C.coverts, -0.08) : C.coverts;
    });
    canvas.draw(wing.outline(C.outline, 0));
  }

  // Eye: yellow with a dark pupil, or closed
  const [ex, ey] = headToC([1.6, -0.9]).map(Math.floor);
  if (pose.blink) {
    canvas.set(ex - 1, ey, C.outline);
    canvas.set(ex, ey, C.outline);
  } else {
    canvas.set(ex, ey, '#111111');
    canvas.set(ex - 1, ey, C.eye);
    canvas.set(ex, ey - 1, C.eye);
  }

  // Hat: a wide, shallow straw hat with a dark band and a chin strap
  drawHat(canvas, headToC, pose.hat ?? {});

  if (pose.fish) drawBigFish(canvas, headToC([3.6 + beakLength * 0.85 - (pose.fish.slide ?? 0), 0.2]), pose.fish);

  if (pose.waterline !== undefined) canvas.mask((x, y) => y < pose.waterline);
  return canvas;
}

function drawHat(canvas, headToC, { tilt = 0, lift = 0, back = 0 }) {
  const [cx, cy] = headToC([-0.8 - back, -5.6 - lift]);
  const local = toLocal(cx, cy, tilt);
  const hat = new Canvas(HERON_SIZE, HERON_SIZE).fill((x, y) => {
    const [lx, ly] = local(x, y);
    const brim = inEllipse(lx, ly, 0, 0, 13.5, 2.3);
    const cone = ly <= 0.2 && ly >= -6.5 && Math.abs(lx) <= 7.2 * (1 - (-ly - 0.2) / 7.2) + 0.4;
    if (!brim && !cone) return null;
    if (cone && ly < -0.3 && ly > -2.2) return C.band;
    if (brim && ly > 0.6) return C.brimShade;
    const ray = Math.floor((Math.atan2(ly - 1, lx) * 180) / Math.PI / 14);
    return ray % 2 ? C.straw : C.strawDark;
  });
  canvas.draw(hat.outline(shade(C.brimShade, -0.45), 0));
  // Chin strap from the brim, down behind the eye, under the head
  const from = toCanvas(cx, cy, tilt)([3.5, 1.6]);
  const to = headToC([1.5, 4]);
  for (let i = 0; i <= 8; i++) {
    const x = Math.round(from[0] + ((to[0] - from[0]) * i) / 8);
    const y = Math.round(from[1] + ((to[1] - from[1]) * i) / 8);
    if (i > 1) canvas.set(x, y, C.strap);
  }
}

/**
 * A big golden carp held in the beak. `angle` points from the tail to the head (-80 = head up,
 * held across the beak); bend swings the tail; size 1 = full, 0 = swallowed.
 */
function drawBigFish(canvas, [fx, fy], { bend = 0, size = 1, angle = -80 }) {
  if (size <= 0) return;
  const len = 18 * size;
  const rad = (angle * Math.PI) / 180;
  const dir = [Math.cos(rad), Math.sin(rad)];
  const normal = [-dir[1], dir[0]];
  // Centerline from head (t = 0, at the beak) to tail (t = 1), bent sideways
  const line = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const sway = bend * 5 * t * t;
    return [fx - dir[0] * len * (t - 0.35) + normal[0] * sway, fy - dir[1] * len * (t - 0.35) + normal[1] * sway];
  });
  const thick = (t) => (t < 0.85 ? 3.8 * size * Math.sin(Math.PI * Math.min(1, (t + 0.08) / 0.95)) + 0.6 : 0);
  const fish = new Canvas(HERON_SIZE, HERON_SIZE).fill((x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let best = Infinity;
    let bt = 0;
    let side = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const d = segmentDistance(px, py, line[i], line[i + 1]);
      if (d < best) {
        best = d;
        bt = i / 12;
        const tx = line[i + 1][0] - line[i][0];
        const ty = line[i + 1][1] - line[i][1];
        side = (px - line[i][0]) * -ty + (py - line[i][1]) * tx;
      }
    }
    const w = thick(bt);
    if (best < w) {
      if (side > w * 0.35) return '#c9761f';
      if (side < -w * 0.4) return '#f8dd8a';
      return (Math.floor(bt * 9) & 1) === 0 ? '#eaa23a' : '#e3952f';
    }
    // Tail fin: a fan at the end of the body
    if (bt > 0.82) {
      const end = line[line.length - 1];
      if (Math.hypot(px - end[0], py - end[1]) < 4.5 * size && best < 2.2 + (bt - 0.82) * 14 * size) return '#b5561a';
    }
    // Dorsal fin
    if (bt > 0.3 && bt < 0.55 && side > 0 && best < w + 2 * size && best >= w) return '#b5561a';
    return null;
  });
  canvas.draw(fish.outline('#5a2f12', 0));
  const eye = line[1];
  canvas.set(Math.round(eye[0] + normal[0]), Math.round(eye[1] + normal[1]), '#111111');
}

// --- Effects drawn on top of a frame ---

/** Light rings around the legs where they enter the water. */
export function drawRipples(canvas, xs, step) {
  for (const cx of xs) {
    for (const [r, color] of [
      [3 + (step % 4) * 1.6, C.water],
      [6 + ((step + 2) % 4) * 1.6, C.waterDark],
    ]) {
      for (let x = 0; x < HERON_SIZE; x++) {
        for (let y = WADE_LINE - 2; y <= WADE_LINE + 1; y++) {
          const d = ((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - WADE_LINE) / (r * 0.28)) ** 2;
          if (d > 0.7 && d <= 1.05 && !canvas.isSet(x, y)) canvas.set(x, y, color);
        }
      }
    }
  }
}

/** Water thrown up where the beak hits the water. */
export function drawStrikeSplash(canvas, cx, step) {
  const splash = new Canvas(HERON_SIZE, HERON_SIZE);
  const heights = [3, 7, 9, 5, 2][step] ?? 0;
  [-6, -3, 0, 3, 6].forEach((dx, i) => {
    const h = Math.round(heights * [0.6, 0.9, 1, 0.9, 0.6][i]);
    const lean = Math.sign(dx);
    for (let k = 0; k < h; k++) {
      const x = Math.round(cx + dx + (lean * k) / 3);
      splash.set(x, WADE_LINE - 1 - k, k > h - 2 ? '#ffffff' : '#bfe9fa');
      splash.set(x + 1, WADE_LINE - 1 - k, '#8fd3f2');
    }
  });
  if (step >= 1 && step <= 3) {
    for (const side of [-1, 1]) {
      const x = Math.round(cx + side * (8 + step * 3));
      const y = WADE_LINE - 6 - step * 2 + (step === 3 ? 4 : 0);
      splash.set(x, y, '#ffffff');
      splash.set(x + 1, y, '#ffffff');
      splash.set(x, y + 1, '#8fd3f2');
      splash.set(x + 1, y + 1, '#8fd3f2');
    }
  }
  canvas.draw(splash.outline('#3f93c2', 0));
}

/** Water drops shaken off a struggling fish. */
export function drawDrops(canvas, points) {
  for (const [x, y] of points) {
    canvas.set(Math.round(x), Math.round(y), '#bfe9fa');
    canvas.set(Math.round(x), Math.round(y) + 1, '#5fb6d6');
  }
}

/** A swoosh arc for kicks and wing strikes: points along a circle from a0 to a1 degrees. */
export function drawSwoosh(canvas, cx, cy, r, a0, a1) {
  const steps = Math.ceil(Math.abs(a1 - a0) / 4);
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (canvas.isSet(x, y)) continue;
    canvas.set(x, y, i > steps * 0.25 ? C.motion : C.motionCore);
    const ix = Math.round(cx + Math.cos(a) * (r - 1));
    const iy = Math.round(cy + Math.sin(a) * (r - 1));
    if (!canvas.isSet(ix, iy) && i > steps * 0.35) canvas.set(ix, iy, C.motionCore);
  }
}

/** Slanted rain and gusts of wind for the storm flight. */
export function drawStorm(canvas, frame) {
  for (let i = 0; i < 16; i++) {
    const x0 = ((i * 37 + frame * 13) % 120) - 10;
    const y0 = (i * 29 + frame * 19) % 100;
    for (let k = 0; k < 5; k++) {
      const x = Math.round(x0 - k * 0.6);
      const y = y0 + k;
      if (!canvas.isSet(x, y)) canvas.set(x, y, C.rain);
    }
  }
  for (let i = 0; i < 3; i++) {
    const y = 20 + i * 27 + ((frame + i) % 3) * 2;
    const x0 = 100 - ((frame * 9 + i * 40) % 130);
    for (let k = 0; k < 16; k++) {
      const x = x0 + k;
      const yy = Math.round(y + Math.sin(k / 3 + i) * 1.2);
      if (!canvas.isSet(x, yy)) canvas.set(x, yy, C.wind);
    }
  }
}
