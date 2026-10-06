// Production build.
// Copies src/ to dist/petty/ with minified JS, CSS, HTML and JSON, stamps the
// package.json version into the manifest, checks every manifest path, and writes
// a reproducible, store-ready zip to dist/petty-<version>.zip.
//
// Usage: npm run build

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { minify as minifyCss } from 'csso';
import { zipSync } from 'fflate';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import { CATALOG_FILE, ROOT, generateCatalogSource } from './lib/catalog.mjs';
import { manifestFiles } from './lib/manifest.mjs';

const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'petty');

// Fixed timestamp so the same sources always produce a byte-identical zip
const ZIP_MTIME = new Date('2000-01-01T00:00:00Z');

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const zipPath = path.join(DIST, `petty-${pkg.version}.zip`);

function fail(message) {
  console.error(`\n[build] ${message}`);
  process.exit(1);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (!entry.name.startsWith('.')) yield full;
  }
}

async function transform(file, rel) {
  const ext = path.extname(file);
  const source = () => readFile(file, 'utf8');

  if (ext === '.js') {
    const result = await minifyJs(await source(), {
      ecma: 2022,
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false },
    });
    return result.code;
  }
  if (ext === '.css') {
    return minifyCss(await source()).css;
  }
  if (ext === '.html') {
    return minifyHtml(await source(), {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
    });
  }
  if (ext === '.json') {
    const data = JSON.parse(await source());
    if (rel === 'manifest.json') data.version = pkg.version;
    return JSON.stringify(data);
  }
  return null; // Binary or other: copy as-is
}

const started = Date.now();

if ((await readFile(CATALOG_FILE, 'utf8')) !== (await generateCatalogSource())) {
  fail('src/shared/catalog.js is out of date. Run `npm run generate` first.');
}

await rm(DIST, { recursive: true, force: true });

let sourceBytes = 0;
let outputBytes = 0;
const zipEntries = {};

for await (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  const dest = path.join(OUT, rel);
  await mkdir(path.dirname(dest), { recursive: true });

  const original = await readFile(file);
  sourceBytes += original.length;

  const transformed = await transform(file, rel);
  if (transformed === null) {
    await copyFile(file, dest);
  } else {
    await writeFile(dest, transformed);
  }

  const output = transformed === null ? original : Buffer.from(transformed);
  outputBytes += output.length;
  // PNGs are already compressed; storing them keeps the build fast
  zipEntries[rel] = [new Uint8Array(output), { level: rel.endsWith('.png') ? 0 : 9, mtime: ZIP_MTIME }];
}

// Every file the manifest points at must exist in the build
const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
const missing = manifestFiles(manifest).filter((rel) => !zipEntries[rel] && !rel.includes('*'));
if (missing.length > 0) {
  fail(`manifest.json references missing files:\n  ${missing.join('\n  ')}`);
}

const sorted = Object.fromEntries(Object.entries(zipEntries).sort(([a], [b]) => a.localeCompare(b)));
const zip = zipSync(sorted);
await writeFile(zipPath, zip);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
console.log(`[build] Petty ${pkg.version}`);
console.log(`[build] ${Object.keys(zipEntries).length} files, ${mb(sourceBytes)} -> ${mb(outputBytes)}`);
console.log(`[build] Unpacked: ${path.relative(ROOT, OUT)}/`);
console.log(`[build] Zip:      ${path.relative(ROOT, zipPath)} (${mb(zip.length)})`);
console.log(`[build] Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
