export type GameStatus = 'active' | 'completed' | 'abandoned';

export interface GameMeta {
  gameId: string;
  playerOne: string;  // hex pubkey
  playerTwo: string;  // hex pubkey
  status: GameStatus;
  winner?: string;    // hex pubkey of winner
}

export interface TurnInfo {
  index: number;
  activePlayer: string;  // hex pubkey of who moves NEXT
  timestamp: number;
  lastMoveHash: string;  // hash of the previous event ID
}

export interface MoveHistory {
  player: string;     // hex pubkey
  word: string;
  score: number;
  coords: string[];   // Array of "x,y"
}

export interface Scoring {
  p1Score: number;
  p2Score: number;
  history: MoveHistory[];
}

export interface GameState {
  meta: GameMeta;
  turn: TurnInfo;
  board: Record<string, string>;  // "x,y" => Letter
  scoring: Scoring;
  tileBag: string[];
}

export interface PlayerRack {
  rack: string[];
}

export interface TilePlacement {
  letter: string;
  x: number;
  y: number;
  isBlank?: boolean;  // blank tiles can be any letter
}

export interface Move {
  placements: TilePlacement[];
  word: string;
  score: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  words?: string[];  // all words formed by this move
  score?: number;
}
