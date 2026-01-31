import './ScoreBoard.css';

interface Player {
  pubkey: string;
  name?: string;
  score: number;
  isActive: boolean;
}

interface ScoreBoardProps {
  player1: Player;
  player2: Player;
  tilesRemaining: number;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`;
}

export function ScoreBoard({ player1, player2, tilesRemaining }: ScoreBoardProps) {
  return (
    <div className="scoreboard">
      <div className={`player-score ${player1.isActive ? 'active' : ''}`}>
        <div className="player-name">{player1.name || truncatePubkey(player1.pubkey)}</div>
        <div className="player-points">{player1.score}</div>
      </div>

      <div className="tiles-remaining">
        <span className="tiles-icon">🎲</span>
        <span className="tiles-count">{tilesRemaining}</span>
      </div>

      <div className={`player-score ${player2.isActive ? 'active' : ''}`}>
        <div className="player-name">{player2.name || truncatePubkey(player2.pubkey)}</div>
        <div className="player-points">{player2.score}</div>
      </div>
    </div>
  );
}

export default ScoreBoard;
