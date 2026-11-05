/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full WebSocket URL of the backend, e.g. wss://strike-squad-server.example.com/ws */
  readonly VITE_WS_URL?: string;
  /** Public origin used to build invite links (defaults to window.location.origin). */
  readonly VITE_PUBLIC_ORIGIN?: string;
  /** Which platform build this is: unset for the game's own site, `crazygames` for the CrazyGames build. */
  readonly VITE_PLATFORM?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
