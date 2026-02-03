# Developer Notes

Implementation notes, gotchas, and design decisions for contributors.

## NIP-17 Gift-Wrapped DMs

Gift-wrapped DMs use manual NIP-59 wrapping rather than NDK's built-in `giftWrap()` helper. This is because `giftWrap()` checks `signer.encryptionEnabled("nip44")` which not all signer wrappers implement (notably our `BunkerSignerWrapper` for NIP-46). The manual approach calls `signer.encrypt()` directly, which works with all signer types (NIP-07, NIP-46, local keypair).

### Wrapping Flow

1. **Rumor (kind 14)** - Unsigned event with the actual message content and a `p` tag for the recipient. Uses the **real timestamp** so the recipient's client displays the correct time.
2. **Seal (kind 13)** - The rumor is JSON-stringified and NIP-44 encrypted to the recipient, then signed by the sender. Uses a **randomized timestamp** (up to 2 days in the past) for metadata privacy.
3. **Gift Wrap (kind 1059)** - The seal is JSON-stringified and NIP-44 encrypted using an ephemeral keypair (`NDKPrivateKeySigner` with `generateSecretKey()`). Tagged with the recipient's pubkey. Uses a **randomized timestamp**. Signed by the ephemeral key.

### Timestamp Gotcha

Per NIP-17, only the seal and gift wrap timestamps should be randomized for privacy. The **rumor must use the real timestamp** — this is what the recipient's client displays as the message time. If you randomize the rumor timestamp, the DM will appear with a wrong/old date in the recipient's inbox. This was a bug we hit and fixed.

### Reference Implementation

See `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip59.ts` for a similar approach used in Ghostr.

## NIP-10 Reply Threading

Public replies (kind 1) use the preferred marked `e` tag format from NIP-10:

```
["e", <event-id>, "", "root"]
```

The reply-to input accepts `note1...`, `nevent1...`, or raw 64-char hex event IDs. Validation is done client-side using `nip19.decode()` before the confirm button is enabled.

## Share Options

Post-move sharing supports four modes:

| Mode | Kind | Description |
|------|------|-------------|
| Public Nostr post | 1 | Standard note with `t` and `client` tags |
| Public Nostr reply | 1 | Reply to an existing note with NIP-10 `e` tag |
| Standard DM | 4 | NIP-04 encrypted DM (more compatible with older clients) |
| Giftwrap DM | 14/13/1059 | NIP-17 gift-wrapped DM (metadata-private) |

Public notes and replies include a `["client", "Words With Zaps"]` tag for attribution.

## Client Tag

All public events (kind 1 notes and replies) include:

```
["client", "Words With Zaps"]
```

This follows the convention used by other Nostr clients to identify the publishing application.

## Dictionary

The app ships `wwzwords1.txt` as its primary word list. Custom words (e.g. YOLO, FOMO, PUBKEY) are added directly to this file rather than injected at runtime, ensuring both players validate against the same dictionary regardless of client version.

The dictionary loads in priority order: `VITE_DICTIONARY_URL` > `wwzwords1.txt` > `sowpods.txt` > `csw21.txt` > `nwl2023.txt` > `twl06.txt`. The legacy `enable1.txt` has been removed.

## Achievements

| Type | Trigger | Badge |
|------|---------|-------|
| Zapathon | All 7 tiles played | "7" |
| Zap Square | Tile placed on ZAP bonus square | "⚡" |
| Double Word | Word on double-word multiplier (25+ pts) | "2x" |
| High Score | Single word scores 40+ points | wow.svg |

## Fetch Timeout

`fetchEvents` in `client.ts` uses a 10-second timeout. If relays don't send EOSE within that window, partial results are returned silently. This prevents the UI from hanging on slow or unresponsive relays.

## Signer Compatibility

The `BunkerSignerWrapper` in `client.ts` wraps NIP-46 bunker signers for NDK compatibility. It implements `encrypt`/`decrypt` using `nip44Encrypt`/`nip44Decrypt` but does **not** implement `encryptionEnabled()`. This is why NIP-17 uses manual wrapping instead of NDK's `giftWrap()` — see the NIP-17 section above.
