// Wallet kind enum for multi-wallet support
export enum WalletKind {
  SPARK = 4, // Breez SDK Spark
}

export type WalletProviderType = "spark" | "bitcoin-connect" | "none";

// Wallet instance stored in wallet store
export interface Wallet {
  id: string;
  kind: WalletKind;
  name: string;
  active: boolean;
  data?: {
    // Spark: has local mnemonic
    hasMnemonic?: boolean;
  };
}

// Spark payment from SDK
export interface SparkPayment {
  id: string;
  type: "incoming" | "outgoing";
  amountSats: number;
  feesSats?: number;
  description?: string;
  preimage?: string;
  paymentHash?: string;
  createdAt: number;
  settledAt?: number;
  status: "pending" | "succeeded" | "failed";
}

export interface ZapParams {
  recipientPubkey: string;
  amountSats: number;
  gameId: string;
  moveDescription: string; // e.g. "Played QUIZ for 22 points"
}

export interface WalletProvider {
  type: WalletProviderType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getBalance(): Promise<number>;
  zapUser(params: ZapParams): Promise<string>; // returns preimage
}

export interface WalletState {
  connected: boolean;
  providerType: WalletProviderType;
  balance?: number;
  error?: string;
  loading?: boolean;
  activeWallet?: Wallet | null;
  wallets?: Wallet[];
}

export interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

// BitcoinConnect wallet info
export interface BitcoinConnectInfo {
  alias?: string;
  pubkey?: string;
  connected: boolean;
  balance?: number;
}

// Unified transaction type for display
export interface Transaction {
  id: string;
  type: "incoming" | "outgoing";
  amountSats: number;
  feesSats?: number;
  description?: string;
  timestamp: number; // Unix timestamp (seconds)
  status: "pending" | "succeeded" | "failed";
}
