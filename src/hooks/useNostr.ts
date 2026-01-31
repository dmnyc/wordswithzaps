import { useState, useEffect, useCallback } from 'react';
import type { NDKUser } from '@nostr-dev-kit/ndk';
import {
  initializeNDK,
  connectWithNip07,
  getCurrentUser,
  isConnected,
  disconnect,
} from '../nostr/client';

export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useNostr(): UseNostrReturn {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for existing connection on mount
  useEffect(() => {
    const existingUser = getCurrentUser();
    if (existingUser) {
      setUser(existingUser);
    }
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
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
