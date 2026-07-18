/** Compact dashboard stat tile on design tokens (ds Stat is marketing-sized). */
export function StatTile({
  label,
  value,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "critical" | "positive";
}) {
  const color =
    tone === "critical"
      ? "var(--critical)"
      : tone === "positive"
        ? "var(--positive)"
        : "var(--ink)";
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          fontWeight: "var(--weight-medium)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          lineHeight: 1.1,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginTop: 6,
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}
