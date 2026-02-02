import Modal from "./Modal";
import "./GameRulesModal.css";

interface GameRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function GameRulesModal({ open, onClose }: GameRulesModalProps) {
  return (
    <Modal open={open} title="How to Play" onClose={onClose}>
      <div className="game-rules-content">
        <section className="rules-section">
          <h3>Objective</h3>
          <p>Score the most points by forming words on the board.</p>
        </section>

        <section className="rules-section">
          <h3>Your Turn</h3>
          <ul>
            <li>Place tiles to form a word (horizontal or vertical)</li>
            <li>New words must connect to existing tiles (except first move)</li>
            <li>First word must cover the center star</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Scoring</h3>
          <ul>
            <li>Each letter has a point value (shown on tile)</li>
            <li><span className="multiplier dl">DL</span> = Double Letter</li>
            <li><span className="multiplier tl">TL</span> = Triple Letter</li>
            <li><span className="multiplier dw">DW</span> = Double Word</li>
            <li><span className="multiplier tw">TW</span> = Triple Word</li>
            <li><span className="bingo">BINGO:</span> Play all 7 tiles = +50 bonus points</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Special Moves</h3>
          <ul>
            <li><strong>Pass:</strong> Skip your turn (game ends after 4 consecutive passes)</li>
            <li><strong>Exchange:</strong> Swap 1-7 tiles with the bag (requires 7+ tiles in bag)</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Blank Tiles</h3>
          <ul>
            <li>Worth 0 points</li>
            <li>Can represent any letter</li>
            <li>Letter is locked once played</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Game End</h3>
          <ul>
            <li>Both players pass consecutively twice (4 total passes)</li>
            <li>One player uses all tiles and bag is empty</li>
            <li>A player forfeits</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

export default GameRulesModal;
