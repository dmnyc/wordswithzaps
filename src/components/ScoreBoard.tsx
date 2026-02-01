import { useEffect, useState } from "react";
import { TbDoorExit } from "react-icons/tb";
import { fetchProfile } from "../nostr/profiles";
import type { NostrProfile } from "../types/nostr";
import "./ScoreBoard.css";

interface Player {
  pubkey: string;
  score: number;
  isActive: boolean;
}

interface ScoreBoardProps {
  player1: Player;
  player2: Player;
  tilesRemaining: number;
  currentUserPubkey: string;
  onShare?: () => void;
  onForfeit?: () => void;
  forfeitDisabled?: boolean;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 10) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

export function ScoreBoard({
  player1,
  player2,
  tilesRemaining,
  currentUserPubkey,
  onShare,
  onForfeit,
  forfeitDisabled = false,
}: ScoreBoardProps) {
  const [profiles, setProfiles] = useState<Record<string, NostrProfile | null>>(
    {},
  );

  useEffect(() => {
    const pubkeys = [player1.pubkey, player2.pubkey];
    pubkeys.forEach(async (pubkey) => {
      if (profiles[pubkey] !== undefined) return;
      try {
        const profile = await fetchProfile(pubkey);
        setProfiles((prev) => ({ ...prev, [pubkey]: profile }));
      } catch {
        setProfiles((prev) => ({ ...prev, [pubkey]: null }));
      }
    });
  }, [player1.pubkey, player2.pubkey, profiles]);

  const getDisplayName = (pubkey: string) => {
    if (pubkey === currentUserPubkey) return "You";
    const profile = profiles[pubkey];
    return profile?.displayName || profile?.name || truncatePubkey(pubkey);
  };

  const _isMyTurn =
    (player1.isActive && player1.pubkey === currentUserPubkey) ||
    (player2.isActive && player2.pubkey === currentUserPubkey);
  void _isMyTurn; // Reserved for turn indicator UI

  return (
    <div className="scoreboard">
      <div className={`player-score ${player1.isActive ? "active" : ""}`}>
        <span className="player-name">{getDisplayName(player1.pubkey)}</span>
        <span className="player-points">{player1.score}</span>
        {player1.isActive && player1.pubkey === currentUserPubkey && (
          <span className="turn-indicator">Your turn</span>
        )}
      </div>

      <div className="tiles-remaining" title="Tiles in bag">
        <svg
          className="tiles-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="tiles-count">{tilesRemaining}</span>
      </div>

      <div className={`player-score ${player2.isActive ? "active" : ""}`}>
        <span className="player-name">{getDisplayName(player2.pubkey)}</span>
        <span className="player-points">{player2.score}</span>
        {player2.isActive && player2.pubkey === currentUserPubkey && (
          <span className="turn-indicator">Your turn</span>
        )}
      </div>

      <div className="scoreboard-actions">
        {onShare && (
          <button
            className="share-btn"
            onClick={onShare}
            title="Copy game link"
          >
            <svg
              className="share-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        )}
        {onForfeit && (
          <button
            className="forfeit-btn"
            onClick={onForfeit}
            disabled={forfeitDisabled}
            title="Forfeit game"
          >
            <TbDoorExit className="forfeit-icon" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ScoreBoard;
