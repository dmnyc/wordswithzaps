import { useState, useCallback } from "react";
import { useGame } from "../hooks/useGame";
import { getCurrentUser } from "../nostr/client";
import "./Lobby.css";

interface LobbyProps {
  onGameStart: (gameId: string, opponentPubkey: string) => void;
}

export function Lobby({ onGameStart }: LobbyProps) {
  const [opponentInput, setOpponentInput] = useState("");
  const [joinGameId, setJoinGameId] = useState("");
  const [joinOpponent, setJoinOpponent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createGame } = useGame();
  const user = getCurrentUser();

  const handleCreateGame = useCallback(async () => {
    if (!opponentInput.trim()) {
      setError("Please enter opponent's public key");
      return;
    }

    // Basic hex pubkey validation
    const pubkey = opponentInput.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
      setError("Invalid public key format (should be 64 hex characters)");
      return;
    }

    if (pubkey === user?.pubkey) {
      setError("Cannot play against yourself");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const gameId = await createGame(pubkey);
      onGameStart(gameId, pubkey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setIsCreating(false);
    }
  }, [opponentInput, user?.pubkey, createGame, onGameStart]);

  const handleJoinGame = useCallback(() => {
    if (!joinGameId.trim() || !joinOpponent.trim()) {
      setError("Please enter both game ID and opponent pubkey");
      return;
    }

    // Basic validation
    if (!/^[a-fA-F0-9]{64}$/.test(joinOpponent.trim())) {
      setError("Invalid opponent public key format");
      return;
    }

    onGameStart(joinGameId.trim(), joinOpponent.trim());
  }, [joinGameId, joinOpponent, onGameStart]);

  return (
    <div className="lobby">
      <h1 className="lobby-title">Words With Zaps</h1>

      {user && (
        <div className="your-pubkey">
          <span>Your pubkey:</span>
          <code>{user.pubkey}</code>
          <button
            className="copy-btn"
            onClick={() => navigator.clipboard.writeText(user.pubkey)}
          >
            Copy
          </button>
        </div>
      )}

      {error && <div className="lobby-error">{error}</div>}

      <div className="lobby-sections">
        <div className="lobby-section">
          <h2>Create New Game</h2>
          <p className="section-desc">Challenge someone to a game</p>

          <input
            type="text"
            placeholder="Opponent's public key (hex)"
            value={opponentInput}
            onChange={(e) => setOpponentInput(e.target.value)}
            className="lobby-input"
          />

          <button
            className="lobby-btn primary"
            onClick={handleCreateGame}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Game"}
          </button>
        </div>

        <div className="lobby-divider">
          <span>or</span>
        </div>

        <div className="lobby-section">
          <h2>Join Existing Game</h2>
          <p className="section-desc">Enter game details shared by opponent</p>

          <input
            type="text"
            placeholder="Game ID (UUID)"
            value={joinGameId}
            onChange={(e) => setJoinGameId(e.target.value)}
            className="lobby-input"
          />

          <input
            type="text"
            placeholder="Opponent's public key (hex)"
            value={joinOpponent}
            onChange={(e) => setJoinOpponent(e.target.value)}
            className="lobby-input"
          />

          <button className="lobby-btn secondary" onClick={handleJoinGame}>
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}

export default Lobby;
