import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const basePath = process.env.NEXT_PUBLIC_AUDITFLOW_BASE_PATH ?? '';
const buildDir = basePath ? '.next-pages' : '.next';
const staticDir = resolve(buildDir, 'static');
const files = (
  await readdir(staticDir, { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile() && !entry.name.endsWith('.map'))
  .map(
    (entry) =>
      `/_next/static/${relative(staticDir, resolve(entry.parentPath, entry.name)).split(sep).join('/')}`,
  )
  .sort();
const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const build = await readFile(resolve(buildDir, 'BUILD_ID'), 'utf8');
const cache = `auditflow-shell-${createHash('sha256')
  .update(build + source + basePath + files.join(','))
  .digest('hex')
  .slice(0, 14)}`;
const precache = [
  '/',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  ...files,
].map((path) => basePath + path);
await writeFile(
  basePath ? 'out-pages/sw.js' : 'public/sw.js',
  `const cacheName = ${JSON.stringify(cache)};\nconst paths = ${JSON.stringify(precache)};\n${source}`,
);
console.log(`Prepared offline shell with ${precache.length} assets.`);
