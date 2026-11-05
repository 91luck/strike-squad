import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// The client is a static bundle. The multiplayer backend URL is injected at build time via VITE_WS_URL
// (see docs/DEPLOYMENT.md); with no value it falls back to same-origin /ws (single-host deployment).
//
// `vite build --mode crazygames` makes the CrazyGames build (docs/CRAZYGAMES.md):
//   - relative paths only (the portal serves the game from its own CDN folder),
//   - the CrazyGames SDK v3 script in <head>, and the platform adapter switched to it,
//   - no service worker, web manifest or host config files (the portal hosts and caches the files),
//   - the co-op server's address from crazygames.config.json (the page no longer lives next to the server).

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

interface PortalConfig {
  /** WebSocket URL of the deployed game server, e.g. wss://<worker>.workers.dev/ws */
  wsUrl: string;
}

function crazygames(outDir: string): Plugin {
  return {
    name: 'strikesquad-crazygames',
    transformIndexHtml(html) {
      return (
        html
          // The portal hosts the files: no install manifest, no home-screen icon.
          .replace(/\s*<link rel="manifest"[^>]*>/, '')
          .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
          // Relative paths only.
          .replace(/(href|src)="\/(?!\/)/g, '$1="./')
          .replace('</title>', `</title>\n    <script src="${SDK_URL}"></script>`)
      );
    },
    closeBundle() {
      // Files only the game's own Cloudflare site uses.
      for (const f of [
        'sw.js',
        '_headers',
        'manifest.webmanifest',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ])
        rmSync(join(outDir, f), { force: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const portal = mode === 'crazygames';
  const outDir = portal ? 'dist-crazygames' : 'dist';
  const cfg: PortalConfig | null = portal
    ? (JSON.parse(readFileSync(new URL('./crazygames.config.json', import.meta.url), 'utf8')) as PortalConfig)
    : null;
  const wsUrl = process.env.VITE_WS_URL || cfg?.wsUrl;
  return {
    root: '.',
    base: portal ? './' : '/',
    server: { port: 5173, host: true, fs: { allow: ['..'] } },
    preview: { port: 4173, host: true },
    build: { outDir, target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 400 },
    define: portal
      ? {
          'import.meta.env.VITE_PLATFORM': JSON.stringify('crazygames'),
          'import.meta.env.VITE_WS_URL': JSON.stringify(wsUrl),
        }
      : {},
    plugins: portal ? [crazygames(outDir)] : [],
  };
});
