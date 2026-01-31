import { useState, useCallback, useEffect, useRef } from "react";
import { useGame } from "../hooks/useGame";
import { getCurrentUser, subscribeToEvents } from "../nostr/client";
import { fetchProfile, normalizePubkey } from "../nostr/profiles";
import { getGameLabel } from "../utils/gameLabel";
import {
  fetchUserGames,
  deleteGameFromLobby,
  type GameSummary,
} from "../nostr/games";
import { GAME_KIND } from "../types/nostr";
import type { NostrProfile } from "../types/nostr";
import OpponentSearch from "./OpponentSearch";
import "./Lobby.css";

interface LobbyProps {
  onGameStart: (gameId: string, opponentPubkey: string) => void;
  prefillGameId?: string | null;
  prefillError?: string | null;
}

export function Lobby({
  onGameStart,
  prefillGameId,
  prefillError,
}: LobbyProps) {
  const [opponentInput, setOpponentInput] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<NostrProfile | null>(
    null,
  );
  const [joinGameId, setJoinGameId] = useState("");
  const [joinOpponent, setJoinOpponent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [showEndedGames, setShowEndedGames] = useState(false);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, NostrProfile | null>>(
    {},
  );
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { createGame } = useGame();
  const user = getCurrentUser();

  useEffect(() => {
    if (prefillGameId && !joinGameId) {
      setJoinGameId(prefillGameId);
    }
    if (prefillError) {
      setError(prefillError);
    }
  }, [prefillGameId, prefillError, joinGameId]);

  const loadGames = useCallback(async () => {
    if (!user?.pubkey) return;
    setIsLoadingGames(true);
    setGamesError(null);
    try {
      const results = await fetchUserGames(user.pubkey);
      setGames(results);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load games";
      setGamesError(message);
    } finally {
      setIsLoadingGames(false);
    }
  }, [user?.pubkey]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      loadGames();
    }, 500);
  }, [loadGames]);

  useEffect(() => {
    if (!user?.pubkey) return;

    const subscription = subscribeToEvents(
      { kinds: [GAME_KIND], "#p": [user.pubkey] },
      () => scheduleRefresh(),
    );

    const intervalId = window.setInterval(() => {
      loadGames();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      window.clearInterval(intervalId);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [user?.pubkey, loadGames, scheduleRefresh]);

  useEffect(() => {
    if (!user?.pubkey) return;
    loadGames();
  }, [user?.pubkey, loadGames]);

  useEffect(() => {
    if (!user?.pubkey) return;
    const pubkeys = new Set<string>();
    pubkeys.add(user.pubkey);
    for (const game of games) {
      if (game.opponentPubkey) {
        pubkeys.add(game.opponentPubkey);
      } else {
        for (const player of game.players) {
          pubkeys.add(player);
        }
      }
    }

    const missing = Array.from(pubkeys).filter(
      (pubkey) => profiles[pubkey] === undefined,
    );
    if (missing.length === 0) return;

    let cancelled = false;

    const loadProfiles = async () => {
      const results = await Promise.all(
        missing.map(async (pubkey) => {
          try {
            return await fetchProfile(pubkey);
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      setProfiles((prev) => {
        const next = { ...prev };
        missing.forEach((pubkey, index) => {
          next[pubkey] = results[index];
        });
        return next;
      });
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [user?.pubkey, games, profiles]);

  const handleOpponentInputChange = (value: string) => {
    setOpponentInput(value);
    if (selectedOpponent) {
      setSelectedOpponent(null);
    }
    if (error) {
      setError(null);
    }
  };

  const handleOpponentSelect = (profile: NostrProfile) => {
    setSelectedOpponent(profile);
    if (error) {
      setError(null);
    }
  };

  const handleCreateGame = useCallback(async () => {
    const pubkey =
      selectedOpponent?.pubkey || normalizePubkey(opponentInput) || "";
    if (!pubkey) {
      setError("Select an opponent or enter a valid npub/pubkey");
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
  }, [opponentInput, selectedOpponent, user?.pubkey, createGame, onGameStart]);

  const handleJoinGame = useCallback(() => {
    if (!joinGameId.trim() || !joinOpponent.trim()) {
      setError("Please enter both game ID and opponent pubkey");
      return;
    }

    const pubkey = normalizePubkey(joinOpponent);
    if (!pubkey) {
      setError("Invalid opponent pubkey format");
      return;
    }

    if (pubkey === user?.pubkey) {
      setError("Cannot play against yourself");
      return;
    }

    onGameStart(joinGameId.trim(), pubkey);
  }, [joinGameId, joinOpponent, onGameStart, user?.pubkey]);

  const getDisplayName = (profile: NostrProfile) =>
    profile.displayName || profile.name || "Anonymous";

  const getTruncatedPubkey = (pubkey: string) =>
    `${pubkey.slice(0, 10)}...${pubkey.slice(-8)}`;

  const getTruncatedGameId = (gameId: string) =>
    `${gameId.slice(0, 8)}...${gameId.slice(-6)}`;

  const getProfileName = (pubkey: string, fallback: string) => {
    const profile = profiles[pubkey];
    return profile?.displayName || profile?.name || fallback;
  };

  const getProfilePicture = (pubkey: string) => profiles[pubkey]?.picture;

  const getInitial = (label: string) => label.charAt(0).toUpperCase();

  const formatUpdatedAt = (timestamp: number) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const getTurnLabel = (game: GameSummary) => {
    if (!game.turnIndex && game.turnIndex !== 0) return "Turn ?";
    return `Turns played: ${game.turnIndex}`;
  };

  const getActiveLabel = (game: GameSummary) => {
    if (!game.activePlayer) return "Active player unknown";
    if (game.activePlayer === user?.pubkey) return "Your turn";
    return "Opponent's turn";
  };

  const getStatusLabel = (game: GameSummary) => {
    if (!game.status) return "Status unknown";
    if (game.status === "deleted") {
      if (game.deletedBy === user?.pubkey) return "Deleted by you";
      if (game.deletedBy) return "Deleted by opponent";
      return "Deleted";
    }
    return game.status === "active"
      ? "Active"
      : game.status === "completed"
        ? "Completed"
        : "Abandoned";
  };

  const getStatusClass = (game: GameSummary) =>
    game.status ? `status-${game.status}` : "status-unknown";

  const visibleGames = showEndedGames
    ? games
    : games.filter(
        (game) =>
          game.status !== "abandoned" &&
          game.status !== "completed" &&
          game.status !== "deleted",
      );

  const handleDeleteFromLobby = useCallback(
    async (game: GameSummary) => {
      if (!user?.pubkey) return;
      if (game.creatorPubkey && game.creatorPubkey !== user.pubkey) {
        setGamesError("Only the game creator can delete this game.");
        return;
      }
      const confirmed = window.confirm(
        `Delete game ${game.gameId}? This will mark it as deleted for both players.`,
      );
      if (!confirmed) return;

      setDeletingGameId(game.gameId);
      setGamesError(null);
      try {
        await deleteGameFromLobby(game.gameId, user.pubkey);
        await loadGames();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete game";
        setGamesError(message);
      } finally {
        setDeletingGameId(null);
      }
    },
    [user?.pubkey, loadGames],
  );

  return (
    <div className="lobby">
      {error && <div className="lobby-error">{error}</div>}

      <div className="lobby-sections">
        <div className="lobby-section">
          <div className="lobby-section-header">
            <h2>Your Games</h2>
            <div className="lobby-actions">
              <button
                className="lobby-btn tiny"
                onClick={() => setShowEndedGames((prev) => !prev)}
              >
                {showEndedGames ? "Hide ended" : "Show ended"}
              </button>
              <button
                className="lobby-btn tiny"
                onClick={loadGames}
                disabled={isLoadingGames}
              >
                {isLoadingGames ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <p className="section-desc">
            Resume a game you are tagged in on relays
          </p>

          {gamesError && <div className="lobby-error">{gamesError}</div>}

          {isLoadingGames ? (
            <div className="games-empty">Loading games...</div>
          ) : visibleGames.length === 0 ? (
            <div className="games-empty">
              {games.length === 0
                ? "No games found yet."
                : "No active games. Toggle to show ended games."}
            </div>
          ) : (
            <div className="games-list">
              {visibleGames.map((game) => (
                <div key={game.gameId} className="game-row">
                  <div className="game-meta">
                    <div className="game-id">{getGameLabel(game.gameId)}</div>
                    <div className="game-id-sub">
                      ID: {getTruncatedGameId(game.gameId)}
                    </div>
                    <div className="game-players">
                      <div className="player-chip">
                        {user?.pubkey && getProfilePicture(user.pubkey) ? (
                          <img
                            src={getProfilePicture(user.pubkey)}
                            alt={getProfileName(user.pubkey, "You")}
                            className="profile-avatar small"
                            onError={(event) => {
                              (event.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
                            }}
                          />
                        ) : (
                          <div className="profile-avatar small fallback">
                            {user?.pubkey
                              ? getInitial(getProfileName(user.pubkey, "You"))
                              : "Y"}
                          </div>
                        )}
                        <div className="player-info">
                          <div className="player-name">
                            {user?.pubkey
                              ? getProfileName(user.pubkey, "You")
                              : "You"}
                          </div>
                          <div className="player-role">You</div>
                        </div>
                      </div>

                      <div className="player-chip">
                        {game.opponentPubkey &&
                        getProfilePicture(game.opponentPubkey) ? (
                          <img
                            src={getProfilePicture(game.opponentPubkey)}
                            alt={getProfileName(
                              game.opponentPubkey,
                              "Opponent",
                            )}
                            className="profile-avatar small"
                            onError={(event) => {
                              (event.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
                            }}
                          />
                        ) : (
                          <div className="profile-avatar small fallback">
                            {game.opponentPubkey
                              ? getInitial(
                                  getProfileName(
                                    game.opponentPubkey,
                                    "Opponent",
                                  ),
                                )
                              : "O"}
                          </div>
                        )}
                        <div className="player-info">
                          <div className="player-name">
                            {game.opponentPubkey
                              ? getProfileName(
                                  game.opponentPubkey,
                                  getTruncatedPubkey(game.opponentPubkey),
                                )
                              : "Opponent"}
                          </div>
                          <div className="player-role">Opponent</div>
                        </div>
                      </div>
                    </div>
                    <div className="game-updated">
                      Updated: {formatUpdatedAt(game.updatedAt)}
                    </div>
                    <div className="game-status-row">
                      <span
                        className={`game-status-badge ${getStatusClass(game)}`}
                      >
                        {getStatusLabel(game)}
                      </span>
                      <span>{getTurnLabel(game)}</span>
                      <span>{getActiveLabel(game)}</span>
                    </div>
                  </div>
                  <div className="game-actions">
                    <button
                      className="lobby-btn secondary tiny"
                      onClick={() => {
                        if (game.opponentPubkey) {
                          onGameStart(game.gameId, game.opponentPubkey);
                        } else if (game.players.length > 0) {
                          const opponent =
                            game.players.find((p) => p !== user?.pubkey) ||
                            game.players[0];
                          if (opponent) {
                            onGameStart(game.gameId, opponent);
                          }
                        }
                      }}
                      disabled={
                        (!game.opponentPubkey && game.players.length === 0) ||
                        (game.status && game.status !== "active")
                      }
                    >
                      {game.status && game.status !== "active"
                        ? "Ended"
                        : "Resume"}
                    </button>
                    {game.creatorPubkey === user?.pubkey && (
                      <button
                        className="lobby-btn danger tiny"
                        onClick={() => handleDeleteFromLobby(game)}
                        disabled={
                          deletingGameId === game.gameId ||
                          (game.status && game.status !== "active")
                        }
                      >
                        {deletingGameId === game.gameId
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lobby-section">
          <h2>Create New Game</h2>
          <p className="section-desc">Challenge someone to a game</p>

          <OpponentSearch
            value={opponentInput}
            onChange={handleOpponentInputChange}
            onSelect={handleOpponentSelect}
          />

          {selectedOpponent && (
            <div className="opponent-selected">
              {selectedOpponent.picture ? (
                <img
                  src={selectedOpponent.picture}
                  alt={getDisplayName(selectedOpponent)}
                  className="opponent-avatar"
                  onError={(event) => {
                    (event.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
                  }}
                />
              ) : (
                <div className="opponent-avatar fallback">
                  {getDisplayName(selectedOpponent).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="opponent-info">
                <div className="opponent-name">
                  {getDisplayName(selectedOpponent)}
                </div>
                {selectedOpponent.nip05 && (
                  <div className="opponent-nip05">
                    nip05: {selectedOpponent.nip05}
                  </div>
                )}
                <div className="opponent-pubkey">
                  {getTruncatedPubkey(selectedOpponent.pubkey)}
                </div>
              </div>
              <button
                type="button"
                className="opponent-clear"
                onClick={() => {
                  setSelectedOpponent(null);
                  setOpponentInput("");
                }}
              >
                Clear
              </button>
            </div>
          )}

          <button
            className="lobby-btn primary"
            onClick={handleCreateGame}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Game"}
          </button>
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
            placeholder="Opponent pubkey or npub"
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
