import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "./Modal";
import "./CreatorZapModal.css";

const CREATOR_LIGHTNING_ADDRESS = "daniel@breez.tips";

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
  const [customAmount, setCustomAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomAmount("");
    setIsSending(false);
    setError(null);
  }, [open]);

  const amount = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [customAmount]);

  const qrValue = useMemo(() => `lightning:${CREATOR_LIGHTNING_ADDRESS}`, []);

  const handleSend = async () => {
    if (!walletConnected || amount <= 0) return;
    setIsSending(true);
    setError(null);
    try {
      await onSendZap(amount);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zap failed";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Zap the creator"
      titleClassName="title-yellow"
      onClose={onClose}
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

        <div className="creator-zap-inline">
          <input
            className="creator-zap-input"
            type="number"
            min={1}
            maxLength={6}
            placeholder="sats"
            value={customAmount}
            onChange={(event) => {
              setCustomAmount(event.target.value.slice(0, 6));
            }}
          />
          <button
            className="creator-zap-btn"
            type="button"
            onClick={handleSend}
            disabled={!walletConnected || isSending || amount <= 0}
          >
            {isSending ? "Sending..." : "Zap"}
          </button>
        </div>
        {error && <p className="creator-error">{error}</p>}
        <p className="creator-hint">Send from your connected wallet.</p>
      </div>
    </Modal>
  );
}

export default CreatorZapModal;
