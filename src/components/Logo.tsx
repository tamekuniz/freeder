export function Logo({
  size = 32,
  variant = "default",
  className = "",
}: {
  size?: number;
  variant?: "default" | "white";
  className?: string;
}) {
  const bgFill = variant === "white" ? "white" : "#F97316";
  const fgFill = variant === "white" ? "#F97316" : "white";
  const arcOpacity = variant === "white" ? 0.2 : 0.35;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background rounded square */}
      <rect width="64" height="64" rx="14" fill={bgFill} />

      {/* RSS-style arcs - bottom left */}
      <path
        d="M14 50a30 30 0 0 1 30-30"
        stroke={fgFill}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity={arcOpacity}
      />
      <path
        d="M14 50a18 18 0 0 1 18-18"
        stroke={fgFill}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity={arcOpacity}
      />

      {/* RSS dot */}
      <circle cx="16" cy="50" r="4" fill={fgFill} opacity={arcOpacity} />

      {/* "F" letter */}
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="38"
        fill={fgFill}
      >
        F
      </text>
    </svg>
  );
}

export function LogoWithText({
  size = 32,
  variant = "default",
  className = "",
}: {
  size?: number;
  variant?: "default" | "white";
  className?: string;
}) {
  const fontSize = size * 0.75;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo size={size} variant={variant} />
      <span
        className={`font-bold tracking-tight ${variant === "white" ? "text-white" : "text-gray-800"}`}
        style={{ fontSize }}
      >
        freeder
      </span>
    </div>
  );
}
