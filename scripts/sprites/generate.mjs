// Draws Petty's own pixel art (birds, trees, pond) and writes the frames to src/assets/sprites.
// Usage: npm run sprites (then npm run generate to refresh the catalog)

import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BIRDS, drawBird, drawSplash } from './birds.mjs';
import { drawPond, drawTree, TREES } from './scenery.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SPRITES_DIR = path.join(ROOT, 'src', 'assets', 'sprites');

// --- Poses ---

const STAND = { x: 24, y: 38 };
const FLY = { x: 25, y: 33 };

/** Standing or perched, looking around. */
function idleFrames(bird) {
  const base = { ...STAND, angle: bird.stance, headTilt: -bird.stance * 0.7 };
  return [
    base,
    base,
    { ...base, blink: true },
    base,
    { ...base, headTilt: base.headTilt - 12, head: [-0.5, -0.5] },
    { ...base, headTilt: base.headTilt - 12, head: [-0.5, -0.5] },
    base,
    { ...base, tail: -14 },
    { ...base, tail: -6 },
    base,
  ];
}

/** Small hops along the ground. */
function hopFrames(bird) {
  const base = { ...STAND, angle: bird.stance + 4, headTilt: -bird.stance * 0.7 };
  return [
    { ...base, y: base.y + 1, legs: 2 },
    { ...base, y: base.y - 2 },
    { ...base, y: base.y - 5, legs: 3, tail: -6 },
    { ...base, y: base.y - 4, legs: 3, tail: -4 },
    { ...base, y: base.y + 1, legs: 2 },
    base,
  ];
}

/** Pecking at the ground. */
function peckFrames(bird) {
  const base = { ...STAND, angle: bird.stance, headTilt: -bird.stance * 0.7 };
  return [
    base,
    { ...base, angle: 12, headTilt: 10, y: base.y + 1 },
    { ...base, angle: 34, headTilt: 30, head: [0.5, 1.5], y: base.y + 2, tail: -8 },
    { ...base, angle: 30, headTilt: 26, head: [0.5, 1], y: base.y + 2, tail: -8 },
    { ...base, angle: 12, headTilt: 10, y: base.y + 1 },
    { ...base, blink: true },
  ];
}

/** A singing bird: head up, beak opening, notes floating away. */
function singFrames(bird) {
  const base = { ...STAND, angle: bird.stance - 6, headTilt: -bird.stance * 0.7 - 14 };
  return [0, 1, 2, 3, 4, 5].map((i) => ({ ...base, beakOpen: i % 2 === 1, note: i }));
}

/** One wing beat. `phi` angles go up, down and back up. */
const FLAP = [-75, -45, -5, 40, 55, 20, -35];
function flyFrames(bird, extra = {}) {
  return FLAP.map((phi, i) => ({
    ...FLY,
    y: FLY.y + [0, 0, 1, 1, 0, -1, -1][i],
    angle: -4,
    wing: phi,
    farWing: phi - 12,
    legs: 'tuck',
    ...extra,
  }));
}

/** Picked up by the mouse: flapping in a panic. */
function dragFrames() {
  return [-80, 45, -60, 55].map((phi, i) => ({
    ...FLY,
    angle: -22,
    wing: phi,
    farWing: phi - 15,
    legs: 'dangle',
    beakOpen: i % 2 === 0,
    tail: 10,
  }));
}

/** Kingfisher: hovering high over the water, looking down. */
function hoverFrames() {
  return [-70, -10, 50, -10].map((phi, i) => ({
    x: 25,
    y: 30 + (i === 2 ? 1 : 0),
    angle: -48,
    headTilt: 70,
    wing: phi,
    farWing: phi - 10,
    legs: 'tuck',
    tail: 18,
  }));
}

/** Kingfisher: wings tucked, beak first. */
function diveFrames() {
  return [0, 1].map((i) => ({ x: 25, y: 26, angle: 78, headTilt: 0, wing: 'folded', legs: 'tuck', tail: i ? 6 : -6 }));
}

