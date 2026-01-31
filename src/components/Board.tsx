import { useState, useCallback } from 'react';
import { BOARD_SIZE, getMultiplier, MultiplierType } from '../engine/constants';
import type { TilePlacement } from '../types/game';
import Tile from './Tile';
import './Board.css';

interface BoardProps {
  board: Record<string, string>;
  pendingPlacements: TilePlacement[];
  onPlaceTile: (x: number, y: number) => void;
  onRemoveTile: (x: number, y: number) => void;
  disabled?: boolean;
}

function getCellClass(multiplier: MultiplierType): string {
  switch (multiplier) {
    case 'TW': return 'cell-tw';
    case 'DW': return 'cell-dw';
    case 'TL': return 'cell-tl';
    case 'DL': return 'cell-dl';
    case 'STAR': return 'cell-star';
    default: return '';
  }
}

function getCellLabel(multiplier: MultiplierType): string {
  switch (multiplier) {
    case 'TW': return 'TW';
    case 'DW': return 'DW';
    case 'TL': return 'TL';
    case 'DL': return 'DL';
    case 'STAR': return '★';
    default: return '';
  }
}

export function Board({
  board,
  pendingPlacements,
  onPlaceTile,
  onRemoveTile,
  disabled = false,
}: BoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    setDragOver(`${x},${y}`);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    setDragOver(null);
    if (!disabled) {
      onPlaceTile(x, y);
    }
  }, [disabled, onPlaceTile]);

  const handleCellClick = useCallback((x: number, y: number) => {
    // Check if this cell has a pending placement
    const pending = pendingPlacements.find(p => p.x === x && p.y === y);
    if (pending) {
      onRemoveTile(x, y);
    }
  }, [pendingPlacements, onRemoveTile]);

  const renderCell = (x: number, y: number) => {
    const coord = `${x},${y}`;
    const multiplier = getMultiplier(x, y);
    const letter = board[coord];
    const pending = pendingPlacements.find(p => p.x === x && p.y === y);
    const isDraggedOver = dragOver === coord;

    return (
      <div
        key={coord}
        className={`board-cell ${getCellClass(multiplier)} ${isDraggedOver ? 'drag-over' : ''}`}
        onDragOver={(e) => handleDragOver(e, x, y)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, x, y)}
        onClick={() => handleCellClick(x, y)}
      >
        {letter ? (
          <Tile letter={letter} isPlaced />
        ) : pending ? (
          <Tile letter={pending.letter} isBlank={pending.isBlank} />
        ) : (
          <span className="cell-label">{getCellLabel(multiplier)}</span>
        )}
      </div>
    );
  };

  const cells = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      cells.push(renderCell(x, y));
    }
  }

  return (
    <div className={`board ${disabled ? 'disabled' : ''}`}>
      {cells}
    </div>
  );
}

export default Board;
