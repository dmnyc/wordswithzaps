import { useEffect, useRef, useState } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import "./NavBar.css";

interface WalletState {
  connected: boolean;
  provider?: string;
}

interface NavBarProps {
  user: NDKUser | null;
  onDisconnect: () => void;
  onBackToLobby?: () => void;
  walletState?: WalletState;
  isWebLNAvailable?: boolean;
  onConnectWallet?: () => void;
  onShareGame?: () => void;
}

export function NavBar({
  user,
  onDisconnect,
  onBackToLobby,
  walletState,
  isWebLNAvailable,
  onConnectWallet,
  onShareGame,
}: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setProfileSnapshot(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      try {
        await user.fetchProfile();
      } catch {
        // Ignore fetch errors; we'll still try to read cached profile.
      }

      if (cancelled) return;
      if (user.profile) {
        setProfileSnapshot({ ...user.profile });
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.pubkey]);

  const profile =
    (profileSnapshot as {
      displayName?: string;
      display_name?: string;
      name?: string;
      picture?: string;
      image?: string;
    } | null) || user?.profile;
  const displayName =
    profile?.displayName || profile?.display_name || profile?.name || "You";
  const picture = profile?.picture || profile?.image;

  return (
    <nav className="main-nav">
      <div className="nav-left">
        <img
          src="/assets/wwz_logo_full_horiz.svg"
          alt="Words With Zaps"
          className="nav-logo full"
        />
        <img
          src="/assets/wwz_logo_abbr_horiz.svg"
          alt="Words With Zaps"
          className="nav-logo abbr"
        />
      </div>

      <div className="nav-right" ref={menuRef}>
        {walletState !== undefined && (
          <div className="wallet-status">
            {walletState.connected ? (
              <span className="wallet-connected" title="Wallet connected">
                <img
                  src="/assets/bolt.svg"
                  alt="Connected"
                  className="bolt-icon"
                />
              </span>
            ) : isWebLNAvailable && onConnectWallet ? (
              <button
                className="wallet-connect-btn"
                onClick={onConnectWallet}
                title="Connect Lightning wallet"
              >
                <img src="/assets/bolt.svg" alt="" className="bolt-icon" />{" "}
                Connect
              </button>
            ) : null}
          </div>
        )}

        <button
          className="user-button"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {picture ? (
            <img
              src={picture}
              alt={displayName}
              className="user-avatar"
              onError={(event) => {
                (event.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
              }}
            />
          ) : (
            <div className="user-avatar fallback">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="user-name">{displayName}</span>
          <span className={`menu-caret ${menuOpen ? "open" : ""}`}>▾</span>
        </button>

        {menuOpen && (
          <div className="user-menu">
            {onShareGame && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onShareGame();
                }}
              >
                Copy Game Link
              </button>
            )}
            {onBackToLobby && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onBackToLobby();
                }}
              >
                Back to Lobby
              </button>
            )}
            <button
              className="menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                onDisconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default NavBar;
