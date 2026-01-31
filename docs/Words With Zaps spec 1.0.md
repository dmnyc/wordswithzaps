This is a comprehensive technical specification designed to be copy-pasted directly into a conversation with Claude or a Codex-based environment. It covers the architecture, data structures, state management, and Zap integration.

# **Technical Specification: Words With Zaps**

**Version:** 1.0 **Architecture:** Serverless, Nostr-based, Lightning-incentivized. **Reference:** Based on the "Zap Cooking" stack (Breez SDK, NWC, WebLN).

## **1\. High-Level Architecture**

The application is a P2P turn-based word game. It does not use a central backend.

* **Database:** Nostr Relays (NIP-78 Parameterized Replaceable Events).  
* **Identity:** Nostr Public Keys (NIP-01).  
* **Encryption:** NIP-44 (XChaCha20-Poly1305) for game state privacy.  
* **Notifications/Incentives:** Lightning Network Zaps (NIP-57).  
* **Client Logic:** React/Typescript (State Machine & Validation).

## **2\. Data Models (Nostr Events)**

### **2.1. The Game State (Kind 30078\)**

We use kind: 30078 (Application Specific Data).

* **d-tag:** wordswithzaps\_v1\_{gameUUID}  
* **Visibility:** The content is **encrypted** using NIP-44 (Shared Secret between Player A and Player B).  
* **Indexing:** Both players publish to this same d-tag. The "Head" of the chain is the event with the highest turnIndex.

#### **Decrypted Content JSON Schema:**

`interface GameState {`  
  `meta: {`  
    `gameId: string;        // UUID`  
    `playerOne: string;     // Pubkey (Hex)`  
    `playerTwo: string;     // Pubkey (Hex)`  
    `status: 'active' | 'completed' | 'abandoned';`  
    `winner?: string;`  
  `};`  
    
  `turn: {`  
    `index: number;         // Incrementing integer (0, 1, 2...)`  
    `activePlayer: string;  // Pubkey of who moves NEXT`  
    `timestamp: number;`  
    `lastMoveHash: string;  // Hash of the previous event ID (Blockchain style linking)`  
  `};`

  `board: {`  
    `// Sparse map: "x,y" => "Letter"`  
    `[coordinate: string]: string;`   
  `};`

  `scoring: {`  
    `p1Score: number;`  
    `p2Score: number;`  
    `history: Array<{`  
      `player: string;`  
      `word: string;`  
      `score: number;`  
      `coords: string[]; // Array of "x,y"`  
    `}>;`  
  `};`

  `// THE BAG PROBLEM (P2P Trust Trade-off)`  
  `// For V1, the remaining tiles are stored here.`  
  `// Note: Technically allows 'peeking' if user inspects raw JSON.`   
  `// Mitigation: Client UI hides this.`  
  `tileBag: string[];`   
`}`

### **2.2. Player Private State (Local Storage / Kind 30078\)**

To prevent players from losing their rack (current letters) if they switch devices, we store the rack in a *separate* event encrypted to *self*.

* **d-tag:** wordswithzaps\_rack\_{gameUUID}  
* **Encryption:** Encrypted to Self (NIP-44).  
* **Content:** {"rack": \["A", "B", "C", ...\]}

## **3\. The State Machine & Game Loop**

### **Step 1: Initialization (The Challenge)**

1. **User A** generates a Game UUID.  
2. **User A** creates the initial GameState (Turn 0, Empty Board, Full Bag).  
3. **User A** publishes kind: 30078 d: wordswithzaps\_v1\_{UUID}.  
4. **User A** sends the Game Link (nostr:nevent...) to **User B**.

### **Step 2: The Move (The Transaction)**

When it is **User B's** turn:

1. **Fetch:** Query relays for kind: 30078 with \#d: {UUID}. Sort by created\_at desc.  
2. **Validate:**  
   * Is activePlayer \== My Pubkey?  
   * Is the prevEventId valid?  
