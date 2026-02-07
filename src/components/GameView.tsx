import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { TilePlacement } from "../types/game";
import { useGame } from "../hooks/useGame";
import { useWallet } from "../hooks/useWallet";
import { getCurrentUser, createEvent, publishEvent } from "../nostr/client";
import { publishShareMessage } from "../nostr/share";
import Board from "./Board";
import ZoomableBoard from "./ZoomableBoard";
import Rack from "./Rack";
import ScoreBoard from "./ScoreBoard";
import GameControls from "./GameControls";
import BlankTilePicker from "./BlankTilePicker";
import ExchangeTilesModal from "./ExchangeTilesModal";
import { BINGO_BONUS, RACK_SIZE, shuffleArray } from "../engine/constants";
import {
  getDisableGameplayZaps,
  subscribeAppSettings,
  addDismissedGame,
  isGameDismissed,
} from "../settings/appSettings";
import ZapNudgeModal from "./ZapNudgeModal";
import GameOverModal from "./GameOverModal";
import AchievementModal from "./AchievementModal";
import GameRulesModal from "./GameRulesModal";
import Modal from "./Modal";
import ZapAnimation from "./ZapAnimation";
import { ZTileLoader } from "./ZTileLoader";
import { detectAchievement, type Achievement } from "../utils/achievements";
import { nip19 } from "nostr-tools";
import { fetchProfile } from "../nostr/profiles";
import { canDeclareAbandoned } from "../utils/gameDecay";
import { computeGameEndStats, type GameEndStats } from "../utils/gameStats";
import DevTools from "./DevTools";
import TileBagInspector from "./TileBagInspector";
import "./GameView.css";

interface GameViewProps {
  gameId: string;
  opponentPubkey: string;
  onShareGame?: (copyFn: () => void) => void;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
  onOpenCreatorZap?: (onReturn?: () => void) => void;
  onOpenWalletSettings?: () => void;
  onOpenRelayList?: () => void;
  onBackToLobby?: () => void;
  onZapSent?: () => void;
}

type WordScorePop = {
  id: number;
  points: number;
};

