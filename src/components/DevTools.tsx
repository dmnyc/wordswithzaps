import { useState } from "react";
import type { Achievement } from "../utils/achievements";
import "./DevTools.css";

interface DevToolsProps {
  onTriggerVictory: () => void;
  onTriggerGameOver: (
    outcome:
      | "won"
      | "lost"
      | "tie"
      | "abandoned"
      | "forfeit-lost"
      | "forfeit-won",
  ) => void;
  onTriggerZapAnimation: () => void;
  onTriggerZapathon: () => void;
  onTriggerAchievement: (achievement: Achievement) => void;
  onRepairRack?: () => Promise<string[]>;
  onPlaceBonusWord?: () => void;
  onClearBonusWord?: () => void;
}

const SAMPLE_ACHIEVEMENTS: { label: string; achievement: Achievement }[] = [
  {
    label: "High Score",
    achievement: {
      type: "high-score",
      word: "QUARTZ",
      score: 68,
      message: "played an awesome word!",
    },
  },
  {
    label: "Zapathon",
    achievement: {
      type: "bingo",
      word: "JUKEBOX",
      score: 92,
      message: "played a ZAPATHON!",
    },
  },
  {
    label: "Zap Bonus",
    achievement: {
      type: "zap-bonus",
      word: "ZIGZAG",
      score: 38,
      message: "landed on a Zap Square!",
    },
  },
  {
    label: "Double Word",
    achievement: {
      type: "double-word",
      word: "SPHINX",
      score: 42,
      message: "hit a Double Word!",
    },
  },
];

export function DevTools({
  onTriggerVictory,
  onTriggerGameOver,
  onTriggerZapAnimation,
  onTriggerZapathon,
  onTriggerAchievement,
  onRepairRack,
  onPlaceBonusWord,
  onClearBonusWord,
}: DevToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);

  if (import.meta.env.PROD) return null;

  return (
    <div className="dev-tools">
      <button
        className="dev-tools-toggle"
        onClick={() => setIsOpen((p) => !p)}
        type="button"
      >
        DEV
      </button>

      {isOpen && (
        <div className="dev-tools-panel">
          <div className="dev-tools-section">
            <div className="dev-tools-section-title">Animations</div>
            <button type="button" onClick={onTriggerVictory}>
              Victory confetti
            </button>
            <button type="button" onClick={onTriggerZapAnimation}>
              Zap lightning
            </button>
            <button type="button" onClick={onTriggerZapathon}>
              Zapathon
            </button>
          </div>

          <div className="dev-tools-section">
            <div className="dev-tools-section-title">Game Over Modals</div>
            <button type="button" onClick={() => onTriggerGameOver("won")}>
              Won
            </button>
            <button type="button" onClick={() => onTriggerGameOver("lost")}>
              Lost
            </button>
            <button type="button" onClick={() => onTriggerGameOver("tie")}>
              Tie
            </button>
            <button
              type="button"
              onClick={() => onTriggerGameOver("abandoned")}
            >
              Abandoned
            </button>
            <button
              type="button"
              onClick={() => onTriggerGameOver("forfeit-lost")}
            >
              Forfeit (I lost)
            </button>
            <button
              type="button"
              onClick={() => onTriggerGameOver("forfeit-won")}
            >
              Forfeit (I won)
            </button>
          </div>

          <div className="dev-tools-section">
            <div className="dev-tools-section-title">Achievements</div>
            {SAMPLE_ACHIEVEMENTS.map((sa) => (
              <button
                key={sa.label}
                type="button"
                onClick={() => onTriggerAchievement(sa.achievement)}
              >
                {sa.label}
              </button>
            ))}
          </div>

          {onPlaceBonusWord && (
            <div className="dev-tools-section">
              <div className="dev-tools-section-title">Bonus Words</div>
              <button type="button" onClick={onPlaceBonusWord}>
                Place BITCOIN
              </button>
              {onClearBonusWord && (
                <button type="button" onClick={onClearBonusWord}>
                  Clear bonus tiles
                </button>
              )}
            </div>
          )}

          {onRepairRack && (
            <div className="dev-tools-section">
              <div className="dev-tools-section-title">Rack</div>
              <button
                type="button"
                onClick={async () => {
                  setRepairStatus("Repairing...");
                  try {
                    const newRack = await onRepairRack();
                    setRepairStatus(`Repaired: ${newRack.join(", ")}`);
                  } catch (err) {
                    setRepairStatus(
                      `Failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                  }
                }}
              >
                Repair rack
              </button>
              {repairStatus && (
                <div className="dev-tools-status">{repairStatus}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DevTools;
