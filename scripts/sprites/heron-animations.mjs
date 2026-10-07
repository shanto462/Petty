// Every animation of the heron, as lists of poses for drawHeron (see heron.mjs).
// Poses repeat with hold() so slow moves and quick ones can share the species' 10 fps.

import { drawDrops, drawHeron, drawRipples, drawStorm, drawStrikeSplash, drawSwoosh, WADE_LINE } from './heron.mjs';

const hold = (frames, times) => Array(times).fill(frames).flat();

// --- Base poses ---

const STAND = {
  body: [46, 58, -14],
  neck: [
    [6, -10],
    [-8, -16],
    [3, -30],
  ],
  headAngle: 0,
  legs: [{ foot: [50, 98] }, { foot: [43, 98] }],
  wing: 'folded',
};

const with_ = (pose, changes) => ({ ...pose, ...changes });

// The heron's crane stance: up on one leg, wings raised, the other foot tucked up
const STANCE = with_(STAND, {
  body: [46, 58, -25],
  neck: [
    [3, -8],
    [-2, -16],
    [4, -24],
  ],
  headAngle: -10,
  legs: [{ foot: [58, 70], bend: -1, toes: 70 }, { foot: [44, 98] }],
  wing: { phi: -58, reach: 38 },
  farWing: { phi: -128, reach: 36 },
});

const BOW = with_(STAND, {
  body: [46, 60, 22],
  neck: [
    [8, -2],
    [12, -4],
    [17, -6],
  ],
  headAngle: 45,
  hat: { tilt: 20 },
});

const WADE = with_(STAND, {
  body: [46, 58, -10],
  neck: [
    [8, -2],
    [2, -10],
    [10, -10],
  ],
  headAngle: 25,
  waterline: WADE_LINE,
});

// --- Animations ---

function idle() {
  const lookUp = with_(STAND, {
    neck: [
      [6, -10],
      [-8, -16],
      [2, -31],
    ],
    headAngle: -14,
  });
  const tall = with_(STAND, {
    neck: [
      [4, -12],
      [-5, -21],
      [3, -34],
    ],
  });
  // A wing comes up to straighten the hat
  const tip = (tilt) => with_(STAND, { wing: { phi: -112, reach: 36, width: 9 }, hat: { tilt } });
  return [
    ...hold([STAND], 8),
    ...hold([with_(STAND, { blink: true })], 2),
    ...hold([STAND], 6),
    ...hold([lookUp], 6),
    ...hold([STAND], 4),
    ...hold([tall], 6),
    ...hold([STAND], 4),
    ...hold([tip(10)], 3),
    ...hold([tip(-6)], 3),
    ...hold([tip(0)], 2),
    ...hold([STAND], 6),
  ];
}

/** A slow stride: the planted foot slides back while the other steps forward; the head bobs. */
function walk() {
  const feet = [
    [57, 98],
    [53, 98],
    [49, 98],
    [45, 98],
    [46, 95],
    [51, 91],
    [56, 92],
    [58, 96],
  ];
  return feet.map((near, i) => {
    const far = feet[(i + 4) % 8];
    const bob = [0, -0.5, -1, -0.5, 0, -0.5, -1, -0.5][i];
    const reach = [2, 1, 0, -1, 2, 1, 0, -1][i];
    return with_(STAND, {
      body: [46, 58 + bob, -14],
      neck: [
        [6, -10],
        [-8, -16],
        [3 + reach, -30],
      ],
      legs: [{ foot: near }, { foot: [far[0] - 4, far[1]] }],
    });
  });
}

const FLAP = [-80, -55, -25, 10, 45, 55, 30, -30];
const reachFor = (phi) => 40 * (0.62 + 0.38 * Math.abs(Math.sin((phi * Math.PI) / 180)));

/** Flight: neck pulled back, legs trailing behind, long slow wing beats. */
function fly() {
  return FLAP.map((phi, i) => ({
    body: [48, 50 + [0, 0, 1, 1, 0, -1, -1, 0][i], 0],
    neck: [
      [6, 2],
      [2, -6],
      [7, -5],
    ],
    headAngle: 0,
    legs: [
      { foot: [8, 57], toes: 180 },
      { foot: [10, 55], toes: 180 },
    ],
    wing: { phi, reach: reachFor(phi) },
    farWing: { phi: phi - 10, reach: reachFor(phi) - 2 },
  }));
}

