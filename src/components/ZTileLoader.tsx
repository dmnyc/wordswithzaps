import "./ZTileLoader.css";

type LoaderSize = "xs" | "sm" | "md";

const SIZE_MAP: Record<LoaderSize, number> = {
  xs: 14,
  sm: 16,
  md: 48,
};

interface ZTileLoaderProps {
  size?: LoaderSize;
  className?: string;
}

export function ZTileLoader({ size = "md", className = "" }: ZTileLoaderProps) {
  const px = SIZE_MAP[size];
  return (
    <span
      className={`ztile-loader ${className}`}
      data-size={size}
      style={{ width: px, height: px }}
      role="status"
      aria-label="Loading"
    >
      <span className="ztile-loader-inner">
        <span className="ztile-loader-face ztile-loader-front">
          <img
            src="/assets/z-tile.svg"
            alt=""
            width={px}
            height={px}
            aria-hidden="true"
          />
        </span>
        <span className="ztile-loader-face ztile-loader-back" />
      </span>
    </span>
  );
}

export default ZTileLoader;
