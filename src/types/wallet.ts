export type WalletProviderType = 'nwc' | 'webln' | 'none';

export interface ZapParams {
  recipientPubkey: string;
  amountSats: number;
  gameId: string;
  moveDescription: string;  // e.g. "Played QUIZ for 22 points"
}

export interface WalletProvider {
  type: WalletProviderType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getBalance(): Promise<number>;
  zapUser(params: ZapParams): Promise<string>;  // returns preimage
}

export interface WalletState {
  connected: boolean;
  providerType: WalletProviderType;
  balance?: number;
  error?: string;
}

export interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}
