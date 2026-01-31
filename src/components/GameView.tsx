import { useState, useCallback, useMemo } from "react";
import type { TilePlacement } from "../types/game";
import { useGame } from "../hooks/useGame";
import { getCurrentUser } from "../nostr/client";
import Board from "./Board";
import Rack from "./Rack";
import ScoreBoard from "./ScoreBoard";
import GameControls from "./GameControls";
import { shuffleArray } from "../engine/constants";
import "./GameView.css";

interface GameViewProps {
  gameId: string;
  opponentPubkey: string;
}

export function GameView({ gameId, opponentPubkey }: GameViewProps) {
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
  } = useGame();

  const [pendingPlacements, setPendingPlacements] = useState<TilePlacement[]>(
    [],
  );
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [localRack, setLocalRack] = useState<string[]>([]);

  const user = getCurrentUser();
  const myPubkey = user?.pubkey || "";

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

      // Handle blank tiles - for now just use as-is, could show letter picker
      const placement: TilePlacement = {
        letter: letter === "BLANK" ? "A" : letter, // Default blank to 'A'
        x,
        y,
        isBlank: letter === "BLANK",
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

  const handleRemoveTile = useCallback((x: number, y: number) => {
    setPendingPlacements((prev) => prev.filter((p) => p.x !== x || p.y !== y));
  }, []);

  const handlePlay = useCallback(async () => {
    if (!validation?.valid) return;

    const result = await makeMove(pendingPlacements);
    if (result.valid) {
      setPendingPlacements([]);
      setLocalRack(playerRack);
    }
  }, [validation, makeMove, pendingPlacements, playerRack]);

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

  const handleExchange = useCallback(() => {
    // TODO: Implement exchange UI
    alert("Exchange not yet implemented. Select tiles to exchange.");
  }, []);

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
      />

      {error && <div className="game-error">{error}</div>}

      <div className="game-status">
        {gameState.meta.status === "completed" ? (
          <span className="status-completed">
            Game Over! Winner:{" "}
            {gameState.meta.winner === myPubkey ? "You!" : "Opponent"}
          </span>
        ) : gameState.meta.status === "abandoned" ? (
          <span className="status-abandoned">Game Abandoned</span>
        ) : isMyTurn ? (
          <span className="status-your-turn">Your Turn</span>
        ) : (
          <span className="status-waiting">Waiting for opponent...</span>
        )}
      </div>

      <Board
        board={gameState.board}
        pendingPlacements={pendingPlacements}
        onPlaceTile={handlePlaceTile}
        onRemoveTile={handleRemoveTile}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
      />

      <Rack
        tiles={availableRack}
        selectedTile={selectedTileIndex}
        onSelectTile={setSelectedTileIndex}
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
        onPlay={handlePlay}
        onPass={handlePass}
        onExchange={handleExchange}
        onClear={handleClear}
        onShuffle={handleShuffle}
      />
    </div>
  );
}

export default GameView;