3. **Action (Client Side):**  
   * Place tiles on board.  
   * Validate word against internal Dictionary API/Library.  
   * Calculate score.  
   * Remove used tiles from Local Rack.  
   * Draw new tiles from tileBag (in GameState).  
   * Update tileBag in GameState.  
4. **Construct Payload:**  
   * Increment turn.index.  
   * Set activePlayer to Opponent.  
   * Set lastMoveHash to the ID of the event just fetched.  
5. **Zap (The Notification):**  
   * *Before publishing the move*, trigger the Zap workflow (see Section 4).  
6. **Publish:**  
   * Encrypt payload (NIP-44).  
   * Publish kind: 30078 to relays.

### **Step 3: Conflict Resolution**

If both players move simultaneously (race condition) or relays serve stale data:

* **Rule:** The client must reject any incoming event where turn.index is not exactly local\_turn.index \+ 1\.  
* **Rule:** The client must reject any event where lastMoveHash does not match the known valid tip.

## **4\. Wallet & Notification Layer (Zap Integration)**

Leveraging the **Zap Cooking** stack logic.

### **4.1. Wallet Abstraction Service**

Create a WalletService class that unifies the methods.  
`type WalletProvider = 'breez' | 'nwc' | 'extension' | 'webln';`

`interface ZapParams {`  
  `recipientPubkey: string;`  
  `amountSats: number;`  
  `gameId: string;`  
  `moveDescription: string; // e.g. "Played QUIZ for 22 points"`  
`}`

`// Logic Flow`  
`async function notifyOpponent(params: ZapParams) {`  
  `// 1. Fetch Lightning Address / LNURL from Opponent's Profile (Kind 0)`  
  `// 2. Construct Zap Request (Kind 9734)`  
  `//    - Add tag ['e', params.gameId]`  
  `//    - Add tag ['poll_option', params.moveDescription] (Creative misuse for visibility)`  
  `// 3. Get Invoice from Provider`  
  `// 4. Pay Invoice`  
  `// 5. Return Preimage`  
`}`

### **4.2. Implementation Priority**

1. **NWC (Nostr Wallet Connect):** Best for mobile users and remote nodes.  
2. **Breez SDK:** For embedded, self-custodial "burner" wallets within the app.  
3. **WebLN (Alby/NIP-07):** For desktop users.

## **5\. Development Phases (For AI Execution)**

### **Phase 1: The Core SDK**

**Prompt to AI:** "Create a TypeScript class GameEngine that handles the Scrabble logic (board validation, scoring, bag management) and state serialization. No UI yet. Just pure logic and Jest tests."

### **Phase 2: The Nostr Transport**

**Prompt to AI:** "Create a NostrSync service using ndk or nostr-tools. It needs to subscribe to a specific d-tag (NIP-78), handle NIP-44 encryption/decryption, and manage the turnIndex validation logic to prevent race conditions."

### **Phase 3: The Wallet Connection**

**Prompt to AI:** "Port the WalletManager from the Zap Cooking repo. Ensure it exposes a simple zapOpponent() method that accepts a pubkey and an amount. It must support NWC and WebLN detection."

### **Phase 4: The UI (React/React Native)**

**Prompt to AI:** "Build a Drag-and-Drop board component. It should subscribe to the GameEngine state. When a move is confirmed, it should await the WalletManager.zapOpponent() promise before finalizing the move via NostrSync."

## **6\. Specific NIP Requirements**

* **NIP-01:** Basic protocol flow.  
* **NIP-07:** Browser extension signing (for Web).  
* **NIP-44:** Encrypted payloads (Vital for hiding letters/tiles from public view).  
* **NIP-57:** Zaps (The notification layer).  
* **NIP-78:** Arbitrary custom app data (The storage layer).

## **7\. Dictionary & Validation**

* Use a local Trie-based dictionary (e.g., enable the app to load sowpods.txt or twl06.txt into memory).  
* **Note:** Do not rely on an external API for word validation to maintain the "Serverless/Uncensorable" ethos. Validate locally on both clients. If Player A sends an invalid word, Player B's client rejects the state update.