/**
 * Board snapshot renderer
 *
 * Pure-canvas rendering of a Words With Zaps board to a PNG blob.
 * Used for shareable images (turn announcements, chat attachments).
 *
 * Output: a self-contained PNG with header/title, board, last-move
 * highlight, and a score footer. No external assets are loaded so the
 * output is deterministic and works offline.
 */

import {
  BOARD_SIZE,
  CENTER_POSITION,
  LETTER_VALUES,
  getMultiplier,
} from "../engine/constants";
import type { BoardTile } from "../types/game";

const CELL = 48;
const GAP = 2;
const PAD = 14;
const BOARD_W = BOARD_SIZE * CELL + (BOARD_SIZE - 1) * GAP + PAD * 2;
const HEADER_H = 72;
const FOOTER_H = 96;
const TOTAL_W = BOARD_W;
const TOTAL_H = HEADER_H + BOARD_W + FOOTER_H;

// Palette mirrors index.css / Board.css
const COLOR_BG = "#0b0b0b";
const COLOR_BOARD_BG = "#0b0b0b";
const COLOR_BOARD_BORDER = "rgba(255, 255, 255, 0.08)";
const COLOR_CELL_EMPTY = "#1a1a1a";
const COLOR_TEXT = "#f5f5f5";
const COLOR_MUTED = "#9a9a9a";
const COLOR_ACCENT = "#ffcc00";

const CELL_COLORS = {
  DW: { bg: "#4a2e2e", text: "#e8a0a0", label: "DW" },
  QL: { bg: "#143a48", text: "#7ec8e3", label: "QL" },
  DL: { bg: "#2e3e4a", text: "#a0c4e8", label: "DL" },
  ZAP: { bg: "#3a2a08", text: COLOR_ACCENT, label: "⚡" },
} as const;

const TILE_BG = "#fff5d1";
const TILE_BG_DARK = "#e8c97a";
const TILE_TEXT = "#1a1a1a";
const TILE_HIGHLIGHT_BORDER = COLOR_ACCENT;
const TILE_BONUS_BORDER = "#ffb300";

interface SnapshotOptions {
  board: Record<string, string | BoardTile>;
  highlightCoords?: Set<string>;
  bonusWordCoords?: Set<string>;
  moveIndex: number;
  player1: { name: string; score: number; isActive?: boolean };
  player2: { name: string; score: number; isActive?: boolean };
  timestamp?: number; // Unix seconds; defaults to "now"
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCellBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  multiplier: ReturnType<typeof getMultiplier>,
  isCenter: boolean,
) {
  if (isCenter && multiplier === "ZAP") {
    ctx.fillStyle = COLOR_ACCENT;
  } else if (multiplier && multiplier in CELL_COLORS) {
    ctx.fillStyle = CELL_COLORS[multiplier as keyof typeof CELL_COLORS].bg;
  } else {
    ctx.fillStyle = COLOR_CELL_EMPTY;
  }
  roundRect(ctx, x, y, CELL, CELL, 4);
  ctx.fill();
}

function drawCellLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  multiplier: ReturnType<typeof getMultiplier>,
  isCenter: boolean,
) {
  if (!multiplier) return;
  const palette = CELL_COLORS[multiplier as keyof typeof CELL_COLORS];
  if (multiplier === "ZAP") {
    ctx.fillStyle = isCenter ? "#1a1a1a" : COLOR_ACCENT;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", x + CELL / 2, y + CELL / 2 + 1);
    return;
  }
  ctx.fillStyle = palette.text;
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(palette.label, x + CELL / 2, y + CELL / 2);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  letter: string,
  value: number,
  highlighted: boolean,
  isBonusWord: boolean,
  isBlank: boolean,
) {
  // Tile body with subtle gradient
  const gradient = ctx.createLinearGradient(x, y, x, y + CELL);
  gradient.addColorStop(0, TILE_BG);
  gradient.addColorStop(1, TILE_BG_DARK);
  ctx.fillStyle = gradient;
  roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 5);
  ctx.fill();

  // Border (highlight last-move tiles)
  if (highlighted) {
    ctx.strokeStyle = TILE_HIGHLIGHT_BORDER;
    ctx.lineWidth = 2.5;
    roundRect(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 5);
    ctx.stroke();
  } else if (isBonusWord) {
    ctx.strokeStyle = TILE_BONUS_BORDER;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 5);
    ctx.stroke();
  }

  // Letter
  ctx.fillStyle = TILE_TEXT;
  ctx.font = "700 22px 'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const display = letter === "BLANK" ? "" : letter;
  ctx.fillText(display, x + CELL / 2, y + CELL / 2 + 1);

  // Point value (top-right corner)
  if (value > 0) {
    ctx.fillStyle = TILE_TEXT;
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(String(value), x + CELL - 5, y + 5);
  }

  // Subtle blank indicator (small dot)
  if (isBlank) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.arc(x + 7, y + CELL - 7, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/**
 * Render the board to a PNG Blob plus a SHA-256 hex hash.
 * The hash and dimensions are useful for NIP-92 imeta tags.
 */
export async function renderBoardSnapshot(
  opts: SnapshotOptions,
): Promise<{
  blob: Blob;
  hash: string;
  width: number;
  height: number;
  mime: string;
}> {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = TOTAL_W * dpr;
  canvas.height = TOTAL_H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(dpr, dpr);

  // --- Background ---
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);

  // --- Header ---
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = "700 18px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("WORDS WITH ZAPS", PAD + 2, HEADER_H / 2 - 8);

  ctx.fillStyle = COLOR_ACCENT;
  ctx.font = "600 13px 'Space Grotesk', system-ui, sans-serif";
  ctx.fillText(
    `Move ${opts.moveIndex}`,
    PAD + 2,
    HEADER_H / 2 + 14,
  );

  // Top-right timestamp
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = "500 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(formatTimestamp(ts), TOTAL_W - PAD - 2, HEADER_H / 2);

  // --- Board frame ---
  const boardOriginY = HEADER_H;
  ctx.fillStyle = COLOR_BOARD_BG;
  roundRect(ctx, 0, boardOriginY, BOARD_W, BOARD_W, 10);
  ctx.fill();
  ctx.strokeStyle = COLOR_BOARD_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Cells ---
  const highlight = opts.highlightCoords ?? new Set<string>();
  const bonus = opts.bonusWordCoords ?? new Set<string>();

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = PAD + x * (CELL + GAP);
      const py = boardOriginY + PAD + y * (CELL + GAP);
      const coord = `${x},${y}`;
      const isCenter = x === CENTER_POSITION.x && y === CENTER_POSITION.y;
      const multiplier = getMultiplier(x, y);

      drawCellBackground(ctx, px, py, multiplier, isCenter);

      const tile = opts.board[coord];
      if (tile) {
        let letter: string;
        let isBlank = false;
        if (typeof tile === "string") {
          if (tile === "BLANK") {
            letter = "?";
            isBlank = true;
          } else {
            letter = tile;
          }
        } else {
          letter = tile.letter;
          isBlank = tile.isBlank || false;
        }
        const value = isBlank ? 0 : LETTER_VALUES[letter] || 0;
        drawTile(
          ctx,
          px,
          py,
          letter.toUpperCase(),
          value,
          highlight.has(coord),
          bonus.has(coord),
          isBlank,
        );
      } else {
        drawCellLabel(ctx, px, py, multiplier, isCenter);
      }
    }
  }

  // --- Footer (scores) ---
  const footerY = HEADER_H + BOARD_W;
  const p1Active = !!opts.player1.isActive;
  const p2Active = !!opts.player2.isActive;
  const colW = TOTAL_W / 2;

  function drawScoreCol(
    cx: number,
    name: string,
    score: number,
    active: boolean,
    align: CanvasTextAlign,
  ) {
    ctx!.fillStyle = active ? COLOR_ACCENT : COLOR_MUTED;
    ctx!.font = "600 12px 'Space Grotesk', system-ui, sans-serif";
    ctx!.textAlign = align;
    ctx!.textBaseline = "alphabetic";
    ctx!.fillText(truncate(name, 22), cx, footerY + 32);

    ctx!.fillStyle = active ? COLOR_ACCENT : COLOR_TEXT;
    ctx!.font = "700 28px 'Space Grotesk', system-ui, sans-serif";
    ctx!.fillText(String(score), cx, footerY + 64);
  }

  drawScoreCol(
    PAD + 4,
    opts.player1.name || "Player 1",
    opts.player1.score,
    p1Active,
    "left",
  );
  drawScoreCol(
    TOTAL_W - PAD - 4,
    opts.player2.name || "Player 2",
    opts.player2.score,
    p2Active,
    "right",
  );

  // Footer divider line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerY + 0.5);
  ctx.lineTo(TOTAL_W, footerY + 0.5);
  ctx.stroke();

  // Center watermark in footer
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = "500 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("wordswithzaps", TOTAL_W / 2, footerY + 78);

  // --- Encode + hash ---
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
      0.92,
    );
  });

  const hash = await sha256Hex(blob);
  return {
    blob,
    hash,
    width: TOTAL_W,
    height: TOTAL_H,
    mime: "image/png",
  };
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
