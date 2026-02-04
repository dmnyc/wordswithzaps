import { useEffect, useMemo, useRef, useState } from "react";
import { nip19 } from "nostr-tools";
import {
  getShareToNostrDefault,
  setShareToNostrDefault,
  getShareMethodDefault,
  setShareMethodDefault,
  type ShareMethod,
  getSaveShareSettingDefault,
  setSaveShareSettingDefault,
} from "../settings/appSettings";
import type { DecayInfo } from "../utils/gameDecay";
import { canDeclareAbandoned } from "../utils/gameDecay";
import type { ShareMode } from "../nostr/share";
import Modal from "./Modal";
import "./NudgeModal.css";

const HEX_64_RE = /^[0-9a-f]{64}$/i;

function validateNoteId(input: string): string | null {
  if (!input) return null;
  try {
    if (input.startsWith("note1")) {
      const decoded = nip19.decode(input);
      if (decoded.type !== "note") return "Not a valid note identifier.";
      return null;
    }
    if (input.startsWith("nevent1")) {
      const decoded = nip19.decode(input);
      if (decoded.type !== "nevent") return "Not a valid nevent identifier.";
      return null;
    }
    if (HEX_64_RE.test(input)) return null;
    return "Enter a note1..., nevent1..., or 64-char hex event ID.";
  } catch {
    return "Invalid identifier.";
  }
}

type ShareOption = { value: ShareMode; label: string };

const SHARE_OPTIONS: ShareOption[] = [
  { value: "none", label: "Don't share" },
  { value: "public", label: "Public Nostr post" },
  { value: "public-reply", label: "Public Nostr reply" },
  { value: "private", label: "Standard DM (Most compatible, less secure)" },
  { value: "private-dm", label: "Giftwrap DM (More secure, less compatible)" },
];

const PRESET_AMOUNTS = [21];

interface NudgeModalProps {
  open: boolean;
  opponentName: string;
  opponentPubkey: string;
  gameId: string;
  gameLink: string;
  updatedAt: number;
  decay: DecayInfo;
  walletConnected: boolean;
  onZap: (params: {
    recipientPubkey: string;
    amountSats: number;
    gameId: string;
    moveDescription: string;
  }) => Promise<unknown>;
  onConfirm: (options: {
    zapAmount: number;
    shareMode: ShareMode;
    replyTo?: string;
    publicMessage: string;
    privateMessage: string;
  }) => void | Promise<void>;
  onDeclareAbandoned?: () => void;
  onClose: () => void;
  onOpenWalletSettings?: () => void;
}

