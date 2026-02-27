export interface GamestrStats {
  wins: number;
  losses: number;
  ties: number;
  highScore: number;
  totalGames: number;
  highestWord: string;
  highestWordScore: number;
}

export const EMPTY_GAMESTR_STATS: GamestrStats = {
  wins: 0,
  losses: 0,
  ties: 0,
  highScore: 0,
  totalGames: 0,
  highestWord: "",
  highestWordScore: 0,
};
