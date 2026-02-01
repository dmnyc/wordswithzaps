import { useState, useEffect, useCallback } from "react";
import { useNostr } from "./hooks/useNostr";
import { useWallet } from "./hooks/useWallet";
import { WalletKind } from "./types/wallet";
import { getDictionary } from "./engine/Dictionary";
import { fetchGamePlayers } from "./nostr/games";
import { getCurrentUser } from "./nostr/client";
import LoginScreen from "./components/LoginScreen";
import Lobby from "./components/Lobby";
import GameView from "./components/GameView";
import NavBar from "./components/NavBar";
import WalletSettings from "./components/WalletSettings";
import "./index.css";

type Screen = "login" | "lobby" | "game";

interface GameSession {
  gameId: string;
  opponentPubkey: string;
}

function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [, setDictionaryLoaded] = useState(false);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [prefillGameId, setPrefillGameId] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const { isConnected, user, disconnect, connect, isConnecting, error } =
    useNostr();
  const {
    state: walletState,
    isReady: walletReady,
    activeWallet,
    bitcoinConnectEnabled,
  } = useWallet();
  const [showWalletSettings, setShowWalletSettings] = useState(false);
  const walletType = activeWallet
    ? activeWallet.kind === WalletKind.SPARK
      ? "spark"
      : "nwc"
    : bitcoinConnectEnabled
      ? "bitcoin-connect"
      : "none";

  const handleOpenWalletSettings = useCallback(() => {
    setShowWalletSettings(true);
  }, []);

  const handleCloseWalletSettings = useCallback(() => {
    setShowWalletSettings(false);
  }, []);

  // Load dictionary on mount
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const dict = getDictionary();
        if (!dict.isLoaded()) {
          const candidates = [
            import.meta.env.VITE_DICTIONARY_URL,
            "/dictionaries/sowpods.txt",
            "/dictionaries/csw21.txt",
            "/dictionaries/nwl2023.txt",
            "/dictionaries/twl06.txt",
            "/dictionaries/enable1.txt",
          ].filter(Boolean) as string[];

          let loadedFrom: string | null = null;
          let lastError: Error | null = null;

          for (const url of candidates) {
            try {
              await dict.loadFromUrl(url);
              loadedFrom = url;
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
            }
          }

          if (!loadedFrom) {
            throw (
              lastError ||
              new Error("No dictionary file found in /public/dictionaries")
            );
          }
        }
        setDictionaryLoaded(true);
      } catch (err) {
        console.warn("Failed to load dictionary:", err);
        // Load a minimal dictionary for testing
        const dict = getDictionary();
        dict.loadWords([
          "CAT",
          "CATS",
          "DOG",
          "DOGS",
          "HAT",
          "HATS",
          "BAT",
          "BATS",
          "RAT",
          "RATS",
          "MAT",
          "MATS",
          "SAT",
          "AT",
          "IT",
          "IS",
          "AS",
          "THE",
          "AND",
          "FOR",
          "ARE",
          "BUT",
          "NOT",
          "YOU",
          "ALL",
          "WORD",
          "WORDS",
          "PLAY",
          "PLAYS",
          "GAME",
          "GAMES",
          "QUIZ",
          "QUIZZES",
          "JAZZ",
          "FIZZ",
          "BUZZ",
          "PA",
          "PAR",
          "PAIR",
          "PAIRS",
        ]);
        setDictionaryLoaded(true);
        setDictionaryError(
          "Using limited dictionary. Add a word list file to /public/dictionaries/ (sowpods.txt, csw21.txt, nwl2023.txt, twl06.txt, or enable1.txt).",
        );
      }
    };

    loadDictionary();
  }, []);

  // Update screen based on connection status
  useEffect(() => {
    if (!isConnected && screen !== "login") {
      setScreen("login");
    }
  }, [isConnected, screen]);

  useEffect(() => {
    if (isConnected && screen === "login" && !prefillGameId) {
      setScreen("lobby");
    }
  }, [isConnected, screen, prefillGameId]);

  // Read gameId from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("gameId");
    if (gameId) {
      setPrefillGameId(gameId.trim());
    }
  }, []);

  // Auto-join game when a link is provided
  useEffect(() => {
    if (!prefillGameId || !isConnected || screen === "game") {
      return;
    }

    const user = getCurrentUser();
    if (!user?.pubkey) return;

    let cancelled = false;

    const resolveOpponent = async () => {
      try {
        const meta = await fetchGamePlayers(prefillGameId);
        if (!meta || meta.players.length === 0) {
          if (!cancelled) {
            setPrefillError("Game not found on relays yet.");
          }
          return;
        }

        const opponent =
          meta.players.find((p) => p !== user.pubkey) || meta.players[0];
        if (!opponent) {
          if (!cancelled) {
            setPrefillError("Could not determine opponent for this game.");
          }
          return;
        }

        if (!cancelled) {
          setGameSession({ gameId: prefillGameId, opponentPubkey: opponent });
          setScreen("game");
        }
      } catch (err) {
        if (!cancelled) {
          setPrefillError(
            err instanceof Error ? err.message : "Failed to open game link.",
          );
        }
      }
    };

    resolveOpponent();

    return () => {
      cancelled = true;
    };
  }, [prefillGameId, isConnected, screen]);

  const handleConnected = () => {
    setScreen("lobby");
  };

  const handleGameStart = (gameId: string, opponentPubkey: string) => {
    setGameSession({ gameId, opponentPubkey });
    setScreen("game");
  };

  const handleBackToLobby = () => {
    setGameSession(null);
    setPrefillGameId(null); // Clear so we don't auto-rejoin
    // Clear gameId from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("gameId");
    window.history.replaceState({}, "", url.toString());
    setScreen("lobby");
  };

  const handleDisconnect = () => {
    disconnect();
    setGameSession(null);
    setScreen("login");
  };

  return (
    <div className="app">
      {dictionaryError && (
        <div className="dictionary-warning">{dictionaryError}</div>
      )}

      {screen === "login" && (
        <LoginScreen
          onConnected={handleConnected}
          user={user}
          isConnecting={isConnecting}
          error={error}
          connect={connect}
        />
      )}

      {screen === "lobby" && (
        <>
          <NavBar
            user={user}
            onDisconnect={handleDisconnect}
            walletConnected={walletReady}
            walletBalance={walletState.balance}
            walletLoading={walletState.loading}
            walletType={walletType}
            onOpenWalletSettings={handleOpenWalletSettings}
          />
          <Lobby
            onGameStart={handleGameStart}
            prefillGameId={prefillGameId}
            prefillError={prefillError}
          />
        </>
      )}

      {screen === "game" && gameSession && (
        <>
          <NavBar
            user={user}
            onDisconnect={handleDisconnect}
            onBackToLobby={handleBackToLobby}
            walletConnected={walletReady}
            walletBalance={walletState.balance}
            walletLoading={walletState.loading}
            walletType={walletType}
            onOpenWalletSettings={handleOpenWalletSettings}
          />
          <GameView
            gameId={gameSession.gameId}
            opponentPubkey={gameSession.opponentPubkey}
          />
        </>
      )}

      {showWalletSettings && (
        <WalletSettings onClose={handleCloseWalletSettings} />
      )}
    </div>
  );
}

export default App;
