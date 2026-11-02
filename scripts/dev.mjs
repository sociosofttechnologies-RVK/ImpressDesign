// `npm run dev` — runs the web app (Vite, in this process) and the API (server/, child process) together.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'vite';

const tag = (c, s) => `\x1b[${c}m${s}\x1b[0m`;

// ---------------------------------------------------------------- API
let api = null;
function startApi() {
  const deps = Object.keys(JSON.parse(fs.readFileSync('server/package.json', 'utf8')).dependencies || {});
  const missing = deps.filter((d) => !fs.existsSync(`server/node_modules/${d}/package.json`));
  if (missing.length) {
    console.log(tag(36, '[api]'), `installing server packages (${missing.join(', ')})…`);
    const r = spawnSync('npm install', { cwd: 'server', shell: true, stdio: 'inherit' });
    if (r.status !== 0) { console.log(tag(33, '[api]'), 'npm install failed in server/ — fix the error above, then run npm run dev again.'); return; }
  }
  // Plain node (not --watch: under --watch a crashed API sits idle "waiting for file changes").
  // This launcher restarts it after a crash and when a file under server/src changes.
  api = spawn(process.execPath, ['src/index.js'], { cwd: 'server', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = (d) => String(d).split(/\r?\n/).filter((l) => l.trim()).forEach((l) => console.log(tag(36, '[api]'), l));
  api.stdout.on('data', out);
  api.stderr.on('data', out);
  api.on('exit', (code) => {
    if (stopping) return;
    if (reloading) { reloading = false; startApi(); return; }
    if (code === 2) { console.log(tag(31, '[api]'), 'not restarting — fix the problem above, then run npm run dev again.'); return; }
    // Restart after a crash (at most 5 times a minute); the error is kept in server/data/api-error.log.
    restarts = restarts.filter((t) => Date.now() - t < 60_000);
    if (restarts.length >= 5) { console.log(tag(31, '[api]'), 'crashed 5 times in a minute — not restarting. See the error above or server/data/api-error.log'); return; }
    restarts.push(Date.now());
    console.log(tag(33, '[api]'), `stopped (exit code ${code}) — restarting in 2 s…`);
    setTimeout(startApi, 2000);
  });
}
let restarts = [];
let stopping = false;
let reloading = false;

// Reload the API when its code changes.
let reloadTimer;
fs.watch('server/src', { recursive: true }, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(tag(36, '[api]'), 'code changed — restarting…');
    if (api && api.exitCode === null) { reloading = true; killApi(); } else startApi();
  }, 300);
});
const killApi = () => {
  if (!api || api.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
  else api.kill();
};

// ---------------------------------------------------------------- web
startApi();
const web = await createServer({ configFile: 'vite.config.js' });
await web.listen();
console.log(tag(35, '[web]'), 'Impress Design web app:');
web.printUrls();
web.bindCLIShortcuts({ print: true });

const stop = async () => {
  stopping = true;
  killApi();
  await web.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
