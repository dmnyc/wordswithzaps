import type { WalletProvider, ZapParams, WalletState } from "../types/wallet";

/**
 * Abstract wallet service that manages wallet providers
 */
export class WalletService {
  private provider: WalletProvider | null = null;
  private state: WalletState = {
    connected: false,
    providerType: "none",
  };
  private listeners: Set<(state: WalletState) => void> = new Set();

  /**
   * Get current wallet state
   */
  getState(): WalletState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  private updateState(updates: Partial<WalletState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Connect a wallet provider
   */
  async connect(provider: WalletProvider): Promise<void> {
    try {
      await provider.connect();
      this.provider = provider;
      this.updateState({
        connected: true,
        providerType: provider.type,
        error: undefined,
      });

      // Fetch initial balance
      try {
        const balance = await provider.getBalance();
        this.updateState({ balance });
      } catch (err) {
        // Balance fetch is optional
        console.warn("Failed to fetch balance:", err);
      }
    } catch (err) {
      this.updateState({
        connected: false,
        providerType: "none",
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Disconnect current provider
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      await this.provider.disconnect();
      this.provider = null;
    }
    this.updateState({
      connected: false,
      providerType: "none",
      balance: undefined,
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.provider?.isConnected() || false;
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<number> {
    if (!this.provider) {
      throw new Error("No wallet connected");
    }
    const balance = await this.provider.getBalance();
    this.updateState({ balance });
    return balance;
  }

  /**
   * Zap a user (send Lightning payment with Nostr metadata)
   */
  async zapUser(params: ZapParams): Promise<string> {
    if (!this.provider) {
      throw new Error("No wallet connected");
    }
    return this.provider.zapUser(params);
  }

  /**
   * Zap opponent for a game move
   */
  async notifyMove(
    recipientPubkey: string,
    gameId: string,
    word: string,
    score: number,
    amountSats: number = 21,
  ): Promise<string> {
    return this.zapUser({
      recipientPubkey,
      amountSats,
      gameId,
      moveDescription: `Played ${word} for ${score} points`,
    });
  }
}

// Singleton instance
let walletServiceInstance: WalletService | null = null;

export function getWalletService(): WalletService {
  if (!walletServiceInstance) {
    walletServiceInstance = new WalletService();
  }
  return walletServiceInstance;
}

export function resetWalletService(): void {
  if (walletServiceInstance) {
    walletServiceInstance.disconnect();
  }
  walletServiceInstance = null;
}