/** Kingfisher: hitting the water. The water line is row 40 of the sprite. */
export const WATERLINE = 40;
function splashFrames() {
  return [32, 39, 45, 45, 45].map((y, i) => ({
    x: 25,
    y,
    angle: 78,
    wing: 'folded',
    legs: 'tuck',
    waterline: WATERLINE,
    splash: i,
  }));
}

/** Kingfisher: eating a fish on its perch. */
function eatFishFrames(bird) {
  const base = { ...STAND, angle: bird.stance, headTilt: -bird.stance * 0.7, fish: 'beak' };
  return [
    base,
    { ...base, headTilt: base.headTilt + 12 },
    base,
    { ...base, headTilt: base.headTilt + 12 },
    { ...base, headTilt: base.headTilt - 30, head: [-0.5, -1], fish: 'swallow' },
    { ...base, headTilt: base.headTilt - 30, head: [-0.5, -1], fish: null, blink: true },
    { ...base, fish: null },
    { ...base, fish: null, blink: true },
    { ...base, fish: null },
  ];
}

const NOTE = ['..##', '..#.#', '..#', '###', '###'];

function render(bird, pose) {
  const canvas = drawBird(bird, pose);
  if (pose.splash !== undefined) drawSplash(canvas, WATERLINE, pose.splash);
  if (pose.note !== undefined) {
    // A music note drifting up and away from the beak
    const nx = 34 + pose.note;
    const ny = 22 - pose.note * 2;
    NOTE.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && canvas.set(nx + dx, ny + dy, '#3b3550')));
  }
  return canvas;
}

/** Repeats every pose `times` times, so slow moves can share the species' fps with fast ones. */
const hold = (poses, times) => poses.flatMap((pose) => Array(times).fill(pose));

// Birds play at 12 fps: a wing beat takes about half a second
function birdAnimations(bird, { fisher = false } = {}) {
  const animations = {
    front: hold(idleFrames(bird), 3),
    walk: hopFrames(bird),
    fly: flyFrames(bird),
    drag: dragFrames(bird),
  };
  if (fisher) {
    Object.assign(animations, {
      eat: hold(eatFishFrames(bird), 3),
      hover: hoverFrames(bird),
      dive: diveFrames(bird),
      splash: hold(splashFrames(bird), 2),
      fly_fish: flyFrames(bird, { fish: 'beak' }),
    });
  } else {
    Object.assign(animations, { eat: hold(peckFrames(bird), 2), sing: hold(singFrames(bird), 2) });
  }
  return Object.fromEntries(Object.entries(animations).map(([id, poses]) => [id, poses.map((p) => render(bird, p))]));
}

// --- Output ---

const SPECIES = {
  sparrow: birdAnimations(BIRDS.sparrow),
  robin: birdAnimations(BIRDS.robin),
  bluebird: birdAnimations(BIRDS.bluebird),
  kingfisher: birdAnimations(BIRDS.kingfisher, { fisher: true }),
  tree_oak: { front: [0, 1, 0, -1].map((sway) => drawTree(TREES.oak, sway)) },
  tree_cherry: { front: [0, 1, 0, -1].map((sway) => drawTree(TREES.cherry, sway)) },
  pond: { front: [0, 1, 2, 3, 4, 5, 6, 7].map((frame) => drawPond(frame)) },
};

const existing = await readdir(SPRITES_DIR);
let written = 0;
for (const [id, animations] of Object.entries(SPECIES)) {
  // Remove old frames first, so a shorter animation does not keep stale extra frames
  const prefix = new RegExp(`^${id}_[a-z_]+-\\d+\\.png$`);
  await Promise.all(existing.filter((f) => prefix.test(f)).map((f) => rm(path.join(SPRITES_DIR, f))));
  for (const [animation, frames] of Object.entries(animations)) {
    await Promise.all(
      frames.map((canvas, i) => writeFile(path.join(SPRITES_DIR, `${id}_${animation}-${i}.png`), canvas.toPng())),
    );
    written += frames.length;
  }
}
console.log(`Wrote ${written} frames for ${Object.keys(SPECIES).join(', ')}.`);