/** Flying in a storm: shaken by gusts, hat blown back, rain and wind all around. */
function storm() {
  const flaps = [-95, -45, 15, 60, 25, -20, -70, -100];
  return flaps.map((phi, i) => ({
    body: [48, 50 + [0, 2, 1, -1, -2, 0, 2, 1][i], -10 + [0, 4, -3, 2, -4, 3, 0, -2][i]],
    neck: [
      [6, 2],
      [2, -6],
      [7, -5],
    ],
    headAngle: [0, -4, 3, 0, -3, 2, 0, -2][i],
    beakOpen: i === 2 || i === 3 ? 0.6 : 0,
    legs: [
      { foot: [8, 60], toes: 180 },
      { foot: [10, 58], toes: 180 },
    ],
    wing: { phi, reach: reachFor(phi) },
    farWing: { phi: phi - 14, reach: reachFor(phi) - 3 },
    hat: { tilt: -24 + (i % 2) * 6, back: 1.5, lift: 1 },
    crestLift: -1.5,
    effects: (canvas) => drawStorm(canvas, i),
  }));
}

/** Picked up: wings flapping wildly, legs dangling, hat askew. */
function drag() {
  return [-100, 40, -70, 60].map((phi, i) => ({
    body: [50, 46, -30],
    neck: [
      [4, -6],
      [-2, -12],
      [4, -20],
    ],
    headAngle: -20,
    beakOpen: i % 2 ? 0 : 1,
    legs: [{ foot: [48, 94] }, { foot: [42, 95] }],
    wing: { phi, reach: reachFor(phi) },
    farWing: { phi: phi - 20, reach: reachFor(phi) - 2 },
    hat: { tilt: i % 2 ? 14 : -14 },
  }));
}

/** A short crane-style form: bow, stance, kick, wing strike, stance, bow. */
function kungfu() {
  const prep = with_(STAND, {
    legs: [{ foot: [54, 86], bend: -1, toes: 60 }, { foot: [43, 98] }],
    wing: { phi: -70, reach: 30 },
    farWing: { phi: -110, reach: 30 },
  });
  const kick = with_(STANCE, {
    body: [44, 58, -34],
    legs: [{ foot: [82, 64], bend: -1, toes: 0 }, { foot: [42, 98] }],
    wing: { phi: -18, reach: 36 },
    farWing: { phi: -40, reach: 34 },
    effects: (canvas) => drawSwoosh(canvas, 50, 64, 31, -70, 10),
  });
  const kickHold = with_(kick, { effects: (canvas) => drawSwoosh(canvas, 50, 64, 31, -25, 10) });
  const strike = with_(STAND, {
    body: [48, 59, 6],
    neck: [
      [8, -8],
      [0, -14],
      [9, -26],
    ],
    headAngle: 5,
    legs: [{ foot: [60, 98] }, { foot: [35, 98] }],
    wing: { phi: 178, reach: 38 },
    farWing: { phi: -100, reach: 34 },
    effects: (canvas) => drawSwoosh(canvas, 56, 50, 34, -50, 40),
  });
  const strikeHold = with_(strike, { effects: (canvas) => drawSwoosh(canvas, 56, 50, 34, 0, 40) });
  return [
    ...hold([BOW], 8),
    ...hold([STAND], 3),
    ...hold([prep], 3),
    ...hold([STANCE], 10),
    ...hold([kick], 3),
    ...hold([kickHold], 2),
    ...hold([STANCE], 4),
    ...hold([strike], 3),
    ...hold([strikeHold], 3),
    ...hold([STANCE], 6),
    ...hold([STAND], 2),
    ...hold([BOW], 8),
    ...hold([STAND], 3),
  ];
}

/** Holding the crane stance, wobbling a little to keep balance. */
function stance() {
  return [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
    const wobble = [0, 1.5, 2.5, 1.5, 0, -1.5, -2.5, -1.5][i];
    const pose = with_(STANCE, {
      body: [46, 58, -25 + wobble],
      wing: { phi: -58 + wobble * 2, reach: 38 },
      farWing: { phi: -128 - wobble * 2, reach: 36 },
      blink: i === 4,
    });
    return hold([pose], 2);
  });
}

