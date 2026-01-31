import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../src/engine/GameEngine';
import { getDictionary, resetDictionary } from '../../src/engine/Dictionary';
import type { TilePlacement } from '../../src/types/game';

describe('GameEngine', () => {
  const player1 = 'pubkey1hex0000000000000000000000000000000000000000000000000000001';
  const player2 = 'pubkey2hex0000000000000000000000000000000000000000000000000000002';

  beforeEach(() => {
    resetDictionary();
    const dict = getDictionary();
    dict.loadWords(['CAT', 'CATS', 'DOG', 'DOGS', 'AT', 'HAT', 'SAT', 'BAT', 'TAT']);
  });

  describe('initializeGame', () => {
    it('should create a new game with correct initial state', () => {
      const state = GameEngine.initializeGame(player1, player2);

      expect(state.meta.playerOne).toBe(player1);
      expect(state.meta.playerTwo).toBe(player2);
      expect(state.meta.status).toBe('active');
      expect(state.meta.gameId).toBeDefined();
      expect(state.turn.index).toBe(0);
      expect(state.turn.activePlayer).toBe(player1);
      expect(state.turn.lastMoveHash).toBe('');
      expect(Object.keys(state.board)).toHaveLength(0);
      expect(state.scoring.p1Score).toBe(0);
      expect(state.scoring.p2Score).toBe(0);
      expect(state.tileBag).toHaveLength(100);
    });

    it('should generate unique game IDs', () => {
      const state1 = GameEngine.initializeGame(player1, player2);
      const state2 = GameEngine.initializeGame(player1, player2);
      expect(state1.meta.gameId).not.toBe(state2.meta.gameId);
    });
  });

  describe('drawTiles', () => {
    it('should draw requested number of tiles', () => {
      const bag = ['A', 'B', 'C', 'D', 'E'];
      const [drawn, remaining] = GameEngine.drawTiles(bag, 3);
      expect(drawn).toEqual(['A', 'B', 'C']);
      expect(remaining).toEqual(['D', 'E']);
    });

    it('should draw all tiles if bag has fewer than requested', () => {
      const bag = ['A', 'B'];
      const [drawn, remaining] = GameEngine.drawTiles(bag, 5);
      expect(drawn).toEqual(['A', 'B']);
      expect(remaining).toEqual([]);
    });

    it('should draw initial rack of 7 tiles', () => {
      const bag = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      const [drawn, remaining] = GameEngine.drawInitialRack(bag);
      expect(drawn).toHaveLength(7);
      expect(remaining).toHaveLength(2);
    });
  });

  describe('isPlayerTurn', () => {
    it('should return true for active player', () => {
      const state = GameEngine.initializeGame(player1, player2);
      expect(GameEngine.isPlayerTurn(state, player1)).toBe(true);
      expect(GameEngine.isPlayerTurn(state, player2)).toBe(false);
    });
  });

  describe('getOpponent', () => {
    it('should return the other player', () => {
      const state = GameEngine.initializeGame(player1, player2);
      expect(GameEngine.getOpponent(state, player1)).toBe(player2);
      expect(GameEngine.getOpponent(state, player2)).toBe(player1);
    });
  });

  describe('validateMove', () => {
    it('should reject move when game is not active', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = { ...state, meta: { ...state.meta, status: 'completed' } };

      const placements: TilePlacement[] = [
        { letter: 'C', x: 7, y: 7 },
      ];
      const result = GameEngine.validateMove(state, placements, ['C', 'A', 'T']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should reject move when player does not have tiles', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const placements: TilePlacement[] = [
        { letter: 'X', x: 7, y: 7 },
      ];
      const result = GameEngine.validateMove(state, placements, ['A', 'B', 'C']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in rack');
    });

    it('should accept valid move with matching rack', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const placements: TilePlacement[] = [
        { letter: 'C', x: 6, y: 7 },
        { letter: 'A', x: 7, y: 7 },
        { letter: 'T', x: 8, y: 7 },
      ];
      const result = GameEngine.validateMove(state, placements, ['C', 'A', 'T', 'X', 'Y', 'Z', 'W']);
      expect(result.valid).toBe(true);
    });
  });

  describe('applyMove', () => {
    it('should apply move and update state correctly', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const placements: TilePlacement[] = [
        { letter: 'C', x: 6, y: 7 },
        { letter: 'A', x: 7, y: 7 },
        { letter: 'T', x: 8, y: 7 },
      ];

      const { state: newState, move, tilesDrawn } = GameEngine.applyMove(
        state,
        placements,
        player1,
        'prev_event_id_123'
      );

      expect(newState.turn.index).toBe(1);
      expect(newState.turn.activePlayer).toBe(player2);
      expect(newState.turn.lastMoveHash).toBe('prev_event_id_123');
      expect(newState.board['6,7']).toBe('C');
      expect(newState.board['7,7']).toBe('A');
      expect(newState.board['8,7']).toBe('T');
      expect(newState.scoring.p1Score).toBeGreaterThan(0);
      expect(newState.scoring.history).toHaveLength(1);
      expect(move.word).toContain('CAT');
      expect(tilesDrawn).toHaveLength(3);
    });

    it('should not modify original state', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const originalTurnIndex = state.turn.index;
      const placements: TilePlacement[] = [
        { letter: 'C', x: 6, y: 7 },
        { letter: 'A', x: 7, y: 7 },
        { letter: 'T', x: 8, y: 7 },
      ];

      GameEngine.applyMove(state, placements, player1, 'prev_event_id');

      expect(state.turn.index).toBe(originalTurnIndex);
      expect(Object.keys(state.board)).toHaveLength(0);
    });
  });

  describe('applyPass', () => {
    it('should switch turns without changing board', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const newState = GameEngine.applyPass(state, player1, 'prev_event_id');

      expect(newState.turn.index).toBe(1);
      expect(newState.turn.activePlayer).toBe(player2);
      expect(Object.keys(newState.board)).toHaveLength(0);
      expect(newState.scoring.history).toHaveLength(1);
      expect(newState.scoring.history[0].word).toBe('(PASS)');
    });
  });

  describe('exchangeTiles', () => {
    it('should exchange tiles and switch turns', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const tilesToExchange = ['A', 'B'];
      const rack = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

      const { state: newState, newTiles, returnedTiles } = GameEngine.exchangeTiles(
        state,
        tilesToExchange,
        rack,
        player1,
        'prev_event_id'
      );

      expect(newState.turn.activePlayer).toBe(player2);
      expect(newTiles).toHaveLength(2);
      expect(returnedTiles).toEqual(tilesToExchange);
      expect(newState.scoring.history[0].word).toContain('EXCHANGE');
    });

    it('should throw if not enough tiles in bag', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = { ...state, tileBag: ['X'] }; // Only 1 tile

      expect(() => {
        GameEngine.exchangeTiles(state, ['A', 'B'], ['A', 'B'], player1, 'id');
      }).toThrow('Not enough tiles');
    });
  });

  describe('isGameOver', () => {
    it('should return false for active game with tiles', () => {
      const state = GameEngine.initializeGame(player1, player2);
      expect(GameEngine.isGameOver(state, ['A', 'B'], ['C', 'D'])).toBe(false);
    });

    it('should return true when bag empty and player has no tiles', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = { ...state, tileBag: [] };
      expect(GameEngine.isGameOver(state, [], ['A', 'B'])).toBe(true);
    });

    it('should return true after 6 consecutive passes', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = {
        ...state,
        scoring: {
          ...state.scoring,
          history: [
            { player: player1, word: '(PASS)', score: 0, coords: [] },
            { player: player2, word: '(PASS)', score: 0, coords: [] },
            { player: player1, word: '(PASS)', score: 0, coords: [] },
            { player: player2, word: '(PASS)', score: 0, coords: [] },
            { player: player1, word: '(PASS)', score: 0, coords: [] },
            { player: player2, word: '(PASS)', score: 0, coords: [] },
          ],
        },
      };
      expect(GameEngine.isGameOver(state, ['A'], ['B'])).toBe(true);
    });
  });

  describe('calculateFinalScores', () => {
    it('should add opponent rack value to player who went out', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = {
        ...state,
        scoring: { ...state.scoring, p1Score: 100, p2Score: 80 },
      };

      // Player 1 went out (empty rack), player 2 has Q(10) and Z(10)
      const { p1Final, p2Final, winner } = GameEngine.calculateFinalScores(
        state,
        [],
        ['Q', 'Z']
      );

      expect(p1Final).toBe(120); // 100 + 20
      expect(p2Final).toBe(60);  // 80 - 20
      expect(winner).toBe(player1);
    });

    it('should handle tie', () => {
      let state = GameEngine.initializeGame(player1, player2);
      state = {
        ...state,
        scoring: { ...state.scoring, p1Score: 100, p2Score: 100 },
      };

      const { winner } = GameEngine.calculateFinalScores(state, [], []);
      expect(winner).toBeNull();
    });
  });

  describe('abandonGame', () => {
    it('should set winner to opponent', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const newState = GameEngine.abandonGame(state, player1);

      expect(newState.meta.status).toBe('abandoned');
      expect(newState.meta.winner).toBe(player2);
    });
  });

  describe('validateStateChain', () => {
    it('should validate correct chain', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const valid = GameEngine.validateStateChain(state, 1, 'event_id', 'event_id');
      expect(valid).toBe(true);
    });

    it('should reject incorrect turn index', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const valid = GameEngine.validateStateChain(state, 5, 'event_id', 'event_id');
      expect(valid).toBe(false);
    });

    it('should reject mismatched event hash', () => {
      const state = GameEngine.initializeGame(player1, player2);
      const valid = GameEngine.validateStateChain(state, 1, 'wrong_hash', 'expected_hash');
      expect(valid).toBe(false);
    });
  });
});
