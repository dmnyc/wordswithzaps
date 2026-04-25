import { useState, useCallback, useEffect, useRef } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import { QRCodeSVG } from "qrcode.react";
import { decode } from "nostr-tools/nip19";
import type { Nip46Progress, NostrConnectSession } from "../hooks/useNostr";
import {
  BoltIcon,
  LockIcon,
  KeyIcon,
  CameraIcon,
  ClipboardIcon,
  UserIcon,
} from "./icons/LoginIcons";
import { ZTileLoader } from "./ZTileLoader";
import "./LoginScreen.css";

const ENABLE_NOSTRCONNECT_QR = true;

type LoginView =
  | "main"
  | "nip46-options"
  | "nip46-qr"
  | "nip46-bunker"
  | "nsec-login"
  | "create-keys"
  | "create-profile";

interface GeneratedKeys {
  nsec: string;
  npub: string;
  secretKeyHex: string;
}

interface LoginScreenProps {
  onConnected: () => void;
  user: NDKUser | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<void>;
  connectWithBunker: (bunkerUri: string) => Promise<void>;
  generateKeypair: () => GeneratedKeys;
  startNostrConnect: () => Promise<NostrConnectSession>;
  waitForNostrConnect: (session: NostrConnectSession) => Promise<void>;
  cancelNostrConnect: () => void;
  nip46Progress: Nip46Progress | null;
}

