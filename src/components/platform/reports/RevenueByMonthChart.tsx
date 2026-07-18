"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";

// Design tokens hardcoded — recharts config can't read CSS custom properties.
export const chartColors = {
  forest: "#28352B",
  sage: "#6E8167",
  ink: "#211F1A",
  inkMuted: "#6E6657",
  hairline: "#E2D9C6",
  warmWhite: "#FBF8F1",
};

/** Compact axis label for cents: 250000 -> "$2.5k", 50000 -> "$500". */
export function compactCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? "-" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `${sign}$${trimTrailingZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}$${trimTrailingZero((abs / 1_000).toFixed(1))}k`;
  return `${sign}$${Math.round(abs)}`;
}

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, "");
}

export const axisTick = { fontSize: 12, fill: chartColors.inkMuted, fontFamily: "inherit" };

export const tooltipContentStyle: React.CSSProperties = {
  background: chartColors.warmWhite,
  border: `1px solid ${chartColors.hairline}`,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "inherit",
  color: chartColors.ink,
  boxShadow: "none",
  padding: "8px 10px",
};

export default function RevenueByMonthChart({
  data,
}: {
  data: { month: string; cents: number }[];
}) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chartColors.hairline} />
          <XAxis
            dataKey="month"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: chartColors.hairline }}
            tick={axisTick}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={compactCents}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "rgba(147, 164, 136, 0.14)" }}
            contentStyle={tooltipContentStyle}
            labelStyle={{ color: chartColors.ink, fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: chartColors.inkMuted }}
            formatter={(value) => [formatCents(Number(value)), "Revenue"]}
          />
          <Bar
            dataKey="cents"
            name="Revenue"
            fill={chartColors.sage}
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
