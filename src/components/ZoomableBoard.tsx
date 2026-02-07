import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./ZoomableBoard.css";

interface ZoomableBoardProps {
  children: ReactNode;
  gameId: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2;
const MOVE_THRESHOLD = 5;

function getTouchDistance(t1: React.Touch, t2: React.Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMidpoint(t1: React.Touch, t2: React.Touch) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function ZoomableBoard({ children, gameId }: ZoomableBoardProps) {
  const [isTouchDevice] = useState(
    () =>
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints > 0 || "ontouchstart" in window),
  );

  // Transform state — only updated on gesture end or throttled for re-render
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [animating, setAnimating] = useState(false);

  // Refs for gesture tracking (no re-renders during active gesture)
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);
  const isPanningRef = useRef(false);
  const hasMovedRef = useRef(false);
  const lastPinchDistRef = useRef(0);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const lastTapTimeRef = useRef(0);
  const touchCountRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Reset zoom when game changes
  useEffect(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [gameId]);

  const applyTransform = useCallback(() => {
    if (!innerRef.current) return;
    const s = scaleRef.current;
    const t = translateRef.current;
    innerRef.current.style.transform = `scale(${s}) translate(${t.x}px, ${t.y}px)`;
  }, []);

  const commitState = useCallback(() => {
    setScale(scaleRef.current);
    setTranslate({ ...translateRef.current });
  }, []);

  const clampPan = useCallback((tx: number, ty: number, s: number) => {
    if (!containerRef.current || !innerRef.current) return { x: tx, y: ty };
    const container = containerRef.current.getBoundingClientRect();
    const board = innerRef.current.children[0];
    if (!board) return { x: tx, y: ty };

    // Board's unscaled dimensions
    const boardRect = board.getBoundingClientRect();
    const boardW = boardRect.width / scaleRef.current;
    const boardH = boardRect.height / scaleRef.current;

    const scaledW = boardW * s;
    const scaledH = boardH * s;

    // With transform-origin: 0 0, translate(0,0) shows top-left.
    // To see bottom-right, need negative translate.
    // Range: -(scaledW - containerW)/s .. 0
    if (scaledW <= container.width) {
      tx = 0;
    } else {
      const minTx = -(scaledW - container.width) / s;
      tx = clamp(tx, minTx, 0);
    }
    if (scaledH <= container.height) {
      ty = 0;
    } else {
      const minTy = -(scaledH - container.height) / s;
      ty = clamp(ty, minTy, 0);
    }
    return { x: tx, y: ty };
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    setAnimating(true);
    commitState();
    applyTransform();
    setTimeout(() => setAnimating(false), 200);
  }, [applyTransform, commitState]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchCountRef.current = e.touches.length;

    if (e.touches.length === 2) {
      // Pinch start
      isPinchingRef.current = true;
      hasMovedRef.current = true;
      lastPinchDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
      setAnimating(false);
      e.preventDefault();
    } else if (e.touches.length === 1) {
      // Potential pan or tap
      isPanningRef.current = false;
      hasMovedRef.current = false;
      lastPanPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch zoom
        isPinchingRef.current = true;
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        const prev = lastPinchDistRef.current;
        if (prev > 0) {
          const delta = dist / prev;
          const newScale = clamp(
            scaleRef.current * delta,
            MIN_SCALE,
            MAX_SCALE,
          );

          // Zoom toward pinch midpoint
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const mid = getTouchMidpoint(e.touches[0], e.touches[1]);
            // Point in container coordinates
            const cx = mid.x - rect.left;
            const cy = mid.y - rect.top;
            // Point in board (untransformed) coordinates
            const oldS = scaleRef.current;
            const bx = cx / oldS - translateRef.current.x;
            const by = cy / oldS - translateRef.current.y;
            // New translate so that the same board point stays under the midpoint
            const newTx = cx / newScale - bx;
            const newTy = cy / newScale - by;

            scaleRef.current = newScale;
            translateRef.current = clampPan(newTx, newTy, newScale);
          } else {
            scaleRef.current = newScale;
          }
          applyTransform();
        }
        lastPinchDistRef.current = dist;
        e.preventDefault();
      } else if (e.touches.length === 1 && !isPinchingRef.current) {
        const dx = e.touches[0].clientX - lastPanPosRef.current.x;
        const dy = e.touches[0].clientY - lastPanPosRef.current.y;
        const moved =
          Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD;

        if (moved) {
          hasMovedRef.current = true;
        }

        // Pan only when zoomed
        if (scaleRef.current > 1 && hasMovedRef.current) {
          isPanningRef.current = true;
          setAnimating(false);
          const s = scaleRef.current;
          const newTx = translateRef.current.x + dx / s;
          const newTy = translateRef.current.y + dy / s;
          translateRef.current = clampPan(newTx, newTy, s);
          applyTransform();
          lastPanPosRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
          e.preventDefault();
        }
      }
    },
    [applyTransform, clampPan],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (isPinchingRef.current && e.touches.length < 2) {
        // Pinch ended
        isPinchingRef.current = false;
        lastPinchDistRef.current = 0;
        // Snap to 1x if close
        if (scaleRef.current < 1.1) {
          scaleRef.current = 1;
          translateRef.current = { x: 0, y: 0 };
          setAnimating(true);
          applyTransform();
          setTimeout(() => setAnimating(false), 200);
        }
        commitState();
        return;
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        commitState();
        return;
      }

      // Single tap — check for double-tap
      if (!hasMovedRef.current && touchCountRef.current === 1) {
        const now = Date.now();
        const elapsed = now - lastTapTimeRef.current;
        if (elapsed < DOUBLE_TAP_MS && elapsed > 50) {
          // Double-tap: toggle zoom
          e.preventDefault();
          setAnimating(true);
          if (scaleRef.current > 1) {
            scaleRef.current = 1;
            translateRef.current = { x: 0, y: 0 };
          } else {
            const touch = e.changedTouches[0];
            if (containerRef.current && touch) {
              const rect = containerRef.current.getBoundingClientRect();
              const cx = touch.clientX - rect.left;
              const cy = touch.clientY - rect.top;
              const newS = DOUBLE_TAP_SCALE;
              // Zoom toward tap point
              const bx = cx / scaleRef.current - translateRef.current.x;
              const by = cy / scaleRef.current - translateRef.current.y;
              const newTx = cx / newS - bx;
              const newTy = cy / newS - by;
              scaleRef.current = newS;
              translateRef.current = clampPan(newTx, newTy, newS);
            } else {
              scaleRef.current = DOUBLE_TAP_SCALE;
            }
          }
          applyTransform();
          commitState();
          setTimeout(() => setAnimating(false), 200);
          lastTapTimeRef.current = 0;
        } else {
          lastTapTimeRef.current = now;
        }
      }
    },
    [applyTransform, clampPan, commitState],
  );

  // Desktop: render children directly
  if (!isTouchDevice) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className="zoomable-board-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={innerRef}
        className={`zoomable-board-inner${animating ? " animating" : ""}`}
        style={{
          transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          className="zoom-reset-btn"
          onClick={resetZoom}
          type="button"
          aria-label="Reset zoom"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default ZoomableBoard;
