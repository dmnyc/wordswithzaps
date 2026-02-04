import { useCallback, useMemo, useState } from "react";
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
  const [copied, setCopied] = useState(false);

  const handleCopyNpub = useCallback(() => {
    navigator.clipboard.writeText(npub).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [npub]);

  const websiteDisplay = useMemo(() => {
    if (!profile?.website) return null;
    try {
      const url = new URL(
        profile.website.startsWith("http")
          ? profile.website
          : `https://${profile.website}`,
      );
      return { label: url.hostname.replace(/^www\./, ""), href: url.href };
    } catch {
      return { label: profile.website, href: profile.website };
    }
  }, [profile?.website]);

  return (
    <Modal open={open} onClose={onClose} className="player-profile-modal">
      <div className="player-profile">
        {/* Banner */}
        <div
          className={`player-profile-banner ${profile?.banner ? "" : "no-image"}`}
        >
          {profile?.banner && (
            <img
              src={profile.banner}
              alt=""
              className="player-profile-banner-img"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement?.classList.add(
                  "no-image",
                );
              }}
            />
          )}
        </div>

        {/* Avatar overlapping banner */}
        <div className="player-profile-avatar-wrap">
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
        </div>

        {/* Identity */}
        <div className="player-profile-identity">
          <div className="player-profile-name">{displayName}</div>
          {profile?.nip05 && (
            <div className="player-profile-nip05">{profile.nip05}</div>
          )}
          <button
            className="player-profile-npub"
            type="button"
            title="Copy npub"
            onClick={handleCopyNpub}
          >
            {copied ? "Copied!" : truncatedNpub}
          </button>
        </div>

        {/* Bio */}
        {profile?.about && (
          <p className="player-profile-about">{profile.about}</p>
        )}

        {/* Meta row: website + lightning address */}
        {(websiteDisplay || profile?.lud16) && (
          <div className="player-profile-meta">
            {websiteDisplay && (
              <a
                href={websiteDisplay.href}
                target="_blank"
                rel="noopener noreferrer"
                className="player-profile-meta-item"
              >
                <svg
                  className="player-profile-meta-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                {websiteDisplay.label}
              </a>
            )}
            {profile?.lud16 && (
              <div className="player-profile-meta-item">
                <img
                  src="/assets/bolt-yellow.svg"
                  alt=""
                  className="player-profile-meta-icon bolt"
                />
                <span className="player-profile-lud16">{profile.lud16}</span>
              </div>
            )}
          </div>
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
