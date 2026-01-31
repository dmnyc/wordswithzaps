import "./LoginScreen.css";
import type { NDKUser } from "@nostr-dev-kit/ndk";

interface LoginScreenProps {
  onConnected: () => void;
  user: NDKUser | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

export function LoginScreen({
  onConnected,
  user,
  isConnecting,
  error,
  connect,
}: LoginScreenProps) {
  const handleConnect = async () => {
    try {
      await connect();
      onConnected();
    } catch (err) {
      // Error is displayed via the error prop.
    }
  };

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

        {!user ? (
          <>
            <button
              className="login-btn"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect with Nostr"}
            </button>
            <p className="login-hint">
              Requires a NIP-07 browser extension like Alby or nos2x
            </p>
          </>
        ) : (
          <div className="login-connected">
            <p>Connected as:</p>
            <p className="login-pubkey">
              {user.profile?.name || user.pubkey.slice(0, 16)}...
            </p>
            <button className="login-btn" onClick={onConnected}>
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
