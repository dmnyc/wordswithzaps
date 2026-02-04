import { useMemo } from "react";
import { nip19 } from "nostr-tools";
import type { NostrProfile } from "../types/nostr";
import Modal from "./Modal";
import "./PlayerProfileModal.css";

interface PlayerProfileModalProps {
  open: boolean;
  profile: NostrProfile | null;
  pubkey: string;
  onClose: () => void;
}

export function PlayerProfileModal({
  open,
  profile,
  pubkey,
  onClose,
}: PlayerProfileModalProps) {
  const npub = useMemo(() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  }, [pubkey]);

  const displayName =
    profile?.displayName || profile?.name || npub.slice(0, 16) + "...";
  const truncatedNpub = npub.slice(0, 20) + "..." + npub.slice(-6);
  const jumbleUrl = `https://jumble.social/${npub}`;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="player-profile">
        <div className="player-profile-header">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="player-profile-avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const fallback = (e.target as HTMLImageElement)
                  .nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="player-profile-avatar fallback"
            style={{
              display: profile?.picture ? "none" : "flex",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="player-profile-info">
            <div className="player-profile-name">{displayName}</div>
            {profile?.nip05 && (
              <div className="player-profile-nip05">{profile.nip05}</div>
            )}
            <div className="player-profile-npub" title={npub}>
              {truncatedNpub}
            </div>
          </div>
        </div>

        {profile?.about && (
          <p className="player-profile-about">{profile.about}</p>
        )}

        <a
          href={jumbleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="player-profile-link"
        >
          View on Jumble
          <svg
            className="player-profile-link-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </Modal>
  );
}

export default PlayerProfileModal;
