import "./GameControls.css";

interface GameControlsProps {
  canPlay: boolean;
  canPass: boolean;
  canExchange: boolean;
  isLoading: boolean;
  pendingScore?: number;
  walletConnected?: boolean;
  zapAmount?: number;
  zapsDisabled?: boolean;
  onPlay: () => void;
  onPass: () => void;
  onExchange: () => void;
  onClear: () => void;
  onShuffle: () => void;
}

export function GameControls({
  canPlay,
  canPass,
  canExchange,
  isLoading,
  pendingScore,
  walletConnected: _walletConnected = false,
  zapAmount = 1,
  zapsDisabled = false,
  onPlay,
  onPass,
  onExchange,
  onClear,
  onShuffle,
}: GameControlsProps) {
  void _walletConnected; // Reserved for future use
  return (
    <div className="game-controls">
      <div className="controls-left">
        <button
          className="control-btn secondary"
          onClick={onShuffle}
          disabled={isLoading}
          title="Shuffle tiles in rack"
        >
          Shuffle
        </button>
        <button
          className="control-btn secondary"
          onClick={onClear}
          disabled={isLoading}
          title="Return tiles to rack"
        >
          Clear
        </button>
      </div>

      <div className="controls-center">
        {pendingScore !== undefined && pendingScore > 0 && (
          <div className="pending-score">+{pendingScore}</div>
        )}
        <button
          className="control-btn primary play-btn"
          onClick={onPlay}
          disabled={!canPlay || isLoading}
        >
          {isLoading ? (
            "Playing..."
          ) : zapsDisabled ? (
            "Play Turn"
          ) : (
            <>
              Zap <img src="/assets/bolt.svg" alt="" className="bolt-icon" />
              {zapAmount} & Play
            </>
          )}
        </button>
      </div>

      <div className="controls-right">
        <button
          className="control-btn secondary"
          onClick={onPass}
          disabled={!canPass || isLoading}
          title="Skip your turn"
        >
          Pass
        </button>
        <button
          className="control-btn secondary"
          onClick={onExchange}
          disabled={!canExchange || isLoading}
          title="Exchange selected tiles"
        >
          Exchange
        </button>
      </div>
    </div>
  );
}

export default GameControls;
