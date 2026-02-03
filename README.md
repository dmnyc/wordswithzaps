# Words With Zaps

A peer-to-peer word game built on the Nostr protocol with Bitcoin Lightning zaps.

## Overview

Words With Zaps is a serverless, censorship-resistant word game where game state lives entirely on Nostr relays. No central server, no accounts, no sign-ups. Just you, your opponent, and the open protocol.

- **Game state** is stored as encrypted addressable events on Nostr relays (Kind 30078 / NIP-78)
- **Identity** uses Nostr keys with multiple login options (NIP-07, NIP-46, or local keypair)
- **Privacy** is ensured via NIP-44 encrypted game state between players
- **Notifications** can be sent as Lightning zaps (NIP-57) or shared as public notes, public replies, standard DMs (NIP-04), or gift-wrapped DMs (NIP-17)
- **Relay discovery** uses NIP-65 relay lists merged with default relays

## Features

- Full crossword-style mechanics on a 15x15 board with letter values, multipliers, and bonus squares
- Custom scoring: 42-point Zapathon bonus for using all 7 tiles, 21-point Zap Square bonus at corners and center
- End-to-end encrypted game state (NIP-44 with NIP-04 fallback)
- Lightning zaps as move notifications via NWC, Breez SDK (Spark), or WebLN
- Post-move sharing: public note, public reply (kind 1), standard DM (kind 4), or gift-wrapped DM (NIP-17/kind 14)
- Achievement system: Zapathon (all 7 tiles), Zap Square bonus, Double Word Score, High Score
- Pass, swap tiles, or forfeit
- Last-move tile highlighting with animated glow
- Relay confirmation with retry logic for reliable event publishing
- Mobile-responsive UI

## Login Methods

- **Browser Extension (NIP-07)**: Alby, nos2x, or any NIP-07 signer
- **Remote Signer (NIP-46)**: Scan a QR code or paste a bunker URI (Amber, nsecBunker, etc.)
- **Local Keypair**: Generate a new keypair directly in the app with nsec backup

## Wallet Support

Lightning wallets are optional and used to zap your opponent after each move:

- **NWC (Nostr Wallet Connect)**: Connect via NIP-47 connection string
- **Breez SDK (Spark)**: Self-custodial Lightning via WebAssembly (requires API key)
- **WebLN (Bitcoin Connect)**: Browser-based wallet interface

## Quick Start

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

## Requirements

- Node.js 18+
- A Nostr signer (browser extension, remote signer, or generate a local key)
- Optional: Lightning wallet for zap notifications

## Dictionary

The app ships with `wwzwords1.txt`, a custom word list that includes standard dictionary words plus game-specific additions (e.g. YOLO, FOMO, PUBKEY).

For alternative dictionaries, place a word list in `public/dictionaries/`. The app tries these in order:
`wwzwords1.txt`, `sowpods.txt`, `csw21.txt`, `nwl2023.txt`, `twl06.txt`.

You can also set `VITE_DICTIONARY_URL` to load a custom file.
A minimal fallback dictionary is included for testing when none are found.

## Configuration

Create `.env.local` for optional settings:

```
VITE_BREEZ_SPARK_API_KEY=your_api_key_here
```

## Architecture

```
src/
├── engine/        # Core game logic (pure, no dependencies)
│   ├── constants  # Board layout, tile values, multipliers
│   ├── Dictionary # Trie-based word validation
│   ├── Board      # Placement validation, scoring
│   └── GameEngine # Game state machine
├── nostr/         # Nostr transport layer
│   ├── client     # NDK connection, signing, relay management
│   ├── encryption # NIP-44 / NIP-04 encryption
│   ├── NostrSync  # Game state publish/subscribe via Kind 30078
│   └── profiles   # Profile fetching and caching
├── wallet/        # Lightning wallet integration
│   ├── walletManager  # Zap flow (LNURL, NIP-57)
│   └── providers/     # NWC, Breez Spark, WebLN
├── components/    # React UI
└── hooks/         # useNostr, useWallet, useGame
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Nostr**: @nostr-dev-kit/ndk + nostr-tools
- **Testing**: Vitest
- **Styling**: CSS (no framework)

## How It Works

1. **Create Game**: Player A generates a game and publishes encrypted state to relays
2. **Share Link**: Player A shares the game link with Player B
3. **Play**: Each move is validated locally, then published as encrypted state
4. **Zap & Share**: After a move, optionally zap your opponent and share a note
5. **Sync**: Both clients subscribe to the game's d-tag for updates

## Nostr Protocol Usage

### Events

| Kind | NIP | Purpose |
|------|-----|---------|
| 0 | NIP-01 | User profiles |
| 1 | NIP-01 | Public move share notes and replies |
| 4 | NIP-04 | Standard private move share DMs |
| 13 | NIP-59 | Seal (gift wrap intermediate layer) |
| 14 | NIP-17 | Private DM rumor (unsigned, inside seal) |
| 1059 | NIP-59 | Gift wrap (outer encryption layer) |
| 9734 | NIP-57 | Zap requests (move notifications) |
| 10002 | NIP-65 | Relay lists |
| 30078 | NIP-78 | Game state, player racks, settings |

### NIPs

- **NIP-01**: Events, profiles, subscriptions
- **NIP-04**: Encrypted direct messages (standard/compatible DMs)
- **NIP-07**: Browser extension signing
- **NIP-10**: Reply threading (e tags with root marker)
- **NIP-17**: Private direct messages (gift-wrapped, secure DMs)
- **NIP-44**: Encrypted payloads (primary encryption for game state and NIP-17)
- **NIP-46**: Nostr Connect / remote signing
- **NIP-47**: Nostr Wallet Connect
- **NIP-57**: Lightning zaps
- **NIP-59**: Gift wrap (seals and wraps for NIP-17)
- **NIP-65**: Relay list metadata
- **NIP-78**: Arbitrary custom app data

### Default Relays

- wss://relay.damus.io
- wss://relay.primal.net
- wss://nos.lol
- wss://relay.snort.social
- wss://purplepag.es
- wss://relay.nostr.net

## Known Limitations

- Tile bag is stored in game state (allows peeking via raw event JSON)
- No spectator mode
- No game history or replay
- Two players only

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes and verify the build passes (`npm run build`)
4. Run tests (`npm run test`)
5. Commit your changes and open a pull request

If you find a bug or have a feature request, open an issue on GitHub.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built for the [Nostr protocol](https://nostr.com)
- From the creator of [Plebs vs. Zombies](https://github.com/dmnyc/plebs-vs-zombies) and [Mutable](https://github.com/dmnyc/mutable)

## Author

Created by The Daniel

Vibed with Claude and Codex
