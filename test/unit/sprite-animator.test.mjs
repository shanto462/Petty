import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadScripts } from './helpers.mjs';

class FakeImage {
  async decode() {}
}

const ctx = loadScripts(['shared/config.js', 'shared/logger.js', 'content/sprite-animator.js'], {
  window: true,
  Image: FakeImage,
});

const FRAMES = { walk: 4, eat: 2, front: 3 };
const speciesManager = {
  getFrameCount: (_id, animation) => FRAMES[animation] ?? 0,
  getSpriteUrl: (id, animation, frame) => `${id}_${animation}-${frame}.png`,
};

const species = {
  fps: 10, // 100ms per frame
  movementPath: 'walk',
  dragPath: 'drag',
  animations: [{ id: 'eat', requiredLoops: 2 }, { id: 'front' }],
};

const animator = () => new ctx.SpriteAnimator('cat', species, speciesManager);

/** Advances the animator one frame at a time and returns the last result. */
function play(anim, frames, start = 1000) {
  let result = anim.update(start);
  for (let i = 1; i <= frames; i++) result = anim.update(start + i * 100);
  return result;
}

test('only requests frames that exist', async () => {
  const anim = animator();
  assert.deepEqual(
    [...(await anim.setAnimation('walk'))],
    ['cat_walk-0.png', 'cat_walk-1.png', 'cat_walk-2.png', 'cat_walk-3.png'],
  );
  assert.equal(anim.hasAnimation('drag'), false);
  assert.equal(await anim.setAnimation('drag'), null);
  assert.equal(anim.currentAnimation, 'walk');
});

test('the newest animation wins, even when an older one finishes loading later', async () => {
  const anim = animator();
  await anim.setAnimation('walk');
  const slow = anim.setAnimation('eat'); // Still loading its frames...
  const back = anim.setAnimation('walk'); // ...when the pet already went back to walking
  await Promise.all([slow, back]);
  assert.equal(anim.currentAnimation, 'walk');
});

test('the first update shows frame 0 immediately', async () => {
  const anim = animator();
  await anim.setAnimation('walk');
  assert.deepEqual({ ...anim.update(500) }, { status: 'playing', frame: 'cat_walk-0.png', frameChanged: true });
  assert.deepEqual({ ...anim.update(550) }, { status: 'playing', frameChanged: false });
  assert.equal(anim.update(600).frame, 'cat_walk-1.png');
});

test('movement animations loop forever', async () => {
  const anim = animator();
  await anim.setAnimation('walk');
  const result = play(anim, 40);
  assert.equal(result.status, 'playing');
});

test('action animations complete after requiredLoops', async () => {
  const anim = animator();
  await anim.setAnimation('eat');
  assert.equal(play(anim, 3).status, 'playing');
  const anim2 = animator();
  await anim2.setAnimation('eat');
  assert.deepEqual({ ...play(anim2, 4) }, { status: 'completed', loops: 2 });
});

test('action animations without requiredLoops play 4 times', async () => {
  const anim = animator();
  await anim.setAnimation('front');
  assert.equal(play(anim, 11).status, 'playing');
  const anim2 = animator();
  await anim2.setAnimation('front');
  assert.equal(play(anim2, 12).status, 'completed');
});

test('forced sleep loops win over requiredLoops', async () => {
  const anim = animator();
  await anim.setAnimation('eat');
  anim.setSleepLoops(1);
  assert.deepEqual({ ...play(anim, 2) }, { status: 'completed', loops: 1 });
  assert.equal(anim.forcedLoops, null);
});

test('fps is clamped to a sane range', () => {
  assert.equal(new ctx.SpriteAnimator('x', { fps: 0.01 }, speciesManager).fps, 0.1);
  assert.equal(new ctx.SpriteAnimator('x', { fps: 500 }, speciesManager).fps, 60);
});