export function NudgeModal({
  open,
  opponentName,
  opponentPubkey,
  gameLink,
  updatedAt,
  decay,
  walletConnected,
  onConfirm,
  onDeclareAbandoned,
  onClose,
  onOpenWalletSettings,
}: NudgeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(21);
  const [customAmount, setCustomAmount] = useState("");
  const [shareMode, setShareMode] = useState<ShareMode>(() => {
    if (!getShareToNostrDefault()) return "none";
    return getShareMethodDefault();
  });
  const [replyTo, setReplyTo] = useState("");
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [saveShareSetting, setSaveShareSetting] = useState(() =>
    getSaveShareSettingDefault(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (open) {
      setShareMenuOpen(false);
      setIsSubmitting(false);
      setReplyTo("");
      setSaveShareSetting(getSaveShareSettingDefault());
      if (!getShareToNostrDefault()) {
        setShareMode("none");
      } else {
        setShareMode(getShareMethodDefault());
      }
    }
  }, [open]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [selectedAmount, customAmountValue]);

  const customAmountInvalid =
    selectedAmount === "custom" && customAmountValue <= 0;

  const abandonable = canDeclareAbandoned(updatedAt);

  const waitLabel =
    decay.ageDays === 1
      ? "1 day"
      : decay.ageDays < 7
        ? `${decay.ageDays} days`
        : decay.ageDays < 14
          ? `${Math.floor(decay.ageDays / 7)} week${Math.floor(decay.ageDays / 7) > 1 ? "s" : ""}`
          : `${Math.floor(decay.ageDays / 7)}+ weeks`;

  const opponentNpub = useMemo(() => {
    try {
      return nip19.npubEncode(opponentPubkey);
    } catch {
      return opponentPubkey;
    }
  }, [opponentPubkey]);

  const publicMessage = `Hey nostr:${opponentNpub}, it's been ${waitLabel}. Don't forget to play your turn on #WordsWithZaps!\n\n${gameLink}`;
  const privateMessage = `Hey, it's been ${waitLabel}. Don't forget to play your turn on #WordsWithZaps!\n\n${gameLink}`;

  const publicPreview = `Hey ${opponentName}, it's been ${waitLabel}. Don't forget to play your turn on #WordsWithZaps!\n\n${gameLink}`;

  const hasZap = walletConnected && resolvedAmount > 0;
  const hasShare = shareMode !== "none";
  const shareLabel =
    SHARE_OPTIONS.find((o) => o.value === shareMode)?.label || "Don't share";
  const isPublicMode = shareMode === "public" || shareMode === "public-reply";
  const isPrivateMode = shareMode === "private" || shareMode === "private-dm";
  const previewText = isPrivateMode ? privateMessage : publicPreview;

  const replyToError = useMemo(
    () => (shareMode === "public-reply" ? validateNoteId(replyTo) : null),
    [shareMode, replyTo],
  );
  const replyInvalid =
    shareMode === "public-reply" && (!replyTo || replyToError !== null);

  const confirmLabel = useMemo(() => {
    if (hasZap && hasShare) return "Zap & Send";
    if (hasZap && !hasShare) return "Send Zap";
    if (!hasZap && hasShare) return "Send Nudge";
    return "Done";
  }, [hasShare, hasZap]);

  // Persist share settings
  useEffect(() => {
    if (!saveShareSetting) return;
    if (shareMode === "none") {
      setShareToNostrDefault(false);
      return;
    }
    setShareToNostrDefault(true);
    setShareMethodDefault(shareMode as ShareMethod);
  }, [shareMode, saveShareSetting]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Close share menu on outside click / escape
  useEffect(() => {
    if (!shareMenuOpen) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target as Node)
      ) {
        setShareMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (isSubmitting && shareMenuOpen) setShareMenuOpen(false);
  }, [isSubmitting, shareMenuOpen]);

  const handleConfirm = () => {
    if (isSubmitting || replyInvalid) return;
    if (confirmLabel === "Done") {
      onClose();
      return;
    }
    setIsSubmitting(true);
    Promise.resolve(
      onConfirm({
        zapAmount: customAmountInvalid ? 0 : hasZap ? resolvedAmount : 0,
        shareMode,
        replyTo: shareMode === "public-reply" && replyTo ? replyTo : undefined,
        publicMessage,
        privateMessage,
      }),
    )
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) setIsSubmitting(false);
      });
  };

  return (
    <Modal open={open} title="Send a Nudge" onClose={onClose}>
      <div className="nudge-content">
        <p className="nudge-waiting">
          <strong>{opponentName}</strong> has been idle for{" "}
          <span className={`nudge-time ${decay.tier}`}>{waitLabel}</span>
        </p>

        {walletConnected ? (
          <>
            <div className="zap-amounts">
              <button
                className={`zap-amount-btn ${selectedAmount === 0 ? "active" : ""}`}
                onClick={() => setSelectedAmount(0)}
                type="button"
                disabled={isSubmitting}
              >
                No zap
              </button>
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  className={`zap-amount-btn ${selectedAmount === amount ? "active" : ""}`}
                  onClick={() => setSelectedAmount(amount)}
                  type="button"
                  disabled={isSubmitting}
                >
                  <img
                    src="/assets/bolt-yellow.svg"
                    alt=""
                    className="nudge-bolt"
                  />
                  {amount}
                </button>
              ))}
              <button
                className={`zap-amount-btn ${selectedAmount === "custom" ? "active" : ""}`}
                onClick={() => setSelectedAmount("custom")}
                type="button"
                disabled={isSubmitting}
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
                  onChange={(e) => setCustomAmount(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </>
        ) : onOpenWalletSettings ? (
          <div className="nudge-wallet-cta">
            <p className="nudge-hint">
              Connect a wallet to include a zap with your nudge.
            </p>
            <button
              className="nudge-btn secondary"
              type="button"
              onClick={onOpenWalletSettings}
              disabled={isSubmitting}
            >
              Connect Wallet
            </button>
          </div>
        ) : null}

        <div className="nudge-share-stack">
          <h3>Share</h3>
          <div className="nudge-share-dropdown" ref={shareMenuRef}>
            <button
              className="nudge-share-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={shareMenuOpen}
              onClick={() => setShareMenuOpen((prev) => !prev)}
              disabled={isSubmitting}
            >
              <span>{shareLabel}</span>
              <span className="nudge-share-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {shareMenuOpen && !isSubmitting && (
              <div className="nudge-share-menu" role="listbox">
                {SHARE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={shareMode === option.value}
                    className={`nudge-share-option ${shareMode === option.value ? "active" : ""}`}
                    onClick={() => {
                      setShareMode(option.value);
                      setShareMenuOpen(false);
                    }}
                    disabled={isSubmitting}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {shareMode !== "none" && (
          <div className="nudge-preview">
            <div className="nudge-preview-title">
              {isPublicMode ? "Public note preview" : "DM preview"}
            </div>
            <pre className="nudge-preview-content">{previewText}</pre>
            {shareMode === "public-reply" && (
              <div className="nudge-reply-to">
                <label
                  className="nudge-reply-to-label"
                  htmlFor="nudge-reply-to-input"
                >
                  Reply to note ID
                </label>
                <input
                  id="nudge-reply-to-input"
                  className={`nudge-reply-to-input${replyTo && replyToError ? " invalid" : ""}`}
                  type="text"
                  placeholder="note1..., nevent1..., or hex event ID"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value.trim())}
                  disabled={isSubmitting}
                />
                {replyTo && replyToError && (
                  <span className="nudge-reply-to-error">{replyToError}</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="nudge-actions">
          <label className="nudge-save-setting">
            <input
              type="checkbox"
              checked={saveShareSetting}
              disabled={isSubmitting}
              onChange={() => {
                setSaveShareSetting((prev) => {
                  const next = !prev;
                  setSaveShareSettingDefault(next);
                  if (next) {
                    if (shareMode === "none") {
                      setShareToNostrDefault(false);
                    } else {
                      setShareToNostrDefault(true);
                      setShareMethodDefault(shareMode as ShareMethod);
                    }
                  }
                  return next;
                });
              }}
            />
            <span>Save share setting</span>
          </label>
          <button
            className="nudge-btn primary"
            onClick={handleConfirm}
            disabled={isSubmitting || replyInvalid}
          >
            {isSubmitting ? "Sending..." : confirmLabel}
          </button>
        </div>

        {abandonable && onDeclareAbandoned && (
          <div className="nudge-abandon">
            <p className="nudge-abandon-hint">
              This game has been idle for {waitLabel}. You can declare it
              abandoned — neither player wins or loses.
            </p>
            <button
              className="nudge-btn abandon"
              onClick={onDeclareAbandoned}
              disabled={isSubmitting}
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
