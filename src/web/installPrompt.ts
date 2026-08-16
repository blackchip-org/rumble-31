// Platform detection for the Application Info screen
// (specs/screens/appinfo.md): shown on iOS/Android when the game isn't
// already running standalone (added to the home screen).

export const PLATFORMS = ["ios", "android", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

// detectPlatform classifies a User-Agent string as iOS, Android, or
// neither. iPadOS 13+ reports as a desktop Mac (Safari's default
// "Request Desktop Website" UA), so a touch-capable "Macintosh" UA
// counts as iOS too.
export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return "ios";
  }
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) {
    return "ios";
  }
  if (/Android/.test(userAgent)) {
    return "android";
  }
  return "other";
}

// INSTALL_INSTRUCTIONS is the Application Info screen's instructions
// text, per platform.
export const INSTALL_INSTRUCTIONS: Record<"ios" | "android", string> = {
  ios: 'Tap the Share icon in Safari, then "Add to Home Screen".',
  android: 'Tap the ⋮ menu in Chrome, then "Add to Home screen" (or "Install app").',
};
