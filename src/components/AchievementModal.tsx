import { useState, useMemo } from "react";
import type { Achievement } from "../utils/achievements";
import "./AchievementModal.css";

interface AchievementModalProps {
  achievement: Achievement;
  opponentName: string;
  walletConnected: boolean;
  onZap: (amount: number) => void;
  onClose: () => void;
}

const PRESET_AMOUNTS = [21, 50, 100, 500];

const ACHIEVEMENT_ICONS: Record<Achievement["type"], string> = {
  bingo: "7",
  "triple-word": "3x",
  "double-word": "2x",
  "high-score": "!",
};

export function AchievementModal({
  achievement,
  opponentName,
  walletConnected,
  onZap,
  onClose,
}: AchievementModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(21);
  const [customAmount, setCustomAmount] = useState("");

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [selectedAmount, customAmountValue]);

  const handleZap = () => {
    if (resolvedAmount > 0) {
      onZap(resolvedAmount);
    }
  };

  // Format the word display (handle multiple words separated by comma)
  const displayWord = achievement.word.split(",")[0].trim().toUpperCase();

  return (
    <div className="achievement-overlay" onClick={onClose}>
      <div className="achievement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="achievement-burst" />

        <div className="achievement-badge">
          <div
            className={`achievement-badge-icon ${achievement.type === "bingo" ? "bingo" : ""}`}
          >
            {ACHIEVEMENT_ICONS[achievement.type]}
          </div>
        </div>

        <p className="achievement-intro">
          <strong>{opponentName}</strong> played an amazing word!
        </p>

        <div className="achievement-word-display">
          <p className="achievement-word">{displayWord}</p>
          <p className="achievement-score">{achievement.score} points</p>
        </div>

        <p className="achievement-type">{achievement.message}</p>

        <div className="achievement-zap-section">
          <h3>Send a congratulatory zap?</h3>

          {!walletConnected ? (
            <p
              style={{
                color: "#7a7a7a",
                fontSize: "13px",
                textAlign: "center",
                marginBottom: "16px",
              }}
            >
              Connect a wallet to send zaps
            </p>
          ) : (
            <>
              <div className="achievement-zap-presets">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className={`achievement-zap-btn ${selectedAmount === amount ? "active" : ""}`}
                    onClick={() => setSelectedAmount(amount)}
                    type="button"
                  >
                    {amount} sats
                  </button>
                ))}
              </div>

              <div className="achievement-custom-row">
                <input
                  className="achievement-custom-input"
                  type="number"
                  min={1}
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount("custom");
                  }}
                  onFocus={() => setSelectedAmount("custom")}
                />
              </div>
            </>
          )}
        </div>

        <div className="achievement-actions">
          <button className="achievement-btn skip" onClick={onClose}>
            Skip
          </button>
          {walletConnected && (
            <button
              className="achievement-btn zap"
              onClick={handleZap}
              disabled={resolvedAmount <= 0}
            >
              Send {resolvedAmount > 0 ? `${resolvedAmount} sats` : "Zap"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AchievementModal;
