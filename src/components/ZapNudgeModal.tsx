import { useEffect, useMemo, useState } from "react";
import {
  getShareToNostrDefault,
  setShareToNostrDefault,
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
} from "../settings/appSettings";
import "./ZapNudgeModal.css";

interface ZapNudgeModalProps {
  open: boolean;
  word: string;
  points: number;
  myScore: number;
  opponentScore: number;
  opponentLabel: string;
  walletConnected: boolean;
  zapsDisabled: boolean;
  sharePreviewText: string;
  onConfirm: (options: { zapAmount: number; shareToNostr: boolean }) => void;
  onClose: () => void;
}

const PRESET_AMOUNTS = [50, 100, 500, 1000];

export function ZapNudgeModal({
  open,
  word,
  points,
  myScore,
  opponentScore,
  opponentLabel,
  walletConnected,
  zapsDisabled,
  sharePreviewText,
  onConfirm,
  onClose,
}: ZapNudgeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [shareToNostr, setShareToNostr] = useState(() =>
    getShareToNostrDefault(),
  );

  useEffect(() => {
    if (open) {
      const saved = getZapNudgeDefaultAmount();
      setSelectedAmount(
        saved > 0 && !PRESET_AMOUNTS.includes(saved) ? "custom" : saved,
      );
      setCustomAmount(
        saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "",
      );
      setShareToNostr(getShareToNostrDefault());
    }
  }, [open]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [customAmount]);

  const resolvedZapAmount = useMemo(() => {
    if (zapsDisabled || !walletConnected) return 0;
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [customAmountValue, selectedAmount, walletConnected, zapsDisabled]);

  const customAmountInvalid =
    selectedAmount === "custom" && customAmountValue <= 0;

  useEffect(() => {
    setShareToNostrDefault(shareToNostr);
  }, [shareToNostr]);

  useEffect(() => {
    const amount =
      selectedAmount === "custom" ? customAmountValue : selectedAmount;
    if (amount >= 0) {
      setZapNudgeDefaultAmount(amount);
    }
  }, [customAmountValue, selectedAmount]);

  if (!open) return null;

  return (
    <div className="zap-modal-overlay">
      <div className="zap-modal">
        <button
          className="zap-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <h2>Play Turn</h2>
        <div className="zap-summary">
          <div className="zap-summary-word">{word || "Your move"}</div>
          <div className="zap-summary-points">
            {points} point{points === 1 ? "" : "s"}
          </div>
          <div className="zap-summary-scores">
            <div>
              <span className="zap-summary-label">You</span>
              <span className="zap-summary-value">{myScore}</span>
            </div>
            <div>
              <span className="zap-summary-label">{opponentLabel}</span>
              <span className="zap-summary-value">{opponentScore}</span>
            </div>
          </div>
        </div>

        <div className="zap-section">
          <h3>Nudge opponent with a zap?</h3>
          {zapsDisabled ? (
            <p className="zap-hint">Gameplay zaps are disabled.</p>
          ) : !walletConnected ? (
            <p className="zap-hint">Connect a wallet to send a zap.</p>
          ) : (
            <>
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
                    <span className="zap-custom-error">
                      Enter a zap amount.
                    </span>
                  )}
                  <input
                    className="zap-custom-input"
                    type="number"
                    min={1}
                    placeholder="Custom sats"
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <label className="zap-checkbox">
          <input
            type="checkbox"
            checked={shareToNostr}
            onChange={() => setShareToNostr((prev) => !prev)}
          />
          <span>Share to Nostr</span>
        </label>
        {shareToNostr && (
          <div className="zap-preview">
            <div className="zap-preview-title">Nostr preview</div>
            <pre className="zap-preview-content">{sharePreviewText}</pre>
          </div>
        )}

        <div className="zap-actions">
          <button className="zap-btn secondary" onClick={onClose}>
            Back
          </button>
          <button
            className="zap-btn primary"
            onClick={() =>
              onConfirm({
                zapAmount: customAmountInvalid ? 0 : resolvedZapAmount,
                shareToNostr,
              })
            }
          >
            Play Turn
          </button>
        </div>
      </div>
    </div>
  );
}

export default ZapNudgeModal;
