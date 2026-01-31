import { useState, useEffect } from "react";
import { useNostr } from "./hooks/useNostr";
import { getDictionary } from "./engine/Dictionary";
import LoginScreen from "./components/LoginScreen";
import Lobby from "./components/Lobby";
import GameView from "./components/GameView";
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

  const { isConnected } = useNostr();

  // Load dictionary on mount
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const dict = getDictionary();
        if (!dict.isLoaded()) {
          // Try to load dictionary from public folder
          await dict.loadFromUrl("/dictionaries/sowpods.txt");
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
        ]);
        setDictionaryLoaded(true);
        setDictionaryError(
          "Using limited dictionary. Add sowpods.txt to /public/dictionaries/",
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

  const handleConnected = () => {
    setScreen("lobby");
  };

  const handleGameStart = (gameId: string, opponentPubkey: string) => {
    setGameSession({ gameId, opponentPubkey });
    setScreen("game");
  };

  const handleBackToLobby = () => {
    setGameSession(null);
    setScreen("lobby");
  };

  return (
    <div className="app">
      {dictionaryError && (
        <div className="dictionary-warning">{dictionaryError}</div>
      )}

      {screen === "login" && <LoginScreen onConnected={handleConnected} />}

      {screen === "lobby" && (
        <>
          <button className="back-btn" onClick={() => setScreen("login")}>
            Disconnect
          </button>
          <Lobby onGameStart={handleGameStart} />
        </>
      )}

      {screen === "game" && gameSession && (
        <>
          <button className="back-btn" onClick={handleBackToLobby}>
            ← Back to Lobby
          </button>
          <GameView
            gameId={gameSession.gameId}
            opponentPubkey={gameSession.opponentPubkey}
          />
        </>
      )}
    </div>
  );
}

export default App;
