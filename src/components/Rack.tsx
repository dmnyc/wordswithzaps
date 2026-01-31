import { useState, useCallback } from "react";
import Tile from "./Tile";
import "./Rack.css";

interface RackProps {
  tiles: string[];
  selectedTile: number | null;
  onSelectTile: (index: number | null) => void;
  onReturnTile?: (x: number, y: number) => void;
  onReorder?: (tiles: string[]) => void;
  disabled?: boolean;
}

export function Rack({
  tiles,
  selectedTile,
  onSelectTile,
  onReturnTile,
  onReorder,
  disabled = false,
}: RackProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (event: React.DragEvent<HTMLDivElement>) => {
      setDraggingIndex(index);
      onSelectTile(index);
      event.dataTransfer.setData("application/x-wwz-rack", String(index));
      event.dataTransfer.effectAllowed = "move";
    },
    [onSelectTile],
  );

  const handleDragEnd = useCallback(
    (_event: React.DragEvent<HTMLDivElement>) => {
      setDraggingIndex(null);
      setDragOverIndex(null);
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

  const handleSlotDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      // Check if it's a rack reorder or a board return
      const rackData = event.dataTransfer.types.includes(
        "application/x-wwz-rack",
      );
      if (rackData) {
        setDragOverIndex(index);
      }
    },
    [],
  );

  const handleSlotDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleSlotDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
      event.preventDefault();
      setDragOverIndex(null);

      // Check for rack reorder
      const rackData = event.dataTransfer.getData("application/x-wwz-rack");
      if (rackData && onReorder) {
        const sourceIndex = parseInt(rackData, 10);
        if (sourceIndex !== targetIndex && !isNaN(sourceIndex)) {
          const newTiles = [...tiles];
          const [removed] = newTiles.splice(sourceIndex, 1);
          newTiles.splice(targetIndex, 0, removed);
          onReorder(newTiles);
          onSelectTile(null);
        }
        return;
      }

      // Check for board return
      const placementData = event.dataTransfer.getData(
        "application/x-wwz-placement",
      );
      if (placementData && onReturnTile) {
        try {
          const data = JSON.parse(placementData) as { x: number; y: number };
          onReturnTile(data.x, data.y);
        } catch {
          // Ignore malformed drops
        }
      }
    },
    [tiles, onReorder, onReturnTile, onSelectTile],
  );

  const handleRackDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleRackDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // Only handle board returns at rack level (not slot level)
      const placementData = event.dataTransfer.getData(
        "application/x-wwz-placement",
      );
      if (placementData && onReturnTile) {
        event.preventDefault();
        try {
          const data = JSON.parse(placementData) as { x: number; y: number };
          onReturnTile(data.x, data.y);
        } catch {
          // Ignore malformed drops
        }
      }
    },
    [onReturnTile],
  );

  return (
    <div
      className={`rack ${disabled ? "disabled" : ""}`}
      onDragOver={handleRackDragOver}
      onDrop={handleRackDrop}
    >
      <div className="rack-tiles">
        {tiles.map((letter, index) => (
          <div
            key={index}
            className={`rack-slot ${selectedTile === index ? "selected" : ""} ${dragOverIndex === index ? "drag-over" : ""}`}
            onClick={() => handleClick(index)}
            onDragOver={(e) => handleSlotDragOver(e, index)}
            onDragLeave={handleSlotDragLeave}
            onDrop={(e) => handleSlotDrop(e, index)}
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
