import { useState, useEffect, useCallback } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import {
  initializeNDK,
  connectWithNip07,
  getCurrentUser,
  isConnected,
  disconnect,
} from "../nostr/client";

export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const AUTO_CONNECT_KEY = "wwz_autoconnect";
const LAST_PUBKEY_KEY = "wwz_last_pubkey";

export function useNostr(): UseNostrReturn {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!window.nostr) {
        window.localStorage.removeItem(AUTO_CONNECT_KEY);
        window.localStorage.removeItem(LAST_PUBKEY_KEY);
        return;
      }

      setConnecting(true);
      try {
        await initializeNDK();
        const connectedUser = await connectWithNip07();
        if (!cancelled) {
          setUser(connectedUser);
        }
      } catch {
        if (!cancelled) {
          setError(null);
        }
        window.localStorage.removeItem(AUTO_CONNECT_KEY);
        window.localStorage.removeItem(LAST_PUBKEY_KEY);
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

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      // Initialize NDK if not already
      await initializeNDK();

      // Connect with NIP-07 extension
      const connectedUser = await connectWithNip07();
      setUser(connectedUser);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
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

  const handleDisconnect = useCallback(() => {
    disconnect();
    setUser(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTO_CONNECT_KEY);
      window.localStorage.removeItem(LAST_PUBKEY_KEY);
    }
  }, []);

  return {
    user,
    isConnected: isConnected(),
    isConnecting: connecting,
    error,
    connect,
    disconnect: handleDisconnect,
  };
}

export default useNostr;
