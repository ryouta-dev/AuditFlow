import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const basePath = process.env.NEXT_PUBLIC_AUDITFLOW_BASE_PATH ?? '/AuditFlow';
if (!/^\/[a-z\d_.-]+$/i.test(basePath)) throw new Error('Invalid Pages path');
process.env.NEXT_PUBLIC_AUDITFLOW_BASE_PATH = basePath;

const require = createRequire(import.meta.url);
const build = spawnSync(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'build'],
  {
    stdio: 'inherit',
  },
);
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// Publish the prerendered workspace shell. API routes stay in the server build.
const output = resolve('out-pages');
await rm(output, { recursive: true, force: true });
await mkdir(output);
await Promise.all([
  copyFile('.next-pages/server/app/index.html', resolve(output, 'index.html')),
  cp('.next-pages/static', resolve(output, '_next/static'), {
    recursive: true,
  }),
  ...['icon.svg', 'icon-192.png', 'icon-512.png'].map((file) =>
    copyFile(resolve('public', file), resolve(output, file)),
  ),
  writeFile(resolve(output, '.nojekyll'), ''),
]);

const manifest = JSON.parse(
  await readFile('public/manifest.webmanifest', 'utf8'),
);
manifest.id = manifest.start_url = manifest.scope = `${basePath}/`;
for (const icon of manifest.icons) icon.src = basePath + icon.src;
await writeFile(
  resolve(output, 'manifest.webmanifest'),
  JSON.stringify(manifest),
);
await import('./build-sw.mjs');
