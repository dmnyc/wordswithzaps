const DISABLE_GAMEPLAY_ZAPS_KEY = "wordswithzaps_disable_gameplay_zaps";
const DEFAULT_DISABLE_GAMEPLAY_ZAPS = true;

type SettingsListener = () => void;
const listeners: Set<SettingsListener> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
}

export function getDisableGameplayZaps(): boolean {
  if (typeof window === "undefined") return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
  try {
    const stored = localStorage.getItem(DISABLE_GAMEPLAY_ZAPS_KEY);
    if (stored === null) return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
    return stored === "true";
  } catch {
    return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
  }
}

export function setDisableGameplayZaps(disabled: boolean): void {
  try {
    const current = getDisableGameplayZaps();
    localStorage.setItem(DISABLE_GAMEPLAY_ZAPS_KEY, String(disabled));
    if (current !== disabled) {
      notifyListeners();
    }
  } catch {
    // Ignore storage errors
  }
}

export function subscribeAppSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
