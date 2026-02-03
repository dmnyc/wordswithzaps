import { useState, useMemo } from "react";
import type { DecayInfo } from "../utils/gameDecay";
import { canDeclareAbandoned } from "../utils/gameDecay";
import Modal from "./Modal";
import "./NudgeModal.css";

interface NudgeModalProps {
  open: boolean;
  opponentName: string;
  opponentPubkey: string;
  gameId: string;
  updatedAt: number;
  decay: DecayInfo;
  walletConnected: boolean;
  onZap: (params: {
    recipientPubkey: string;
    amountSats: number;
    gameId: string;
    moveDescription: string;
  }) => Promise<unknown>;
  onDeclareAbandoned?: () => void;
  onClose: () => void;
  onOpenWalletSettings?: () => void;
}

const PRESET_AMOUNTS = [21, 50, 100, 500];

export function NudgeModal({
  open,
  opponentName,
  opponentPubkey,
  gameId,
  updatedAt,
  decay,
  walletConnected,
  onZap,
  onDeclareAbandoned,
  onClose,
  onOpenWalletSettings,
}: NudgeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState(21);
  const [customAmount, setCustomAmount] = useState("");
  const [isSending, setIsSending] = useState(false);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === -1) return customAmountValue;
    return selectedAmount;
  }, [selectedAmount, customAmountValue]);

  const abandonable = canDeclareAbandoned(updatedAt);

  const waitLabel = decay.ageDays === 1
    ? "1 day"
    : decay.ageDays < 7
      ? `${decay.ageDays} days`
      : decay.ageDays < 14
        ? `${Math.floor(decay.ageDays / 7)} week${Math.floor(decay.ageDays / 7) > 1 ? "s" : ""}`
        : `${Math.floor(decay.ageDays / 7)}+ weeks`;

  const handleSend = async () => {
    if (resolvedAmount <= 0 || isSending) return;
    setIsSending(true);
    try {
      await onZap({
        recipientPubkey: opponentPubkey,
        amountSats: resolvedAmount,
        gameId,
        moveDescription: "Your turn on #WordsWithZaps!",
      });
      onClose();
    } catch {
      // Error handled by caller toast
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal open={open} title="Send a Nudge" onClose={onClose}>
      <div className="nudge-content">
        <p className="nudge-waiting">
          <strong>{opponentName}</strong> has been idle for{" "}
          <span className={`nudge-time ${decay.tier}`}>{waitLabel}</span>
        </p>

        {!walletConnected ? (
          <div className="nudge-wallet-cta">
            <p className="nudge-hint">Connect a wallet to send a nudge zap.</p>
            {onOpenWalletSettings && (
              <button
                className="nudge-btn secondary"
                type="button"
                onClick={onOpenWalletSettings}
              >
                Connect Wallet
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="nudge-amounts">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  className={`nudge-amount-btn ${selectedAmount === amount ? "active" : ""}`}
                  onClick={() => setSelectedAmount(amount)}
                  type="button"
                  disabled={isSending}
                >
                  <img
                    src="/assets/bolt-yellow.svg"
                    alt=""
                    className="nudge-bolt"
                  />
                  {amount}
                </button>
              ))}
            </div>

            <div className="nudge-custom-row">
              <input
                className="nudge-custom-input"
                type="number"
                min={1}
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedAmount(-1);
                }}
                onFocus={() => setSelectedAmount(-1)}
                disabled={isSending}
              />
            </div>

            <button
              className="nudge-btn primary"
              onClick={handleSend}
              disabled={resolvedAmount <= 0 || isSending}
            >
              {isSending ? (
                "Sending..."
              ) : (
                <>
                  Send Nudge{" "}
                  <img
                    src="/assets/bolt.svg"
                    alt=""
                    className="nudge-bolt"
                  />
                  {resolvedAmount}
                </>
              )}
            </button>
          </>
        )}

        {abandonable && onDeclareAbandoned && (
          <div className="nudge-abandon">
            <p className="nudge-abandon-hint">
              This game has been idle for {waitLabel}. You can declare it
              abandoned — neither player wins or loses.
            </p>
            <button
              className="nudge-btn abandon"
              onClick={onDeclareAbandoned}
              disabled={isSending}
            >
              Declare Abandoned
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default NudgeModal;
