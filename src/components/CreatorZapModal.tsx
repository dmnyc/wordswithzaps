import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
} from "../settings/appSettings";
import Modal from "./Modal";
import "./CreatorZapModal.css";

const CREATOR_LIGHTNING_ADDRESS = "thedaniel@breez.tips";
const PRESET_AMOUNTS = [50, 100, 500, 1000];

interface CreatorZapModalProps {
  open: boolean;
  walletConnected: boolean;
  onClose: () => void;
  onSendZap: (amount: number) => Promise<void>;
}

export function CreatorZapModal({
  open,
  walletConnected,
  onClose,
  onSendZap,
}: CreatorZapModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [isSending, setIsSending] = useState(false);

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

  useEffect(() => {
    const amount =
      selectedAmount === "custom" ? customAmountValue : selectedAmount;
    if (amount >= 0) {
      setZapNudgeDefaultAmount(amount);
    }
  }, [customAmountValue, selectedAmount]);

  const qrValue = useMemo(() => `lightning:${CREATOR_LIGHTNING_ADDRESS}`, []);

  const handleSend = async () => {
    if (!walletConnected || customAmountInvalid || resolvedAmount <= 0) return;
    setIsSending(true);
    try {
      await onSendZap(resolvedAmount);
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Zap the creator"
      onClose={onClose}
      footer={
        walletConnected ? (
          <div className="wwz-modal-actions">
            <button
              className="wwz-modal-btn primary"
              type="button"
              onClick={handleSend}
              disabled={isSending || customAmountInvalid || resolvedAmount <= 0}
            >
              {isSending ? "Sending..." : "Send zap"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="creator-zap-body">
        <div className="creator-qr">
          <QRCodeSVG
            value={qrValue}
            size={160}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            imageSettings={{
              src: "/favicon.svg",
              height: 32,
              width: 32,
              excavate: true,
            }}
          />
        </div>
        <div className="creator-address">{CREATOR_LIGHTNING_ADDRESS}</div>
        <p className="creator-hint">
          Scan the code to zap from another wallet.
        </p>
      </div>

      {walletConnected && (
        <div className="creator-zap-amounts">
          <div className="creator-zap-title">Zap amount</div>
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
                <span className="zap-custom-error">Enter a zap amount.</span>
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
        </div>
      )}
    </Modal>
  );
}

export default CreatorZapModal;
