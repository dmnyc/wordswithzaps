/**
 * REPAIR SCRIPT — Gamestr Leaderboard + Share Note
 *
 * Re-publishes a missing/broken gamestr leaderboard event (kind 30762)
 * and a corrected share note (kind 1) for a given game.
 *
 * Usage:
 *   1. Wire into App.tsx (see below)
 *   2. Log in, then navigate to ?repair=gamestr&gameId=<UUID>
 *
 * App.tsx wiring (add near top):
 *   import { lazy, Suspense } from "react";
 *   const RepairGamestr = lazy(() => import("./scripts/repair-gamestr"));
 *
 * App.tsx wiring (add before return):
 *   const repairParams = new URLSearchParams(window.location.search);
 *   if (repairParams.get("repair") === "gamestr" && isConnected) {
 *     return (
 *       <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
 *         <RepairGamestr />
 *       </Suspense>
 *     );
 *   }
 */
import { fetchEvents, createEvent, publishEvent, getCurrentUser } from "../nostr/client";
import { decryptGameState } from "../nostr/encryption";
import { computeGameEndStats } from "../utils/gameStats";
import { GAME_KIND, GAME_D_TAG_PREFIX, GAMESTR_KIND, GAMESTR_GAME_ID } from "../types/nostr";
import type { GameState } from "../types/game";
import { nip19 } from "nostr-tools";
import { useState } from "react";

function getGameIdFromURL(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("gameId") || "";
}

async function repairGame(gameId: string): Promise<string> {
  if (!gameId) throw new Error("No gameId provided. Add &gameId=<UUID> to the URL.");

  const log: string[] = [];
  const add = (msg: string) => { log.push(msg); console.log(`[repair] ${msg}`); };

  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Not logged in");
  add(`Logged in as ${user.pubkey.slice(0, 12)}...`);

  // 1. Fetch game events
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const events = await fetchEvents({ kinds: [GAME_KIND], "#d": [dTag], limit: 20 });
  add(`Found ${events.length} game events`);
  if (events.length === 0) throw new Error("Game not found on relays");

  const sorted = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  // 2. Decrypt latest state
  let gameState: GameState | null = null;
  for (const event of sorted) {
    const players = event.tags.filter(t => t[0] === "p" && t[1]).map(t => t[1]);
    const opponent = players.find(p => p !== user.pubkey) || "";
    if (!opponent) continue;
    try {
      const decryptKey = event.pubkey === user.pubkey ? opponent : event.pubkey;
      gameState = await decryptGameState<GameState>(decryptKey, event.content);
      add(`Decrypted game state (status: ${gameState.meta.status}, winner: ${gameState.meta.winner?.slice(0, 12)}...)`);
      break;
    } catch {
      add(`Decrypt failed for event ${event.id?.slice(0, 12)}, trying next...`);
    }
  }
  if (!gameState) throw new Error("Could not decrypt any game event");

  // 3. Verify this is a won game
  const { status, winner, playerOne, playerTwo } = gameState.meta;
  if (winner !== user.pubkey) throw new Error(`You are not the winner (winner: ${winner})`);
  add(`Game: ${status}, winner is you`);

  const opponentPubkey = playerOne === user.pubkey ? playerTwo : playerOne;
  const isPlayerOne = playerOne === user.pubkey;
  const myScore = isPlayerOne ? gameState.scoring.p1Score : gameState.scoring.p2Score;
  const oppScore = isPlayerOne ? gameState.scoring.p2Score : gameState.scoring.p1Score;

  add(`Score: ${myScore} - ${oppScore}`);

  // 4. Compute stats
  const stats = computeGameEndStats(gameState.scoring.history, user.pubkey);
  add(`Best word: ${stats.highestWord} (${stats.highestWordScore} pts)`);

  // 5. Publish gamestr leaderboard event (kind 30762)
  const outcome = "win";
  const content = `Won with ${myScore} points! Best word: ${stats.highestWord.toUpperCase()} (${stats.highestWordScore} pts)`;

  const gamestrTags: string[][] = [
    ["d", `${GAMESTR_GAME_ID}:${user.pubkey}:${gameId}`],
    ["game", GAMESTR_GAME_ID],
    ["matchid", gameId],
    ["score", String(myScore)],
    ["score:highestword", String(stats.highestWordScore)],
    ["highestword", stats.highestWord.toUpperCase()],
    ["p", user.pubkey],
    ["state", "completed"],
    ["result", outcome],
    ["mode", "multiplayer"],
    ["t", "puzzle"],
    ["t", "multiplayer"],
    ["alt", `Words With Zaps score: ${myScore} pts (best word: ${stats.highestWord.toUpperCase()} for ${stats.highestWordScore} pts)`],
  ];

  const gamestrEvent = createEvent(GAMESTR_KIND, content, gamestrTags);
  await publishEvent(gamestrEvent);
  const gamestrEventId = gamestrEvent.id;
  add(`Published gamestr event: ${gamestrEventId}`);

  // 6. Publish corrected share note (kind 1)
  const gamestrUrl = `https://gamestr.io/wordswithzaps/score/${gamestrEventId}`;
  const opponentNpub = nip19.npubEncode(opponentPubkey);
  const opponentRef = `nostr:${opponentNpub}`;
  const statsLine = stats.highestWord
    ? `Best word: ${stats.highestWord.toUpperCase()} (${stats.highestWordScore} pts)`
    : "";

  const shareContent = `I just won ${myScore} to ${oppScore} against ${opponentRef} in #WordsWithZaps! 🏆⚡${statsLine ? `\n\n${statsLine}` : ""}\n\n${gamestrUrl}`;

  const shareEvent = createEvent(1, shareContent, [
    ["t", "wordswithzaps"],
    ["client", "Words With Zaps"],
    ["p", opponentPubkey],
  ]);
  await publishEvent(shareEvent);
  add(`Published share note: ${shareEvent.id}`);
  add(`Gamestr URL: ${gamestrUrl}`);

  return log.join("\n");
}

export default function RepairGamestr() {
  const [gameId] = useState(getGameIdFromURL);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [output, setOutput] = useState("");

  const run = async () => {
    setStatus("running");
    setOutput("Running...");
    try {
      const result = await repairGame(gameId);
      setOutput(result);
      setStatus("done");
    } catch (err) {
      setOutput(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("error");
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "monospace", maxWidth: 700 }}>
      <h2>Repair Gamestr</h2>
      <p>Game: <code>{gameId || "(none — add &gameId=UUID to URL)"}</code></p>
      <p>Publishes the missing gamestr leaderboard event + corrected share note.</p>
      <button
        onClick={run}
        disabled={status === "running" || status === "done" || !gameId}
        style={{ padding: "8px 16px", fontSize: 16 }}
      >
        {status === "idle" ? "Run Repair" : status === "running" ? "Running..." : status === "done" ? "Done" : "Error — check output"}
      </button>
      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 16, borderRadius: 8 }}>
        {output}
      </pre>
    </div>
  );
}

export { repairGame };
