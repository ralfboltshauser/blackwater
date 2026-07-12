type BrandProps = {
  compact?: boolean;
  className?: string;
};

export function Brand({ compact = false, className }: BrandProps) {
  return (
    <div className={className} aria-label="Blackwater">
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        width={compact ? 31 : 42}
        height={compact ? 31 : 42}
      >
        <path
          d="M24 3 42 13v22L24 45 6 35V13Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <path
          d="M24 10 36 17v14l-12 7-12-7V17Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity=".75"
        />
        <path
          d="M24 16.5 30.5 20v8L24 31.5 17.5 28v-8Z"
          fill="currentColor"
          opacity=".16"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="24" cy="24" r="2.8" fill="currentColor" />
      </svg>
      {!compact && <span>Blackwater</span>}
    </div>
  );
}
