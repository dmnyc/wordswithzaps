import type { WalletProvider, ZapParams } from "../../types/wallet";
import {
  fetchUserProfile,
  getCurrentUser,
  createEvent,
  getNDK,
} from "../../nostr/client";

/**
 * NWC (Nostr Wallet Connect) provider
 * Connects to a remote Lightning wallet via Nostr
 *
 * NWC URI format: nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>
 */
export class NWCProvider implements WalletProvider {
  type: "nwc" = "nwc";
  private connectionUri: string;
  private walletPubkey: string = "";
  private relayUrl: string = "";
  private secret: string = "";
  private connected: boolean = false;

  constructor(connectionUri: string) {
    this.connectionUri = connectionUri;
  }

  async connect(): Promise<void> {
    // Parse NWC URI
    const url = new URL(this.connectionUri);

    if (url.protocol !== "nostr+walletconnect:") {
      throw new Error("Invalid NWC connection URI");
    }

    this.walletPubkey = url.pathname.replace("//", "");
    this.relayUrl = url.searchParams.get("relay") || "";
    this.secret = url.searchParams.get("secret") || "";

    if (!this.walletPubkey || !this.relayUrl || !this.secret) {
      throw new Error(
        "Invalid NWC connection URI: missing required parameters",
      );
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getBalance(): Promise<number> {
    if (!this.connected) {
      throw new Error("NWC not connected");
    }

    // NWC balance request
    const response = await this.sendNWCRequest("get_balance", {});

    if (response.error) {
      throw new Error(response.error.message || "Failed to get balance");
    }

    return response.result?.balance || 0;
  }

  async zapUser(params: ZapParams): Promise<string> {
    if (!this.connected) {
      throw new Error("NWC not connected");
    }

    const { recipientPubkey, amountSats, gameId, moveDescription } = params;

    // Fetch recipient's Lightning address
    const recipientUser = await fetchUserProfile(recipientPubkey);
    const lud16 = recipientUser.profile?.lud16;
    const lud06 = recipientUser.profile?.lud06;

    if (!lud16 && !lud06) {
      throw new Error("Recipient has no Lightning address configured");
    }

    // Get LNURL pay endpoint
    let lnurlPayUrl: string;
    if (lud16) {
      const [name, domain] = lud16.split("@");
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
        throw new Error("Must be logged in to send zaps");
      }

      const zapRequest = createEvent(9734, moveDescription, [
        [
          "relays",
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://relay.primal.net",
        ],
        ["amount", (amountSats * 1000).toString()],
        ["p", recipientPubkey],
        ["e", gameId],
      ]);

      const ndk = getNDK();
      zapRequest.ndk = ndk;
      await zapRequest.sign();

      // Get invoice with zap request
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set("amount", (amountSats * 1000).toString());
      callbackUrl.searchParams.set(
        "nostr",
        JSON.stringify(zapRequest.rawEvent()),
      );

      const invoiceResponse = await fetch(callbackUrl.toString());
      const invoiceData = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error("Failed to get invoice from LNURL");
      }

      invoice = invoiceData.pr;
    } else {
      // Regular payment without zap
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set("amount", (amountSats * 1000).toString());
      callbackUrl.searchParams.set("comment", moveDescription);

      const invoiceResponse = await fetch(callbackUrl.toString());
      const invoiceData = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error("Failed to get invoice");
      }

      invoice = invoiceData.pr;
    }

    // Pay via NWC
    const response = await this.sendNWCRequest("pay_invoice", {
      invoice,
    });

    if (response.error) {
      throw new Error(response.error.message || "Payment failed");
    }

    return response.result?.preimage || "";
  }

  /**
   * Send a request to the NWC wallet
   */
  private async sendNWCRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<{
    result?: { balance?: number; preimage?: string };
    error?: { message: string };
  }> {
    // In a full implementation, this would:
    // 1. Create and encrypt the request using NIP-04 with the secret
    // 2. Publish to the NWC relay
    // 3. Subscribe for the response
    // 4. Decrypt and return the response

    // For now, return a placeholder that indicates NWC needs full implementation
    console.warn("NWC request:", method, params);
    console.warn(
      "NWC requires additional implementation for full functionality",
    );

    // This is a simplified stub - in production, implement full NWC protocol
    return {
      error: {
        message:
          "NWC payment requires full protocol implementation. Please use WebLN instead.",
      },
    };
  }
}

/**
 * Decode bech32 LNURL to URL
 */
function decodeLnurl(lnurl: string): string {
  const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  const lnurlLower = lnurl.toLowerCase();
  if (!lnurlLower.startsWith("lnurl")) {
    throw new Error("Invalid LNURL");
  }

  const data = lnurlLower.slice(lnurlLower.indexOf("1") + 1);
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

export default NWCProvider;
