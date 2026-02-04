# Developer Notes

Implementation notes, gotchas, and design decisions for contributors.

## Game Design

Words With Zaps is **not** Scrabble. It is a unique crossword-style word game with its own rules, board layout, scoring, and special squares designed around Bitcoin Lightning and Nostr.

### Board & Squares

15x15 board with four square types (no Triple Word or Triple Letter squares):

| Square | Meaning | Count | Locations |
|--------|---------|-------|-----------|
| **DL** | Double Letter Score | 12 | Scattered inner ring |
| **QL** | Quadruple Letter Score | 12 | Edge and mid positions |
| **DW** | Double Word Score | 8 | Inner diagonal positions |
| **ZAP** | +21 bonus points per word | 5 | Four corners + center |

The center square is a ZAP square (not a star). The first word must cover it.

### Scoring

- **Letter values** are unique to this game (e.g. Z=11, Q=10, X=9, K=7, J=8)
- **Zap Square bonus**: +21 points per word that includes a newly placed tile on a ZAP square
- **Zapathon bonus**: +42 points for playing all 7 tiles in one turn
- **Blank tiles**: Worth 0 points, can represent any letter, locked once played
- **99 tiles total** with 4 blanks

### Game End

- Both players pass consecutively
- One player uses all tiles
- A player forfeits (opponent wins)
- A game is declared abandoned after 14 days idle (no winner)

## Game End Flow

The GameOverModal differentiates by outcome:

| Outcome | Graphic | Content | Actions |
|---------|---------|---------|---------|
| **Won** | `victory.svg` | Score, best word, words played | Share to Nostr + GG zap + creator zap |
| **Lost** | `game_over.svg` | Score | GG zap + creator zap |
| **Tie** | `game_over.svg` | Score | Share to Nostr + GG zap + creator zap |
| **Abandoned** | `game_over.svg` | — | Creator zap |

When the current user wins, a 3-second victory celebration overlay (confetti + score) plays before the modal appears.

**Share options** reuse the same modes as post-move sharing (public kind 1, public reply, kind 4 DM, NIP-17 giftwrap). Victory messages include the final score, opponent mention, and best word.

**Game stats** are computed from `scoring.history` via `computeGameEndStats()` in `src/utils/gameStats.ts` — highest-scoring word, total words played, and total moves.

## Game Decay & Abandonment

Games where the opponent hasn't moved are tracked with a decay tier system. Decay is computed from the existing `updatedAt` (Lobby) or `turn.timestamp` (GameView) — no schema changes needed.

### Decay Tiers

| Tier | Time Idle | Badge | Card Border |
|------|-----------|-------|-------------|
| Fresh | < 1 day | Gray "Waiting" | None |
| Stale | 1–3 days | Orange "1d"/"2d"/"3d" | Orange left border |
| Cold | 3–7 days | Red "3d"–"7d" | Red left border |
| Dormant | 7+ days | Dark red "1w+"/"2w+" | Dark red border, dimmed |

Decay badges only appear when it's the **opponent's** turn. When it's your turn the badge stays gold "Your turn" as usual.

### Nudge Zaps

Stale, cold, and dormant games show a bolt icon in the Lobby that opens a NudgeModal. This lets you send a reminder zap (21/50/100/500 sats) to the opponent with the message "Your turn on #WordsWithZaps!" — using the existing `zapUser` infrastructure.

### Abandonment

After **14 days** of opponent inactivity, the game can be declared abandoned:

- From **GameView**: a subtle "Declare abandoned" button appears below the game controls
- `GameEngine.declareAbandoned()` sets `status: "abandoned"` with **no winner** — neither player wins or loses
- This is distinct from forfeit/resign (`GameEngine.abandonGame()`) where the resigning player loses and the opponent wins
- Only the waiting player (not the active player) can declare abandonment

### Utility

`src/utils/gameDecay.ts` exports:
- `getDecayTier(updatedAt, now?)` — returns `{ tier, label, ageDays }`
- `canDeclareAbandoned(updatedAt, now?)` — true if idle ≥ 14 days
- `ABANDON_THRESHOLD_DAYS = 14`

## NIP-17 Gift-Wrapped DMs

Gift-wrapped DMs use manual NIP-59 wrapping rather than NDK's built-in `giftWrap()` helper. This is because `giftWrap()` checks `signer.encryptionEnabled("nip44")` which not all signer wrappers implement (notably our `BunkerSignerWrapper` for NIP-46). The manual approach calls `signer.encrypt()` directly, which works with all signer types (NIP-07, NIP-46, local keypair).

### Wrapping Flow

1. **Rumor (kind 14)** - Unsigned event with the actual message content and a `p` tag for the recipient. Uses the **real timestamp** so the recipient's client displays the correct time.
2. **Seal (kind 13)** - The rumor is JSON-stringified and NIP-44 encrypted to the recipient, then signed by the sender. Uses a **randomized timestamp** (up to 2 days in the past) for metadata privacy.
3. **Gift Wrap (kind 1059)** - The seal is JSON-stringified and NIP-44 encrypted using an ephemeral keypair (`NDKPrivateKeySigner` with `generateSecretKey()`). Tagged with the recipient's pubkey. Uses a **randomized timestamp**. Signed by the ephemeral key.

### Timestamp Gotcha

Per NIP-17, only the seal and gift wrap timestamps should be randomized for privacy. The **rumor must use the real timestamp** -- this is what the recipient's client displays as the message time. If you randomize the rumor timestamp, the DM will appear with a wrong/old date in the recipient's inbox. This was a bug we hit and fixed.

### Reference Implementation

The Ghostr project uses the same manual wrapping approach. See its `src/lib/nostr/nip59.ts` for reference.

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
| Zapathon | All 7 tiles played in one turn | "7" |
| Zap Square | Tile placed on a ZAP bonus square | bolt icon |
| Double Word | Word on DW multiplier scoring 25+ points | "2x" |
| High Score | Single word scores 40+ points | wow.svg |

## Fetch Timeout

`fetchEvents` in `client.ts` uses a 10-second timeout. If relays don't send EOSE within that window, partial results are returned silently. This prevents the UI from hanging on slow or unresponsive relays.

## Signer Compatibility

The `BunkerSignerWrapper` in `client.ts` wraps NIP-46 bunker signers for NDK compatibility. It implements `encrypt`/`decrypt` using `nip44Encrypt`/`nip44Decrypt` but does **not** implement `encryptionEnabled()`. This is why NIP-17 uses manual wrapping instead of NDK's `giftWrap()` -- see the NIP-17 section above.
