import { useEffect, useMemo, useState } from "react";
import {
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
  getShareToNostrDefault,
} from "../settings/appSettings";
import type { GameStatus } from "../types/game";
import type { GameEndStats } from "../utils/gameStats";
import Modal from "./Modal";
import "./GameOverModal.css";

interface GameOverModalProps {
  open: boolean;
  opponentLabel: string;
  walletConnected: boolean;
  winner: string | undefined;
  myPubkey: string;
  gameStatus: GameStatus;
  scores: { my: number; opponent: number };
  gameStats: GameEndStats | null;
  sharePreview?: string;
  myPicture?: string | null;
  opponentPicture?: string | null;
  onClose: () => void;
  onSendZap: (amount: number) => Promise<void>;
  onShareResult: (gamestrEventId?: string) => Promise<void>;
  onOpenCreatorZap: () => void;
  onOpenWalletSettings?: () => void;
  leaderboardEnabled: boolean;
  onToggleLeaderboard: (enabled: boolean) => void;
  onPublishLeaderboard?: () => Promise<string | null>;
}

const PRESET_AMOUNTS = [50, 100, 500, 1000];

export function GameOverModal({
  open,
  opponentLabel,
  walletConnected,
  winner,
  myPubkey,
  gameStatus,
  scores,
  gameStats,
  sharePreview,
  myPicture,
  opponentPicture,
  onClose,
  onSendZap,
  onShareResult,
  onOpenCreatorZap,
  onOpenWalletSettings,
  leaderboardEnabled,
  onToggleLeaderboard,
  onPublishLeaderboard,
}: GameOverModalProps) {
  const iWon = winner === myPubkey;
  const iLost = !!winner && winner !== myPubkey;
  const isTie = gameStatus === "completed" && !winner;
  const isAbandoned = gameStatus === "abandoned";
  const canShare = iWon || isTie;

  // Zap state
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [isSending, setIsSending] = useState(false);

  // Share state
  const [willShare, setWillShare] = useState(
    () => canShare && getShareToNostrDefault(),
  );

  useEffect(() => {
    if (!open) return;
    const saved = getZapNudgeDefaultAmount();
    setSelectedAmount(
      saved > 0 && !PRESET_AMOUNTS.includes(saved) ? "custom" : saved,
    );
    setCustomAmount(
      saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "",
    );
    setIsSending(false);
    setWillShare(canShare && getShareToNostrDefault());
  }, [open, canShare]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [customAmountValue, selectedAmount]);

  const customAmountInvalid =
    selectedAmount === "custom" && customAmountValue <= 0;

  useEffect(() => {
    const amount =
      selectedAmount === "custom" ? customAmountValue : selectedAmount;
    if (amount >= 0) {
      setZapNudgeDefaultAmount(amount);
    }
  }, [customAmountValue, selectedAmount]);

  const handleSend = () => {
    if (isSending) return;

    const shouldZap = walletConnected && resolvedAmount > 0;
    const shouldShare = canShare && willShare;
    const shouldPublishLeaderboard =
      leaderboardEnabled && onPublishLeaderboard;

    // Close modal immediately — zap, share, and leaderboard run in the background
    onClose();

    // Fire sequentially: leaderboard first (to get event ID for share), then share, then zap
    (async () => {
      let gamestrEventId: string | null = null;
      if (shouldPublishLeaderboard) {
        try {
          gamestrEventId = await onPublishLeaderboard();
        } catch {
          // toast handled inside onPublishLeaderboard
        }
      }
      if (shouldShare) {
        try {
          await onShareResult(gamestrEventId ?? undefined);
        } catch {
          // toast handled inside onShareResult
        }
      }
      if (shouldZap) {
        try {
          await onSendZap(resolvedAmount);
        } catch {
          // toast handled inside onSendZap
        }
      }
    })();
  };

  // Determine button label
  const hasZap = !isAbandoned && walletConnected && resolvedAmount > 0;
  const hasShare = canShare && willShare;
  let buttonLabel = "Done";
  if (hasZap && hasShare) buttonLabel = "Share & Zap";
  else if (hasZap) buttonLabel = "Send GG zap";
  else if (hasShare) buttonLabel = "Share";

  // Title
  let title = "Game Over";
  if (iWon) title = "Victory!";
  else if (isTie) title = "It's a Tie!";
  else if (isAbandoned) title = "Game Abandoned";

  return (
    <Modal open={open} title={title} onClose={onClose} footer={null}>
      <div className="gameover-body">
        <img
          src={iWon ? "/assets/victory.svg" : "/assets/game_over.svg"}
          alt={iWon ? "Victory" : "Game over"}
          className={`gameover-graphic ${iWon ? "victory" : ""}`}
        />

        {/* Score display */}
        {(gameStatus === "completed" || (gameStatus === "abandoned" && winner)) && (
          <div className="gameover-scores">
            <div className={`gameover-score ${iWon || isTie ? "winner" : ""}`}>
              <span className="gameover-score-name">You</span>
              <div className="gameover-score-row">
                {myPicture ? (
                  <img src={myPicture} alt="" className="gameover-avatar" />
                ) : (
                  <div className="gameover-avatar fallback">Y</div>
                )}
                <span className="gameover-score-value">{scores.my}</span>
              </div>
            </div>
            <div className="gameover-score-divider" />
            <div className={`gameover-score ${iLost ? "winner" : ""}`}>
              <span className="gameover-score-name">{opponentLabel}</span>
              <div className="gameover-score-row">
                <span className="gameover-score-value">{scores.opponent}</span>
                {opponentPicture ? (
                  <img
                    src={opponentPicture}
                    alt=""
                    className="gameover-avatar"
                  />
                ) : (
                  <div className="gameover-avatar fallback">
                    {opponentLabel.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats (winner and tie only) */}
        {canShare && gameStats && gameStats.highestWord && (
          <div className="gameover-stats">
            <div className="gameover-stat">
              <span className="gameover-stat-label">Best word</span>
              <span className="gameover-stat-value">
                {gameStats.highestWord.toUpperCase()} (
                {gameStats.highestWordScore} pts)
              </span>
            </div>
            <div className="gameover-stat">
              <span className="gameover-stat-label">Words played</span>
              <span className="gameover-stat-value">
                {gameStats.totalWordsPlayed}
              </span>
            </div>
          </div>
        )}

        {/* Flavor text */}
        <p className="gameover-text">
          {iWon && !isAbandoned && walletConnected
            ? `Share your victory or send a GG zap to ${opponentLabel}!`
            : iWon
              ? "Share your victory on Nostr!"
              : iLost && !isAbandoned && walletConnected
                ? `Want to send a GG zap to ${opponentLabel}?`
                : isTie && walletConnected
                  ? `Share the result or send a GG zap to ${opponentLabel}!`
                  : isTie
                    ? "Share the result on Nostr!"
                    : isAbandoned
                      ? "This game was abandoned."
                      : "Thanks for playing!"}
        </p>
      </div>

      {/* Share option (winner and tie only) */}
      {canShare && sharePreview && (
        <div className="gameover-share">
          <label className="gameover-share-check">
            <input
              type="checkbox"
              checked={!!willShare}
              onChange={(e) => setWillShare(e.target.checked)}
            />
            Share result to Nostr
          </label>
          {willShare && (
            <div className="gameover-share-preview">
              {sharePreview.replace(/nostr:npub1\w+/g, opponentLabel)}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard opt-in (completed games only, not yet published) */}
      {gameStatus === "completed" && onPublishLeaderboard && (
        <div className="gameover-share">
          <label className="gameover-share-check">
            <input
              type="checkbox"
              checked={leaderboardEnabled}
              onChange={(e) => onToggleLeaderboard(e.target.checked)}
            />
            Publish stats to gamestr leaderboard
          </label>
        </div>
      )}

      {/* GG zap (not for abandoned) */}
      {!isAbandoned && walletConnected ? (
        <div className="gameover-zap">
          <div className="gameover-section-title">GG zap amount</div>
          <div className="zap-amounts">
            <button
              className={`zap-amount-btn ${selectedAmount === 0 ? "active" : ""}`}
              onClick={() => setSelectedAmount(0)}
              type="button"
            >
              No zap
            </button>
            {PRESET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                className={`zap-amount-btn ${selectedAmount === amount ? "active" : ""}`}
                onClick={() => setSelectedAmount(amount)}
                type="button"
              >
                <img
                  src="/assets/bolt-yellow.svg"
                  alt=""
                  className="gameover-bolt"
                />
                {amount}
              </button>
            ))}
            <button
              className={`zap-amount-btn ${selectedAmount === "custom" ? "active" : ""}`}
              onClick={() => setSelectedAmount("custom")}
              type="button"
            >
              Custom
            </button>
          </div>
          {selectedAmount === "custom" && (
            <div className="zap-custom-row">
              {customAmountInvalid && (
                <span className="zap-custom-error">Enter a zap amount.</span>
              )}
              <input
                className="zap-custom-input"
                type="number"
                min={1}
                placeholder="Custom sats"
                value={customAmount}
                onChange={(event) =>
                  setCustomAmount(event.target.value.slice(0, 6))
                }
              />
            </div>
          )}
        </div>
      ) : !isAbandoned && onOpenWalletSettings ? (
        <div className="gameover-wallet-cta">
          <button
            className="gameover-wallet-btn"
            type="button"
            onClick={onOpenWalletSettings}
          >
            Connect wallet to send GG zaps
          </button>
        </div>
      ) : null}

      <button
        className="gameover-action-btn"
        type="button"
        onClick={buttonLabel === "Done" ? onClose : handleSend}
        disabled={isSending || (hasZap && customAmountInvalid)}
      >
        {isSending ? "Sending..." : buttonLabel}
      </button>

      <div className="gameover-creator">
        <button
          className="gameover-creator-btn"
          type="button"
          onClick={onOpenCreatorZap}
        >
          If you enjoyed this game, you can also zap the creator.
        </button>
      </div>
    </Modal>
  );
}

export default GameOverModal;
