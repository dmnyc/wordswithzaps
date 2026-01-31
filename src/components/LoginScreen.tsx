import { useNostr } from "../hooks/useNostr";
import "./LoginScreen.css";

interface LoginScreenProps {
  onConnected: () => void;
}

export function LoginScreen({ onConnected }: LoginScreenProps) {
  const { user, isConnecting, error, connect } = useNostr();

  const handleConnect = async () => {
    try {
      await connect();
      onConnected();
    } catch (err) {
      // Error is handled by useNostr hook
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Words With Zaps</h1>
        <p className="login-subtitle">P2P Scrabble on Nostr</p>

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