export function LoginScreen({
  onConnected,
  user,
  isConnecting,
  error,
  connect,
  connectWithPrivateKey,
  connectWithBunker,
  generateKeypair,
  startNostrConnect,
  waitForNostrConnect,
  cancelNostrConnect,
  nip46Progress,
}: LoginScreenProps) {
  const [view, setView] = useState<LoginView>("main");
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(
    null,
  );
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bunkerUri, setBunkerUri] = useState("");
  const [nsecInput, setNsecInput] = useState("");
  const [nsecError, setNsecError] = useState<string | null>(null);
  const [nip46Waiting, setNip46Waiting] = useState(false);
  const [nip46Timeout, setNip46Timeout] = useState(40);
  const [copied, setCopied] = useState<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [qrTimedOut, setQrTimedOut] = useState(false);
  const nostrConnectSessionRef = useRef<NostrConnectSession | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const qrTimeoutRef = useRef<number | null>(null);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      if (qrTimeoutRef.current) {
        clearTimeout(qrTimeoutRef.current);
      }
    };
  }, []);

  const handleExtensionConnect = async () => {
    try {
      await connect();
      onConnected();
    } catch {
      // Error is displayed via the error prop
    }
  };

  const handleCreateAccount = useCallback(() => {
    const keys = generateKeypair();
    setGeneratedKeys(keys);
    setView("create-keys");
  }, [generateKeypair]);

  const handleNsecLogin = useCallback(async () => {
    const trimmed = nsecInput.trim();
    if (!trimmed) return;
    setNsecError(null);

    // Detect common wrong key types
    if (trimmed.startsWith("npub1")) {
      setNsecError("That's a public key (npub). You need your private key (nsec).");
      return;
    }
    if (trimmed.startsWith("nprofile1") || trimmed.startsWith("nevent1") || trimmed.startsWith("naddr1") || trimmed.startsWith("note1")) {
      setNsecError("That's not a private key. You need an nsec1... key.");
      return;
    }
    if (!trimmed.startsWith("nsec1")) {
      setNsecError("Invalid key format. Must start with nsec1...");
      return;
    }

    try {
      const { type, data } = decode(trimmed);
      if (type !== "nsec") {
        setNsecError("Invalid key format. Must be an nsec1... private key.");
        return;
      }
      // data is Uint8Array, connectWithPrivateKey expects hex string
      const hexKey = Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await connectWithPrivateKey(hexKey);
      onConnected();
    } catch {
      setNsecError("Invalid nsec key. Please check and try again.");
    }
  }, [nsecInput, connectWithPrivateKey, onConnected]);

  const downloadBackupFile = useCallback(() => {
    if (!generatedKeys) return;

    const date = new Date().toISOString().split("T")[0];
    const content = `Words With Zaps - Nostr Keys Backup
Generated: ${new Date().toLocaleString()}

PRIVATE KEY (keep secret!):
${generatedKeys.nsec}

PUBLIC KEY (safe to share):
${generatedKeys.npub}

WARNING: Never share your private key. Store this file securely.`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wordswithzaps-keys-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  }, [generatedKeys]);

  const handleKeysConfirmed = useCallback(() => {
    setView("create-profile");
  }, []);

  const handleFinishCreate = useCallback(async () => {
    if (!generatedKeys) return;
    try {
      await connectWithPrivateKey(generatedKeys.secretKeyHex);
      // TODO: If displayName is set, update profile
      onConnected();
    } catch {
      // Error handled by hook
    }
  }, [generatedKeys, connectWithPrivateKey, onConnected]);

  const handleBunkerConnect = useCallback(async () => {
    if (!bunkerUri.trim()) return;

    setNip46Waiting(true);
    setNip46Timeout(40);

    // Start countdown timer
    timeoutRef.current = window.setInterval(() => {
      setNip46Timeout((prev) => {
        if (prev <= 1) {
          if (timeoutRef.current) {
            clearInterval(timeoutRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      await connectWithBunker(bunkerUri.trim());
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      onConnected();
    } catch {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      setNip46Waiting(false);
      // Error handled by hook
    }
  }, [bunkerUri, connectWithBunker, onConnected]);

  const handleShowQRCode = useCallback(async () => {
    setView("nip46-qr");
    setQrTimedOut(false);
    try {
      const session = await startNostrConnect();
      setNostrConnectUri(session.uri);
      nostrConnectSessionRef.current = session;
      qrTimeoutRef.current = window.setTimeout(
        () => setQrTimedOut(true),
        30000,
      );

      // Start waiting for connection in background
      waitForNostrConnect(session)
        .then(() => {
          onConnected();
        })
        .catch(() => {
          // Error handled by hook or cancelled
        });
    } catch {
      // Error handled by hook
    }
  }, [startNostrConnect, waitForNostrConnect, onConnected]);

  const handleCancelQR = useCallback(() => {
    cancelNostrConnect();
    setNostrConnectUri(null);
    nostrConnectSessionRef.current = null;
    setQrTimedOut(false);
    if (qrTimeoutRef.current) {
      clearTimeout(qrTimeoutRef.current);
      qrTimeoutRef.current = null;
    }
    setView("nip46-options");
  }, [cancelNostrConnect]);

  const handleCancelNip46 = useCallback(() => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
    setNip46Waiting(false);
    setNip46Timeout(40);
  }, []);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const resetToMain = useCallback(() => {
    setView("main");
    setGeneratedKeys(null);
    setShowPrivateKey(false);
    setBackupDownloaded(false);
    setDisplayName("");
    setBunkerUri("");
    setNsecInput("");
    setNsecError(null);
    setNip46Waiting(false);
    setNostrConnectUri(null);
    nostrConnectSessionRef.current = null;
    cancelNostrConnect();
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
  }, [cancelNostrConnect]);

  // If user is connected, show continue button
  if (user) {
    const profileName =
      user.profile?.displayName ||
      user.profile?.display_name ||
      user.profile?.name;
    return (
      <div className="login-screen">
        <div className="login-card">
          <img
            src="/assets/wwz_logo_stack.svg"
            alt="Words With Zaps"
            className="login-logo"
          />
          <div className="login-connected">
            {profileName ? (
              <>
                <p>Connected as:</p>
                <p className="login-pubkey">{profileName}</p>
              </>
            ) : (
              <div className="login-connecting-state">
                <ZTileLoader />
                <p>Connecting...</p>
              </div>
            )}
            <button className="login-btn" onClick={onConnected}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img
          src="/assets/wwz_logo_stack.svg"
          alt="Words With Zaps"
          className="login-logo"
        />
        <p className="login-subtitle">A P2P Crossword Game on Nostr</p>

        {error && <div className="login-error">{error}</div>}

        {/* Main View - Option Cards */}
        {view === "main" && (
          <div className="login-options">
            {/* Extension Option */}
            <button
              className="login-option-card extension"
              onClick={handleExtensionConnect}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-yellow">
                <BoltIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">
                  {isConnecting ? "Connecting..." : "Browser Extension"}
                </div>
                <div className="login-option-desc">
                  Alby, nos2x, or other NIP-07 extension
                </div>
              </div>
            </button>

            {/* Remote Signer Option */}
            <button
              className="login-option-card remote"
              onClick={() => setView("nip46-options")}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-purple">
                <LockIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">Remote Signer</div>
                <div className="login-option-desc">
                  Amber or another NIP-46 bunker
                </div>
              </div>
            </button>

            {/* Private Key Option */}
            <button
              className="login-option-card nsec"
              onClick={() => setView("nsec-login")}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-orange">
                <KeyIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">Private Key</div>
                <div className="login-option-desc">Enter nsec or create new keys</div>
              </div>
            </button>
          </div>
        )}

        {/* NIP-46 Options */}
        {view === "nip46-options" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <div className="login-option-icon icon-purple">
                <LockIcon />
              </div>
              <div className="login-option-title">Remote Signer</div>
            </div>

            <div className="login-suboptions">
              {ENABLE_NOSTRCONNECT_QR && (
                <button className="login-suboption" onClick={handleShowQRCode}>
                  <span className="login-suboption-icon icon-blue">
                    <CameraIcon />
                  </span>
                  <div>
                    <div className="login-suboption-title">Scan QR Code</div>
                    <div className="login-suboption-desc">
                      For Primal mobile and other apps
                    </div>
                  </div>
                </button>
              )}

              <button
                className="login-suboption"
                onClick={() => setView("nip46-bunker")}
              >
                <span className="login-suboption-icon icon-orange">
                  <ClipboardIcon />
                </span>
                <div>
                  <div className="login-suboption-title">Paste Bunker URL</div>
                  <div className="login-suboption-desc">
                    For Amber and other signers
                  </div>
                </div>
              </button>
            </div>

            <button className="login-cancel" onClick={resetToMain}>
              Cancel
            </button>
          </div>
        )}

        {/* NIP-46 QR Code */}
        {ENABLE_NOSTRCONNECT_QR && view === "nip46-qr" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-blue">
                <CameraIcon />
              </span>
              <div className="login-option-title">Scan with Remote Signer</div>
            </div>

            {nostrConnectUri ? (
              <div className="login-qr-container">
                <div className="login-qr-code">
                  <QRCodeSVG
                    value={nostrConnectUri}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                    imageSettings={{
                      src: "/favicon.svg",
                      height: 28,
                      width: 28,
                      excavate: true,
                    }}
                  />
                </div>

                <div className="login-qr-uri">
                  <span className="login-qr-uri-text">
                    {nostrConnectUri.substring(0, 32)}...
                  </span>
                  <button
                    className="login-qr-copy"
                    onClick={() =>
                      copyToClipboard(nostrConnectUri, "nostrconnect")
                    }
                  >
                    {copied === "nostrconnect" ? "✓" : "Copy"}
                  </button>
                </div>

                <div className="login-qr-waiting">
                  <ZTileLoader size="sm" />
                  <span>Waiting for connection...</span>
                </div>
                <p className="login-hint">
                  Best with Primal. Amber users should use the Bunker URL flow
                  instead.
                </p>
                {qrTimedOut && (
                  <div className="login-qr-timeout-hint">
                    If your connection is taking too long, try resetting your
                    signer.
                  </div>
                )}
              </div>
            ) : (
              <div className="login-qr-loading">
                <ZTileLoader />
                <p>Generating QR code...</p>
              </div>
            )}

            <button className="login-cancel" onClick={handleCancelQR}>
              Cancel
            </button>
          </div>
        )}

        {/* NIP-46 Bunker URL */}
        {view === "nip46-bunker" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-orange">
                <ClipboardIcon />
              </span>
              <div className="login-option-title">Paste Bunker URL</div>
            </div>

            {!nip46Waiting ? (
              <>
                <input
                  type="text"
                  className="login-input"
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                />

                <div className="login-btn-row">
                  <button
                    className="login-btn-secondary"
                    onClick={() => setView("nip46-options")}
                  >
                    Back
                  </button>
                  <button
                    className="login-btn"
                    onClick={handleBunkerConnect}
                    disabled={!bunkerUri.trim() || isConnecting}
                  >
                    Connect
                  </button>
                </div>

                <p className="login-hint">
                  Paste a bunker:// URL from Amber or another signer
                </p>
              </>
            ) : (
              <div className="login-waiting">
                <ZTileLoader />
                <p className="login-waiting-text">
                  {nip46Progress?.stage === "parsing"
                    ? "Validating bunker URL..."
                    : nip46Progress?.stage === "connecting"
                      ? "Connecting to signer relays..."
                      : nip46Progress?.stage === "auth-url"
                        ? "Open this URL to approve the connection:"
                        : nip46Progress?.stage === "finalizing"
                          ? "Almost there..."
                          : "Waiting for your signer to approve..."}
                </p>
                {nip46Progress?.stage === "auth-url" &&
                  nip46Progress.authUrl && (
                    <a
                      href={nip46Progress.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="login-link"
                    >
                      {nip46Progress.authUrl}
                    </a>
                  )}
                <p className="login-waiting-timeout">
                  Timeout in {nip46Timeout}s
                </p>
                <button
                  className="login-btn-secondary"
                  onClick={handleCancelNip46}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sign in with nsec or create new keys */}
        {view === "nsec-login" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <div className="login-option-icon icon-orange">
                <KeyIcon />
              </div>
              <div className="login-option-title">Private Key</div>
            </div>

            {nsecError && <div className="login-error">{nsecError}</div>}

            <input
              type="password"
              className="login-input"
              placeholder="nsec1..."
              value={nsecInput}
              onChange={(e) => { setNsecInput(e.target.value); setNsecError(null); }}
            />

            <div className="login-btn-row">
              <button className="login-btn-secondary" onClick={resetToMain}>
                Cancel
              </button>
              <button
                className="login-btn"
                onClick={handleNsecLogin}
                disabled={!nsecInput.trim() || isConnecting}
              >
                {isConnecting ? "Connecting..." : "Sign In"}
              </button>
            </div>

            <p className="login-hint">
              Your key stays on this device and is never sent to any server
            </p>

            <div className="login-divider">
              <span>or</span>
            </div>

            <button
              className="login-btn-create"
              onClick={handleCreateAccount}
            >
              Create New Account
            </button>
          </div>
        )}

        {/* Create Account - Keys Step */}
        {view === "create-keys" && generatedKeys && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-green">
                <KeyIcon />
              </span>
              <div className="login-option-title">Your New Keys</div>
            </div>

            <div className="login-key-section">
              <div className="login-key-label">
                <span>Private Key</span>
                <button
                  className="login-key-toggle"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              <div
                className={`login-key-box ${showPrivateKey ? "" : "masked"}`}
              >
                {showPrivateKey
                  ? generatedKeys.nsec
                  : "••••••••••••••••••••••••••••••••••••••••••••••••"}
                <button
                  className="login-key-copy"
                  onClick={() => copyToClipboard(generatedKeys.nsec, "nsec")}
                >
                  {copied === "nsec" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="login-key-section">
              <div className="login-key-label">
                <span>Public Key</span>
              </div>
              <div className="login-key-box public">
                {generatedKeys.npub}
                <button
                  className="login-key-copy"
                  onClick={() => copyToClipboard(generatedKeys.npub, "npub")}
                >
                  {copied === "npub" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="login-backup-section">
              <button
                className={`login-backup-btn ${backupDownloaded ? "downloaded" : ""}`}
                onClick={downloadBackupFile}
              >
                {backupDownloaded
                  ? "✓ Backup Downloaded"
                  : "Download Backup File"}
              </button>
            </div>

            <div className="login-btn-row">
              <button className="login-btn-secondary" onClick={resetToMain}>
                Cancel
              </button>
              <button
                className="login-btn"
                onClick={handleKeysConfirmed}
                disabled={!backupDownloaded}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Create Account - Profile Step */}
        {view === "create-profile" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-blue">
                <UserIcon />
              </span>
              <div className="login-option-title">Set Display Name</div>
            </div>

            <input
              type="text"
              className="login-input"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <div className="login-btn-row">
              <button
                className="login-btn-secondary"
                onClick={handleFinishCreate}
                disabled={isConnecting}
              >
                Skip
              </button>
              <button
                className="login-btn"
                onClick={handleFinishCreate}
                disabled={isConnecting}
              >
                {isConnecting ? "Creating..." : "Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
