#!/usr/bin/env node
/** Fast, dependency-free release sanity checks. This is not a substitute for CI or device QA. */
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import process from 'node:process';

const checks = [];
const pass = (name, detail = '') => checks.push({ name, ok: true, detail });
const fail = (name, detail) => checks.push({ name, ok: false, detail });
const exists = async (path) => {
  try { await access(path, constants.R_OK); return true; } catch { return false; }
};
const read = async (path) => readFile(path, 'utf8');

for (const path of ['package-lock.json', 'client/index.html', 'client/src/main.ts', 'client/src/style.css', 'wrangler.jsonc', 'cloudflare/worker.ts', 'LICENSE', 'ASSETS.md']) {
  (await exists(path)) ? pass(`Required file: ${path}`) : fail(`Required file: ${path}`, 'Missing or unreadable');
}

try {
  const html = await read('client/index.html');
  for (const [name, ok] of [
    ['Document title', /<title>STRIKE SQUAD/i.test(html)],
    ['Description metadata', /name="description"/.test(html)],
    ['Viewport metadata', /name="viewport"/.test(html)],
    ['Privacy dialog', /id="modal-privacy"/.test(html)],
    ['Keyboard skip link', /class="skip-link"/.test(html)],
  ]) ok ? pass(name) : fail(name, 'Expected markup not found');
} catch (error) { fail('HTML inspection', String(error)); }

try {
  const config = await read('wrangler.jsonc');
  for (const [name, ok] of [
    ['Durable Object binding', /"name"\s*:\s*"GAME"/.test(config)],
    ['SQLite Durable Object migration', /new_sqlite_classes/.test(config)],
    ['Static asset binding', /"binding"\s*:\s*"ASSETS"/.test(config)],
    ['WebSocket worker route', /"\/ws"/.test(config)],
  ]) ok ? pass(name) : fail(name, 'Expected Cloudflare configuration not found');
} catch (error) { fail('Cloudflare config inspection', String(error)); }

try {
  const root = JSON.parse(await read('package.json'));
  const client = JSON.parse(await read('client/package.json'));
  for (const name of ['check', 'test:e2e', 'build:crazygames', 'package:crazygames', 'audit:deps']) {
    root.scripts?.[name] ? pass(`Release command: npm run ${name}`) : fail(`Release command: npm run ${name}`, 'Script missing');
  }
  client.scripts?.build ? pass('Client production build command') : fail('Client production build command', 'Script missing');
} catch (error) { fail('Package manifest inspection', String(error)); }

console.log('\nSTRIKE SQUAD — release preflight');
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
const failed = checks.filter((item) => !item.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
if (failed) {
  console.error('Preflight failed. Fix the listed issues before release.');
  process.exitCode = 1;
} else {
  console.log('Static preflight passed. CI, browser tests, portal QA and real-device testing are still required.');
}
