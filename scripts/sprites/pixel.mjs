// Tiny pixel-art toolkit used to draw Petty's own sprites in code.
// Shapes are tested at each pixel center, so poses can be rotated and still stay crisp.
// No dependencies: PNG files are written with node:zlib.

import { deflateSync } from 'node:zlib';

/** Parses '#rrggbb' or '#rrggbbaa' into [r, g, b, a]. */
export function hex(color) {
  const value = color.replace('#', '');
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
}

/** Moves a color toward black (amount < 0) or white (amount > 0). */
export function shade(color, amount) {
  const [r, g, b, a] = typeof color === 'string' ? hex(color) : color;
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return [r + (target - r) * t, g + (target - g) * t, b + (target - b) * t, a].map(Math.round);
}

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x, y) {
    if (!this.inside(x, y)) return null;
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  isSet(x, y) {
    return this.inside(x, y) && this.data[(y * this.width + x) * 4 + 3] > 0;
  }

  set(x, y, color) {
    if (!color || !this.inside(x, y)) return;
    const [r, g, b, a] = typeof color === 'string' ? hex(color) : color;
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  clear(x, y) {
    if (!this.inside(x, y)) return;
    this.data.fill(0, (y * this.width + x) * 4, (y * this.width + x) * 4 + 4);
  }

  /** Calls paint(x, y) for every pixel; a returned color is written. */
  fill(paint) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const color = paint(x, y);
        if (color) this.set(x, y, color);
      }
    }
    return this;
  }

  /** Draws `src` on top of this canvas (alpha is either on or off). */
  draw(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (src.isSet(x, y)) this.set(x + dx, y + dy, src.get(x, y));
      }
    }
    return this;
  }

  /**
   * Adds a 1px outline on the outside of every shape. By default each outline pixel is a
   * darker version of the pixel it touches ("selective outline"), which reads softer than black.
   */
  outline(color = null, darken = 0.55) {
    const add = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isSet(x, y)) continue;
        const near = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].find(([nx, ny]) => this.isSet(nx, ny));
        if (near) add.push([x, y, color ?? shade(this.get(...near), -darken)]);
      }
    }
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  }

  /** Clears every pixel for which keep(x, y) is false. */
  mask(keep) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!keep(x, y)) this.clear(x, y);
      }
    }
    return this;
  }

  /** Returns a copy shifted per row: offset(y) gives the x shift (used for swaying trees). */
  shear(offset) {
    const out = new Canvas(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      const dx = offset(y);
      for (let x = 0; x < this.width; x++) {
        if (this.isSet(x, y)) out.set(x + dx, y, this.get(x, y));
      }
    }
    return out;
  }

  flipX() {
    const out = new Canvas(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isSet(x, y)) out.set(this.width - 1 - x, y, this.get(x, y));
      }
    }
    return out;
  }

  /** Scaled copy with hard pixel edges, for previews. */
  scale(factor) {
    const out = new Canvas(this.width * factor, this.height * factor);
    return out.fill((x, y) =>
      this.isSet((x / factor) | 0, (y / factor) | 0) ? this.get((x / factor) | 0, (y / factor) | 0) : null,
    );
  }

  toPng() {
    return encodePng(this.width, this.height, this.data);
  }
}

// --- Shape tests, in any coordinate space ---

export const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, y) to the segment a-b; used for thick lines such as legs and branches. */
export function segmentDistance(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * A 2D transform from canvas pixels to a shape's local space: translate to the origin,
 * then rotate by `angle` degrees (positive turns clockwise on screen).
 */
export function toLocal(originX, originY, angle) {
  const rad = (-angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return (x, y) => {
    const dx = x + 0.5 - originX;
    const dy = y + 0.5 - originY;
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  };
}

/** Rotates a local point back into canvas space (inverse of toLocal). */
export function toCanvas(originX, originY, angle) {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return ([x, y]) => [originX + x * cos - y * sin, originY + x * sin + y * cos];
}

/** Small deterministic random generator, so the art is the same on every run. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- PNG encoding ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // No filter
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
