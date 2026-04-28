import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Modal } from "./Modal";
import { SendIcon } from "./icons/NotificationIcons";
import { useGameChat } from "../hooks/useGameChat";
import { fetchProfile } from "../nostr/profiles";
import type { NostrProfile } from "../types/nostr";
import type { ShareImageAttachment } from "../nostr/share";
import "./GameChatPanel.css";

interface GameChatPanelProps {
  open: boolean;
  onClose: () => void;
  gameId: string;
  creatorPubkey: string;
  otherPlayerPubkey: string;
  participantPubkeys: string[];
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
  // If provided, enables a "Send board snapshot" button. The handler
  // renders + uploads the current board and resolves with the
  // attachment metadata; the panel then sends it as a chat message.
  onCaptureSnapshot?: () => Promise<ShareImageAttachment | null>;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 10) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const IMAGE_URL_RE =
  /(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s)]*)?)/gi;

interface ChatContentParts {
  imageUrls: string[];
  text: string;
}

function splitContent(content: string): ChatContentParts {
  const imageUrls: string[] = [];
  const text = content.replace(IMAGE_URL_RE, (match) => {
    imageUrls.push(match);
    return "";
  });
  return { imageUrls, text: text.trim() };
}

export default function GameChatPanel({
  open,
  onClose,
  gameId,
  creatorPubkey,
  otherPlayerPubkey,
  participantPubkeys,
  onToast,
  onCaptureSnapshot,
}: GameChatPanelProps) {
  const { messages, myPubkey, send, markRead } = useGameChat({
    gameId,
    creatorPubkey,
    otherPlayerPubkey,
  });

  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(
    new Map(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inFlightProfiles = useRef<Set<string>>(new Set());

  // Mark chat read whenever the panel is open and new messages arrive
  useEffect(() => {
    if (open) markRead();
  }, [open, messages.length, markRead]);

  // Auto-scroll to bottom when new messages come in or panel opens
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages.length]);

  // Fetch profiles for everyone who has chatted in this game (plus both players)
  useEffect(() => {
    if (!open) return;
    const all = new Set<string>(participantPubkeys);
    for (const m of messages) all.add(m.fromPubkey);
    const missing = Array.from(all).filter(
      (pk) => pk && !profiles.has(pk) && !inFlightProfiles.current.has(pk),
    );
    if (missing.length === 0) return;
    missing.forEach((pk) => inFlightProfiles.current.add(pk));
    Promise.all(missing.map((pk) => fetchProfile(pk))).then((results) => {
      missing.forEach((pk) => inFlightProfiles.current.delete(pk));
      const next = new Map(profiles);
      results.forEach((profile, i) => {
        if (profile) next.set(missing[i], profile);
      });
      if (next.size !== profiles.size) setProfiles(next);
    });
  }, [open, messages, participantPubkeys, profiles]);

  const getDisplayName = useCallback(
    (pubkey: string) => {
      if (pubkey === myPubkey) return "You";
      const profile = profiles.get(pubkey);
      return (
        profile?.displayName || profile?.name || truncatePubkey(pubkey)
      );
    },
    [profiles, myPubkey],
  );

  const getPicture = useCallback(
    (pubkey: string) => profiles.get(pubkey)?.picture,
    [profiles],
  );

  const handleSend = useCallback(async () => {
    const text = composeText.trim();
    if (!text || sending) return;
    setSending(true);
    setComposeText("");
    try {
      await send(text);
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Failed to send message",
        "error",
      );
      setComposeText(text);
    } finally {
      setSending(false);
    }
  }, [composeText, sending, send, onToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSendSnapshot = useCallback(async () => {
    if (!onCaptureSnapshot || snapshotting || sending) return;
    setSnapshotting(true);
    try {
      const image = await onCaptureSnapshot();
      if (!image) return;
      await send(composeText.trim(), image);
      setComposeText("");
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Snapshot failed",
        "error",
      );
    } finally {
      setSnapshotting(false);
    }
  }, [onCaptureSnapshot, snapshotting, sending, send, composeText, onToast]);

  const headerLabel = useMemo(() => "Game Chat", []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={headerLabel}
      className="game-chat-modal"
    >
      <div className="game-chat-thread">
        <div className="game-chat-notice">
          Public chat for this game. Messages are visible to anyone with the
          game link.
        </div>
        <div className="game-chat-messages">
          {messages.length === 0 ? (
            <div className="game-chat-empty">
              No messages yet — say hi to your opponent!
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.fromPubkey === myPubkey;
              const picture = getPicture(msg.fromPubkey);
              const name = getDisplayName(msg.fromPubkey);
              return (
                <div
                  key={msg.id}
                  className={`game-chat-message ${isMine ? "sent" : "received"} ${
                    msg.pending ? "pending" : ""
                  } ${msg.failed ? "failed" : ""}`}
                >
                  {!isMine &&
                    (picture ? (
                      <img
                        src={picture}
                        alt=""
                        className="game-chat-avatar"
                      />
                    ) : (
                      <div className="game-chat-avatar-fallback">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  <div className="game-chat-bubble">
                    {!isMine && (
                      <div className="game-chat-author">{name}</div>
                    )}
                    {(() => {
                      const { imageUrls, text } = splitContent(msg.content);
                      return (
                        <>
                          {imageUrls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="game-chat-image-link"
                            >
                              <img
                                src={url}
                                alt="Board snapshot"
                                className="game-chat-image"
                                loading="lazy"
                              />
                            </a>
                          ))}
                          {text && (
                            <div className="game-chat-text">{text}</div>
                          )}
                        </>
                      );
                    })()}
                    <div className="game-chat-meta">
                      <span className="game-chat-time">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                      {msg.pending && (
                        <span className="game-chat-status">sending…</span>
                      )}
                      {msg.failed && (
                        <span className="game-chat-status failed">
                          failed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="game-chat-compose">
          {onCaptureSnapshot && (
            <button
              className="game-chat-snapshot"
              onClick={handleSendSnapshot}
              disabled={snapshotting || sending || !myPubkey}
              type="button"
              aria-label="Send board snapshot"
              title="Send board snapshot"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="game-chat-snapshot-icon"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {snapshotting && (
                <span className="game-chat-snapshot-spinner" aria-hidden="true" />
              )}
            </button>
          )}
          <textarea
            className="game-chat-input"
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={sending || !myPubkey}
            rows={2}
          />
          <button
            className="game-chat-send"
            onClick={handleSend}
            disabled={!composeText.trim() || sending || !myPubkey}
            type="button"
            aria-label="Send message"
          >
            <SendIcon className="game-chat-send-icon" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
