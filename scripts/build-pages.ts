import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
await execute(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/build-demo.ts'], { windowsHide: true });
await execute(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { windowsHide: true });
const directory = `public-dist/pages-${Date.now()}`; await mkdir(`${directory}/demo`, { recursive: true });
for (const name of ['assets', 'font-licenses', 'demo-data.json', 'demo-proof.json', 'demo-videos.json', 'launch-preview.json', 'favicon.svg']) {
  await cp(`web-dist/${name}`, `${directory}/${name}`, { recursive: true });
}
const home = await readFile('web-dist/home.html', 'utf8'), desk = await readFile('web-dist/index.html', 'utf8'), overlay = await readFile('web-dist/overlay.html', 'utf8');
await writeFile(`${directory}/index.html`, home);
for (const page of ['index', 'library', 'settings', 'receipt-shell']) await writeFile(`${directory}/demo/${page}.html`, desk);
await writeFile(`${directory}/demo/overlay.html`, overlay);
await writeFile(`${directory}/_redirects`, '/demo/r/* /demo/receipt-shell.html 200\n');
await writeFile(`${directory}/_headers`, `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: no-store
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self' https://clips.twitch.tv; object-src 'none'; base-uri 'none'; frame-ancestors 'self'
`);
await writeFile(`${directory}/404.html`, '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page unavailable | Chat Is This Real</title><body><main><h1>This page is unavailable.</h1><p><a href="/demo/">Open the recorded demo</a></p></main></body></html>');
async function files(path: string): Promise<string[]> {
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map((entry) => entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]))).flat().sort();
}
const paths = await files(directory);
if (paths.some((path) => /(?:^|\/)(?:functions|_worker\.js|_routes\.json|\.env|\.dev\.vars)(?:\/|$)/u.test(path))) throw new Error('A non-static entry entered the Pages build.');
const manifest = { directory, static_only: true, functions: 0, bindings: 0,
  files: await Promise.all(paths.map(async (path) => ({ path: path.slice(directory.length + 1), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))) };
await mkdir('.cache', { recursive: true }); await writeFile('.cache/pages-build.json', JSON.stringify(manifest, null, 2));
console.info(`Static-only Pages build ready: ${directory}. ${paths.length} files; no Functions or bindings.`);
