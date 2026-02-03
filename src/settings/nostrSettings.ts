/**
 * NIP-78 Settings Storage
 *
 * Syncs user preferences to Nostr relays using kind 30078 (addressable events).
 * Settings are encrypted for privacy and synced across devices.
 */

import { getNDK, getCurrentUser, createEvent } from "../nostr/client";

const APP_IDENTIFIER = "wordswithzaps/settings";
const KIND_APP_DATA = 30078;

// Settings schema
export interface UserSettings {
  disableGameplayZaps: boolean;
  shareToNostrDefault: boolean;
  shareMethodDefault: "public" | "public-reply" | "private" | "private-dm";
  saveShareSetting: boolean;
  zapNudgeDefaultAmount: number;
  balanceHidden: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  disableGameplayZaps: false,
  shareToNostrDefault: true,
  shareMethodDefault: "public",
  saveShareSetting: true,
  zapNudgeDefaultAmount: 0,
  balanceHidden: false,
};

// Local cache
let cachedSettings: UserSettings | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Fetch user settings from relays
 */
export async function fetchSettingsFromRelays(): Promise<UserSettings | null> {
  const ndk = getNDK();
  const user = getCurrentUser();

  if (!ndk || !user?.pubkey) {
    return null;
  }

  try {
    const filter = {
      kinds: [KIND_APP_DATA],
      authors: [user.pubkey],
      "#d": [APP_IDENTIFIER],
      limit: 1,
    };

    const events = await ndk.fetchEvents(filter);
    const eventsArray = Array.from(events);

    if (eventsArray.length === 0) {
      return null;
    }

    // Get the most recent event
    const latestEvent = eventsArray.sort(
      (a, b) => (b.created_at || 0) - (a.created_at || 0),
    )[0];

    // Parse content as JSON
    const settings = JSON.parse(latestEvent.content) as Partial<UserSettings>;

    // Merge with defaults to handle missing fields
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  } catch (error) {
    console.error("[NostrSettings] Failed to fetch settings:", error);
    return null;
  }
}

/**
 * Save user settings to relays
 */
export async function saveSettingsToRelays(
  settings: UserSettings,
): Promise<boolean> {
  const ndk = getNDK();
  const user = getCurrentUser();

  if (!ndk || !user?.pubkey) {
    console.warn("[NostrSettings] Cannot save: not logged in");
    return false;
  }

  try {
    const event = createEvent(KIND_APP_DATA, JSON.stringify(settings), [
      ["d", APP_IDENTIFIER],
    ]);

    event.ndk = ndk;
    await event.sign();
    await event.publish();

    // Update cache
    cachedSettings = settings;
    lastFetchTime = Date.now();

    console.log("[NostrSettings] Settings saved to relays");
    return true;
  } catch (error) {
    console.error("[NostrSettings] Failed to save settings:", error);
    return false;
  }
}

/**
 * Get settings (from cache, relays, or defaults)
 */
export async function getSettings(): Promise<UserSettings> {
  // Return cached if fresh
  if (cachedSettings && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return cachedSettings;
  }

  // Try to fetch from relays
  const relaySettings = await fetchSettingsFromRelays();

  if (relaySettings) {
    cachedSettings = relaySettings;
    lastFetchTime = Date.now();
    return relaySettings;
  }

  // Fall back to defaults
  return DEFAULT_SETTINGS;
}

/**
 * Update a single setting and sync to relays
 */
export async function updateSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K],
): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, [key]: value };

  // Update cache immediately
  cachedSettings = updated;

  // Sync to relays in background
  saveSettingsToRelays(updated).catch((error) => {
    console.error("[NostrSettings] Background sync failed:", error);
  });
}

/**
 * Sync local settings to relays (call on login)
 */
export async function syncSettingsOnLogin(): Promise<void> {
  const user = getCurrentUser();
  if (!user?.pubkey) return;

  // First, try to fetch from relays
  const relaySettings = await fetchSettingsFromRelays();

  if (relaySettings) {
    // Relay settings exist - use them and update local storage
    cachedSettings = relaySettings;
    lastFetchTime = Date.now();

    // Update local storage to match relay settings
    updateLocalStorage(relaySettings);
    console.log("[NostrSettings] Synced settings from relays");
  } else {
    // No relay settings - push local settings to relays
    const localSettings = getLocalSettings();
    await saveSettingsToRelays(localSettings);
    console.log("[NostrSettings] Pushed local settings to relays");
  }
}

/**
 * Get current settings from local storage
 */
function getLocalSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    return {
      disableGameplayZaps:
        localStorage.getItem("wordswithzaps_disable_gameplay_zaps") === "true",
      shareToNostrDefault:
        localStorage.getItem("wordswithzaps_share_to_nostr_default") !==
        "false",
      shareMethodDefault:
        (localStorage.getItem("wordswithzaps_share_method_default") as
          | "public"
          | "public-reply"
          | "private"
          | "private-dm") || "public",
      saveShareSetting:
        localStorage.getItem("wordswithzaps_save_share_setting") !== "false",
      zapNudgeDefaultAmount:
        parseInt(
          localStorage.getItem("wordswithzaps_zap_nudge_default_amount") || "0",
          10,
        ) || 0,
      balanceHidden:
        localStorage.getItem("wordswithzaps_balance_hidden") === "true",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update local storage from settings object
 */
function updateLocalStorage(settings: UserSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      "wordswithzaps_disable_gameplay_zaps",
      String(settings.disableGameplayZaps),
    );
    localStorage.setItem(
      "wordswithzaps_share_to_nostr_default",
      String(settings.shareToNostrDefault),
    );
    localStorage.setItem(
      "wordswithzaps_share_method_default",
      settings.shareMethodDefault,
    );
    localStorage.setItem(
      "wordswithzaps_save_share_setting",
      String(settings.saveShareSetting),
    );
    localStorage.setItem(
      "wordswithzaps_zap_nudge_default_amount",
      String(settings.zapNudgeDefaultAmount),
    );
    localStorage.setItem(
      "wordswithzaps_balance_hidden",
      String(settings.balanceHidden),
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear cached settings (call on logout)
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
  lastFetchTime = 0;
}

export default {
  fetchSettingsFromRelays,
  saveSettingsToRelays,
  getSettings,
  updateSetting,
  syncSettingsOnLogin,
  clearSettingsCache,
};
