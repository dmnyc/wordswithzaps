import { useState, useCallback } from "react";
import Tile from "./Tile";
import "./Rack.css";

interface RackProps {
  tiles: string[];
  selectedTile: number | null;
  onSelectTile: (index: number | null) => void;
  onReturnTile?: (x: number, y: number) => void;
  disabled?: boolean;
}

export function Rack({
  tiles,
  selectedTile,
  onSelectTile,
  onReturnTile,
  disabled = false,
}: RackProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (_event: React.DragEvent<HTMLDivElement>) => {
      setDraggingIndex(index);
      onSelectTile(index);
    },
    [onSelectTile],
  );

  const handleDragEnd = useCallback(
    (_event: React.DragEvent<HTMLDivElement>) => {
      setDraggingIndex(null);
    },
    [],
  );

  const handleClick = useCallback(
    (index: number) => {
      if (disabled) return;
      onSelectTile(selectedTile === index ? null : index);
    },
    [disabled, selectedTile, onSelectTile],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!onReturnTile || disabled) return;
      event.preventDefault();
    },
    [onReturnTile, disabled],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!onReturnTile || disabled) return;
      event.preventDefault();
      const payload = event.dataTransfer.getData("application/x-wwz-placement");
      if (!payload) return;
      try {
        const data = JSON.parse(payload) as { x: number; y: number };
        onReturnTile(data.x, data.y);
      } catch {
        // Ignore malformed drops
      }
    },
    [onReturnTile, disabled],
  );

  return (
    <div
      className={`rack ${disabled ? "disabled" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="rack-tiles">
        {tiles.map((letter, index) => (
          <div
            key={index}
            className={`rack-slot ${selectedTile === index ? "selected" : ""}`}
            onClick={() => handleClick(index)}
          >
            <Tile
              letter={letter}
              isBlank={letter === "BLANK"}
              isDragging={draggingIndex === index}
              onDragStart={handleDragStart(index)}
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