const WORD_SCORE_POP_DURATION_MS = 900;
const POST_MOVE_MODAL_DELAY_MS = 1000;
export function GameView({
  gameId,
  opponentPubkey,
  onShareGame: _onShareGame,
  onToast,
  onOpenCreatorZap,
  onOpenWalletSettings,
  onOpenRelayList,
  onBackToLobby,
  onZapSent,
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
    exchange,
    validateMove,
    resign,
    declareAbandoned,
    deleteGame,
    repairRack,
  } = useGame();

  const [pendingPlacements, setPendingPlacements] = useState<TilePlacement[]>(
    [],
  );
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [localRack, setLocalRack] = useState<string[]>([]);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSelection, setExchangeSelection] = useState<number[]>([]);
  const [shuffleCount, setShuffleCount] = useState(0);
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
    isFirstMove: boolean;
    kind: "move" | "skip";
    skipReason?: "pass" | "swap";
  } | null>(null);
  const [opponentDisplayName, setOpponentDisplayName] = useState<string | null>(
    null,
  );
  const [opponentPicture, setOpponentPicture] = useState<string | null>(null);
  const [myPicture, setMyPicture] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "forfeit" | "delete" | "pass" | "abandon" | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [pendingAchievement, setPendingAchievement] =
    useState<Achievement | null>(null);
  const [showBingoCelebration, setShowBingoCelebration] = useState(false);
  const [showBonusCelebration, setShowBonusCelebration] = useState(false);
  const [bonusCelebrationWords, setBonusCelebrationWords] = useState<string[]>(
    [],
  );
  const [showVictoryCelebration, setShowVictoryCelebration] = useState(false);
  const [wordScorePop, setWordScorePop] = useState<WordScorePop | null>(null);
  const [showZapAnimation, setShowZapAnimation] = useState(false);
  const [devBonusTiles, setDevBonusTiles] = useState<
    Record<string, string> | undefined
  >();
  const [devOverride, setDevOverride] = useState<{
    winner: string | undefined;
    status: "completed" | "abandoned";
    scores: { my: number; opponent: number };
    stats: GameEndStats | null;
  } | null>(null);
  const lastValidationErrorRef = useRef<string | null>(null);
  const lastAchievementTurnRef = useRef<number | null>(null);
  const wordScoreTimeoutRef = useRef<number | null>(null);
  const postMoveModalTimeoutRef = useRef<number | null>(null);
  const bingoTimeoutRef = useRef<number | null>(null);
  const bonusCelebrationTimeoutRef = useRef<number | null>(null);

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
  const { zapUser, state: walletState, bitcoinConnectConnected } = useWallet();
  const isWalletConnected = walletState.connected || bitcoinConnectConnected;

  const gameEndStats = useMemo(() => {
    if (!gameState || gameState.meta.status === "active") return null;
    return computeGameEndStats(gameState.scoring.history, myPubkey);
  }, [gameState?.meta.status, gameState?.scoring.history, myPubkey]);

  const gameEndScores = useMemo(() => {
    if (!gameState || gameState.meta.status === "active")
      return { my: 0, opponent: 0 };
    const isPlayerOne = gameState.meta.playerOne === myPubkey;
    return {
      my: isPlayerOne ? gameState.scoring.p1Score : gameState.scoring.p2Score,
      opponent: isPlayerOne
        ? gameState.scoring.p2Score
        : gameState.scoring.p1Score,
    };
  }, [
    gameState?.meta.status,
    gameState?.scoring.p1Score,
    gameState?.scoring.p2Score,
    gameState?.meta.playerOne,
    myPubkey,
  ]);

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
        setOpponentPicture(profile?.picture || null);
      })
      .catch(() => {
        if (!cancelled) {
          setOpponentDisplayName(null);
          setOpponentPicture(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opponentPubkey]);

  useEffect(() => {
    if (!myPubkey) return;
    let cancelled = false;
    fetchProfile(myPubkey)
      .then((profile) => {
        if (!cancelled) setMyPicture(profile?.picture || null);
      })
      .catch(() => {
        if (!cancelled) setMyPicture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [myPubkey]);

  const gameLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    return url.toString();
  }, [gameId]);

  const appLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.search = "";
    return url.toString();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    window.history.replaceState({}, "", url.toString());
  }, [gameId]);

  const victoryCelebrationRef = useRef<number | null>(null);
  useEffect(() => {
    if (!gameState) return;
    const ended =
      gameState.meta.status === "completed" ||
      gameState.meta.status === "abandoned";
    if (ended) {
      // Suppress any pending post-move ZapNudgeModal — game is over
      if (postMoveModalTimeoutRef.current !== null) {
        window.clearTimeout(postMoveModalTimeoutRef.current);
        postMoveModalTimeoutRef.current = null;
      }
      setShowZapModal(false);
      setPendingMoveSummary(null);

      // Don't show modal again if user already saw it
      const alreadySeen = isGameDismissed(gameId);

      // Mark as dismissed so it hides from lobby after being viewed once
      addDismissedGame(gameId);

      if (alreadySeen) return;

      const iWon =
        gameState.meta.status === "completed" &&
        gameState.meta.winner === myPubkey;
      if (iWon) {
        setShowVictoryCelebration(true);
        victoryCelebrationRef.current = window.setTimeout(() => {
          setShowVictoryCelebration(false);
          setShowGameOverModal(true);
          victoryCelebrationRef.current = null;
        }, 8000);
      } else {
        setShowGameOverModal(true);
      }
    }
  }, [gameState?.meta.status, gameId, myPubkey]);

  useEffect(() => {
    return () => {
      if (wordScoreTimeoutRef.current !== null) {
        window.clearTimeout(wordScoreTimeoutRef.current);
      }
      if (postMoveModalTimeoutRef.current !== null) {
        window.clearTimeout(postMoveModalTimeoutRef.current);
      }
      if (bingoTimeoutRef.current !== null) {
        window.clearTimeout(bingoTimeoutRef.current);
      }
      if (victoryCelebrationRef.current !== null) {
        window.clearTimeout(victoryCelebrationRef.current);
      }
      if (bonusCelebrationTimeoutRef.current !== null) {
        window.clearTimeout(bonusCelebrationTimeoutRef.current);
      }
    };
  }, []);

  // Sync local rack with latest playerRack.
  // Always sync when tile contents differ to pick up newly drawn tiles.
  useEffect(() => {
    if (playerRack.length === 0) return;
    const sameLength = playerRack.length === localRack.length;
    // Compare tile contents (sorted) rather than order to preserve shuffle
    const sameTiles =
      sameLength &&
      [...playerRack].sort().join(",") === [...localRack].sort().join(",");
    if (!sameTiles) {
      setLocalRack(playerRack);
    }
  }, [playerRack, localRack]);

  // Detect opponent's achievement when our turn begins
  useEffect(() => {
    if (!gameState || !isMyTurn) return;

    const currentTurnIndex = gameState.turn.index;
    if (lastAchievementTurnRef.current === currentTurnIndex) return;
    lastAchievementTurnRef.current = currentTurnIndex;

    if (currentTurnIndex === 0) return;

    const history = gameState.scoring.history;
    const lastMove = history[history.length - 1];

    // Check if the last move was by the opponent
    if (
      lastMove &&
      lastMove.player !== myPubkey &&
      lastMove.coords.length > 0
    ) {
      const achievement = detectAchievement(
        lastMove.word,
        lastMove.score,
        lastMove.coords,
        lastMove.bonusWords,
      );
      if (achievement) {
        setPendingAchievement(achievement);
      }
    }
  }, [gameState, isMyTurn, myPubkey]);

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

  // Coords of the opponent's last-placed tiles (highlight when it's our turn)
  const highlightCoords = useMemo(() => {
    if (!gameState || !isMyTurn) return new Set<string>();
    const history = gameState.scoring.history;
    if (history.length === 0) return new Set<string>();
    const lastMove = history[history.length - 1];
    if (lastMove.player !== myPubkey && lastMove.coords.length > 0) {
      return new Set(lastMove.coords);
    }
    return new Set<string>();
  }, [gameState, isMyTurn, myPubkey]);

  // Coords of tiles forming bonus words (yellow tint easter egg)
  const bonusWordCoords = useMemo(() => {
    if (!gameState && !devBonusTiles) return new Set<string>();
    const coords = new Set<string>();
    if (gameState) {
      for (const move of gameState.scoring.history) {
        if (move.bonusWordCoords) {
          for (const c of move.bonusWordCoords) {
            coords.add(c);
          }
        }
      }
    }
    if (devBonusTiles) {
      for (const c of Object.keys(devBonusTiles)) {
        coords.add(c);
      }
    }
    return coords;
  }, [gameState?.scoring.history, devBonusTiles]);

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

  const triggerWordScorePop = useCallback((points: number) => {
    if (points <= 0) return;

    if (wordScoreTimeoutRef.current !== null) {
      window.clearTimeout(wordScoreTimeoutRef.current);
    }

    setWordScorePop({
      id: Date.now(),
      points,
    });

    wordScoreTimeoutRef.current = window.setTimeout(() => {
      setWordScorePop(null);
      wordScoreTimeoutRef.current = null;
    }, WORD_SCORE_POP_DURATION_MS);
  }, []);

  const triggerZapAnimation = useCallback(() => {
    setShowZapAnimation(true);
    onZapSent?.();
  }, [onZapSent]);

  const handleZapAnimationComplete = useCallback(() => {
    setShowZapAnimation(false);
  }, []);

  const handlePlay = useCallback(async () => {
    if (!validation?.valid) return;

    const mainWord = validation.words?.[0] || "Your move";
    const points = validation.score ?? 0;
    const p1Score = gameState?.scoring.p1Score || 0;
    const p2Score = gameState?.scoring.p2Score || 0;
    const isPlayerOne = gameState?.meta.playerOne === myPubkey;
    const myScore = isPlayerOne ? p1Score + points : p2Score + points;
    const opponentScore = isPlayerOne ? p2Score : p1Score;
    const isFirstMove = (gameState?.turn.index ?? 0) === 0;
    const moveSummary = {
      word: mainWord,
      points,
      myScore,
      opponentScore,
      isFirstMove,
      kind: "move" as const,
    };

    const wasBingo = pendingPlacements.length === 7;

    const result = await makeMove(pendingPlacements);
    if (result.valid) {
      onToast?.("Move synced", "info");
      setPendingPlacements([]);

      // Show bingo celebration if all 7 tiles were played
      if (wasBingo) {
        setShowBingoCelebration(true);
        triggerZapAnimation();
        if (bingoTimeoutRef.current !== null) {
          window.clearTimeout(bingoTimeoutRef.current);
        }
        bingoTimeoutRef.current = window.setTimeout(() => {
          setShowBingoCelebration(false);
          bingoTimeoutRef.current = null;
        }, 2500);
      }

      // Show bonus word celebration
      const bonusWords = validation.bonusWords;
      if (bonusWords && bonusWords.length > 0) {
        setBonusCelebrationWords(bonusWords);
        setShowBonusCelebration(true);
        if (bonusCelebrationTimeoutRef.current !== null) {
          window.clearTimeout(bonusCelebrationTimeoutRef.current);
        }
        bonusCelebrationTimeoutRef.current = window.setTimeout(() => {
          setShowBonusCelebration(false);
          bonusCelebrationTimeoutRef.current = null;
        }, 2500);
      }

      triggerWordScorePop(points);

      setPendingMoveSummary(moveSummary);
      if (postMoveModalTimeoutRef.current !== null) {
        window.clearTimeout(postMoveModalTimeoutRef.current);
      }
      postMoveModalTimeoutRef.current = window.setTimeout(() => {
        setShowZapModal(true);
        postMoveModalTimeoutRef.current = null;
      }, POST_MOVE_MODAL_DELAY_MS);
    }
  }, [
    availableRack,
    gameState?.meta.playerOne,
    gameState?.scoring.p1Score,
    gameState?.scoring.p2Score,
    makeMove,
    myPubkey,
    pendingPlacements,
    triggerWordScorePop,
    triggerZapAnimation,
    validation,
  ]);

  const handleConfirmPlay = useCallback(
    async (options: {
      zapAmount: number;
      shareMode: "none" | "public" | "public-reply" | "private" | "private-dm";
      replyTo?: string;
    }) => {
      const word = pendingMoveSummary?.word || "Your move";
      const points = pendingMoveSummary?.points ?? 0;

      // Close modal immediately - zap and share run in the background
      setShowZapModal(false);
      setPendingMoveSummary(null);

      // Build zap promise (if applicable)
      const zapPromise =
        !zapsDisabled &&
        options.zapAmount > 0 &&
        isWalletConnected &&
        opponentPubkey
          ? zapUser({
              recipientPubkey: opponentPubkey,
              amountSats: options.zapAmount,
              gameId,
              moveDescription: "It's your turn!",
            }).then(() => {
              triggerZapAnimation();
              onToast?.(
                `Sent ${options.zapAmount} sat${
                  options.zapAmount === 1 ? "" : "s"
                }!`,
                "success",
              );
            })
          : null;

      // Build share promise (if applicable)
      let sharePromise: Promise<void> | null = null;
      if (options.shareMode !== "none") {
        let shareText = "";
        if (pendingMoveSummary?.kind === "skip") {
          const action =
            pendingMoveSummary.skipReason === "swap"
              ? "swapped tiles"
              : "passed my turn";
          let opponentRef = "";
          if (opponentPubkey) {
            try {
              opponentRef = `nostr:${opponentNpub}`;
            } catch {
              opponentRef = opponentPubkey;
            }
          }
          const turnLine = opponentRef
            ? `Over to you, ${opponentRef}!`
            : "Over to you!";
          shareText = `I just ${action} in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
        } else if (pendingMoveSummary?.isFirstMove) {
          const isPublicShare =
            options.shareMode === "public" ||
            options.shareMode === "public-reply";
          const publicTarget = opponentPubkey
            ? `nostr:${opponentNpub}`
            : opponentLabel
              ? `@${opponentLabel}`
              : "you";
          const challengeTarget = isPublicShare ? publicTarget : "you";
          const joinLine = isPublicShare
            ? "Join or start a new game here:"
            : "Join the game here:";
          shareText = `I'm challenging ${challengeTarget} to play #WordsWithZaps.\n\nI just played ${word} for ${points} point${points === 1 ? "" : "s"}.\n\n${joinLine}\n\n${gameLink}`;
        } else {
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
          shareText = `I just played ${word} for ${points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
        }

        const isPrivateMode =
          options.shareMode === "private" || options.shareMode === "private-dm";
        const toastLabel = isPrivateMode
          ? "Shared privately!"
          : "Shared publicly!";
        sharePromise = publishShareMessage({
          text: shareText,
          shareMode: options.shareMode,
          recipientPubkey: opponentPubkey || "",
          replyTo: options.replyTo,
        }).then(() => {
          onToast?.(toastLabel, "success");
        });
      }

      // Fire both in parallel - neither blocks the other
      const promises: Promise<void>[] = [];
      if (zapPromise)
        promises.push(
          zapPromise.catch((err) => {
            console.warn("Zap failed:", err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            onToast?.(`Zap failed: ${errorMsg}`, "error");
          }),
        );
      if (sharePromise)
        promises.push(
          sharePromise.catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            onToast?.(`Sharing failed: ${errorMsg}`, "error");
          }),
        );

      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    },
    [
      gameId,
      gameLink,
      onToast,
      opponentLabel,
      opponentNpub,
      opponentPubkey,
      pendingMoveSummary?.isFirstMove,
      pendingMoveSummary?.kind,
      pendingMoveSummary?.points,
      pendingMoveSummary?.skipReason,
      pendingMoveSummary?.word,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
      zapsDisabled,
    ],
  );

  const handlePass = useCallback(() => {
    setConfirmAction("pass");
  }, []);

  const handleClear = useCallback(() => {
    setPendingPlacements([]);
    setSelectedTileIndex(null);
  }, []);

  const handleShuffle = useCallback(() => {
    setShuffleCount((c) => c + 1);
    setLocalRack((prev) => shuffleArray(prev));
  }, []);

  const sharePreviewText = useMemo(() => {
    if (!pendingMoveSummary) {
      return { public: "", private: "" };
    }
    if (pendingMoveSummary.kind === "skip") {
      const action =
        pendingMoveSummary.skipReason === "swap"
          ? "swapped tiles"
          : "passed my turn";
      const publicTurnLine = opponentLabel
        ? `Over to you, @${opponentLabel}!`
        : "Over to you!";
      const privateTurnLine = "Over to you!";
      return {
        public: `I just ${action} in #WordsWithZaps.\n\n${publicTurnLine}\n\n${gameLink}`,
        private: `I just ${action} in #WordsWithZaps.\n\n${privateTurnLine}\n\n${gameLink}`,
      };
    }
    const points = pendingMoveSummary.points;
    if (pendingMoveSummary.isFirstMove) {
      const publicTarget = opponentLabel ? `@${opponentLabel}` : "you";
      return {
        public: `I'm challenging ${publicTarget} to play #WordsWithZaps.\n\nI just played ${pendingMoveSummary.word} for ${points} point${points === 1 ? "" : "s"}.\n\nJoin or start a new game here:\n\n${gameLink}`,
        private: `I'm challenging you to play #WordsWithZaps.\n\nI just played ${pendingMoveSummary.word} for ${points} point${points === 1 ? "" : "s"}.\n\nJoin the game here:\n\n${gameLink}`,
      };
    }
    const turnLine = opponentLabel
      ? `It's your turn, ${opponentLabel}!`
      : "It's your turn!";
    const standard = `I just played ${pendingMoveSummary.word} for ${pendingMoveSummary.points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
    return { public: standard, private: standard };
  }, [gameLink, opponentLabel, pendingMoveSummary]);

  const handleExchange = useCallback(() => {
    // Enter exchange mode - clear any pending placements first
    setPendingPlacements([]);
    setSelectedTileIndex(null);
    setExchangeMode(true);
    setExchangeSelection([]);
  }, []);

  const handleToggleExchangeSelect = useCallback((index: number) => {
    setExchangeSelection((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      // Limit to rack size
      if (prev.length >= RACK_SIZE) return prev;
      return [...prev, index];
    });
  }, []);

  const handleCancelExchange = useCallback(() => {
    setExchangeMode(false);
    setExchangeSelection([]);
  }, []);

  const handleConfirmExchange = useCallback(async () => {
    if (exchangeSelection.length === 0) return;

    const tilesToExchange = exchangeSelection.map((idx) => availableRack[idx]);

    try {
      await exchange(tilesToExchange);
      onToast?.(
        `Exchanged ${tilesToExchange.length} tile${tilesToExchange.length === 1 ? "" : "s"}`,
        "success",
      );
      setPendingMoveSummary({
        word: "Turn completed",
        points: 0,
        myScore: gameState?.scoring.p1Score || 0,
        opponentScore: gameState?.scoring.p2Score || 0,
        isFirstMove: false,
        kind: "skip",
        skipReason: "swap",
      });
      setShowZapModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Exchange failed";
      onToast?.(message, "error");
    }

    setExchangeMode(false);
    setExchangeSelection([]);
  }, [exchangeSelection, availableRack, exchange, onToast, gameState]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gameLink);
      onToast?.("Link copied!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to copy game link";
      onToast?.(message, "error");
    }
  }, [gameLink, onToast]);

  const handleSendGgZap = useCallback(
    async (amount: number) => {
      if (!isWalletConnected || !opponentPubkey) return;
      try {
        const message = `Words With Zaps: GG! ${gameLink}`;
        await zapUser({
          recipientPubkey: opponentPubkey,
          amountSats: amount,
          gameId,
          moveDescription: message,
        });
        triggerZapAnimation();
        onToast?.(`Sent ${amount} sat${amount === 1 ? "" : "s"}!`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Zap failed";
        onToast?.(`GG zap failed: ${message}`, "error");
        throw err;
      }
    },
    [
      gameId,
      gameLink,
      onToast,
      opponentPubkey,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
    ],
  );

  const sharePreview = useMemo(() => {
    if (!gameState || gameState.meta.status !== "completed") return "";
    const iWon = gameState.meta.winner === myPubkey;
    const isTie = !gameState.meta.winner;
    if (!iWon && !isTie) return "";

    const myScore = gameEndScores.my;
    const oppScore = gameEndScores.opponent;
    const opponentRef = opponentPubkey
      ? `nostr:${opponentNpub}`
      : opponentLabel;

    if (iWon) {
      const statsLine = gameEndStats?.highestWord
        ? `Best word: ${gameEndStats.highestWord.toUpperCase()} (${gameEndStats.highestWordScore} pts)`
        : "";
      return `🏆⚡ I just won ${myScore} to ${oppScore} against ${opponentRef} in #WordsWithZaps!${statsLine ? `\n\n${statsLine}` : ""}\n\n${appLink}`;
    }
    return `🤝⚡ Tied ${myScore}-${oppScore} against ${opponentRef} in #WordsWithZaps!\n\n${appLink}`;
  }, [
    gameState?.meta.winner,
    gameState?.meta.status,
    gameEndScores,
    gameEndStats,
    appLink,
    myPubkey,
    opponentLabel,
    opponentNpub,
    opponentPubkey,
  ]);

  const handleShareResult = useCallback(async () => {
    if (!sharePreview) return;
    try {
      const event = createEvent(1, sharePreview, [
        ["t", "wordswithzaps"],
        ["client", "Words With Zaps"],
        ...(opponentPubkey ? [["p", opponentPubkey]] : []),
      ]);
      await publishEvent(event);
      onToast?.("Shared to Nostr!", "success");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onToast?.(`Sharing failed: ${errorMsg}`, "error");
    }
  }, [sharePreview, onToast, opponentPubkey]);

  const handleAchievementZap = useCallback(
    (amount: number, message: string) => {
      if (!isWalletConnected || !opponentPubkey || !pendingAchievement) return;
      // Close modal immediately, send zap in background
      setPendingAchievement(null);
      zapUser({
        recipientPubkey: opponentPubkey,
        amountSats: amount,
        gameId,
        moveDescription: message,
      })
        .then(() => {
          triggerZapAnimation();
          onToast?.(`Sent ${amount} sat${amount === 1 ? "" : "s"}!`, "success");
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Zap failed";
          onToast?.(`Zap failed: ${msg}`, "error");
        });
    },
    [
      gameId,
      onToast,
      opponentPubkey,
      pendingAchievement,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
    ],
  );

  const handleForfeit = useCallback(() => {
    setConfirmAction("forfeit");
  }, []);

  const handleDeleteGame = useCallback(() => {
    if (!isCreator) return;
    setConfirmAction("delete");
  }, [isCreator]);

  const confirmConfig = useMemo(() => {
    if (confirmAction === "forfeit") {
      return {
        title: "Forfeit game?",
        message: "You will lose and the game will end.",
        confirmLabel: "Forfeit game",
        tone: "danger",
        showCancel: true,
      };
    }
    if (confirmAction === "pass") {
      return {
        title: "Pass your turn?",
        message: "You'll skip this turn and your opponent can play.",
        confirmLabel: "Pass turn",
        tone: "danger",
        showCancel: true,
      };
    }
    if (confirmAction === "delete") {
      return {
        title: "Delete game?",
        message: "This will mark the game as deleted for both players.",
        confirmLabel: "Delete game",
        tone: "danger",
        showCancel: true,
      };
    }
    if (confirmAction === "abandon") {
      return {
        title: "Declare abandoned?",
        message:
          "This game has been idle for over 2 weeks. Declaring it abandoned ends the game — neither player wins or loses.",
        confirmLabel: "Declare abandoned",
        tone: "danger",
        showCancel: true,
      };
    }
    return null;
  }, [confirmAction]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction === "forfeit") {
        await resign();
        onToast?.("Game forfeited.", "info");
      }
      if (confirmAction === "pass") {
        await pass();
        onToast?.("Turn passed", "info");
        setPendingPlacements([]);
        setPendingMoveSummary({
          word: "Turn completed",
          points: 0,
          myScore: gameState?.scoring.p1Score || 0,
          opponentScore: gameState?.scoring.p2Score || 0,
          isFirstMove: false,
          kind: "skip",
          skipReason: "pass",
        });
        setShowZapModal(true);
      }
      if (confirmAction === "abandon") {
        await declareAbandoned();
        onToast?.("Game declared abandoned.", "info");
      }
      if (confirmAction === "delete") {
        await deleteGame();
        onToast?.("Game deleted", "info");
      }
      setConfirmAction(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Action failed. Try again.";
      onToast?.(message, "error");
    } finally {
      setConfirmBusy(false);
    }
  }, [
    confirmAction,
    declareAbandoned,
    deleteGame,
    onToast,
    resign,
    pass,
    gameState,
  ]);

  const handleCloseConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirmAction(null);
  }, [confirmBusy]);

  useEffect(() => {
    if (!error) return;
    onToast?.(error, "error");
  }, [error, onToast]);

  useEffect(() => {
    const shouldShow =
      isMyTurn &&
      pendingPlacements.length > 0 &&
      validation &&
      !validation.valid;
    const currentError = shouldShow ? validation?.error || "Invalid move" : "";
    if (currentError && currentError !== lastValidationErrorRef.current) {
      onToast?.(currentError, "error");
      lastValidationErrorRef.current = currentError;
    } else if (!currentError) {
      lastValidationErrorRef.current = null;
    }
  }, [isMyTurn, pendingPlacements.length, validation, onToast]);
  void handleDeleteGame; // Reserved for delete button UI

  // Dev tools handlers
  const handleDevTriggerVictory = useCallback(() => {
    setShowVictoryCelebration(true);
    if (victoryCelebrationRef.current)
      window.clearTimeout(victoryCelebrationRef.current);
    victoryCelebrationRef.current = window.setTimeout(() => {
      setShowVictoryCelebration(false);
      victoryCelebrationRef.current = null;
    }, 8000);
  }, []);

  const handleDevTriggerGameOver = useCallback(
    (
      outcome:
        | "won"
        | "lost"
        | "tie"
        | "abandoned"
        | "forfeit-lost"
        | "forfeit-won",
    ) => {
      const fakeStats: GameEndStats = {
        highestWord: "QUARTZ",
        highestWordScore: 68,
        totalWordsPlayed: 14,
        totalMoves: 16,
      };
      if (outcome === "won") {
        setDevOverride({
          winner: myPubkey,
          status: "completed",
          scores: { my: 342, opponent: 278 },
          stats: fakeStats,
        });
      } else if (outcome === "lost") {
        setDevOverride({
          winner: opponentPubkey,
          status: "completed",
          scores: { my: 278, opponent: 342 },
          stats: fakeStats,
        });
      } else if (outcome === "tie") {
        setDevOverride({
          winner: undefined,
          status: "completed",
          scores: { my: 305, opponent: 305 },
          stats: fakeStats,
        });
      } else if (outcome === "forfeit-lost") {
        setDevOverride({
          winner: opponentPubkey,
          status: "abandoned",
          scores: { my: 180, opponent: 120 },
          stats: null,
        });
      } else if (outcome === "forfeit-won") {
        setDevOverride({
          winner: myPubkey,
          status: "abandoned",
          scores: { my: 180, opponent: 120 },
          stats: null,
        });
      } else {
        setDevOverride({
          winner: undefined,
          status: "abandoned",
          scores: { my: 180, opponent: 120 },
          stats: null,
        });
      }
      setShowGameOverModal(true);
    },
    [myPubkey, opponentPubkey],
  );

  const handleDevPlaceBonusWord = useCallback(() => {
    // Place "BITCOIN" horizontally at row 1, starting col 1
    const word = "BITCOIN";
    const tiles: Record<string, string> = {};
    for (let i = 0; i < word.length; i++) {
      tiles[`${1 + i},1`] = word[i];
    }
    setDevBonusTiles((prev) => (prev ? { ...prev, ...tiles } : tiles));
  }, []);

  const handleDevClearBonusWord = useCallback(() => {
    setDevBonusTiles(undefined);
  }, []);

  const handleDevTriggerZapathon = useCallback(() => {
    setShowBingoCelebration(true);
    triggerZapAnimation();
    if (bingoTimeoutRef.current) window.clearTimeout(bingoTimeoutRef.current);
    bingoTimeoutRef.current = window.setTimeout(() => {
      setShowBingoCelebration(false);
      bingoTimeoutRef.current = null;
    }, 2500);
  }, []);

  const handleDevTriggerBonusCelebration = useCallback(() => {
    setBonusCelebrationWords(["BITCOIN"]);
    setShowBonusCelebration(true);
    if (bonusCelebrationTimeoutRef.current)
      window.clearTimeout(bonusCelebrationTimeoutRef.current);
    bonusCelebrationTimeoutRef.current = window.setTimeout(() => {
      setShowBonusCelebration(false);
      bonusCelebrationTimeoutRef.current = null;
    }, 2500);
  }, []);

  if (!gameState) {
    return (
      <div className="game-view loading">
        <ZTileLoader />
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
          walletConnected={isWalletConnected}
          onShare={handleCopyLink}
          onShowRules={() => setShowRulesModal(true)}
          onShowRelays={onOpenRelayList}
          onRefresh={() => loadGame(gameId, opponentPubkey)}
          onForfeit={
            gameState.meta.status === "active" ? handleForfeit : undefined
          }
          forfeitDisabled={isLoading}
          onBackToLobby={onBackToLobby}
          onZapUser={(pubkey, amount, message) => {
            zapUser({
              recipientPubkey: pubkey,
              amountSats: amount,
              gameId,
              moveDescription: message,
            })
              .then(() => {
                triggerZapAnimation();
                onToast?.(
                  `Sent ${amount} sat${amount === 1 ? "" : "s"}!`,
                  "success",
                );
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : "Zap failed";
                onToast?.(`Zap failed: ${msg}`, "error");
              });
          }}
          onOpenWalletSettings={onOpenWalletSettings}
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

      <ZoomableBoard gameId={gameId}>
        <Board
          board={
            devBonusTiles
              ? { ...gameState.board, ...devBonusTiles }
              : gameState.board
          }
          pendingPlacements={pendingPlacements}
          selectedTileIndex={selectedTileIndex}
          onPlaceTile={handlePlaceTile}
          onRemoveTile={handleRemoveTile}
          onMoveTile={handleMoveTile}
          disabled={!isMyTurn || gameState.meta.status !== "active"}
          isFirstMove={(gameState.turn.index ?? 0) === 0}
          highlightCoords={highlightCoords}
          bonusWordCoords={bonusWordCoords}
        />
      </ZoomableBoard>

      <Rack
        tiles={availableRack}
        selectedTile={selectedTileIndex}
        onSelectTile={setSelectedTileIndex}
        onReturnTile={handleRemoveTile}
        onReorder={setLocalRack}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
        shuffleKey={shuffleCount}
        exchangeMode={exchangeMode}
        exchangeSelection={exchangeSelection}
        onToggleExchangeSelect={handleToggleExchangeSelect}
      />

      <GameControls
        canPlay={isMyTurn && (validation?.valid || false)}
        canPass={isMyTurn && gameState.meta.status === "active"}
        canExchange={
          isMyTurn &&
          gameState.meta.status === "active" &&
          gameState.tileBag.length >= RACK_SIZE
        }
        isLoading={isLoading}
        isMyTurn={isMyTurn}
        gameOver={gameState.meta.status !== "active"}
        pendingScore={validation?.score}
        onPlay={handlePlay}
        onPass={handlePass}
        onExchange={handleExchange}
        onClear={handleClear}
        onShuffle={handleShuffle}
        scorePop={wordScorePop}
      />

      <TileBagInspector tileBag={gameState.tileBag} />

      {gameState.meta.status === "active" &&
        !isMyTurn &&
        canDeclareAbandoned(Math.floor(gameState.turn.timestamp / 1000)) && (
          <div className="abandon-hint">
            <button
              className="abandon-hint-btn"
              onClick={() => setConfirmAction("abandon")}
              disabled={isLoading}
            >
              Declare abandoned
            </button>
          </div>
        )}

      <ExchangeTilesModal
        open={exchangeMode}
        tiles={availableRack}
        exchangeSelection={exchangeSelection}
        isLoading={isLoading}
        onToggleExchangeSelect={handleToggleExchangeSelect}
        onCancel={handleCancelExchange}
        onConfirm={handleConfirmExchange}
      />

      {pendingBlankPosition && (
        <BlankTilePicker
          onSelect={handleBlankLetterSelect}
          onCancel={handleBlankPickerCancel}
        />
      )}

      {pendingMoveSummary && !showVictoryCelebration && !showGameOverModal && (
        <ZapNudgeModal
          open={showZapModal}
          word={pendingMoveSummary.word}
          points={pendingMoveSummary.points}
          myScore={pendingMoveSummary.myScore}
          opponentScore={pendingMoveSummary.opponentScore}
          opponentLabel={opponentLabel}
          walletConnected={isWalletConnected}
          zapsDisabled={zapsDisabled}
          sharePreviewTextPublic={sharePreviewText.public}
          sharePreviewTextPrivate={sharePreviewText.private}
          onConfirm={handleConfirmPlay}
          onClose={() => {
            setShowZapModal(false);
            setPendingMoveSummary(null);
          }}
          onOpenWalletSettings={onOpenWalletSettings}
        />
      )}

      {confirmConfig && (
        <Modal
          open={Boolean(confirmConfig)}
          title={confirmConfig.title}
          onClose={handleCloseConfirm}
          footer={
            <div className="wwz-modal-actions">
              {confirmConfig.showCancel && (
                <button
                  className="wwz-modal-btn"
                  type="button"
                  onClick={handleCloseConfirm}
                  disabled={confirmBusy}
                >
                  Cancel
                </button>
              )}
              <button
                className={`wwz-modal-btn ${confirmConfig.tone}`}
                type="button"
                onClick={handleConfirmAction}
                disabled={confirmBusy}
              >
                {confirmBusy ? "Working..." : confirmConfig.confirmLabel}
              </button>
            </div>
          }
        >
          <p>{confirmConfig.message}</p>
        </Modal>
      )}

      {(gameState.meta.status !== "active" || devOverride) && (
        <GameOverModal
          open={showGameOverModal}
          opponentLabel={opponentLabel}
          walletConnected={isWalletConnected}
          winner={devOverride?.winner ?? gameState.meta.winner}
          myPubkey={myPubkey}
          gameStatus={devOverride?.status ?? gameState.meta.status}
          scores={devOverride?.scores ?? gameEndScores}
          gameStats={devOverride?.stats ?? gameEndStats}
          sharePreview={
            devOverride
              ? devOverride.winner === myPubkey
                ? `I just won ${devOverride.scores.my} to ${devOverride.scores.opponent} against ${opponentLabel} in #WordsWithZaps!\n\nBest word: QUARTZ (68 pts)\n\n${appLink}`
                : devOverride.status === "completed" && !devOverride.winner
                  ? `Tied ${devOverride.scores.my}-${devOverride.scores.opponent} against ${opponentLabel} in #WordsWithZaps!\n\n${appLink}`
                  : undefined
              : sharePreview
          }
          myPicture={myPicture}
          opponentPicture={opponentPicture}
          onClose={() => {
            setShowGameOverModal(false);
            setDevOverride(null);
            // Suppress any lingering Share & Zap modal state
            setShowZapModal(false);
            setPendingMoveSummary(null);
            // Mark game as dismissed so it hides from lobby
            addDismissedGame(gameId);
          }}
          onSendZap={handleSendGgZap}
          onShareResult={handleShareResult}
          onOpenCreatorZap={() => {
            setShowGameOverModal(false);
            onOpenCreatorZap?.(() => setShowGameOverModal(true));
          }}
          onOpenWalletSettings={onOpenWalletSettings}
        />
      )}

      {pendingAchievement && (
        <AchievementModal
          achievement={pendingAchievement}
          opponentName={opponentLabel}
          walletConnected={isWalletConnected}
          onZap={handleAchievementZap}
          onClose={() => setPendingAchievement(null)}
          onOpenWalletSettings={onOpenWalletSettings}
        />
      )}

      {showBingoCelebration && (
        <div className="zapathon-celebration">
          <div className="zapathon-confetti">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="confetti-piece zapathon-confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 1}s`,
                }}
              />
            ))}
          </div>
          <div className="zapathon-celebration-content">
            <img
              src="/assets/zapathon.svg"
              alt="Zapathon"
              className="zapathon-celebration-graphic"
            />
            <div className="zapathon-bonus">+{BINGO_BONUS} bonus points</div>
          </div>
        </div>
      )}

      {showBonusCelebration && (
        <div className="bonus-celebration">
          <div className="bonus-celebration-confetti">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="confetti-piece bonus-confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 1}s`,
                }}
              />
            ))}
          </div>
          <div className="bonus-celebration-content">
            <img
              src="/assets/bonus_word.svg"
              alt="Bonus Word"
              className="bonus-celebration-graphic"
            />
            <div className="bonus-celebration-words">
              {bonusCelebrationWords.map((w) => (
                <span key={w} className="bonus-celebration-word">
                  {w}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {showVictoryCelebration && (
        <div className="victory-celebration">
          <div className="victory-confetti">
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className="confetti-piece victory-confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${-10 - Math.random() * 20}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2.5 + Math.random() * 1.5}s`,
                }}
              />
            ))}
          </div>
          <div className="victory-celebration-content">
            <div className="victory-celebration-text">VICTORY!</div>
            <div className="victory-celebration-score">
              {gameEndScores.my} - {gameEndScores.opponent}
            </div>
          </div>
        </div>
      )}

      <GameRulesModal
        open={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />

      {showZapAnimation && (
        <ZapAnimation onComplete={handleZapAnimationComplete} />
      )}

      <DevTools
        onTriggerVictory={handleDevTriggerVictory}
        onTriggerGameOver={handleDevTriggerGameOver}
        onTriggerZapAnimation={triggerZapAnimation}
        onTriggerZapathon={handleDevTriggerZapathon}
        onTriggerBonusCelebration={handleDevTriggerBonusCelebration}
        onTriggerAchievement={setPendingAchievement}
        onRepairRack={repairRack}
        onPlaceBonusWord={handleDevPlaceBonusWord}
        onClearBonusWord={devBonusTiles ? handleDevClearBonusWord : undefined}
      />
    </div>
  );
}

export default GameView;
