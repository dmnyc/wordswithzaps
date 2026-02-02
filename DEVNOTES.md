# Words With Zaps - Developer Notes

## Project Status

**Phase 2 Complete** - Full gameplay, multi-wallet support, achievements, and multiple authentication methods.

## What's Implemented

### Game Engine (`src/engine/`)
- ✅ Full Scrabble board logic (15x15, all multiplier positions)
- ✅ Standard tile distribution and letter values
- ✅ Trie-based dictionary for O(n) word lookup
- ✅ Move validation (line continuity, connection to existing tiles, word validity)
- ✅ Score calculation with DL/TL/DW/TW multipliers
- ✅ Bingo bonus (50 pts for using all 7 tiles) with celebration animation
- ✅ Game state management (moves, passes, exchanges, resignation)
- ✅ End game detection and final scoring
- ✅ 99 unit tests passing

### Nostr Layer (`src/nostr/`)
- ✅ NDK client setup with relay connection
- ✅ Multiple authentication methods (see Authentication section)
- ✅ NIP-44 encryption/decryption for game state
- ✅ Kind 30078 events for game state storage
- ✅ Player rack stored encrypted to self
- ✅ Real-time subscription to game updates
- ✅ Turn validation (index increment, lastMoveHash chain)
- ✅ Profile management with NIP-98 image uploads

### Authentication (`src/nostr/client.ts`, `src/hooks/useNostr.ts`)
Three login methods supported:

1. **NIP-07 Browser Extension** (Alby, nos2x, etc.)
   - Standard browser extension signing
   - Auto-reconnect on page refresh

2. **Private Key / Create Account**
   - Generate new keypair with `nostr-tools`
   - Mandatory backup file download before proceeding
   - Keys stored in localStorage (hex format)

3. **NIP-46 Remote Signer** (Amber, Primal, etc.)
   - **Bunker URL**: Paste `bunker://` URI directly
   - **QR Code Scan**: Generate `nostrconnect://` URI for mobile signers
   - Uses `nostr-tools/nip46` `BunkerSigner` for connection
   - Custom `BunkerSignerWrapper` class bridges nostr-tools to NDK

#### NIP-46 Implementation Notes

The nostrconnect flow required special handling:

```typescript
// 1. Generate URI using nostr-tools
const uri = createNostrConnectURI({
  clientPubkey,
  relays: DEFAULT_RELAYS.slice(0, 3),
  secret,
  name: "Words With Zaps",
});

// 2. Wait for remote signer with BunkerSigner.fromURI
const bunkerSigner = await BunkerSigner.fromURI(secretKey, uri, {}, timeout);

// 3. Wrap in custom class for NDK compatibility
ndk.signer = new BunkerSignerWrapper(bunkerSigner, userPubkey, ndk);
```

**Why the wrapper?** NDK's `NDKNip46Signer` calls `blockUntilReady()` which sends a new `connect` request. Remote signers like Primal reject duplicate connection attempts. The `BunkerSignerWrapper` implements `NDKSigner` interface and delegates signing to the already-connected `BunkerSigner`.

### Profile Settings (`src/components/ProfileSettings.tsx`)
- ✅ Edit display name, about, website
- ✅ Upload avatar/banner via nostr.build (NIP-98 authenticated)
- ✅ Image upload with auth header signing
- ✅ Publish kind 0 profile metadata

### Wallet Integration (`src/wallet/`)
- ✅ Multi-wallet support with wallet manager
- ✅ WebLN provider (Alby extension)
- ✅ NWC provider (Nostr Wallet Connect)
- ✅ Breez SDK provider (Spark)
- ✅ Bitcoin Connect integration
- ✅ Lightning address management
- ✅ NIP-57 zap requests
- ✅ LNURL-pay support

### React UI (`src/components/`)
- ✅ Login screen with progressive disclosure (3 auth methods)
- ✅ QR code display for nostrconnect (qrcode.react)
- ✅ Lobby for creating/joining games
- ✅ Game board with drag-and-drop tiles
- ✅ Player rack with shuffle animation
- ✅ Scoreboard with turn indicator
- ✅ Game controls (Play, Pass, Shuffle, Clear)
- ✅ Achievements system with unlock animations
- ✅ Nudge zap modal
- ✅ Support zap modal
- ✅ Profile settings modal
- ✅ Toast notifications
- ✅ Favicons and social share meta tags

## localStorage Schema

```
wwz_auth_method: "nip07" | "private-key" | "nip46"
wwz_autoconnect: "1" | null
wwz_last_pubkey: string (hex)
wwz_private_key: string (hex) - for private-key auth only
wwz_nip46_bunker: string (bunker:// URI)
wwz_nip46_local_key: string (hex) - local signer key for NIP-46
```

## Dependencies Added

- `qrcode.react` - QR code generation for nostrconnect
- `@noble/hashes` - Cryptographic utilities (bytesToHex)
- `nostr-tools/nip46` - BunkerSigner, createNostrConnectURI

## What's NOT Implemented Yet

### High Priority
- [ ] Session restore for nostrconnect (currently only bunker URL restores)
- [ ] Proper error handling/recovery for NIP-46 timeouts

### Medium Priority
- [ ] Game invites via Nostr DMs
- [ ] Sound effects
- [ ] Keyboard shortcuts

### Low Priority / Future
- [ ] Spectator mode
- [ ] Game replay/history
- [ ] Leaderboards
- [ ] Tournaments
- [ ] AI opponent

## Technical Debt

1. **Dynamic import warning**: `GameEngine.ts` is both statically and dynamically imported
2. **Bundle size**: ~800KB - could benefit from code splitting
3. **Dictionary loading**: Falls back to minimal word list if SOWPODS not found

## Testing

```bash
npm run test        # Watch mode
npm run test:run    # Single run
```

All 99 tests cover the game engine (constants, dictionary, board, game engine).
No tests yet for Nostr/wallet layers (require mocking).

## Default Relays

```typescript
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];
```

## Event Schema

### Game State Event
```
Kind: 30078
Tags: [["d", "wordswithzaps_v1_{uuid}"], ["p", pubkey1], ["p", pubkey2]]
Content: NIP-44 encrypted JSON (GameState interface)
```

### Player Rack Event
```
Kind: 30078
Tags: [["d", "wordswithzaps_rack_{uuid}"]]
Content: NIP-44 encrypted to self ({"rack": ["A", "B", ...]})
```

### Profile Metadata Event
```
Kind: 0
Content: JSON { name, about, picture, banner, website, ... }
```

## Build Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript check + Vite build
npm run preview  # Preview production build
npm run test     # Run Vitest in watch mode
npm run test:run # Run tests once
```

## Deployment

Static site - deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, etc.)

Remember to:
1. Set environment variables if using Breez
2. Include dictionary in `public/dictionaries/`
3. Configure CORS if hosting dictionary separately
