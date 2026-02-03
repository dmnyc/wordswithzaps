export type DecayTier = "fresh" | "stale" | "cold" | "dormant";

export const ABANDON_THRESHOLD_DAYS = 14;

const SECONDS_PER_DAY = 86400;

export interface DecayInfo {
  tier: DecayTier;
  label: string;
  ageDays: number;
}

/**
 * Compute decay tier for a game based on time since last update.
 * @param updatedAt - Unix timestamp in seconds of the last game event
 * @param now - Optional override for current time (seconds), defaults to Date.now()/1000
 */
export function getDecayTier(updatedAt: number, now?: number): DecayInfo {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  const ageDays = Math.max(0, Math.floor((currentTime - updatedAt) / SECONDS_PER_DAY));

  if (ageDays < 1) {
    return { tier: "fresh", label: "Waiting", ageDays };
  }

  if (ageDays <= 3) {
    return { tier: "stale", label: `${ageDays}d`, ageDays };
  }

  if (ageDays <= 7) {
    return { tier: "cold", label: `${ageDays}d`, ageDays };
  }

  const weeks = Math.floor(ageDays / 7);
  return { tier: "dormant", label: `${weeks}w+`, ageDays };
}

/**
 * Whether a game qualifies for abandonment declaration.
 */
export function canDeclareAbandoned(updatedAt: number, now?: number): boolean {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  const ageDays = (currentTime - updatedAt) / SECONDS_PER_DAY;
  return ageDays >= ABANDON_THRESHOLD_DAYS;
}
