import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const files = (
  await readdir('.next/static', { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile() && !entry.name.endsWith('.map'))
  .map(
    (entry) =>
      `/_next/static/${relative('.next/static', resolve(entry.parentPath, entry.name)).split(sep).join('/')}`,
  )
  .sort();
const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const build = await readFile('.next/BUILD_ID', 'utf8');
const cache = `auditflow-shell-${createHash('sha256')
  .update(build + source + files.join(','))
  .digest('hex')
  .slice(0, 14)}`;
const precache = [
  '/',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  ...files,
];
await writeFile(
  'public/sw.js',
  `const cacheName = ${JSON.stringify(cache)};\nconst paths = ${JSON.stringify(precache)};\n${source}`,
);
console.log(`Prepared offline shell with ${precache.length} assets.`);
