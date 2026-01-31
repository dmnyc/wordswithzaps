import type { WalletProvider, ZapParams } from '../../types/wallet';
import { fetchUserProfile, getCurrentUser, createEvent, getNDK } from '../../nostr/client';

/**
 * Breez SDK provider for embedded Lightning wallet
 * Uses Breez Spark SDK for web
 *
 * Note: Breez Spark SDK needs to be loaded separately
 * See: https://breez.technology/spark/
 */

// Breez Spark SDK types (loaded via script tag or npm package when available)
interface BreezSparkSDK {
  connect(config: { apiKey: string }): Promise<void>;
  disconnect(): Promise<void>;
  getInfo(): Promise<{ balanceSat: number }>;
  sendPayment(bolt11: string): Promise<{ paymentPreimage: string }>;
  receivePayment(params: { amountSat: number; description: string }): Promise<{ bolt11: string }>;
}

declare global {
  interface Window {
    breezSpark?: BreezSparkSDK;
  }
}

export class BreezProvider implements WalletProvider {
  type: 'nwc' = 'nwc'; // Using 'nwc' type since our WalletProviderType doesn't have 'breez' yet
  private connected: boolean = false;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || import.meta.env.VITE_BREEZ_SPARK_API_KEY || '';
  }

  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.breezSpark;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Breez API key not configured. Set VITE_BREEZ_SPARK_API_KEY in .env.local');
    }

    if (!BreezProvider.isAvailable()) {
      throw new Error('Breez Spark SDK not loaded. Include the SDK script in your HTML.');
    }

    await window.breezSpark!.connect({ apiKey: this.apiKey });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (window.breezSpark && this.connected) {
      await window.breezSpark.disconnect();
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getBalance(): Promise<number> {
    if (!this.connected || !window.breezSpark) {
      throw new Error('Breez not connected');
    }

    const info = await window.breezSpark.getInfo();
    return info.balanceSat;
  }

  async zapUser(params: ZapParams): Promise<string> {
    if (!this.connected || !window.breezSpark) {
      throw new Error('Breez not connected');
    }

    const { recipientPubkey, amountSats, gameId, moveDescription } = params;

    // Fetch recipient's Lightning address
    const recipientUser = await fetchUserProfile(recipientPubkey);
    const lud16 = recipientUser.profile?.lud16;
    const lud06 = recipientUser.profile?.lud06;

    if (!lud16 && !lud06) {
      throw new Error('Recipient has no Lightning address configured');
    }

    // Get LNURL pay endpoint
    let lnurlPayUrl: string;
    if (lud16) {
      const [name, domain] = lud16.split('@');
      lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${name}`;
    } else {
      lnurlPayUrl = decodeLnurl(lud06!);
    }

    // Fetch LNURL pay info
    const lnurlResponse = await fetch(lnurlPayUrl);
    const lnurlData = await lnurlResponse.json();

    let invoice: string;

    if (lnurlData.allowsNostr && lnurlData.nostrPubkey) {
      // Create zap request (NIP-57)
      const currentUser = getCurrentUser();
      if (!currentUser?.pubkey) {
        throw new Error('Must be logged in to send zaps');
      }

      const zapRequest = createEvent(9734, moveDescription, [
        ['relays', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'],
        ['amount', (amountSats * 1000).toString()],
        ['p', recipientPubkey],
        ['e', gameId],
      ]);

      const ndk = getNDK();
      zapRequest.ndk = ndk;
      await zapRequest.sign();

      // Get invoice with zap request
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set('amount', (amountSats * 1000).toString());
      callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequest.rawEvent()));

      const invoiceResponse = await fetch(callbackUrl.toString());
      const invoiceData = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error('Failed to get invoice from LNURL');
      }

      invoice = invoiceData.pr;
    } else {
      // Regular payment without zap
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set('amount', (amountSats * 1000).toString());
      callbackUrl.searchParams.set('comment', moveDescription);

      const invoiceResponse = await fetch(callbackUrl.toString());
      const invoiceData = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error('Failed to get invoice');
      }

      invoice = invoiceData.pr;
    }

    // Pay via Breez
    const result = await window.breezSpark!.sendPayment(invoice);
    return result.paymentPreimage;
  }
}

/**
 * Decode bech32 LNURL to URL
 */
function decodeLnurl(lnurl: string): string {
  const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

  const lnurlLower = lnurl.toLowerCase();
  if (!lnurlLower.startsWith('lnurl')) {
    throw new Error('Invalid LNURL');
  }

  const data = lnurlLower.slice(lnurlLower.indexOf('1') + 1);
  const bytes: number[] = [];

  for (const char of data) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) break;
    bytes.push(value);
  }

  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (const b of bytes) {
    value = (value << 5) | b;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((value >> bits) & 0xff);
    }
  }

  return new TextDecoder().decode(new Uint8Array(result));
}

export default BreezProvider;
