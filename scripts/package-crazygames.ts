/**
 * Packs the CrazyGames build (client/dist-crazygames, made by `npm run build:crazygames`) into
 * release/strike-squad-crazygames.zip, with index.html at the root of the zip, ready to upload in the
 * CrazyGames Developer Portal.
 *
 *   npm run package:crazygames
 *
 * Before zipping it checks the portal's limits and rules that a mistake could break (docs/CRAZYGAMES.md):
 * total size <= 250 MB and initial download <= 50 MB (20 MB for the mobile homepage), at most 1500 files,
 * relative paths only, the SDK script present, and no service worker. It exits non-zero when any check fails.
 *
 * The zip writer is a few lines of plain Node (deflate + CRC-32), so this works the same on Windows, macOS and
 * Linux with nothing extra installed.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'client', 'dist-crazygames');
const OUT_DIR = join(ROOT, 'release');
const OUT = join(OUT_DIR, 'strike-squad-crazygames.zip');

const MB = 1024 * 1024;
const LIMITS = { totalBytes: 250 * MB, mobileInitialBytes: 20 * MB, files: 1500 };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- checks

const files = walk(DIST).sort();
const total = files.reduce((n, f) => n + statSync(f).size, 0);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const problems: string[] = [];
if (files.length > LIMITS.files) problems.push(`${files.length} files (limit ${LIMITS.files})`);
// Every file is part of the initial download (no lazy chunks), so the stricter mobile limit applies to the total.
if (total > LIMITS.mobileInitialBytes) problems.push(`${(total / MB).toFixed(1)} MB (mobile limit 20 MB)`);
if (/\s(src|href)="\/(?!\/)/.test(html)) problems.push('index.html uses an absolute path (must be relative)');
if (!html.includes('sdk.crazygames.com/crazygames-sdk-v3.js'))
  problems.push('the CrazyGames SDK script is missing');
if (files.some((f) => f.endsWith('sw.js'))) problems.push('a service worker is included');
for (const f of files.filter((x) => x.endsWith('.css'))) {
  if (/url\(\/(?!\/)/.test(readFileSync(f, 'utf8')))
    problems.push(`${relative(DIST, f)} uses an absolute url()`);
}
if (problems.length) {
  console.error('CrazyGames build check FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// ---------------------------------------------------------------- zip (store/deflate, no dependencies)

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
// Fixed timestamp (2026-01-01 00:00) so the same build always gives the same zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
for (const f of files) {
  const name = Buffer.from(relative(DIST, f).split(sep).join('/'), 'utf8');
  const data = readFileSync(f);
  const packed = deflateRawSync(data, { level: 9 });
  const useDeflate = packed.length < data.length;
  const body = useDeflate ? packed : data;
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, body);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + body.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(OUT_DIR, { recursive: true });
const zip = Buffer.concat([...locals, ...centrals, end]);
writeFileSync(OUT, zip);
console.log(
  `CrazyGames build OK: ${files.length} files, ${(total / 1024).toFixed(0)} KB unpacked, ` +
    `${(zip.length / 1024).toFixed(0)} KB zipped -> ${relative(ROOT, OUT)}`,
);
