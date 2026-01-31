# Words With Zaps - Developer Notes

## Project Status

**Phase 1 Complete** - Core implementation finished, ready for testing and iteration.

## What's Implemented

### Game Engine (`src/engine/`)
- ✅ Full Scrabble board logic (15x15, all multiplier positions)
- ✅ Standard tile distribution and letter values
- ✅ Trie-based dictionary for O(n) word lookup
- ✅ Move validation (line continuity, connection to existing tiles, word validity)
- ✅ Score calculation with DL/TL/DW/TW multipliers
- ✅ Bingo bonus (50 pts for using all 7 tiles)
- ✅ Game state management (moves, passes, exchanges, resignation)
- ✅ End game detection and final scoring
- ✅ 99 unit tests passing

### Nostr Layer (`src/nostr/`)
- ✅ NDK client setup with relay connection
- ✅ NIP-07 browser extension authentication
- ✅ NIP-44 encryption/decryption for game state
- ✅ Kind 30078 events for game state storage
- ✅ Player rack stored encrypted to self
- ✅ Real-time subscription to game updates
- ✅ Turn validation (index increment, lastMoveHash chain)

### Wallet Integration (`src/wallet/`)
- ✅ Abstract WalletService with provider pattern
- ✅ WebLN provider (Alby, etc.)
- ✅ NWC provider (stub - needs full protocol implementation)
- ✅ Breez SDK provider (ready for Spark SDK)
- ✅ NIP-57 zap request creation
- ✅ LNURL-pay support for fetching invoices

### React UI (`src/components/`)
- ✅ Login screen with NIP-07 connection
- ✅ Lobby for creating/joining games
- ✅ Game board with drag-and-drop tiles
- ✅ Player rack with tile selection
- ✅ Scoreboard with turn indicator
- ✅ Game controls (Play, Pass, Shuffle, Clear)
- ✅ Move validation feedback
- ✅ Game status display

## What's NOT Implemented Yet

### High Priority
- [ ] Blank tile letter selection UI
- [ ] Exchange tiles UI flow
- [ ] Game list (show active games)
- [ ] Proper error handling/recovery
- [ ] Loading states and skeleton UI

### Medium Priority
- [ ] Full NWC protocol implementation
- [ ] Game invites via Nostr DMs
- [ ] Sound effects
- [ ] Keyboard shortcuts
- [ ] Mobile responsive design

### Low Priority / Future
- [ ] Spectator mode
- [ ] Game replay/history
- [ ] Leaderboards
- [ ] Tournaments
- [ ] AI opponent

## Technical Debt

1. **Dynamic import warning**: `GameEngine.ts` is both statically and dynamically imported
2. **Bundle size**: 566KB - could benefit from code splitting
3. **NWC stub**: Returns error, needs full implementation
4. **Dictionary loading**: Falls back to minimal word list if SOWPODS not found

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_BREEZ_SPARK_API_KEY` | Breez Spark SDK API key (optional) |

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
2. Include SOWPODS dictionary in `public/dictionaries/`
3. Configure CORS if hosting dictionary separately
