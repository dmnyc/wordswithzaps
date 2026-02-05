import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import "./ZapNudgeModal.css";

const PRESET_AMOUNTS = [21, 50, 100, 500, 1000];

interface ProfileZapModalProps {
  open: boolean;
  recipientName: string;
  walletConnected: boolean;
  onZap: (amount: number, message: string) => void;
  onClose: () => void;
  onOpenWalletSettings?: () => void;
}

export function ProfileZapModal({
  open,
  recipientName,
  walletConnected,
  onZap,
  onClose,
  onOpenWalletSettings,
}: ProfileZapModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(21);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedAmount(21);
      setCustomAmount("");
      setMessage("");
      setIsSubmitting(false);
    }
  }, [open]);

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

  const canSubmit =
    walletConnected && resolvedAmount > 0 && !customAmountInvalid;

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    onZap(resolvedAmount, message || `Zap from Words With Zaps!`);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Zap ${recipientName}`}
      titleClassName="title-yellow"
      onClose={onClose}
    >
      <div className="zap-section">
        <h3>Amount (sats)</h3>
        <div className="zap-amounts">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              type="button"
              className={`zap-amount-btn ${selectedAmount === amt ? "active" : ""}`}
              onClick={() => setSelectedAmount(amt)}
              disabled={!walletConnected}
            >
              {amt}
            </button>
          ))}
          <button
            type="button"
            className={`zap-amount-btn ${selectedAmount === "custom" ? "active" : ""}`}
            onClick={() => setSelectedAmount("custom")}
            disabled={!walletConnected}
          >
            Custom
          </button>
        </div>
        {selectedAmount === "custom" && (
          <div className="zap-custom-row">
            <input
              type="number"
              className={`zap-custom-input ${customAmountInvalid ? "error" : ""}`}
              placeholder="Enter amount"
              value={customAmount}
              min={1}
              onChange={(e) => setCustomAmount(e.target.value.slice(0, 6))}
              disabled={!walletConnected}
            />
            {customAmountInvalid && (
              <span className="zap-custom-error">Enter a valid amount</span>
            )}
          </div>
        )}
        {!walletConnected && (
          <p className="zap-hint">
            <button
              type="button"
              className="zap-btn tertiary"
              onClick={onOpenWalletSettings}
            >
              Connect wallet
            </button>{" "}
            to send zaps
          </p>
        )}
      </div>

      <div className="zap-section">
        <h3>Message (optional)</h3>
        <input
          type="text"
          className="zap-custom-input"
          style={{ width: "100%" }}
          placeholder="Add a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="zap-actions">
        <button type="button" className="zap-btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="zap-btn primary"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting
            ? "Sending..."
            : `Zap ${resolvedAmount > 0 ? resolvedAmount + " sats" : ""}`}
        </button>
      </div>
    </Modal>
  );
}

export default ProfileZapModal;
