import { LETTER_VALUES } from '../engine/constants';
import './Tile.css';

interface TileProps {
  letter: string;
  isBlank?: boolean;
  isDragging?: boolean;
  isPlaced?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function Tile({
  letter,
  isBlank = false,
  isDragging = false,
  isPlaced = false,
  onDragStart,
  onDragEnd,
}: TileProps) {
  const displayLetter = letter === 'BLANK' ? '' : letter;
  const value = isBlank ? 0 : (LETTER_VALUES[letter] || 0);

  return (
    <div
      className={`tile ${isDragging ? 'dragging' : ''} ${isPlaced ? 'placed' : ''}`}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="tile-letter">{displayLetter}</span>
      {value > 0 && <span className="tile-value">{value}</span>}
    </div>
  );
}

export default Tile;
