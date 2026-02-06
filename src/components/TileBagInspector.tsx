import { useState, useMemo } from "react";
import { LETTER_VALUES } from "../engine/constants";
import "./TileBagInspector.css";

interface TileBagInspectorProps {
  tileBag: string[];
}

export function TileBagInspector({ tileBag }: TileBagInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tile of tileBag) {
      map[tile] = (map[tile] || 0) + 1;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [tileBag]);

  if (import.meta.env.PROD) return null;

  const content = (
    <div className="tile-bag-inspector-content">
      <div className="tile-bag-inspector-header">
        <span className="tile-bag-inspector-title">Remaining tiles</span>
        <span className="tile-bag-inspector-total">{tileBag.length}</span>
      </div>
      <div className="tile-bag-inspector-grid">
        {counts.map(([letter, count]) => (
          <div key={letter} className="tile-bag-inspector-item">
            <span className="tile-bag-inspector-letter">
              {letter === "BLANK" ? "?" : letter}
            </span>
            <span className="tile-bag-inspector-count">{count}</span>
            <span className="tile-bag-inspector-pts">
              {LETTER_VALUES[letter] ?? 0}
            </span>
          </div>
        ))}
      </div>
      {tileBag.length === 0 && (
        <div className="tile-bag-inspector-empty">Empty</div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: sidebar */}
      <div className="tile-bag-inspector-desktop">{content}</div>

      {/* Mobile: collapsible tray */}
      <div className="tile-bag-inspector-mobile">
        <button
          className="tile-bag-inspector-toggle"
          onClick={() => setIsOpen((p) => !p)}
          type="button"
        >
          Tile Bag ({tileBag.length}) {isOpen ? "▲" : "▼"}
        </button>
        {isOpen && content}
      </div>
    </>
  );
}

export default TileBagInspector;