/** Standing in the water, watching for fish. */
function wade() {
  return [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
    const sway = [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5][i];
    const pose = with_(WADE, {
      neck: [
        [8, -2],
        [2, -10],
        [10 + sway, -10],
      ],
      headAngle: 25 + sway * 3,
      blink: i === 6,
      effects: (canvas) => drawRipples(canvas, [50, 39], i),
    });
    return hold([pose], 2);
  });
}

/** The strike: coil back, then the beak shoots into the water. */
function strike() {
  const coil = with_(WADE, {
    neck: [
      [7, -4],
      [0, -12],
      [6, -13],
    ],
    headAngle: 32,
  });
  const lunge = with_(WADE, {
    body: [47, 59, 2],
    neck: [
      [8, 2],
      [14, 8],
      [20, 14],
    ],
    headAngle: 50,
  });
  const inWater = (step) =>
    with_(WADE, {
      body: [48, 60, 10],
      neck: [
        [8, 4],
        [16, 12],
        [22, 22],
      ],
      headAngle: 62,
      effects: (canvas) => drawStrikeSplash(canvas, 82, step),
    });
  const ripple = (canvas) => drawRipples(canvas, [50, 39], 1);
  return [
    ...hold([with_(coil, { effects: ripple })], 4),
    with_(lunge, { effects: ripple }),
    inWater(0),
    inWater(1),
    inWater(2),
    inWater(3),
    with_(lunge, { effects: (canvas) => drawStrikeSplash(canvas, 82, 4) }),
  ];
}

/** Pulled up a big one: the fish thrashes in the beak and throws off water. */
function caught() {
  return [0.8, -0.6, 0.9, -0.8].map((bend, i) =>
    with_(WADE, {
      neck: [
        [6, -10],
        [-4, -18],
        [8, -24],
      ],
      headAngle: 8,
      fish: { bend, angle: -80 },
      wing: { phi: -40, reach: 26 },
      effects: (canvas) => {
        drawRipples(canvas, [50, 39], i);
        drawDrops(canvas, [
          [74 + bend * 6, 44 - i],
          [64 - bend * 4, 52 + i],
          [80 + bend * 3, 58],
        ]);
      },
    }),
  );
}

/** Swallowing: the fish is flipped head first, slides in, and a lump goes down the neck. */
function gulp() {
  const up = (extra) =>
    with_(WADE, {
      neck: [
        [4, -12],
        [-4, -20],
        [4, -30],
      ],
      headAngle: -62,
      ...extra,
    });
  const ripple = (i) => (canvas) => drawRipples(canvas, [50, 39], i);
  const frames = [
    up({ fish: { angle: 118, size: 1, slide: 0 }, effects: ripple(0) }),
    up({ fish: { angle: 118, size: 0.85, slide: 3 }, effects: ripple(1) }),
    up({ fish: { angle: 118, size: 0.65, slide: 6 }, effects: ripple(2) }),
    up({ fish: { angle: 118, size: 0.4, slide: 9 }, effects: ripple(3) }),
    up({ bulge: 0.95, effects: ripple(0) }),
    up({ bulge: 0.8, effects: ripple(1) }),
    with_(WADE, { bulge: 0.6, effects: ripple(2) }),
    with_(WADE, { bulge: 0.4, effects: ripple(3) }),
    with_(WADE, { bulge: 0.2, effects: ripple(0) }),
    with_(WADE, { blink: true, effects: ripple(1) }),
  ];
  return frames.flatMap((pose, i) => hold([pose], i < 4 ? 2 : i === 9 ? 6 : 2));
}

function render(pose) {
  const canvas = drawHeron(pose);
  pose.effects?.(canvas);
  return canvas;
}

export function heronAnimations() {
  const animations = {
    front: idle(),
    walk: walk(),
    fly: fly(),
    storm: storm(),
    drag: drag(),
    kungfu: kungfu(),
    stance: stance(),
    wade: wade(),
    strike: strike(),
    catch: caught(),
    gulp: gulp(),
  };
  return Object.fromEntries(Object.entries(animations).map(([id, poses]) => [id, poses.map(render)]));
}
