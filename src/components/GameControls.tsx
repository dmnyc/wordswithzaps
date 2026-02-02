import "./GameControls.css";

interface GameControlsProps {
  canPlay: boolean;
  canPass: boolean;
  canExchange: boolean;
  isLoading: boolean;
  pendingScore?: number;
  walletConnected?: boolean;
  scorePop?: { id: number; points: number } | null;
  exchangeMode?: boolean;
  exchangeCount?: number;
  onPlay: () => void;
  onPass: () => void;
  onExchange: () => void;
  onClear: () => void;
  onShuffle: () => void;
  onCancelExchange?: () => void;
  onConfirmExchange?: () => void;
}

export function GameControls({
  canPlay,
  canPass,
  canExchange,
  isLoading,
  pendingScore,
  walletConnected: _walletConnected = false,
  scorePop = null,
  exchangeMode = false,
  exchangeCount = 0,
  onPlay,
  onPass,
  onExchange,
  onClear,
  onShuffle,
  onCancelExchange,
  onConfirmExchange,
}: GameControlsProps) {
  void _walletConnected; // Reserved for future use

  // Exchange mode UI
  if (exchangeMode) {
    return (
      <div className="game-controls exchange-mode">
        <div className="exchange-info">
          <span className="exchange-label">Select tiles to exchange</span>
          {exchangeCount > 0 && (
            <span className="exchange-count">{exchangeCount} selected</span>
          )}
        </div>
        <div className="exchange-actions">
          <button
            className="control-btn secondary"
            onClick={onCancelExchange}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="control-btn exchange-confirm"
            onClick={onConfirmExchange}
            disabled={exchangeCount === 0 || isLoading}
          >
            {isLoading
              ? "Exchanging..."
              : `Exchange ${exchangeCount} tile${exchangeCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

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
        <div className="play-btn-wrap">
          {scorePop && (
            <span key={scorePop.id} className="play-score-pop">
              +{scorePop.points}
            </span>
          )}
          <button
            className="control-btn primary play-btn"
            onClick={onPlay}
            disabled={!canPlay || isLoading}
          >
            {isLoading ? "Playing..." : "Play Turn"}
          </button>
        </div>
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
