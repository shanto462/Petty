import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { manifestFiles } from '../../scripts/lib/manifest.mjs';
import { ROOT, SRC } from './helpers.mjs';

const manifest = JSON.parse(readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('manifest version matches package.json', () => {
  assert.equal(manifest.version, pkg.version);
});

test('requests only the permissions it needs', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
  assert.equal(manifest.host_permissions, undefined);
});

test('store listing text fits Chrome Web Store limits', () => {
  assert.ok(manifest.name.length <= 75);
  assert.ok(manifest.description.length <= 132);
});

test('every file the manifest references exists', () => {
  for (const file of manifestFiles(manifest)) {
    if (file.includes('*')) {
      const dir = path.join(SRC, path.dirname(file));
      assert.ok(readdirSync(dir).length > 0, `${file} matches nothing`);
    } else {
      assert.ok(existsSync(path.join(SRC, file)), `${file} is missing`);
    }
  }
});

test('every icon is the size its manifest entry says', () => {
  for (const icons of [manifest.icons, manifest.action.default_icon]) {
    assert.deepEqual(Object.keys(icons), ['16', '32', '48', '128']);
    for (const [size, file] of Object.entries(icons)) {
      const png = readFileSync(path.join(SRC, file));
      // Width and height are the first two fields of the PNG header (IHDR)
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [Number(size), Number(size)], file);
    }
  }
});

test('content scripts load the catalog and config before anything else', () => {
  const [{ js }] = manifest.content_scripts;
  assert.deepEqual(js.slice(0, 2), ['shared/catalog.js', 'shared/config.js']);
  assert.equal(js.at(-1), 'content/pet-manager.js');
});

test('the popup only loads local scripts that exist', () => {
  const html = readFileSync(path.join(SRC, 'popup', 'popup.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const src of scripts) {
    assert.doesNotMatch(src, /^https?:/, 'remote code is not allowed in Manifest V3');
    const file = src.startsWith('/') ? path.join(SRC, src) : path.join(SRC, 'popup', src);
    assert.ok(existsSync(file), `${src} is missing`);
  }
});
