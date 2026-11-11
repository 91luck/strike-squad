/**
 * Phone-browser helpers: fullscreen + landscape lock where the browser allows it (Android Chrome, Samsung
 * Internet, Firefox Android), and honest fallbacks where it does not (iPhone Safari has no element fullscreen).
 * Every call must come from a user gesture (tap); browsers refuse otherwise.
 */

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

let portalDevice: 'desktop' | 'tablet' | 'mobile' | null = null;

/** The portal's word on the device (see Platform.device): it overrides the game's own guess. */
export function setPortalDevice(d: 'desktop' | 'tablet' | 'mobile' | null): void {
  portalDevice = d;
}

/**
 * A phone or tablet: the portal's word if it gave one, else a guess from the browser. The guess counts a
 * coarse pointer or a touch screen; a laptop with a touch screen guesses wrong, which is why the portal's word
 * comes first.
 */
export const isTouchDevice = (): boolean =>
  portalDevice !== null
    ? portalDevice !== 'desktop'
    : matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export const isIOS = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

/** Running as an installed app (home-screen icon): no browser bars, so fullscreen is not needed. */
export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const canFullscreen = (): boolean =>
  typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false;

export const isPortrait = (): boolean => window.innerHeight > window.innerWidth;

/**
 * Best effort: fullscreen, then lock to landscape. Resolves to true when the screen ended up landscape.
 * Never throws: on unsupported browsers it simply does nothing.
 */
export async function enterLandscapeFullscreen(): Promise<boolean> {
  try {
    if (canFullscreen() && !document.fullscreenElement && !isStandalone()) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    /* refused (no gesture, iframe, browser policy) */
  }
  try {
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
  } catch {
    /* most browsers only allow locking while fullscreen; iOS never */
  }
  return !isPortrait();
}

/** On phones, try to switch to landscape fullscreen as part of the tap that starts a match. */
export function phoneMatchGesture(): void {
  if (!isTouchDevice()) return;
  void enterLandscapeFullscreen();
}
