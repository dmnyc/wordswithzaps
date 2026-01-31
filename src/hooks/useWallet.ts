import { useState, useEffect, useCallback } from "react";
import type { WalletState, ZapParams } from "../types/wallet";
import { getWalletService, WalletService } from "../wallet/WalletService";
import { WebLNProvider } from "../wallet/providers/webln";
import { NWCProvider } from "../wallet/providers/nwc";
import { BreezProvider } from "../wallet/providers/breez";

export interface UseWalletReturn {
  state: WalletState;
  connectWebLN: () => Promise<void>;
  connectNWC: (connectionUri: string) => Promise<void>;
  connectBreez: (apiKey?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  zapUser: (params: ZapParams) => Promise<string>;
  refreshBalance: () => Promise<void>;
  isWebLNAvailable: boolean;
  isBreezAvailable: boolean;
}

export function useWallet(): UseWalletReturn {
  const [walletService] = useState<WalletService>(() => getWalletService());
  const [state, setState] = useState<WalletState>(walletService.getState());

  // Subscribe to wallet state changes
  useEffect(() => {
    const unsubscribe = walletService.subscribe(setState);
    return unsubscribe;
  }, [walletService]);

  // Auto-connect WebLN on mount if available
  useEffect(() => {
    if (WebLNProvider.isAvailable() && !state.connected) {
      const provider = new WebLNProvider();
      walletService.connect(provider).catch(() => {
        // Silently fail - user can manually connect
      });
    }
  }, []);

  const connectWebLN = useCallback(async () => {
    if (!WebLNProvider.isAvailable()) {
      throw new Error(
        "WebLN not available. Please install Alby or another WebLN extension.",
      );
    }
    const provider = new WebLNProvider();
    await walletService.connect(provider);
  }, [walletService]);

  const connectNWC = useCallback(
    async (connectionUri: string) => {
      const provider = new NWCProvider(connectionUri);
      await walletService.connect(provider);
    },
    [walletService],
  );

  const connectBreez = useCallback(
    async (apiKey?: string) => {
      const provider = new BreezProvider(apiKey);
      await walletService.connect(provider);
    },
    [walletService],
  );

  const disconnect = useCallback(async () => {
    await walletService.disconnect();
  }, [walletService]);

  const zapUser = useCallback(
    async (params: ZapParams) => {
      return walletService.zapUser(params);
    },
    [walletService],
  );

  const refreshBalance = useCallback(async () => {
    await walletService.getBalance();
  }, [walletService]);

  return {
    state,
    connectWebLN,
    connectNWC,
    connectBreez,
    disconnect,
    zapUser,
    refreshBalance,
    isWebLNAvailable: WebLNProvider.isAvailable(),
    isBreezAvailable: BreezProvider.isAvailable(),
  };
}

export default useWallet;
