import { useState, useCallback } from 'react';
import Tile from './Tile';
import './Rack.css';

interface RackProps {
  tiles: string[];
  selectedTile: number | null;
  onSelectTile: (index: number | null) => void;
  disabled?: boolean;
}

export function Rack({
  tiles,
  selectedTile,
  onSelectTile,
  disabled = false,
}: RackProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
    onSelectTile(index);
  }, [onSelectTile]);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  const handleClick = useCallback((index: number) => {
    if (disabled) return;
    onSelectTile(selectedTile === index ? null : index);
  }, [disabled, selectedTile, onSelectTile]);

  return (
    <div className={`rack ${disabled ? 'disabled' : ''}`}>
      <div className="rack-tiles">
        {tiles.map((letter, index) => (
          <div
            key={index}
            className={`rack-slot ${selectedTile === index ? 'selected' : ''}`}
            onClick={() => handleClick(index)}
          >
            <Tile
              letter={letter}
              isBlank={letter === 'BLANK'}
              isDragging={draggingIndex === index}
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}
        {/* Empty slots */}
        {Array.from({ length: 7 - tiles.length }).map((_, i) => (
          <div key={`empty-${i}`} className="rack-slot empty" />
        ))}
      </div>
    </div>
  );
}

export default Rack;
