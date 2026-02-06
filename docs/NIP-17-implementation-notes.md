# NIP-17 Implementation Notes

## Status: Partially implemented, DM panel disabled

NIP-17 (Private Direct Messages via gift wrap) is implemented in Words With Zaps but disabled for the DM inbox/outbox. It remains active for the share/zap notification panel. This document captures our findings during implementation and testing.

## What Works

- **Sending NIP-17 DMs from WWZ**: Gift wraps are correctly constructed (kind 14 rumor → kind 13 seal → kind 1059 gift wrap with ephemeral key). Messages sent from WWZ are received by other NIP-17 clients on the recipient's relays.
- **Receiving NIP-17 DMs sent by WWZ**: Self-copies and recipient copies sent by our own client are correctly unwrapped and displayed.
- **Receiving NIP-17 DMs from some clients**: Gift wraps from clients that publish to standard relays (the recipient's pool relays) are received and decrypted successfully.
- **NIP-44 encryption/decryption**: The full encrypt/decrypt chain works via NDK signer (NIP-07 extension, private key, or NIP-46 bunker).

## What Doesn't Work: Cross-Client Interoperability

### Problem: Messages sent from Amethyst are not received

During testing, NIP-17 messages sent from Amethyst were **not visible** in Words With Zaps or Keychat (another NIP-17 client). The messages were only visible within Amethyst itself (both sender and recipient profiles could see them in Amethyst).

### Root Cause Analysis

NIP-17 specifies that senders should publish gift wraps to the **recipient's kind 10050 DM relay list**. In our testing:

1. The recipient's kind 10050 relay was `wss://inbox.nostr.wine/`
2. This is a paid relay requiring NIP-42 authentication
3. Amethyst appears to either:
   - Not look up the recipient's kind 10050 relays before publishing
   - Not authenticate with paid relays when publishing gift wraps
   - Publish gift wraps only to Amethyst-specific relay infrastructure
   - Store/relay messages through a proprietary mechanism

**Evidence**: After subscribing on the recipient's pool relays (11 relays), the recipient's DM inbox relay (inbox.nostr.wine, with NIP-42 auth), and the sender's NIP-65 write relays, the gift wraps from Amethyst were still not found on any relay. Yet both profiles could see the messages within Amethyst.

### Issues Encountered Along the Way

#### 1. NIP-42 Relay Authentication

**Problem**: `inbox.nostr.wine` (and likely other inbox relays) require NIP-42 AUTH. NDK connected successfully but silently dropped subscriptions when AUTH challenges went unanswered.

**Symptom**: Relay showed status "connected", subscription was created, but no EOSE and no events were ever returned.

**Fix**: Set `NDKRelayAuthPolicies.signIn({ ndk })` as `ndk.relayAuthDefaultPolicy` after configuring the signer. This must be done in every login path (NIP-07, private key, NIP-46 bunker, nostrconnect).

```typescript
import { NDKRelayAuthPolicies } from "@nostr-dev-kit/ndk";
// After setting ndk.signer:
ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });
```

#### 2. Gift Wrap Randomized Timestamps

**Problem**: NIP-17 mandates that gift wrap timestamps are randomized up to 2 days in the past for privacy. A 24-hour `since` filter on subscriptions missed recent messages.

**Fix**: Use a 7-day lookback window for kind 1059 subscriptions.

#### 3. Inbox Relay Disconnection

**Problem**: `inbox.nostr.wine` disconnected shortly after sending EOSE, causing any subsequently published gift wraps to be missed.

**Fix**: Added auto-reconnect on disconnect for DM relays:

```typescript
relay.on("disconnect", () => {
  setTimeout(() => relay.connect().catch(() => {}), 3000);
});
```

#### 4. NIP-04 Decryption Prompt Flood

**Problem**: When receiving multiple NIP-04 DMs at once, each `window.nostr.nip04.decrypt()` call triggers a browser extension approval prompt. Multiple concurrent calls caused the extension to hang or flood the user with prompts.

**Fix**: Sequential decrypt queue — each NIP-04 decryption waits for the previous one to complete:

```typescript
let _decryptQueue: Promise<void> = Promise.resolve();
function queueDecrypt<T>(fn: () => Promise<T>): Promise<T> {
  const result = _decryptQueue.then(fn, fn);
  _decryptQueue = result.then(() => {}, () => {});
  return result;
}
```

This is not needed for NIP-17/NIP-44 since NDK's signer handles decryption without per-message prompts.

#### 5. Self-Copy Deduplication

**Problem**: NIP-17 sends a self-addressed gift wrap copy so the sender can recover their sent messages. When both the self-copy and the direct send arrive, the same message appears twice.

**Fix**: Content + timestamp + sender deduplication in the DM store:

```typescript
if (messages.some((m) =>
  m.fromPubkey === message.fromPubkey &&
  m.content === message.content &&
  Math.abs(m.createdAt - message.createdAt) < 5
)) return;
```

## Relay Subscription Strategy

Our final subscription strategy for NIP-17 reception:

1. **Pool relays** — the user's connected relay set (NIP-65 write relays + defaults)
2. **DM inbox relays** — the user's kind 10050 relay list, with NIP-42 auth support and auto-reconnect
3. **Conversation partner relays** — NIP-65 write relays of up to 10 most recent conversation partners (to catch clients that publish to sender's relays)

Even with all three layers, Amethyst messages were not found.

## Current State

- **DM panel**: NIP-04 only. Toggle hidden, replaced with "Messages are sent in the most compatible format."
- **Share panel**: NIP-17 still used for private game notifications (this works because both sender and receiver use WWZ)
- **Reception**: Both NIP-04 and NIP-17 messages are received and displayed regardless of protocol

## Recommendations

1. **Test with more NIP-17 clients** as the ecosystem matures — try 0xchat, which is known for strong NIP-17 support
2. **Re-enable the toggle** once cross-client NIP-17 interop is confirmed working
3. **File an issue with Amethyst** about gift wrap relay publishing behavior — their messages should be discoverable by other NIP-17 clients on standard relays
4. **Consider NIP-17 as default** once inbox relay infrastructure is more widely adopted and clients consistently publish to kind 10050 relays
