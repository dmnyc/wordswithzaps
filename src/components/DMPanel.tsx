import { useState, useEffect, useRef, useCallback } from "react";
import { nip19 } from "nostr-tools";
import { useDM } from "../hooks/useDM";
import { fetchProfile } from "../nostr/profiles";
import type { NostrProfile } from "../types/nostr";
import { getCurrentUser } from "../nostr/client";
import { Modal } from "./Modal";
import ContactSearch from "./ContactSearch";
import MentionInput from "./MentionInput";
import { ArrowLeftIcon, SendIcon, PlusIcon } from "./icons/NotificationIcons";
import "./DMPanel.css";

interface DMPanelProps {
  open: boolean;
  onClose: () => void;
  initialPubkey?: string | null;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
}

type View = "list" | "thread" | "search";

export default function DMPanel({
  open,
  onClose,
  initialPubkey,
  onToast,
}: DMPanelProps) {
  const { conversations, getMessages, markConversationRead, sendMessage } =
    useDM();
  const [view, setView] = useState<View>("list");
  const [activePubkey, setActivePubkey] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(
    new Map(),
  );
  const inFlight = useRef<Set<string>>(new Set());
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle initial pubkey navigation
  useEffect(() => {
    if (open && initialPubkey) {
      setActivePubkey(initialPubkey);
      setView("thread");
    }
  }, [open, initialPubkey]);

  // Reset view on close
  useEffect(() => {
    if (!open) {
      setView("list");
      setActivePubkey(null);
      setComposeText("");
      inFlight.current.clear();
    }
  }, [open]);

  const currentUser = getCurrentUser();
  const myPubkey = currentUser?.pubkey || "";

  // Fetch profiles for conversations
  useEffect(() => {
    if (!open) return;
    const pubkeys = conversations.map((c) => c.pubkey);
    if (activePubkey && !pubkeys.includes(activePubkey)) {
      pubkeys.push(activePubkey);
    }
    if (myPubkey && !pubkeys.includes(myPubkey)) {
      pubkeys.push(myPubkey);
    }
    const missing = pubkeys.filter(
      (pk) => !profiles.has(pk) && !inFlight.current.has(pk),
    );
    if (missing.length === 0) return;

    // Mark as in-flight to prevent duplicate fetches
    missing.forEach((pk) => inFlight.current.add(pk));

    Promise.all(missing.map((pk) => fetchProfile(pk))).then((results) => {
      // Clear in-flight
      missing.forEach((pk) => inFlight.current.delete(pk));

      const newProfiles = new Map<string, NostrProfile>();
      results.forEach((profile, i) => {
        if (profile) newProfiles.set(missing[i], profile);
      });
      if (newProfiles.size > 0) {
        setProfiles((prev) => {
          const next = new Map(prev);
          newProfiles.forEach((p, pk) => next.set(pk, p));
          return next;
        });
      }
    });
  }, [open, conversations, activePubkey, myPubkey]);

  // Mark conversation read when viewing thread
  useEffect(() => {
    if (view === "thread" && activePubkey) {
      markConversationRead(activePubkey);
    }
  }, [view, activePubkey, markConversationRead]);

  // Scroll to bottom when messages change
  const messages = activePubkey ? getMessages(activePubkey) : [];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const openThread = useCallback((pubkey: string) => {
    setActivePubkey(pubkey);
    setView("thread");
    setComposeText("");
  }, []);

  const handleSend = useCallback(async () => {
    if (!activePubkey || !composeText.trim() || sending) return;
    const text = composeText.trim();
    setComposeText("");
    setSending(true);

    try {
      await sendMessage(activePubkey, text, "nip04");
    } catch (err) {
      onToast?.(
        err instanceof Error ? err.message : "Failed to send message",
        "error",
      );
      setComposeText(text); // Restore on failure
    } finally {
      setSending(false);
    }
  }, [activePubkey, composeText, sending, sendMessage, onToast]);

  const resolveNostrMentions = useCallback(
    (text: string) => {
      // Match full npubs and truncated ones (e.g. nostr:npub1abc...! or nostr:npub1abc…)
      return text.replace(
        /nostr:npub1[a-z0-9]+(?:(?:\.\.\.|…)[a-z0-9]*)?/g,
        (match) => {
          const bare = match.replace("nostr:", "");
          // Try decoding full npubs
          try {
            const decoded = nip19.decode(bare);
            if (decoded.type === "npub") {
              const profile = profiles.get(decoded.data);
              if (profile?.displayName || profile?.name) {
                return profile.displayName || profile.name!;
              }
            }
          } catch {
            /* truncated or invalid — try prefix match */
          }

          // For truncated npubs, match by prefix against known profiles
          const npubPrefix = bare.replace(/(?:\.\.\.|…).*$/, "");
          if (npubPrefix.length >= 10) {
            for (const [pubkey, profile] of profiles) {
              try {
                const fullNpub = nip19.npubEncode(pubkey);
                if (fullNpub.startsWith(npubPrefix)) {
                  return profile.displayName || profile.name || match;
                }
              } catch {
                continue;
              }
            }
          }

          return match;
        },
      );
    },
    [profiles],
  );

  const renderMessageContent = useCallback(
    (text: string) => {
      const resolved = resolveNostrMentions(text);
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const parts = resolved.split(urlPattern);
      if (parts.length === 1) return resolved;
      return parts.map((part, i) =>
        urlPattern.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="dm-message-link"
          >
            {part}
          </a>
        ) : (
          part
        ),
      );
    },
    [resolveNostrMentions],
  );

  const getDisplayName = (pubkey: string) => {
    const profile = profiles.get(pubkey);
    return profile?.displayName || profile?.name || pubkey.slice(0, 12) + "...";
  };

  const getPicture = (pubkey: string) => profiles.get(pubkey)?.picture;

  function formatTime(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function formatMessageTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        view === "list"
          ? "Messages"
          : view === "search"
            ? "New Message"
            : "Direct Message"
      }
      className="dm-panel-modal"
    >
      {/* Contact Search View */}
      {view === "search" && (
        <ContactSearch
          onSelect={(pubkey) => openThread(pubkey)}
          onClose={() => setView("list")}
        />
      )}

      {/* Conversation List View */}
      {view === "list" && (
        <div className="dm-conversation-list">
          <button
            className="dm-new-message-btn"
            onClick={() => setView("search")}
          >
            <PlusIcon className="dm-new-message-icon" />
            New Message
          </button>

          {conversations.length === 0 ? (
            <div className="dm-empty-state">
              No conversations yet — start one!
            </div>
          ) : (
            conversations.map((convo) => {
              const name = getDisplayName(convo.pubkey);
              const picture = getPicture(convo.pubkey);
              return (
                <button
                  key={convo.pubkey}
                  className="dm-conversation-item"
                  onClick={() => openThread(convo.pubkey)}
                >
                  {picture ? (
                    <img src={picture} alt="" className="dm-convo-avatar" />
                  ) : (
                    <div className="dm-convo-avatar-fallback">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="dm-convo-body">
                    <div className="dm-convo-top">
                      <span className="dm-convo-name">{name}</span>
                      <span className="dm-convo-time">
                        {formatTime(convo.lastMessageAt)}
                      </span>
                    </div>
                    <div className="dm-convo-preview">
                      {resolveNostrMentions(convo.lastMessagePreview)}
                    </div>
                  </div>
                  {convo.unreadCount > 0 && (
                    <span className="dm-convo-unread">{convo.unreadCount}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Thread View */}
      {view === "thread" &&
        activePubkey &&
        (() => {
          return (
            <div className="dm-thread">
              <div className="dm-thread-header">
                <button
                  className="dm-thread-back"
                  onClick={() => {
                    setView("list");
                    setActivePubkey(null);
                  }}
                >
                  <ArrowLeftIcon className="dm-thread-back-icon" />
                </button>
                {getPicture(activePubkey) ? (
                  <img
                    src={getPicture(activePubkey)}
                    alt=""
                    className="dm-thread-avatar"
                  />
                ) : (
                  <div className="dm-thread-avatar-fallback">
                    {getDisplayName(activePubkey).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="dm-thread-name">
                  {getDisplayName(activePubkey)}
                </span>
              </div>

              <div className="dm-thread-messages">
                {messages.length === 0 && (
                  <div className="dm-empty-state">
                    Send a message to start the conversation
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.fromPubkey === myPubkey;
                  return (
                    <div
                      key={msg.id}
                      className={`dm-message ${isMine ? "sent" : "received"} ${msg.protocol} ${msg.pending ? "pending" : ""} ${msg.failed ? "failed" : ""}`}
                    >
                      <div className="dm-message-bubble">
                        <div className="dm-message-text">
                          {renderMessageContent(msg.content)}
                        </div>
                        <div className="dm-message-meta">
                          <span className="dm-message-time">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                          {msg.pending && (
                            <span className="dm-message-status">
                              sending...
                            </span>
                          )}
                          {msg.failed && (
                            <span className="dm-message-status failed">
                              failed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="dm-compose-protocol">
                <span className="dm-protocol-compat-note">
                  Messages are sent in the most compatible format.
                </span>
              </div>
              <div className="dm-compose nip04">
                <MentionInput
                  value={composeText}
                  onChange={setComposeText}
                  onSubmit={handleSend}
                  placeholder="Type a message..."
                  disabled={sending}
                />
                <button
                  className="dm-compose-send"
                  onClick={handleSend}
                  disabled={!composeText.trim() || sending}
                >
                  <SendIcon className="dm-compose-send-icon" />
                </button>
              </div>
            </div>
          );
        })()}
    </Modal>
  );
}
