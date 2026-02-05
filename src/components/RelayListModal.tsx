import { useState } from "react";
import Modal from "./Modal";
import "./RelayListModal.css";

interface RelayListModalProps {
  open: boolean;
  relays: string[];
  connectedRelays?: string[];
  gameId?: string;
  onRebroadcast?: (gameId: string) => Promise<number>;
  onClose: () => void;
}

export function RelayListModal({
  open,
  relays,
  connectedRelays = [],
  gameId,
  onRebroadcast,
  onClose,
}: RelayListModalProps) {
  const [isRebroadcasting, setIsRebroadcasting] = useState(false);
  const [rebroadcastResult, setRebroadcastResult] = useState<string | null>(
    null,
  );
  const sortedRelays = [...relays].sort();
  const normalize = (relay: string) =>
    relay.trim().toLowerCase().replace(/\/+$/, "");
  const connectedSet = new Set(connectedRelays.map(normalize));

  const handleRebroadcast = async () => {
    if (!gameId || !onRebroadcast || isRebroadcasting) return;
    setIsRebroadcasting(true);
    setRebroadcastResult(null);
    try {
      const count = await onRebroadcast(gameId);
      setRebroadcastResult(`Sent to ${count} relay${count === 1 ? "" : "s"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to rebroadcast";
      setRebroadcastResult(`Error: ${msg}`);
    } finally {
      setIsRebroadcasting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Relays">
      <div className="relay-list-summary">
        {sortedRelays.length} relay{sortedRelays.length === 1 ? "" : "s"} in
        pool
      </div>
      {sortedRelays.length === 0 ? (
        <div className="relay-list-empty">No relays connected.</div>
      ) : (
        <ul className="relay-list">
          {sortedRelays.map((relay) => {
            const isConnected = connectedSet.has(normalize(relay));
            return (
              <li
                key={relay}
                className={`relay-list-item ${isConnected ? "active" : "inactive"}`}
              >
                <span
                  className="relay-status-dot"
                  aria-label={isConnected ? "Active relay" : "Inactive relay"}
                  title={isConnected ? "Active" : "Inactive"}
                />
                <span className="relay-url">{relay}</span>
              </li>
            );
          })}
        </ul>
      )}

      {gameId && onRebroadcast && (
        <div className="relay-rebroadcast">
          <p className="relay-rebroadcast-hint">
            If your opponent can't find this game, try rebroadcasting to all
            relays.
          </p>
          <button
            type="button"
            className="relay-rebroadcast-btn"
            onClick={handleRebroadcast}
            disabled={isRebroadcasting}
          >
            {isRebroadcasting ? "Broadcasting..." : "Rebroadcast Game"}
          </button>
          {rebroadcastResult && (
            <p
              className={`relay-rebroadcast-result ${rebroadcastResult.startsWith("Error") ? "error" : "success"}`}
            >
              {rebroadcastResult}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default RelayListModal;
