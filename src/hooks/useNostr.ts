import { useState, useEffect, useCallback, useRef } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import {
  initializeNDK,
  getNDK,
  connectWithNip07,
  connectWithPrivateKey as clientConnectWithPrivateKey,
  connectWithBunker as clientConnectWithBunker,
  generateKeypair as clientGenerateKeypair,
  generateNostrConnectURI as clientGenerateNostrConnectURI,
  waitForNostrConnect as clientWaitForNostrConnect,
  getCurrentUser,
  setCurrentUser,
  isConnected,
  getConnectedRelayCount,
  getRelayUrls,
  getConnectedRelayUrls,
  disconnect,
  type Nip46Stage,
} from "../nostr/client";
import {
  syncSettingsOnLogin,
  clearSettingsCache,
} from "../settings/nostrSettings";

export type AuthMethod = "nip07" | "private-key" | "nip46" | null;

export interface NostrConnectSession {
  uri: string;
  localKeyHex: string;
  secret: string;
}

export interface Nip46Progress {
  stage: Nip46Stage;
  authUrl?: string;
}

export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  authMethod: AuthMethod;
  relayCount: number;
  relayUrls: string[];
  connectedRelayUrls: string[];
  nip46Progress: Nip46Progress | null;
  connect: () => Promise<void>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<void>;
  connectWithBunker: (bunkerUri: string) => Promise<void>;
  generateKeypair: () => { nsec: string; npub: string; secretKeyHex: string };
  startNostrConnect: () => Promise<NostrConnectSession>;
  waitForNostrConnect: (session: NostrConnectSession) => Promise<void>;
  cancelNostrConnect: () => void;
  disconnect: () => void;
}

const AUTO_CONNECT_KEY = "wwz_autoconnect";
const LAST_PUBKEY_KEY = "wwz_last_pubkey";
const AUTH_METHOD_KEY = "wwz_auth_method";
const PRIVATE_KEY_KEY = "wwz_private_key";
const NIP46_BUNKER_KEY = "wwz_nip46_bunker";
const NIP46_LOCAL_KEY = "wwz_nip46_local_key";
const NIP46_GENERIC_HINT = "Create a new bunker URL in your signer.";

function formatErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
    const maybeError = (err as { error?: unknown }).error;
    if (typeof maybeError === "string") return maybeError;
    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function formatNip46UiError(err: unknown): string {
  const baseMessage = formatErrorMessage(err, "Failed to connect").trim();
  const lower = baseMessage.toLowerCase();

  if (lower.includes("already connected")) {
    return "Already connected. Create a new bunker URL in your signer.";
  }
  if (lower.includes("expired") || lower.includes("revoked")) {
    return "Link expired. Create a new bunker URL in your signer.";
  }
  if (lower.includes("missing relay") || lower.includes("no relays")) {
    return "Bunker URL is missing relay info. Generate a new one in your signer.";
  }
  if (lower.includes("invalid bunker")) {
    return "That doesn't look like a valid bunker URL. It should start with bunker:// and include relay info.";
  }
  if (lower.includes("signer approval")) {
    return "Signer didn't respond. Make sure your signer app is open and approved this connection.";
  }
  if (lower.includes("signer pubkey")) {
    return "Signer connected but didn't return a public key. Try again.";
  }
  if (lower.includes("could not reach")) {
    return "Could not reach signer relays. Check your network and try again.";
  }
  if (lower.includes("rejected") || lower.includes("unauthorized")) {
    return "Signer rejected the connection. Approve in your signer app.";
  }
  if (lower.includes("failed to decrypt")) {
    return "Signer encryption mismatch. Update your signer app and try again.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Connection timed out. Create a new bunker URL in your signer.";
  }
  if (baseMessage.length > 80) {
    return `Failed to connect. ${NIP46_GENERIC_HINT}`;
  }

  return `${baseMessage}${baseMessage.endsWith(".") ? "" : "."} ${NIP46_GENERIC_HINT}`;
}

