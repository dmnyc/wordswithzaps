import type { WalletProvider, ZapParams } from '../../types/wallet';
import { fetchUserProfile, getCurrentUser, createEvent, getNDK } from '../../nostr/client';

// WebLN type declarations
declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      getInfo(): Promise<{ node: { pubkey: string } }>;
      sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
      makeInvoice(args: { amount: number; defaultMemo?: string }): Promise<{ paymentRequest: string }>;
      getBalance?(): Promise<{ balance: number }>;
    };
  }
}

/**
 * WebLN provider for browser extensions (Alby, etc.)
 */
export class WebLNProvider implements WalletProvider {
  type: 'webln' = 'webln';
  private enabled: boolean = false;

  /**
   * Check if WebLN is available in the browser
   */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.webln;
  }

  async connect(): Promise<void> {
    if (!WebLNProvider.isAvailable()) {
      throw new Error('WebLN not available. Please install Alby or another WebLN-compatible extension.');
    }

    await window.webln!.enable();
    this.enabled = true;
  }

  async disconnect(): Promise<void> {
    this.enabled = false;
  }

  isConnected(): boolean {
    return this.enabled;
  }

  async getBalance(): Promise<number> {
    if (!this.enabled) {
      throw new Error('WebLN not enabled');
    }

    if (!window.webln?.getBalance) {
      throw new Error('WebLN provider does not support getBalance');
    }

    const { balance } = await window.webln.getBalance();
    return balance;
  }

  async zapUser(params: ZapParams): Promise<string> {
    if (!this.enabled) {
      throw new Error('WebLN not enabled');
    }

    const { recipientPubkey, amountSats, gameId, moveDescription } = params;

    // Fetch recipient's Lightning address from their Nostr profile
    const recipientUser = await fetchUserProfile(recipientPubkey);
    const lud16 = recipientUser.profile?.lud16;
    const lud06 = recipientUser.profile?.lud06;

    if (!lud16 && !lud06) {
      throw new Error('Recipient has no Lightning address configured');
    }

    // Get LNURL pay endpoint
    let lnurlPayUrl: string;
    if (lud16) {
      // Convert lightning address to LNURL
      const [name, domain] = lud16.split('@');
      lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${name}`;
    } else {
      // Decode LNURL
      lnurlPayUrl = decodeLnurl(lud06!);
    }

    // Fetch LNURL pay info
    const lnurlResponse = await fetch(lnurlPayUrl);
    const lnurlData = await lnurlResponse.json();

    if (!lnurlData.allowsNostr || !lnurlData.nostrPubkey) {
      // Fallback: regular payment without zap receipt
      console.warn('Recipient does not support Nostr zaps, sending regular payment');
      const invoice = await this.getInvoiceFromLnurl(
        lnurlData.callback,
        amountSats * 1000,
        moveDescription
      );
      const { preimage } = await window.webln!.sendPayment(invoice);
      return preimage;
    }

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

    // Sign the zap request
    const ndk = getNDK();
    zapRequest.ndk = ndk;
    await zapRequest.sign();

    // Get invoice from LNURL callback with zap request
    const callbackUrl = new URL(lnurlData.callback);
    callbackUrl.searchParams.set('amount', (amountSats * 1000).toString());
    callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequest.rawEvent()));

    const invoiceResponse = await fetch(callbackUrl.toString());
    const invoiceData = await invoiceResponse.json();

    if (!invoiceData.pr) {
      throw new Error('Failed to get invoice from LNURL');
    }

    // Pay the invoice
    const { preimage } = await window.webln!.sendPayment(invoiceData.pr);
    return preimage;
  }

  private async getInvoiceFromLnurl(
    callback: string,
    amountMsats: number,
    memo: string
  ): Promise<string> {
    const callbackUrl = new URL(callback);
    callbackUrl.searchParams.set('amount', amountMsats.toString());
    callbackUrl.searchParams.set('comment', memo);

    const response = await fetch(callbackUrl.toString());
    const data = await response.json();

    if (!data.pr) {
      throw new Error('Failed to get invoice');
    }

    return data.pr;
  }
}

/**
 * Decode bech32 LNURL to URL
 */
function decodeLnurl(lnurl: string): string {
  // Simple bech32 decode for LNURL
  // In production, use a proper bech32 library
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

  // Convert 5-bit groups to 8-bit bytes
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

export default WebLNProvider;
