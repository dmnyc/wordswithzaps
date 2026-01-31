# Words With Zaps ⚡

A peer-to-peer Scrabble-like word game built on Nostr with Lightning payments.

## Overview

Words With Zaps is a serverless, censorship-resistant word game where:
- **Game state** is stored on Nostr relays (Kind 30078)
- **Identity** uses Nostr public keys (NIP-07 browser extensions)
- **Privacy** is ensured via NIP-44 encryption between players
- **Notifications** are sent as Lightning Zaps (NIP-57)

No central server. No accounts. Just you, your opponent, and the blockchain of words.

## Features

- 🎮 Full Scrabble mechanics (15x15 board, letter values, multipliers, bingo bonus)
- 🔐 End-to-end encrypted game state between players
- ⚡ Lightning payments for move notifications
- 🌐 Works with any NIP-07 browser extension (Alby, nos2x, etc.)
- 📱 Wallet support: WebLN, NWC, Breez SDK

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

## Requirements

- Node.js 18+
- A NIP-07 browser extension (Alby recommended)
- Optional: Lightning wallet for zap notifications

## Dictionary

Place a word list in `public/dictionaries/` for full validation. The app will try these (in order):
`sowpods.txt`, `csw21.txt`, `nwl2023.txt`, `twl06.txt`, `enable1.txt`.
You can also set `VITE_DICTIONARY_URL` to load a custom file.
A minimal fallback dictionary is included for testing when none are found.

## Configuration

Create `.env.local` for optional Breez SDK support:

```
VITE_BREEZ_SPARK_API_KEY=your_api_key_here
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Nostr**: @nostr-dev-kit/ndk + nostr-tools
- **Testing**: Vitest
- **Styling**: CSS (no framework)

## Architecture

```
src/
├── engine/        # Core game logic (no dependencies)
│   ├── constants  # Board size, tile values, multipliers
│   ├── Dictionary # Trie-based word validation
│   ├── Board      # Placement validation, scoring
│   └── GameEngine # Game state management
├── nostr/         # Nostr transport layer
│   ├── client     # NDK connection, NIP-07 auth
│   ├── encryption # NIP-44 encryption
│   └── NostrSync  # Game state sync via Kind 30078
├── wallet/        # Lightning wallet integration
│   ├── WalletService
│   └── providers/ # WebLN, NWC, Breez
├── components/    # React UI
└── hooks/         # useNostr, useWallet, useGame
```

## How It Works

1. **Create Game**: Player A generates a game, publishes encrypted state to relays
2. **Share Link**: Player A sends game ID + their pubkey to Player B
3. **Play**: Each move is validated locally, then published as a new encrypted event
4. **Zap**: Optionally zap your opponent when you play (serves as notification)
5. **Sync**: Both clients subscribe to the game's d-tag for real-time updates

## Nostr Events

- **Kind 30078** (Game State): `d-tag: wordswithzaps_v1_{gameUUID}`
- **Kind 30078** (Player Rack): `d-tag: wordswithzaps_rack_{gameUUID}` (encrypted to self)
- **Kind 9734** (Zap Request): Sent with move description

## Known Limitations (V1)

- Tile bag is stored in game state (technically allows peeking via raw JSON)
- No spectator mode
- No game history/replay
- Two players only

## License

MIT