export function useNostr(): UseNostrReturn {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [relayCount, setRelayCount] = useState(0);
  const [relayUrls, setRelayUrls] = useState<string[]>([]);
  const [connectedRelayUrls, setConnectedRelayUrls] = useState<string[]>([]);
  const [nip46Progress, setNip46Progress] = useState<Nip46Progress | null>(
    null,
  );
  const nostrConnectCancelledRef = useRef(false);

  // Check for existing connection on mount
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const existingUser = getCurrentUser();
      if (existingUser) {
        setUser(existingUser);
        return;
      }

      if (typeof window === "undefined") return;
      const shouldAutoConnect =
        window.localStorage.getItem(AUTO_CONNECT_KEY) === "1";
      if (!shouldAutoConnect) return;

      const storedAuthMethod = window.localStorage.getItem(
        AUTH_METHOD_KEY,
      ) as AuthMethod;
      const storedPubkey = window.localStorage.getItem(LAST_PUBKEY_KEY);

      // For NIP-07: Use stored pubkey immediately for fast UI, verify in background
      // This prevents waiting for extension response on page reload
      if (storedAuthMethod === "nip07" && storedPubkey && window.nostr) {
        // Initialize NDK (non-blocking)
        await initializeNDK();

        // Create user from stored pubkey immediately
        const ndk = getNDK();
        const quickUser = ndk.getUser({ pubkey: storedPubkey });

        // Set currentUser in client module so isConnected() returns true
        setCurrentUser(quickUser);

        if (!cancelled) {
          setUser(quickUser);
          setAuthMethod("nip07");
          setConnecting(false);
        }

        // Verify with extension in background (don't block UI)
        connectWithNip07()
          .then((verifiedUser) => {
            if (!cancelled && verifiedUser.pubkey !== storedPubkey) {
              // Pubkey changed (different extension account), update
              setUser(verifiedUser);
              window.localStorage.setItem(LAST_PUBKEY_KEY, verifiedUser.pubkey);
            }
          })
          .catch((err) => {
            console.warn(
              "[useNostr] Background NIP-07 verification failed:",
              err,
            );
            // Don't logout - keep using stored pubkey
          });

        return;
      }

      setConnecting(true);
      try {
        await initializeNDK();

        let connectedUser: NDKUser | null = null;

        switch (storedAuthMethod) {
          case "private-key": {
            const privateKey = window.localStorage.getItem(PRIVATE_KEY_KEY);
            if (privateKey) {
              connectedUser = await clientConnectWithPrivateKey(privateKey);
            }
            break;
          }
          case "nip46": {
            const bunkerUri = window.localStorage.getItem(NIP46_BUNKER_KEY);
            const localKey = window.localStorage.getItem(NIP46_LOCAL_KEY);
            if (bunkerUri && localKey) {
              const result = await clientConnectWithBunker(bunkerUri, localKey);
              connectedUser = result.user;
            }
            break;
          }
          case "nip07":
          default:
            if (window.nostr) {
              connectedUser = await connectWithNip07();
            }
            break;
        }

        if (!cancelled && connectedUser) {
          setUser(connectedUser);
          setAuthMethod(storedAuthMethod || "nip07");
        }
      } catch {
        if (!cancelled) {
          setError(null);
        }
        // Clear all auth data on failure
        window.localStorage.removeItem(AUTO_CONNECT_KEY);
        window.localStorage.removeItem(LAST_PUBKEY_KEY);
        window.localStorage.removeItem(AUTH_METHOD_KEY);
        window.localStorage.removeItem(PRIVATE_KEY_KEY);
        window.localStorage.removeItem(NIP46_BUNKER_KEY);
        window.localStorage.removeItem(NIP46_LOCAL_KEY);
      } finally {
        if (!cancelled) {
          setConnecting(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync settings when user logs in or out
  useEffect(() => {
    if (user) {
      // User logged in - sync settings from relays
      syncSettingsOnLogin().catch((err) => {
        console.warn("[useNostr] Failed to sync settings:", err);
      });
    } else {
      // User logged out - clear settings cache
      clearSettingsCache();
    }
  }, [user]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      // Initialize NDK if not already
      await initializeNDK();

      // Connect with NIP-07 extension
      const connectedUser = await connectWithNip07();
      setUser(connectedUser);
      setAuthMethod("nip07");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "nip07");
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithPrivateKey = useCallback(async (privateKeyHex: string) => {
    setConnecting(true);
    setError(null);

    try {
      await initializeNDK();
      const connectedUser = await clientConnectWithPrivateKey(privateKeyHex);
      setUser(connectedUser);
      setAuthMethod("private-key");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "private-key");
        window.localStorage.setItem(PRIVATE_KEY_KEY, privateKeyHex);
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithBunker = useCallback(async (bunkerUri: string) => {
    setConnecting(true);
    setError(null);
    setNip46Progress({ stage: "parsing" });

    try {
      await initializeNDK();
      const { user: connectedUser, localKey } = await clientConnectWithBunker(
        bunkerUri,
        undefined,
        {
          onStage: (stage, payload) => {
            setNip46Progress({ stage, authUrl: payload?.authUrl });
          },
        },
      );
      setUser(connectedUser);
      setAuthMethod("nip46");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "nip46");
        window.localStorage.setItem(NIP46_BUNKER_KEY, bunkerUri);
        window.localStorage.setItem(NIP46_LOCAL_KEY, localKey);
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      console.warn("[useNostr] NIP-46 connect failed:", err);
      setError(formatNip46UiError(err));
      throw err;
    } finally {
      setConnecting(false);
      setNip46Progress(null);
    }
  }, []);

  const generateKeypair = useCallback(() => {
    return clientGenerateKeypair();
  }, []);

  const startNostrConnect =
    useCallback(async (): Promise<NostrConnectSession> => {
      // Ensure NDK is initialized
      await initializeNDK();
      nostrConnectCancelledRef.current = false;
      const { uri, localKeyHex, secret } = clientGenerateNostrConnectURI();
      return { uri, localKeyHex, secret };
    }, []);

  const waitForNostrConnect = useCallback(
    async (session: NostrConnectSession) => {
      setConnecting(true);
      setError(null);
      nostrConnectCancelledRef.current = false;

      try {
        const {
          user: connectedUser,
          remotePubkey,
          bunkerPointer,
        } = await clientWaitForNostrConnect(
          session.localKeyHex,
          session.secret,
          120000,
        );

        if (nostrConnectCancelledRef.current) {
          return;
        }

        setUser(connectedUser);
        setAuthMethod("nip46");

        // Build bunker URI for session restore using the actual relays the
        // signer agreed on (NOT a hardcoded list — relay.nsec.app is dead).
        // Omit the secret: nostrconnect secrets are one-time handshake
        // matchers; on reconnect the signer identifies us by our pubkey.
        if (typeof window !== "undefined") {
          const bunkerParams = new URLSearchParams();
          bunkerPointer.relays.forEach((r) => bunkerParams.append("relay", r));
          const bunkerUri = `bunker://${remotePubkey}?${bunkerParams.toString()}`;

          window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
          window.localStorage.setItem(AUTH_METHOD_KEY, "nip46");
          window.localStorage.setItem(NIP46_BUNKER_KEY, bunkerUri);
          window.localStorage.setItem(NIP46_LOCAL_KEY, session.localKeyHex);
          window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
        }
      } catch (err) {
        if (nostrConnectCancelledRef.current) {
          return;
        }
        console.warn("[useNostr] Nostr Connect failed:", err);
        setError(formatNip46UiError(err));
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const cancelNostrConnect = useCallback(() => {
    nostrConnectCancelledRef.current = true;
    setConnecting(false);
    setError(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setUser(null);
    setError(null);
    setAuthMethod(null);
    setRelayCount(0);
    setRelayUrls([]);
    setConnectedRelayUrls([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTO_CONNECT_KEY);
      window.localStorage.removeItem(LAST_PUBKEY_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
      window.localStorage.removeItem(PRIVATE_KEY_KEY);
      window.localStorage.removeItem(NIP46_BUNKER_KEY);
      window.localStorage.removeItem(NIP46_LOCAL_KEY);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setRelayCount(0);
      return;
    }
    if (!authMethod) {
      setAuthMethod("nip07");
    }
    const updateCount = () => {
      setRelayCount(getConnectedRelayCount());
      setRelayUrls(getRelayUrls());
      setConnectedRelayUrls(getConnectedRelayUrls());
    };
    updateCount();
    const intervalId = window.setInterval(updateCount, 5000);
    return () => window.clearInterval(intervalId);
  }, [user?.pubkey, authMethod]);

  return {
    user,
    isConnected: isConnected(),
    isConnecting: connecting,
    error,
    authMethod,
    relayCount,
    relayUrls,
    connectedRelayUrls,
    nip46Progress,
    connect,
    connectWithPrivateKey,
    connectWithBunker,
    generateKeypair,
    startNostrConnect,
    waitForNostrConnect,
    cancelNostrConnect,
    disconnect: handleDisconnect,
  };
}

export default useNostr;
