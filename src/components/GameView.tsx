import { useState, useCallback, useMemo, useEffect } from "react";
import type { TilePlacement } from "../types/game";
import { useGame } from "../hooks/useGame";
import { useWallet } from "../hooks/useWallet";
import { getCurrentUser, createEvent, publishEvent } from "../nostr/client";
import Board from "./Board";
import Rack from "./Rack";
import ScoreBoard from "./ScoreBoard";
import GameControls from "./GameControls";
import BlankTilePicker from "./BlankTilePicker";
import { shuffleArray } from "../engine/constants";
import {
  getDisableGameplayZaps,
  subscribeAppSettings,
} from "../settings/appSettings";
import ZapNudgeModal from "./ZapNudgeModal";
import { nip19 } from "nostr-tools";
import { fetchProfile } from "../nostr/profiles";
import "./GameView.css";

interface GameViewProps {
  gameId: string;
  opponentPubkey: string;
  onShareGame?: (copyFn: () => void) => void;
}

export function GameView({
  gameId,
  opponentPubkey,
  onShareGame: _onShareGame,
}: GameViewProps) {
  void _onShareGame; // Reserved for share UI
  const {
    gameState,
    playerRack,
    isMyTurn,
    isLoading,
    error,
    loadGame,
    makeMove,
    pass,
    validateMove,
    deleteGame,
  } = useGame();

  const [pendingPlacements, setPendingPlacements] = useState<TilePlacement[]>(
    [],
  );
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [localRack, setLocalRack] = useState<string[]>([]);
  const [zapMessage, setZapMessage] = useState<string | null>(null);
  const [zapError, setZapError] = useState<string | null>(null);
  const [, setLinkCopied] = useState(false);
  const [pendingBlankPosition, setPendingBlankPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [zapsDisabled, setZapsDisabled] = useState(() =>
    getDisableGameplayZaps(),
  );
  const [showZapModal, setShowZapModal] = useState(false);
  const [pendingMoveSummary, setPendingMoveSummary] = useState<{
    word: string;
    points: number;
    myScore: number;
    opponentScore: number;
  } | null>(null);
  const [opponentDisplayName, setOpponentDisplayName] = useState<string | null>(
    null,
  );

  const opponentLabel = opponentDisplayName || "Opponent";
  const opponentNpub = useMemo(() => {
    if (!opponentPubkey) return "";
    try {
      return nip19.npubEncode(opponentPubkey);
    } catch {
      return opponentPubkey;
    }
  }, [opponentPubkey]);

  const user = getCurrentUser();
  const myPubkey = user?.pubkey || "";
  const isCreator = gameState?.meta.playerOne === myPubkey;
  const { zapUser, state: walletState } = useWallet();

  useEffect(() => {
    const unsubscribe = subscribeAppSettings(() => {
      setZapsDisabled(getDisableGameplayZaps());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!opponentPubkey) {
      setOpponentDisplayName(null);
      return;
    }
    fetchProfile(opponentPubkey)
      .then((profile) => {
        if (cancelled) return;
        setOpponentDisplayName(profile?.displayName || profile?.name || null);
      })
      .catch(() => {
        if (!cancelled) {
          setOpponentDisplayName(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opponentPubkey]);

  const gameLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    return url.toString();
  }, [gameId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    window.history.replaceState({}, "", url.toString());
  }, [gameId]);

  // Initialize local rack from playerRack
  useMemo(() => {
    if (playerRack.length > 0 && localRack.length === 0) {
      setLocalRack(playerRack);
    }
  }, [playerRack, localRack.length]);

  // Load game on mount
  useMemo(() => {
    if (gameId && opponentPubkey && !gameState) {
      loadGame(gameId, opponentPubkey);
    }
  }, [gameId, opponentPubkey, gameState, loadGame]);

  // Available tiles in rack (excluding placed ones)
  const availableRack = useMemo(() => {
    const used = pendingPlacements.map((p) => (p.isBlank ? "BLANK" : p.letter));
    const rack = [...localRack];
    for (const letter of used) {
      const idx = rack.indexOf(letter);
      if (idx !== -1) rack.splice(idx, 1);
    }
    return rack;
  }, [localRack, pendingPlacements]);

  // Validate current pending move
  const validation = useMemo(() => {
    if (pendingPlacements.length === 0) return null;
    return validateMove(pendingPlacements);
  }, [pendingPlacements, validateMove]);

  const handlePlaceTile = useCallback(
    (x: number, y: number) => {
      if (selectedTileIndex === null) return;
      if (!isMyTurn) return;

      const letter = availableRack[selectedTileIndex];
      if (!letter) return;

      // Check if position is already occupied
      const existing = pendingPlacements.find((p) => p.x === x && p.y === y);
      if (existing) return;

      if (gameState?.board[`${x},${y}`]) return;

      // Handle blank tiles - show letter picker
      if (letter === "BLANK") {
        setPendingBlankPosition({ x, y });
        return;
      }

      const placement: TilePlacement = {
        letter,
        x,
        y,
        isBlank: false,
      };

      setPendingPlacements((prev) => [...prev, placement]);
      setSelectedTileIndex(null);
    },
    [
      selectedTileIndex,
      availableRack,
      isMyTurn,
      pendingPlacements,
      gameState?.board,
    ],
  );

  const handleBlankLetterSelect = useCallback(
    (letter: string) => {
      if (!pendingBlankPosition) return;

      const placement: TilePlacement = {
        letter,
        x: pendingBlankPosition.x,
        y: pendingBlankPosition.y,
        isBlank: true,
      };

      setPendingPlacements((prev) => [...prev, placement]);
      setPendingBlankPosition(null);
      setSelectedTileIndex(null);
    },
    [pendingBlankPosition],
  );

  const handleBlankPickerCancel = useCallback(() => {
    setPendingBlankPosition(null);
  }, []);

  const handleRemoveTile = useCallback((x: number, y: number) => {
    setPendingPlacements((prev) => prev.filter((p) => p.x !== x || p.y !== y));
  }, []);

  const handleMoveTile = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!isMyTurn) return;
      if (fromX === toX && fromY === toY) return;
      if (gameState?.board[`${toX},${toY}`]) return;

      setPendingPlacements((prev) => {
        const movingIndex = prev.findIndex(
          (p) => p.x === fromX && p.y === fromY,
        );
        if (movingIndex === -1) return prev;
        if (prev.some((p) => p.x === toX && p.y === toY)) return prev;

        const next = [...prev];
        next[movingIndex] = { ...next[movingIndex], x: toX, y: toY };
        return next;
      });
    },
    [gameState?.board, isMyTurn],
  );

  const handlePlay = useCallback(async () => {
    if (!validation?.valid) return;

    const mainWord = validation.words?.[0] || "Your move";
    const points = validation.score ?? 0;
    const p1Score = gameState?.scoring.p1Score || 0;
    const p2Score = gameState?.scoring.p2Score || 0;
    const isPlayerOne = gameState?.meta.playerOne === myPubkey;
    const myScore = isPlayerOne ? p1Score + points : p2Score + points;
    const opponentScore = isPlayerOne ? p2Score : p1Score;

    setPendingMoveSummary({
      word: mainWord,
      points,
      myScore,
      opponentScore,
    });
    setZapError(null);
    setZapMessage(null);
    setShowZapModal(true);
  }, [gameState?.scoring.p1Score, gameState?.scoring.p2Score, validation]);

  const handleConfirmPlay = useCallback(
    async (options: { zapAmount: number; shareToNostr: boolean }) => {
      if (!validation?.valid) return;

      const result = await makeMove(pendingPlacements);
      if (result.valid) {
        setPendingPlacements([]);
        setLocalRack(playerRack);
        setShowZapModal(false);

        const word =
          pendingMoveSummary?.word || validation.words?.[0] || "Your move";
        const points = pendingMoveSummary?.points ?? validation.score ?? 0;

        if (!zapsDisabled && options.zapAmount > 0) {
          if (walletState.connected && opponentPubkey) {
            try {
              const message = `Words With Zaps: your turn -> ${gameLink}`;
              await zapUser({
                recipientPubkey: opponentPubkey,
                amountSats: options.zapAmount,
                gameId,
                moveDescription: message,
              });
              setZapMessage(
                `Sent ${options.zapAmount} sat${
                  options.zapAmount === 1 ? "" : "s"
                }!`,
              );
              setTimeout(() => setZapMessage(null), 3000);
            } catch (err) {
              console.warn("Zap failed:", err);
              const errorMsg = err instanceof Error ? err.message : String(err);
              setZapError(`Move played, but zap failed: ${errorMsg}`);
            }
          } else if (!walletState.connected) {
            console.log("Wallet not ready, skipping zap");
          }
        } else if (zapsDisabled) {
          console.log("[Zap] Gameplay zaps disabled");
        }

        if (options.shareToNostr) {
          try {
            let opponentRef = "";
            if (opponentPubkey) {
              try {
                opponentRef = `nostr:${opponentNpub}`;
              } catch {
                opponentRef = opponentPubkey;
              }
            }
            const turnLine = opponentRef
              ? `It's your turn, ${opponentRef}!`
              : "It's your turn!";
            const shareText = `I just played ${word} for ${points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
            const event = createEvent(1, shareText, [
              ["t", "wordswithzaps"],
              ...(opponentPubkey ? [["p", opponentPubkey]] : []),
            ]);
            await publishEvent(event);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setZapError(
              `Move played, but sharing to Nostr failed: ${errorMsg}`,
            );
          }
        }
      }
    },
    [
      gameId,
      gameLink,
      makeMove,
      opponentNpub,
      opponentPubkey,
      pendingMoveSummary?.points,
      pendingMoveSummary?.word,
      pendingPlacements,
      playerRack,
      validation,
      walletState.connected,
      zapUser,
      zapsDisabled,
    ],
  );

  const handlePass = useCallback(async () => {
    await pass();
    setPendingPlacements([]);
  }, [pass]);

  const handleClear = useCallback(() => {
    setPendingPlacements([]);
    setSelectedTileIndex(null);
  }, []);

  const handleShuffle = useCallback(() => {
    setLocalRack((prev) => shuffleArray(prev));
  }, []);

  const sharePreviewText = useMemo(() => {
    if (!pendingMoveSummary) return "";
    const turnLine = opponentLabel
      ? `It's your turn, ${opponentLabel}!`
      : "It's your turn!";
    return `I just played ${pendingMoveSummary.word} for ${pendingMoveSummary.points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
  }, [gameLink, opponentLabel, pendingMoveSummary]);

  const handleExchange = useCallback(() => {
    // TODO: Implement exchange UI
    alert("Exchange not yet implemented. Select tiles to exchange.");
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gameLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch (err) {
      setZapError(
        err instanceof Error ? err.message : "Failed to copy game link",
      );
    }
  }, [gameLink]);

  const handleDeleteGame = useCallback(async () => {
    if (!isCreator) return;
    const confirmed = window.confirm(
      "Delete this game? This will mark it as deleted for both players.",
    );
    if (!confirmed) return;
    try {
      await deleteGame();
    } catch (err) {
      setZapError(err instanceof Error ? err.message : "Failed to delete game");
    }
  }, [isCreator, deleteGame]);
  void handleDeleteGame; // Reserved for delete button UI

  if (!gameState) {
    return (
      <div className="game-view loading">
        <p>Loading game...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const _isPlayerOne = gameState.meta.playerOne === myPubkey;
  void _isPlayerOne; // Reserved for future use

  return (
    <div className="game-view">
      <div className="game-header">
        <ScoreBoard
          player1={{
            pubkey: gameState.meta.playerOne,
            score: gameState.scoring.p1Score,
            isActive: gameState.turn.activePlayer === gameState.meta.playerOne,
          }}
          player2={{
            pubkey: gameState.meta.playerTwo,
            score: gameState.scoring.p2Score,
            isActive: gameState.turn.activePlayer === gameState.meta.playerTwo,
          }}
          tilesRemaining={gameState.tileBag.length}
          currentUserPubkey={myPubkey}
          onShare={handleCopyLink}
        />

        {gameState.meta.status !== "active" && (
          <div className="game-status">
            {gameState.meta.status === "completed" ? (
              <span className="status-completed">
                Game Over! Winner:{" "}
                {gameState.meta.winner === myPubkey ? "You!" : "Opponent"}
              </span>
            ) : gameState.meta.status === "abandoned" ? (
              <span className="status-abandoned">Game Abandoned</span>
            ) : gameState.meta.status === "deleted" ? (
              <span className="status-deleted">
                Game Deleted{" "}
                {gameState.meta.deletedBy
                  ? gameState.meta.deletedBy === myPubkey
                    ? "(by you)"
                    : "(by opponent)"
                  : ""}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {error && <div className="game-error">{error}</div>}
      {zapMessage && <div className="game-success">{zapMessage}</div>}
      {zapError && <div className="game-error">{zapError}</div>}

      <Board
        board={gameState.board}
        pendingPlacements={pendingPlacements}
        onPlaceTile={handlePlaceTile}
        onRemoveTile={handleRemoveTile}
        onMoveTile={handleMoveTile}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
      />

      <Rack
        tiles={availableRack}
        selectedTile={selectedTileIndex}
        onSelectTile={setSelectedTileIndex}
        onReturnTile={handleRemoveTile}
        onReorder={setLocalRack}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
      />

      {validation && !validation.valid && pendingPlacements.length > 0 && (
        <div className="validation-error">{validation.error}</div>
      )}

      <GameControls
        canPlay={validation?.valid || false}
        canPass={isMyTurn && gameState.meta.status === "active"}
        canExchange={
          isMyTurn &&
          gameState.meta.status === "active" &&
          gameState.tileBag.length >= 7
        }
        isLoading={isLoading}
        pendingScore={validation?.score}
        walletConnected={walletState.connected}
        onPlay={handlePlay}
        onPass={handlePass}
        onExchange={handleExchange}
        onClear={handleClear}
        onShuffle={handleShuffle}
      />

      {pendingBlankPosition && (
        <BlankTilePicker
          onSelect={handleBlankLetterSelect}
          onCancel={handleBlankPickerCancel}
        />
      )}

      {pendingMoveSummary && (
        <ZapNudgeModal
          open={showZapModal}
          word={pendingMoveSummary.word}
          points={pendingMoveSummary.points}
          myScore={pendingMoveSummary.myScore}
          opponentScore={pendingMoveSummary.opponentScore}
          opponentLabel={opponentLabel}
          walletConnected={walletState.connected}
          walletConnected={walletState.connected}
          zapsDisabled={zapsDisabled}
          sharePreviewText={sharePreviewText}
          onConfirm={handleConfirmPlay}
          onClose={() => {
            setShowZapModal(false);
            setPendingMoveSummary(null);
          }}
        />
      )}
    </div>
  );
}

export default GameView;
