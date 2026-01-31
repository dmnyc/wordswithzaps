import type { GameState, PlayerRack } from "./game";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  lud16?: string; // Lightning address
  lud06?: string; // LNURL
}

export interface GameEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30078;
  tags: string[][];
  content: string; // encrypted GameState JSON
  sig: string;
}

export interface RackEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30078;
  tags: string[][];
  content: string; // encrypted PlayerRack JSON
  sig: string;
}

export interface DecryptedGameEvent {
  event: GameEvent;
  state: GameState;
}

export interface DecryptedRackEvent {
  event: RackEvent;
  rack: PlayerRack;
}

export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "wordswithzaps_v1_";
export const RACK_D_TAG_PREFIX = "wordswithzaps_rack_";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];
