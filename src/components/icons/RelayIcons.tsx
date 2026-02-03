interface IconProps {
  className?: string;
}

export function WifiIcon({ className = "" }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M5.5 13a10 10 0 0 1 13 0" />
      <path d="M9.58 17a5 5 0 0 1 4.84 0" />
      <circle cx="12" cy="21" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
